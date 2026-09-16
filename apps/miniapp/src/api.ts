export interface AccountProfile {
  id: string;
  displayName: string;
}

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });

  const payload = (await response.json()) as unknown;
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
  return payload as T;
}

export function currentAccount(): Promise<AccountProfile> {
  return request<AccountProfile>('/api/me');
}

export function authenticateTelegram(initData: string): Promise<AccountProfile> {
  return request<AccountProfile>('/api/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData }),
  });
}

let bootstrapPromise: Promise<AccountProfile> | undefined;

export function bootstrapAccount(initData: string): Promise<AccountProfile> {
  bootstrapPromise ??= currentAccount().catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 401 && initData.length > 0) {
      return authenticateTelegram(initData);
    }
    throw error;
  });
  return bootstrapPromise;
}
