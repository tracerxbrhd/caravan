import {
  acceptedChallengeSchema,
  challengeResolutionSchema,
  challengeViewSchema,
  createChallengeResponseSchema,
  matchmakingStatusSchema,
  rematchStatusSchema,
  type AcceptedChallenge,
  type ChallengeId,
  type ChallengeResolution,
  type ChallengeView,
  type CreateChallengeResponse,
  type InviteToken,
  type MatchId,
  type MatchmakingStatus,
  type RematchStatus,
} from '@caravan/protocol';

export interface AccountProfile {
  id: string;
  displayName: string;
}

interface RuntimeSchema<T> {
  parse(input: unknown): T;
}

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

export class ResponseValidationError extends Error {
  public constructor() {
    super('INVALID_SERVER_RESPONSE');
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ResponseValidationError();
  }

  if (!response.ok) {
    const code =
      typeof payload === 'object' &&
      payload !== null &&
      'code' in payload &&
      typeof payload.code === 'string'
        ? payload.code
        : 'REQUEST_FAILED';
    throw new ApiError(response.status, code);
  }
  return payload;
}

async function requestParsed<T>(
  path: string,
  schema: RuntimeSchema<T>,
  init?: RequestInit,
): Promise<T> {
  const payload = await request(path, init);
  try {
    return schema.parse(payload);
  } catch {
    throw new ResponseValidationError();
  }
}

function parseAccountProfile(payload: unknown): AccountProfile {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('id' in payload) ||
    typeof payload.id !== 'string' ||
    !('displayName' in payload) ||
    typeof payload.displayName !== 'string'
  ) {
    throw new ResponseValidationError();
  }
  return { id: payload.id, displayName: payload.displayName };
}

export async function currentAccount(): Promise<AccountProfile> {
  return parseAccountProfile(await request('/api/me'));
}

export async function authenticateTelegram(initData: string): Promise<AccountProfile> {
  return parseAccountProfile(
    await request('/api/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    }),
  );
}

export function matchmakingStatus(): Promise<MatchmakingStatus> {
  return requestParsed('/api/matchmaking', matchmakingStatusSchema);
}

export function joinMatchmaking(): Promise<MatchmakingStatus> {
  return requestParsed('/api/matchmaking/join', matchmakingStatusSchema, { method: 'POST' });
}

export function heartbeatMatchmaking(): Promise<MatchmakingStatus> {
  return requestParsed('/api/matchmaking/heartbeat', matchmakingStatusSchema, { method: 'POST' });
}

export function leaveMatchmaking(): Promise<MatchmakingStatus> {
  return requestParsed('/api/matchmaking', matchmakingStatusSchema, { method: 'DELETE' });
}

export function createChallenge(): Promise<CreateChallengeResponse> {
  return requestParsed('/api/challenges', createChallengeResponseSchema, { method: 'POST' });
}

export function challengeStatus(challengeId: ChallengeId): Promise<ChallengeView> {
  return requestParsed(`/api/challenges/${encodeURIComponent(challengeId)}`, challengeViewSchema);
}

export function acceptChallenge(inviteToken: InviteToken): Promise<AcceptedChallenge> {
  return requestParsed('/api/challenges/accept', acceptedChallengeSchema, {
    method: 'POST',
    body: JSON.stringify({ inviteToken }),
  });
}

export function declineChallenge(inviteToken: InviteToken): Promise<ChallengeResolution> {
  return requestParsed('/api/challenges/decline', challengeResolutionSchema, {
    method: 'POST',
    body: JSON.stringify({ inviteToken }),
  });
}

export function cancelChallenge(challengeId: ChallengeId): Promise<ChallengeResolution> {
  return requestParsed(
    `/api/challenges/${encodeURIComponent(challengeId)}/cancel`,
    challengeResolutionSchema,
    {
      method: 'POST',
    },
  );
}

export function rematchStatus(matchId: MatchId): Promise<RematchStatus> {
  return requestParsed(`/api/matches/${encodeURIComponent(matchId)}/rematch`, rematchStatusSchema);
}

export function requestRematch(matchId: MatchId): Promise<RematchStatus> {
  return requestParsed(`/api/matches/${encodeURIComponent(matchId)}/rematch`, rematchStatusSchema, {
    method: 'POST',
  });
}

export function cancelRematch(matchId: MatchId): Promise<RematchStatus> {
  return requestParsed(`/api/matches/${encodeURIComponent(matchId)}/rematch`, rematchStatusSchema, {
    method: 'DELETE',
  });
}

let bootstrapPromise: Promise<AccountProfile> | undefined;

export function bootstrapAccount(initData: string): Promise<AccountProfile> {
  if (bootstrapPromise === undefined) {
    const attempt = currentAccount().catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401 && initData.length > 0) {
        return authenticateTelegram(initData);
      }
      throw error;
    });
    bootstrapPromise = attempt.then(
      (account) => {
        bootstrapPromise = undefined;
        return account;
      },
      (error: unknown) => {
        bootstrapPromise = undefined;
        throw error;
      },
    );
  }
  return bootstrapPromise;
}
