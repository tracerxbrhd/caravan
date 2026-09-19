import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { RawData, WebSocket } from 'ws';
import { parseServerMessage, type ServerMessage } from '@caravan/protocol';
import {
  MatchService,
  PostgresMatchStore,
  SESSION_COOKIE_NAME,
  buildServer,
  createPool,
  migrateDatabase,
} from '../src/index.js';
import { signedTelegramInitData, testConfig } from './auth-fixtures.js';

const databaseUrl = process.env.DATABASE_URL;
if (process.env.CARAVAN_REQUIRE_DATABASE_TESTS === '1' && databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required when CARAVAN_REQUIRE_DATABASE_TESTS=1.');
}

const describeDatabase = databaseUrl === undefined ? describe.skip : describe;
const profileSchema = z.object({ id: z.string().uuid(), displayName: z.string().min(1) }).strict();

function cookiePair(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (value === undefined) throw new Error('Expected authentication to set a session cookie.');
  const [pair] = value.split(';');
  if (pair === undefined || !pair.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error('Expected CARAVAN session cookie.');
  }
  return pair;
}

function nextMessage(socket: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('message', onMessage);
      socket.off('close', onClose);
    };
    const onMessage = (data: RawData) => {
      cleanup();
      try {
        resolve(parseServerMessage(JSON.parse(data.toString()) as unknown));
      } catch (error) {
        reject(error);
      }
    };
    const onClose = (code: number) => {
      cleanup();
      reject(new Error(`WebSocket closed before a message arrived (${code}).`));
    };
    socket.once('message', onMessage);
    socket.once('close', onClose);
  });
}

function nextClose(socket: WebSocket): Promise<{ readonly code: number; readonly reason: string }> {
  return new Promise((resolve) => {
    socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

async function roundTrip(socket: WebSocket, payload: unknown): Promise<ServerMessage> {
  const response = nextMessage(socket);
  socket.send(JSON.stringify(payload));
  return response;
}

describeDatabase('authenticated realtime runtime', () => {
  const requiredDatabaseUrl = databaseUrl as string;
  const pool = createPool(requiredDatabaseUrl);
  const config = testConfig(requiredDatabaseUrl);
  const store = new PostgresMatchStore(pool);
  const service = new MatchService(store, {
    turnTimeoutMs: config.TURN_TIMEOUT_SECONDS * 1_000,
    reconnectGraceMs: config.RECONNECT_GRACE_SECONDS * 1_000,
  });
  let app: Awaited<ReturnType<typeof buildServer>>;
  let appClosed = false;

  beforeAll(async () => {
    await migrateDatabase(pool);
    app = await buildServer(pool, config, { matchService: service });
    await app.ready();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE caravan_matches, sessions, account_identities, accounts CASCADE',
    );
  });

  afterAll(async () => {
    if (!appClosed) await app.close();
    await pool.end();
  });

  async function authenticate(userId: number, firstName: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData: signedTelegramInitData({ userId, firstName }) },
    });
    expect(response.statusCode).toBe(200);
    return {
      profile: profileSchema.parse(response.json()),
      cookie: cookiePair(response.headers['set-cookie']),
    };
  }

  async function openSocket(cookie: string): Promise<WebSocket> {
    return app.injectWS('/ws', {
      headers: {
        cookie,
        origin: config.PUBLIC_ORIGIN,
      },
    });
  }

  it('rejects a websocket upgrade without the existing authenticated session boundary', async () => {
    await expect(
      app.injectWS('/ws', { headers: { origin: config.PUBLIC_ORIGIN } }),
    ).rejects.toThrow();
  });

  it('resyncs sanitized views, owns one controlling socket and persists commands before broadcast', async () => {
    const a = await authenticate(10_001, 'Courier A');
    const b = await authenticate(10_002, 'Courier B');
    const { matchId } = await service.createMatch({
      participants: { A: a.profile.id, B: b.profile.id },
    });
    const authoritative = await store.load(matchId);
    const hiddenOpponentCardId = authoritative?.game.players.B.hand[0];
    if (hiddenOpponentCardId === undefined) throw new Error('Expected a private player B hand.');

    const socketA = await openSocket(a.cookie);
    const socketB = await openSocket(b.cookie);
    let socketA2: WebSocket | null = null;
    let socketA3: WebSocket | null = null;

    try {
      const unsupported = await roundTrip(socketA, { protocolVersion: 2, type: 'RESYNC' });
      expect(unsupported).toMatchObject({
        type: 'PROTOCOL_ERROR',
        code: 'UNSUPPORTED_PROTOCOL_VERSION',
      });

      const firstA = await roundTrip(socketA, {
        protocolVersion: 1,
        type: 'RESYNC',
        matchId,
        commandId: '00000000-0000-4000-8000-000000000811',
        knownStateVersion: null,
      });
      expect(firstA.type).toBe('SNAPSHOT');
      if (firstA.type !== 'SNAPSHOT') throw new Error('Expected player A resync snapshot.');
      expect(firstA.snapshot.connected).toEqual({ A: true, B: false });
      expect(firstA.snapshot.turnDeadlineAtMs).toBeNull();

      const earlyCard = firstA.snapshot.game.hand[0];
      if (earlyCard === undefined) throw new Error('Expected a private player A hand.');
      const notReady = await roundTrip(socketA, {
        protocolVersion: 1,
        type: 'GAME_ACTION',
        matchId,
        commandId: '00000000-0000-4000-8000-000000000812',
        expectedStateVersion: firstA.snapshot.stateVersion,
        action: { type: 'DISCARD_HAND_CARD', cardId: earlyCard.id },
      });
      expect(notReady).toMatchObject({
        type: 'COMMAND_REJECTED',
        code: 'MATCH_NOT_READY',
        retryable: true,
      });

      const updateForA = nextMessage(socketA);
      const responseForB = nextMessage(socketB);
      socketB.send(
        JSON.stringify({
          protocolVersion: 1,
          type: 'RESYNC',
          matchId,
          commandId: '00000000-0000-4000-8000-000000000813',
          knownStateVersion: null,
        }),
      );
      const [secondA, firstB] = await Promise.all([updateForA, responseForB]);
      expect(secondA.type).toBe('SNAPSHOT');
      expect(firstB.type).toBe('SNAPSHOT');
      if (secondA.type !== 'SNAPSHOT' || firstB.type !== 'SNAPSHOT') {
        throw new Error('Expected per-player snapshots after the second player joined.');
      }
      expect(secondA.commandId).toBeNull();
      expect(secondA.snapshot.connected).toEqual({ A: true, B: true });
      expect(secondA.snapshot.turnDeadlineAtMs).not.toBeNull();
      expect(JSON.stringify(secondA)).not.toContain(hiddenOpponentCardId);
      expect(JSON.stringify(firstB)).toContain(hiddenOpponentCardId);

      socketA2 = await openSocket(a.cookie);
      const oldControlClosed = nextClose(socketA);
      const takeoverResponse = nextMessage(socketA2);
      const takeoverBroadcast = nextMessage(socketB);
      socketA2.send(
        JSON.stringify({
          protocolVersion: 1,
          type: 'RESYNC',
          matchId,
          commandId: '00000000-0000-4000-8000-000000000814',
          knownStateVersion: secondA.snapshot.stateVersion,
        }),
      );
      const [takenOver, closed, peerAfterTakeover] = await Promise.all([
        takeoverResponse,
        oldControlClosed,
        takeoverBroadcast,
      ]);
      expect(takenOver.type).toBe('SNAPSHOT');
      expect(peerAfterTakeover.type).toBe('SNAPSHOT');
      expect(closed).toEqual({ code: 4001, reason: 'CONTROL_REPLACED' });
      expect((await service.getSnapshot(matchId, a.profile.id))?.connected.A).toBe(true);

      socketA3 = await openSocket(a.cookie);
      const nonOwner = await roundTrip(socketA3, {
        protocolVersion: 1,
        type: 'SURRENDER',
        matchId,
        commandId: '00000000-0000-4000-8000-000000000815',
        expectedStateVersion: secondA.snapshot.stateVersion,
      });
      expect(nonOwner).toMatchObject({
        type: 'COMMAND_REJECTED',
        code: 'CONNECTION_NOT_OWNER',
        retryable: true,
      });

      const finalForB = nextMessage(socketB);
      const finalForA = nextMessage(socketA2);
      socketA2.send(
        JSON.stringify({
          protocolVersion: 1,
          type: 'SURRENDER',
          matchId,
          commandId: '00000000-0000-4000-8000-000000000816',
          expectedStateVersion: secondA.snapshot.stateVersion,
        }),
      );
      const [accepted, broadcast] = await Promise.all([finalForA, finalForB]);
      expect(accepted.type).toBe('SNAPSHOT');
      expect(broadcast.type).toBe('SNAPSHOT');
      if (accepted.type !== 'SNAPSHOT' || broadcast.type !== 'SNAPSHOT') {
        throw new Error('Expected persisted final snapshots.');
      }
      expect(accepted.snapshot.status).toBe('FINISHED');
      expect(accepted.snapshot.result).toEqual({ reason: 'SURRENDER', winner: 'B', loser: 'A' });
      expect(broadcast.snapshot.stateVersion).toBe(accepted.snapshot.stateVersion);

      const persisted = await store.load(matchId);
      expect(persisted?.status).toBe('FINISHED');
      expect(persisted?.stateVersion).toBe(accepted.snapshot.stateVersion);
    } finally {
      socketA.terminate();
      socketB.terminate();
      socketA2?.terminate();
      socketA3?.terminate();
    }
  });

  it('allows surrender before the opponent connects so a recovered waiting match can be left', async () => {
    const a = await authenticate(15_001, 'Waiting A');
    const b = await authenticate(15_002, 'Waiting B');
    const { matchId } = await service.createMatch({
      participants: { A: a.profile.id, B: b.profile.id },
    });
    const socketA = await openSocket(a.cookie);

    try {
      const firstA = await roundTrip(socketA, {
        protocolVersion: 1,
        type: 'RESYNC',
        matchId,
        commandId: '00000000-0000-4000-8000-000000000817',
        knownStateVersion: null,
      });
      expect(firstA.type).toBe('SNAPSHOT');
      if (firstA.type !== 'SNAPSHOT') throw new Error('Expected waiting match snapshot.');
      expect(firstA.snapshot.connected).toEqual({ A: true, B: false });
      expect(firstA.snapshot.turnDeadlineAtMs).toBeNull();

      const finished = await roundTrip(socketA, {
        protocolVersion: 1,
        type: 'SURRENDER',
        matchId,
        commandId: '00000000-0000-4000-8000-000000000818',
        expectedStateVersion: firstA.snapshot.stateVersion,
      });
      expect(finished.type).toBe('SNAPSHOT');
      if (finished.type !== 'SNAPSHOT') throw new Error('Expected surrender snapshot.');
      expect(finished.snapshot.status).toBe('FINISHED');
      expect(finished.snapshot.result).toEqual({ reason: 'SURRENDER', winner: 'B', loser: 'A' });

      const matchmaking = await app.inject({
        method: 'GET',
        url: '/api/matchmaking',
        headers: { cookie: a.cookie },
      });
      expect(matchmaking.statusCode).toBe(200);
      expect(matchmaking.json()).toEqual({ status: 'IDLE' });
    } finally {
      socketA.terminate();
    }
  });

  it('lets the connected active player act while the opponent is inside reconnect grace', async () => {
    const a = await authenticate(20_001, 'Active A');
    const b = await authenticate(20_002, 'Active B');
    const { matchId } = await service.createMatch({
      participants: { A: a.profile.id, B: b.profile.id },
    });
    const socketA = await openSocket(a.cookie);
    const socketB = await openSocket(b.cookie);

    try {
      const firstA = await roundTrip(socketA, {
        protocolVersion: 1,
        type: 'RESYNC',
        matchId,
        commandId: '00000000-0000-4000-8000-000000000821',
        knownStateVersion: null,
      });
      expect(firstA.type).toBe('SNAPSHOT');

      const startedForA = nextMessage(socketA);
      const startedForB = nextMessage(socketB);
      socketB.send(
        JSON.stringify({
          protocolVersion: 1,
          type: 'RESYNC',
          matchId,
          commandId: '00000000-0000-4000-8000-000000000822',
          knownStateVersion: null,
        }),
      );
      const [snapshotA, snapshotB] = await Promise.all([startedForA, startedForB]);
      expect(snapshotA.type).toBe('SNAPSHOT');
      expect(snapshotB.type).toBe('SNAPSHOT');
      if (snapshotA.type !== 'SNAPSHOT' || snapshotB.type !== 'SNAPSHOT') {
        throw new Error('Expected match-start snapshots.');
      }

      const activeSeat = snapshotA.snapshot.game.activePlayer;
      const active = activeSeat === 'A' ? a : b;
      const disconnected = activeSeat === 'A' ? b : a;
      const activeSocket = activeSeat === 'A' ? socketA : socketB;
      const disconnectedSocket = activeSeat === 'A' ? socketB : socketA;

      const disconnectedSnapshot = await service.disconnectPlayer(matchId, disconnected.profile.id);
      expect(disconnectedSnapshot).not.toBeNull();

      const before = await service.getSnapshot(matchId, active.profile.id);
      if (before === null)
        throw new Error('Expected active-player snapshot after peer disconnect.');
      expect(before.status).toBe('ACTIVE');
      expect(before.connected[activeSeat]).toBe(true);
      expect(before.connected[activeSeat === 'A' ? 'B' : 'A']).toBe(false);
      expect(before.turnDeadlineAtMs).not.toBeNull();
      expect(before.reconnectDeadlineAtMs[activeSeat === 'A' ? 'B' : 'A']).not.toBeNull();

      const action = before.game.legalActions[0];
      if (action === undefined) throw new Error('Expected a legal action for the active player.');

      const peerBroadcast = nextMessage(disconnectedSocket);
      const response = nextMessage(activeSocket);
      activeSocket.send(
        JSON.stringify({
          protocolVersion: 1,
          type: 'GAME_ACTION',
          matchId,
          commandId: '00000000-0000-4000-8000-000000000823',
          expectedStateVersion: before.stateVersion,
          action,
        }),
      );

      const [accepted, broadcast] = await Promise.all([response, peerBroadcast]);
      expect(accepted.type).toBe('SNAPSHOT');
      expect(broadcast.type).toBe('SNAPSHOT');
      if (accepted.type !== 'SNAPSHOT' || broadcast.type !== 'SNAPSHOT') {
        throw new Error('Expected an accepted action and peer broadcast during reconnect grace.');
      }
      expect(accepted.snapshot.stateVersion).toBe(before.stateVersion + 1);
      expect(accepted.snapshot.status).toBe('ACTIVE');
      expect(broadcast.snapshot.stateVersion).toBe(accepted.snapshot.stateVersion);
      expect(broadcast.snapshot.connected[activeSeat === 'A' ? 'B' : 'A']).toBe(false);
    } finally {
      socketA.terminate();
      socketB.terminate();
    }
  });

  it('closes sockets for service restart without persisting player disconnect penalties', async () => {
    const a = await authenticate(30_001, 'Restart A');
    const b = await authenticate(30_002, 'Restart B');
    const { matchId } = await service.createMatch({
      participants: { A: a.profile.id, B: b.profile.id },
    });
    const socketA = await openSocket(a.cookie);
    const socketB = await openSocket(b.cookie);

    const firstA = await roundTrip(socketA, {
      protocolVersion: 1,
      type: 'RESYNC',
      matchId,
      commandId: '00000000-0000-4000-8000-000000000831',
      knownStateVersion: null,
    });
    expect(firstA.type).toBe('SNAPSHOT');

    const startedForA = nextMessage(socketA);
    const startedForB = nextMessage(socketB);
    socketB.send(
      JSON.stringify({
        protocolVersion: 1,
        type: 'RESYNC',
        matchId,
        commandId: '00000000-0000-4000-8000-000000000832',
        knownStateVersion: null,
      }),
    );
    await Promise.all([startedForA, startedForB]);

    const beforeShutdown = await store.load(matchId);
    expect(beforeShutdown?.connected).toEqual({ A: true, B: true });
    expect(beforeShutdown?.reconnectDeadlineAtMs).toEqual({ A: null, B: null });

    const closedA = nextClose(socketA);
    const closedB = nextClose(socketB);
    await app.close();
    appClosed = true;

    await expect(Promise.all([closedA, closedB])).resolves.toEqual([
      { code: 1012, reason: 'SERVICE_RESTART' },
      { code: 1012, reason: 'SERVICE_RESTART' },
    ]);

    const persisted = await store.load(matchId);
    expect(persisted?.connected).toEqual({ A: true, B: true });
    expect(persisted?.reconnectDeadlineAtMs).toEqual({ A: null, B: null });
    expect(persisted?.stateVersion).toBe(beforeShutdown?.stateVersion);
  });
});
