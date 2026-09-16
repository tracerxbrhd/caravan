# 08. Authenticated Server Runtime

## Status

Implemented as the initial HTTP/authentication foundation for the first playable.

This layer turns `apps/server` from a domain/storage package into a runnable backend process without introducing realtime match transport prematurely.

## Runtime boundary

`apps/server` now owns a Fastify HTTP runtime with:

- fail-fast environment validation;
- `GET /health` process liveness;
- `GET /ready` PostgreSQL readiness;
- Telegram Mini App authentication;
- application sessions;
- minimal authenticated account projection;
- graceful process shutdown.

WebSocket transport, connection ownership, reconnect deadlines, matchmaking, challenges, and bot flows remain separate later layers.

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

Current authenticated endpoints are:

```text
GET  /api/me
POST /api/logout
```

`/api/logout` revokes only the presented session rather than globally signing the account out everywhere.

## Account status

The initial account lifecycle supports:

- `ACTIVE`;
- `SUSPENDED`;
- `BANNED`.

Only active accounts may authenticate or resolve an application session. Moderation/admin tooling is not part of this PR.

## HTTP security baseline

The Fastify runtime:

- limits request body size;
- rate-limits requests globally and applies a stricter authentication limit;
- redacts cookies, authorization headers, `initData`, and `Set-Cookie` values from logs;
- exposes only stable public error codes rather than exception details;
- in production enforces the configured public Host and same-origin mutation requests.

The intended deployment remains same-origin for Mini App, HTTP API, and future WebSocket traffic.

## Mini App integration

Telegram access lives behind `apps/miniapp/src/platform.ts`.

The Mini App first attempts to restore an existing CARAVAN session with `/api/me`. Only when that returns unauthenticated does it submit Telegram `initData`.

This keeps Telegram APIs out of general application/game UI code and avoids issuing a new server session on every React remount when an existing cookie is valid.

Vite proxies `/api` to the local backend during development.

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
- `/api/me` session restoration;
- repeated Telegram login resolving the same account;
- logout session revocation;
- disabled-account authentication rejection.

Database-backed auth tests are mandatory in CI whenever `CARAVAN_REQUIRE_DATABASE_TESTS=1`.

## Deferred to the realtime PR

This layer deliberately does not yet implement:

- WebSocket handshake/session authorization;
- connection ownership/takeover;
- match subscription/broadcasting;
- reconnect grace periods;
- authoritative turn/disconnect deadline scheduling;
- recovered deadline execution after server restart.

Those should consume the session/account boundary defined here rather than invent another authentication mechanism.
