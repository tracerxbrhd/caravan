# 08. Authenticated Server Runtime

## Status

Implemented as the HTTP/authentication foundation for the first playable. The authenticated realtime layer now consumes this boundary; see [`09-authenticated-realtime-runtime.md`](09-authenticated-realtime-runtime.md).

## Runtime boundary

`apps/server` owns a Fastify runtime with:

- fail-fast environment validation;
- `GET /health` process liveness;
- `GET /ready` PostgreSQL readiness;
- Telegram Mini App authentication;
- application sessions;
- minimal authenticated account projection;
- graceful process shutdown.

Realtime does not introduce a second identity mechanism. `/ws` uses the same session/account boundary defined here.

## Account identity model

CARAVAN uses an internal provider-independent account ID:

```text
Account
  |
  +-- AccountIdentity
        provider
        providerSubject
```

`accounts.id` is the canonical gameplay/application identity.

Telegram user IDs are stored only as `account_identities.provider_subject` for provider `TELEGRAM`. They must not become match ownership keys or leak into the game engine.

The database does not hard-code Telegram as the only possible identity provider. Additional accepted providers can later link to the same account model without changing gameplay ownership.

## Telegram authentication

The Mini App obtains raw Telegram `initData` through its platform adapter and sends it to:

```text
POST /api/auth/telegram
```

The backend:

1. rejects duplicate/ambiguous query parameters;
2. validates Telegram's HMAC-SHA256 signature using the bot token;
3. validates `auth_date` freshness and a small future-clock tolerance;
4. parses only the Telegram user fields required for account bootstrap;
5. resolves or creates the provider identity and internal account transactionally;
6. verifies that the account is active;
7. creates a CARAVAN application session.

Raw `initData` is never persisted and is explicitly redacted from request logs.

`initDataUnsafe` and client-provided Telegram user objects are never authoritative.

## Concurrent first login

Authentication serializes account creation per provider subject with a PostgreSQL transaction-scoped advisory lock.

Two simultaneous first-login requests for the same Telegram subject therefore cannot create two CARAVAN accounts before the `(provider, provider_subject)` uniqueness constraint is observed.

This coordination is database-local and requires no Redis or distributed lock service.

## Sessions

Application sessions use cryptographically random 32-byte opaque tokens.

The raw token exists only in the browser cookie and in request memory. PostgreSQL stores only its SHA-256 hash.

Session properties:

- `HttpOnly` cookie;
- `Secure` in production;
- `SameSite=Strict`;
- explicit expiration;
- explicit revocation;
- account status checked when resolving the session;
- one account may have more than one active session;
- Redis is not required.

The cookie name is `caravan_session`.

Current authenticated HTTP endpoints are:

```text
GET  /api/me
POST /api/logout
```

`/api/logout` revokes only the presented session rather than globally signing the account out everywhere.

The realtime runtime also resolves this cookie during WebSocket upgrade and revalidates it during the connection lifetime, so a revoked or disabled session does not remain authorized merely because a socket is still open.

## Account status

The initial account lifecycle supports:

- `ACTIVE`;
- `SUSPENDED`;
- `BANNED`.

Only active accounts may authenticate or resolve an application session. Moderation/admin tooling is not part of this layer.

## HTTP security baseline

The Fastify runtime:

- limits request body size;
- rate-limits requests globally and applies a stricter authentication limit;
- redacts cookies, authorization headers, `initData`, and `Set-Cookie` values from logs;
- exposes only stable public error codes rather than exception details;
- in production enforces the configured public Host and same-origin mutation requests.

The intended deployment remains same-origin for Mini App, HTTP API, and WebSocket traffic. The WebSocket route additionally validates `Origin` directly during upgrade.

## Mini App integration

Telegram access lives behind `apps/miniapp/src/platform.ts`.

When Telegram supplies raw `initData`, the Mini App authenticates that launch through `/api/auth/telegram` before using the application session. A pre-existing same-origin `caravan_session` cookie is not allowed to outrank fresh Telegram launch identity, because Telegram WebViews may preserve cookies while the user switches Telegram accounts. The backend-validated `initData` therefore rebinds the browser cookie to the correct internal account for the current launch.

Only when Telegram `initData` is unavailable does the Mini App restore an existing CARAVAN application session through `/api/me`. This fallback preserves a provider-independent path for non-Telegram/web/native clients without weakening Telegram account switching correctness.

Telegram identity remains server-verified; the client does not compare or trust `initDataUnsafe.user` as an authorization decision.

Vite proxies `/api` to the local backend during development. Client-side realtime transport is a later Mini App layer.

## Persistence

Committed migration `0001_accounts_sessions.sql` adds:

- `accounts`;
- `account_identities`;
- `sessions`;
- uniqueness and lookup indexes required by authentication/session resolution.

Authentication account creation and session creation occur in one PostgreSQL transaction.

## Testing baseline

Automated coverage protects:

- valid Telegram signature acceptance;
- tamper rejection;
- freshness/future-date rejection;
- duplicate parameter rejection;
- configuration fail-fast behavior;
- production HTTPS requirement;
- liveness and database readiness endpoints;
- internal account creation;
- Telegram identity mapping;
- session token hashing;
- `/api/me` session restoration when Telegram launch data is unavailable;
- fresh Telegram launch identity rebinding an existing browser cookie to the correct internal account;
- repeated Telegram login resolving the same account;
- logout session revocation;
- disabled-account authentication rejection.

Database-backed auth tests are mandatory in CI whenever `CARAVAN_REQUIRE_DATABASE_TESTS=1`.

## Realtime consumer

The functionality previously deferred from this layer is now implemented in [`09-authenticated-realtime-runtime.md`](09-authenticated-realtime-runtime.md):

- WebSocket handshake/session authorization;
- connection ownership/takeover;
- match resync/broadcasting;
- reconnect grace periods;
- authoritative turn/disconnect deadline scheduling;
- recovered lifecycle handling after server restart.

Matchmaking, challenges, bot flows, and client match UI remain later layers.
