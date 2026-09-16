# Production Deployment Runbook

This runbook is the operator-facing companion to [`../architecture/17-production-docker-and-deployment.md`](../architecture/17-production-docker-and-deployment.md).

## One-time VPS preparation

The production host needs Git, Docker Engine with the Compose plugin, and an existing HTTPS reverse proxy capable of forwarding one hostname to a loopback HTTP port.

Clone the repository into a stable absolute path, for example:

```bash
git clone https://github.com/tracerxbrhd/caravan.git /srv/caravan
cd /srv/caravan
cp .env.production.example .env.production
```

Edit `.env.production` with real production values. Never commit that file.

At minimum replace the database password/URL, Telegram bot token, bot username, webhook secret and `PUBLIC_ORIGIN`. The database URL must use `db` as the hostname because the server connects over the Compose network.

Validate the configuration before the first rollout:

```bash
docker compose --env-file .env.production -f compose.production.yaml config --quiet
```

## Host reverse proxy

The CARAVAN web container binds only to loopback, defaulting to:

```text
127.0.0.1:18081
```

Configure the host's existing TLS proxy so the final CARAVAN HTTPS hostname forwards to that address while preserving the public `Host` and `X-Forwarded-Proto` headers.

Do not expose PostgreSQL, `server:3000`, or `bot:3001` directly on the public host interface.

## GitHub production environment

Create/use a GitHub Environment named `production`.

Environment secrets:

```text
VPS_SSH_KEY
VPS_KNOWN_HOSTS
VPS_HOST
VPS_USER
```

Environment variables:

```text
DEPLOY_PATH=/srv/caravan
PUBLIC_ORIGIN=https://your-caravan-host.example
```

`VPS_KNOWN_HOSTS` should contain a pinned host key collected out-of-band, not the output of an unchecked `ssh-keyscan` performed inside the deployment job.

The application `.env.production` remains on the VPS; do not duplicate its bot/database secrets into GitHub unless a later workflow has a concrete need for them.

## Manual first deployment

Before using GitHub Actions, the same sequence can be exercised directly on the VPS:

```bash
cd /srv/caravan
git fetch origin
git checkout --detach <commit-sha>

docker compose --env-file .env.production -f compose.production.yaml build
docker compose --env-file .env.production -f compose.production.yaml up -d --wait db
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps server node dist/migrate-cli.js
docker compose --env-file .env.production -f compose.production.yaml up -d --wait
```

Then verify both internal and public health:

```bash
curl --fail http://127.0.0.1:18081/health
curl --fail https://your-caravan-host.example/health
```

The first command assumes the default `CARAVAN_HTTP_PORT`; use the configured port if it differs.

## Normal deployments

Use **Actions -> Deploy production -> Run workflow** and select the commit/ref intended for production.

The workflow first runs the repository verification job, then deploys that exact `GITHUB_SHA`. It will stop on Compose validation, image build, migration, service health, or public health failure.

Do not make routine production changes by editing files inside running containers.

## Inspecting the stack

Useful commands on the VPS:

```bash
cd /srv/caravan
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 server
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 bot
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200 web
```

Avoid dumping environment variables or raw database rows into support logs because they may contain authentication material or privileged match state.

## Rollback

For an application-only regression, redeploy a previously verified commit:

```bash
cd /srv/caravan
git fetch origin
git checkout --detach <previous-good-sha>
docker compose --env-file .env.production -f compose.production.yaml build
docker compose --env-file .env.production -f compose.production.yaml up -d --wait
```

Database rollback is intentionally not automatic. Migrations should therefore be additive/backward-compatible whenever practical. If a migration itself is unsafe, stop and recover deliberately rather than running an automatic down migration against production data.

## Data persistence

PostgreSQL uses the `postgres_data` named Docker volume. `docker compose down` without `-v` preserves it; commands that remove volumes can destroy production data.

Off-host automated backups are not introduced by this PR. Before inviting meaningful external testing, the operator should at minimum have a deliberate `pg_dump`/restore procedure and keep backup files outside the repository.

## Telegram wiring

A healthy Docker deployment is not the same as a fully wired Telegram production bot.

Webhook registration, Mini App/Menu Button configuration and the first real Telegram-account smoke test belong to the next production-wiring step. Do not invent a second bot/server deployment path for them; point Telegram at the public routes provided by this stack.
