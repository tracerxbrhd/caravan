# 11. Telegram Bot Entry and Challenge Deep Links

## Status

Implemented as the thin Telegram entry boundary for the first playable. This layer launches the Mini App and carries private-challenge context; it does not own accounts, matchmaking, challenge acceptance, game rules, or match state.

## Responsibilities

`apps/bot` now owns only Telegram-facing entry concerns:

- `GET /health` for bot-process liveness;
- `POST /telegram/webhook` for Telegram Bot API updates;
- `/start` presentation in Russian or English;
- a direct Mini App launch action;
- validation of bounded launch payloads;
- fallback handling for `/start challenge_<inviteToken>`;
- construction of Main Mini App deep links.

The bot uses the Node.js 24 HTTP/fetch runtime directly. No bot framework, second application framework, queue, or Telegram-specific game service is introduced for this small boundary.

## Launch context

The accepted first launch context is deliberately tiny:

```text
HOME
CHALLENGE -> challenge_<43-character invite token>
```

A challenge link is therefore:

```text
https://t.me/<BOT_USERNAME>?startapp=challenge_<inviteToken>
```

Telegram passes a non-empty `startapp` value into the Mini App launch context. The upcoming Mini App Play layer must read that value through the platform adapter, validate the same format, authenticate normally, and then submit the invite token to the existing authenticated challenge API.

Unknown, malformed, overlong, or unsupported `/start` payloads fail closed and are not reflected back to the user.

## Challenge security boundary

The private invite token is a short-lived bearer capability, not player identity and not proof that a match exists.

The bot never accepts a challenge or creates a match. It only transports the token into the Mini App. The authenticated server remains authoritative:

```text
Telegram link
  -> Mini App launch context
  -> CARAVAN application session
  -> POST /api/challenges/accept
  -> MatchEntryService
  -> authoritative MatchService
```

The raw invite token is intentionally present in the invitation/deep link because the recipient needs the capability, but it must not be written to application logs, analytics, error payloads, or durable bot storage. PostgreSQL continues to store only its SHA-256 hash in the challenge row.

## Webhook security

`POST /telegram/webhook` requires the configured `X-Telegram-Bot-Api-Secret-Token` value before the request body is parsed.

The runtime also:

- caps webhook request bodies at 64 KiB by default;
- parses only the minimal update fields required for `/start`;
- does not log incoming update bodies;
- does not log bot tokens, webhook secrets, launch payloads, or invite tokens;
- emits only a generic processing-failure message on unexpected update errors;
- bounds Telegram Bot API calls with a timeout.

`TELEGRAM_WEBHOOK_SECRET` must be a high-entropy 32-256 character URL-safe value in non-local environments.

## Configuration

The bot runtime uses:

```text
NODE_ENV
PUBLIC_ORIGIN
BOT_TOKEN
BOT_USERNAME
BOT_HOST
BOT_PORT
TELEGRAM_WEBHOOK_SECRET
```

`PUBLIC_ORIGIN` is the public Mini App origin and must be HTTPS in production. Telegram-specific configuration stays in the bot/runtime boundary; game-engine and authoritative match state do not depend on it.

## Deployment direction

The currently intended production origin is:

```text
https://caravan.tracerxbrhd.ru
```

DNS already points that hostname at the existing VPS. The intended deployment is an isolated CARAVAN Docker stack on that server, with the public reverse proxy eventually routing the same origin approximately as follows:

```text
/                  -> Mini App static/client surface
/api/*             -> apps/server
/ws                 -> apps/server WebSocket
/telegram/webhook  -> apps/bot
```

This document records the boundary and target topology only. Production Docker images, reverse-proxy configuration, TLS wiring, and webhook registration remain a later deployment-focused change and must not be represented as already implemented.

## Portability

Challenge launch meaning is an application concern, while Telegram `startapp` syntax is a platform transport detail. The Mini App must expose launch context through `PlatformAdapter` rather than letting Telegram globals spread through application/game components. A future standalone client can supply equivalent challenge context through its own deep-link adapter without changing server challenge semantics.

## Testing baseline

Bot/entry changes should protect at least:

- fail-fast configuration and production HTTPS requirements;
- strict challenge launch-parameter shape;
- `/start@BotName` address filtering;
- webhook-secret enforcement before body processing;
- health behavior;
- challenge fallback producing the expected Main Mini App link;
- unsupported payloads not being reflected into replies;
- Telegram API failures not exposing raw response/update data through normal logs.

## Deferred

This layer deliberately does not add:

- challenge creation/acceptance logic in the bot;
- Telegram user IDs as gameplay identity;
- Mini App Play/matchmaking UI;
- Mini App launch-context consumption;
- Telegram notifications for match lifecycle;
- inline-mode sharing UX;
- webhook setup automation;
- Docker/reverse-proxy deployment.

Those belong to later focused layers only when required by the first-playable journey.
