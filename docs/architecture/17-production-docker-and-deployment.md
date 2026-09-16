# 17. Production Docker and Deployment

## Status

Accepted and implemented as the first-playable production deployment baseline.

This document defines how the existing CARAVAN server, Telegram bot, Mini App and PostgreSQL runtime are packaged and deployed. It does not register Telegram webhooks or configure Telegram Bot API production metadata; that wiring remains a separate step.

## Operational model

CARAVAN intentionally uses one production host and one Docker Compose project while the product is in first-playable validation.

```text
Internet
  |
  | HTTPS
  v
host TLS / reverse proxy
  |
  | loopback HTTP
  v
CARAVAN web container (Caddy)
  |-- /              -> Mini App static files
  |-- /api/*         -> server:3000
  |-- /ws            -> server:3000
  |-- /health        -> server:3000
  |-- /ready         -> server:3000
  `-- /telegram/webhook -> bot:3001

server ----> PostgreSQL
bot
```

Only the `web` service publishes a host port, and it binds to `127.0.0.1` by default. PostgreSQL, the authoritative server and the bot remain reachable only on the Compose network.

The host-level reverse proxy owns public TLS and forwards the CARAVAN hostname to `127.0.0.1:${CARAVAN_HTTP_PORT}`. This allows CARAVAN to coexist with UNDERGAMMON or other applications on the same VPS without competing for host ports 80/443.

## Images

The repository root `Dockerfile` is multi-stage and produces three deployable targets:

- `server` — Node.js 24 production runtime for `apps/server` plus committed database migrations;
- `bot` — Node.js 24 production runtime for `apps/bot`;
- `web` — Caddy serving the built Mini App and reverse-proxying application routes.

The Node runtime targets run as the unprivileged `node` user. Production dependencies are materialized with pnpm deploy rather than shipping the whole monorepo/node_modules tree.

`VITE_TELEGRAM_BOT_USERNAME` is the only current build-time Mini App deployment value. It is public configuration, not a secret. Tokens, database credentials and webhook secrets are runtime-only values and must never be baked into images.

## Compose boundaries

`compose.yaml` remains the lightweight local-development PostgreSQL dependency.

`compose.production.yaml` is the production application stack and owns:

- persistent PostgreSQL storage;
- server/bot/web image builds;
- service dependency ordering;
- liveness/readiness healthchecks;
- runtime configuration injection;
- the loopback-only application edge port.

The two Compose files are deliberately separate so production requirements do not make normal local development depend on production secrets.

## Configuration and secrets

`.env.production.example` documents the production environment contract. The real `.env.production` exists only on the production host and is ignored by Git.

Required sensitive values include at minimum:

- `POSTGRES_PASSWORD`;
- `DATABASE_URL`;
- `BOT_TOKEN`;
- `TELEGRAM_WEBHOOK_SECRET`.

`PUBLIC_ORIGIN` must be the final HTTPS origin. `DATABASE_URL` uses the internal Compose hostname `db`; special characters in database passwords must be URL-encoded in that URL.

The deploy workflow does not copy secrets from GitHub into the application environment. The VPS keeps its own `.env.production`, reducing secret exposure during deployment.

## Health and readiness

The server exposes two distinct probes:

- `/health` — process liveness;
- `/ready` — readiness including PostgreSQL connectivity.

The server container healthcheck uses `/ready`; the bot uses its `/health`; the web container verifies the proxied public-style `/health` route.

A production rollout is not considered healthy until Docker Compose reports all application services healthy and the GitHub deployment workflow can reach the public HTTPS `/health` endpoint.

## Database migrations

Migrations remain committed Drizzle migrations owned by `apps/server`.

Deployment order is:

1. build the selected commit's images;
2. ensure PostgreSQL is healthy;
3. run `node dist/migrate-cli.js` from the new server image as a one-shot container;
4. only if migration succeeds, recreate/update the application services;
5. wait for service healthchecks;
6. verify the public health endpoint.

A failed migration stops the rollout before the new application containers replace the running service. Schema changes should remain backward-compatible/additive whenever practical because the old application may still be running while the migration is applied.

## Deployment workflow

`.github/workflows/deploy.yml` is manual (`workflow_dispatch`) and uses the GitHub `production` environment.

Every deployment first calls the same repository verification workflow used by pull requests. The deployment job then SSHes to the VPS, checks out the exact selected commit in detached mode, validates the production Compose configuration, builds images, applies migrations, updates the stack and verifies public health.

Automatic deployment on every merge is intentionally avoided. CARAVAN has realtime matches, so production restarts should remain deliberate during first-playable validation.

The GitHub production environment requires these deployment values:

Secrets:

- `VPS_SSH_KEY`;
- `VPS_KNOWN_HOSTS`;
- `VPS_HOST`;
- `VPS_USER`.

Variables:

- `DEPLOY_PATH`;
- `PUBLIC_ORIGIN`.

Application secrets remain in the VPS `.env.production`, not in those GitHub variables.

## CI contract

CI validates both deployment representations:

- local `compose.yaml` parses successfully;
- `compose.production.yaml` parses against the committed example environment;
- all production image targets build;
- the bundled Caddy configuration validates;
- normal build/lint/format/typecheck/tests/database migration checks and production dependency audit still pass.

A Docker-only failure therefore blocks the PR even when the TypeScript workspace itself is green.

## Restart and recovery

PostgreSQL state lives in a named Docker volume. Authoritative unfinished matches and deadlines are already durable in PostgreSQL; restarting the server container must recover them through the existing server recovery path rather than trusting any client state.

The deployment stack deliberately runs one authoritative server instance. Multi-instance coordination, Redis, queues, Kubernetes and service discovery are not introduced until there is an objective need.

## Boundary with the next production step

This layer makes CARAVAN deployable but does not make a particular Telegram bot/public domain live by itself.

Production Telegram wiring remains responsible for operations such as:

- choosing/finalizing the real public hostname;
- pointing the host TLS proxy at CARAVAN's loopback port;
- creating/finalizing the real bot configuration;
- registering the Telegram webhook URL and secret;
- configuring the Mini App/Menu Button entry as required;
- performing the first real Telegram-account smoke test.

Those operations must reuse this deployment topology rather than introduce a second runtime path.
