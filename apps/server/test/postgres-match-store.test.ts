import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MatchService,
  PostgresMatchStore,
  createPool,
  migrateDatabase,
  type AuthoritativeMatch,
} from '../src/index.js';
import { ACCOUNT_A, ACCOUNT_B, MATCH_ID, ZeroRandomSource, gameplayCommand } from './fixtures.js';

const databaseUrl = process.env.DATABASE_URL;
if (process.env.CARAVAN_REQUIRE_DATABASE_TESTS === '1' && databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required when CARAVAN_REQUIRE_DATABASE_TESTS=1.');
}

const describeDatabase = databaseUrl === undefined ? describe.skip : describe;

describeDatabase('PostgresMatchStore', () => {
  const requiredDatabaseUrl = databaseUrl as string;
  const pool = createPool(requiredDatabaseUrl);

  beforeAll(async () => {
    await migrateDatabase(pool);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE caravan_matches');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('round-trips authoritative state and allows only one same-version CAS winner', async () => {
    const store = new PostgresMatchStore(pool);
    const service = new MatchService(store, {
      random: new ZeroRandomSource(),
      now: () => 1_000_000,
    });
    await service.createMatch({ participants: { A: ACCOUNT_A, B: ACCOUNT_B } });

    const loaded = await store.load(MATCH_ID);
    if (loaded === null) throw new Error('Expected the created match to be persisted.');
    expect(loaded.stateVersion).toBe(0);
    expect(loaded.game.players.A.hand).toHaveLength(8);
    expect(loaded.game.players.B.hand).toHaveLength(8);

    const nextA: AuthoritativeMatch = {
      ...loaded,
      stateVersion: 1,
      connected: { A: true, B: false },
    };
    const nextB: AuthoritativeMatch = {
      ...loaded,
      stateVersion: 1,
      connected: { A: false, B: true },
    };

    const results = await Promise.all([
      store.compareAndSet(MATCH_ID, 0, nextA),
      store.compareAndSet(MATCH_ID, 0, nextB),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);

    const committed = await store.load(MATCH_ID);
    expect(committed?.stateVersion).toBe(1);
    expect([committed?.connected.A, committed?.connected.B].filter(Boolean)).toHaveLength(1);
  });

  it('recovers accepted commands after pool/service recreation without applying retries twice', async () => {
    const firstPool = createPool(requiredDatabaseUrl);
    await migrateDatabase(firstPool);
    const firstStore = new PostgresMatchStore(firstPool);
    const firstService = new MatchService(firstStore, {
      random: new ZeroRandomSource(),
      now: () => 1_000_000,
    });
    await firstService.createMatch({ participants: { A: ACCOUNT_A, B: ACCOUNT_B } });

    const initial = await firstService.getSnapshot(MATCH_ID, ACCOUNT_A);
    if (initial === null) throw new Error('Expected player A snapshot.');
    const action = initial.game.legalActions[0];
    if (action === undefined) throw new Error('Expected an opening legal action.');

    const command = gameplayCommand('00000000-0000-4000-8000-000000000006', 0, action);
    const accepted = await firstService.handleCommand(ACCOUNT_A, command);
    expect(accepted.type).toBe('SNAPSHOT');
    if (accepted.type !== 'SNAPSHOT') throw new Error('Expected accepted snapshot.');
    expect(accepted.snapshot.stateVersion).toBe(1);
    await firstPool.end();

    const restartedPool = createPool(requiredDatabaseUrl);
    const restartedStore = new PostgresMatchStore(restartedPool);
    const restartedService = new MatchService(restartedStore, { now: () => 1_000_100 });

    const recovered = await restartedService.getSnapshot(MATCH_ID, ACCOUNT_A);
    expect(recovered?.stateVersion).toBe(1);

    const retry = await restartedService.handleCommand(ACCOUNT_A, command);
    expect(retry.type).toBe('SNAPSHOT');
    if (retry.type !== 'SNAPSHOT') throw new Error('Expected idempotent retry snapshot.');
    expect(retry.snapshot.stateVersion).toBe(1);

    const authoritative = await restartedStore.load(MATCH_ID);
    expect(authoritative?.stateVersion).toBe(1);
    expect(authoritative?.processedCommands).toHaveLength(1);
    await restartedPool.end();
  });

  it('rejects row metadata that disagrees with its authoritative snapshot', async () => {
    const store = new PostgresMatchStore(pool);
    const service = new MatchService(store, {
      random: new ZeroRandomSource(),
      now: () => 1_000_000,
    });
    await service.createMatch({ participants: { A: ACCOUNT_A, B: ACCOUNT_B } });

    await pool.query('UPDATE caravan_matches SET state_version = 5 WHERE id = $1', [MATCH_ID]);
    await expect(store.load(MATCH_ID)).rejects.toThrow(/stateVersion/);
  });
});
