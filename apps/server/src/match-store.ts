import type { MatchId, StateVersion } from '@caravan/protocol';
import type { AuthoritativeMatch } from './match-types.js';

export interface MatchStore {
  create(match: AuthoritativeMatch): Promise<void>;
  load(matchId: MatchId): Promise<AuthoritativeMatch | null>;
  listActiveMatchIds(): Promise<readonly MatchId[]>;
  compareAndSet(
    matchId: MatchId,
    expectedStateVersion: StateVersion,
    next: AuthoritativeMatch,
  ): Promise<boolean>;
}

function cloneMatch(match: AuthoritativeMatch): AuthoritativeMatch {
  return structuredClone(match);
}

export class InMemoryMatchStore implements MatchStore {
  readonly #matches = new Map<MatchId, AuthoritativeMatch>();

  public async create(match: AuthoritativeMatch): Promise<void> {
    if (this.#matches.has(match.id)) {
      throw new Error(`Match ${match.id} already exists.`);
    }
    this.#matches.set(match.id, cloneMatch(match));
  }

  public async load(matchId: MatchId): Promise<AuthoritativeMatch | null> {
    const match = this.#matches.get(matchId);
    return match === undefined ? null : cloneMatch(match);
  }

  public async listActiveMatchIds(): Promise<readonly MatchId[]> {
    return [...this.#matches.values()]
      .filter((match) => match.status === 'ACTIVE')
      .map((match) => match.id);
  }

  public async compareAndSet(
    matchId: MatchId,
    expectedStateVersion: StateVersion,
    next: AuthoritativeMatch,
  ): Promise<boolean> {
    const current = this.#matches.get(matchId);
    if (current === undefined || current.stateVersion !== expectedStateVersion) return false;
    if (next.id !== matchId) throw new Error('Cannot commit a match under a different id.');
    if (next.stateVersion !== expectedStateVersion + 1) {
      throw new Error('Committed match stateVersion must advance by exactly one.');
    }

    this.#matches.set(matchId, cloneMatch(next));
    return true;
  }
}
