# Production Telegram Wiring Runbook

This runbook is the operator-facing companion to [`../architecture/18-production-telegram-wiring.md`](../architecture/18-production-telegram-wiring.md).

## Before the first production wiring

The CARAVAN production stack and public HTTPS origin must already be healthy through the deployment path in [`production-deployment.md`](production-deployment.md).

The intended production origin is:

```text
https://caravan.tracerxbrhd.ru
```

The VPS `.env.production` must contain the real values for:

```text
PUBLIC_ORIGIN
BOT_TOKEN
BOT_USERNAME
TELEGRAM_WEBHOOK_SECRET
```

Do not paste those values into issues, pull requests, chat logs, shell history screenshots, or support output.

## BotFather prerequisite

Before running the production wiring command for the first time, configure the bot's **Main Mini App** in BotFather to the exact `PUBLIC_ORIGIN`.

For the current production target that is:

```text
https://caravan.tracerxbrhd.ru
```

The Main Mini App is required for CARAVAN challenge links using:

```text
https://t.me/<BOT_USERNAME>?startapp=challenge_<inviteToken>
```

The repository can verify through `getMe` that a Main Mini App exists, but Telegram does not expose the configured Main Mini App URL through the same Bot API wiring contract. Check the URL deliberately in BotFather.

The default bot-chat **Menu Button** does not need separate manual configuration; CARAVAN configures and verifies it through the Bot API.

## Automated production wiring

Normal production deployment now performs Telegram wiring automatically after the public HTTPS health check succeeds.

The equivalent host-side command is:

```bash
cd /srv/caravan
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps bot node dist/configure-production.js
```

A successful command prints only non-secret operational information: the verified bot username, webhook URL, menu-button URL and pending update count.

It performs these checks before reporting success:

- `BOT_TOKEN` authenticates as the configured `BOT_USERNAME`;
- Telegram reports that the bot has a Main Mini App;
- webhook is `${PUBLIC_ORIGIN}/telegram/webhook`;
- webhook is restricted to `message` updates;
- Telegram accepted the configured webhook secret token;
- the default menu button is a `web_app` button named `CARAVAN`;
- the menu button opens exactly `PUBLIC_ORIGIN`.

The command is idempotent and may be rerun after changing supported Telegram production configuration.

## First real-account smoke test

After the first successful production wiring, use **two real Telegram accounts**. Do not use client-side mocks for this acceptance check.

Account A:

1. open the production bot;
2. send `/start`;
3. confirm the bot reply contains a working CARAVAN launch action;
4. open CARAVAN from the bot Menu Button as a second entry path;
5. confirm Telegram authentication succeeds and the Play surface loads;
6. create a private challenge and share/open the generated challenge link.

Account B:

1. open the challenge link;
2. confirm Telegram opens the CARAVAN Main Mini App rather than a generic browser route;
3. confirm the `challenge_<token>` launch context reaches the Mini App;
4. authenticate normally;
5. accept the challenge and enter the same authoritative match.

Then with both accounts:

1. confirm both players receive sanitized realtime snapshots;
2. play several legal actions from both sides;
3. temporarily background/close one Mini App and reconnect it;
4. finish or surrender the match;
5. confirm both players see a consistent result;
6. request a rematch and confirm both accounts reach the fresh match;
7. return to Play and exercise casual matchmaking once if two accounts are available simultaneously.

Do not inspect or copy raw `initData`, session cookies, challenge invite tokens, database snapshots, or bot credentials while performing the smoke test.

## Failure handling

### `BOT_USERNAME does not match...`

The token and username in `.env.production` refer to different Telegram bots. Correct the environment before doing anything else. Do not work around the check by changing client challenge-link behavior.

### `Telegram Main Mini App is not configured...`

Open BotFather and configure the production bot's Main Mini App. Use the exact `PUBLIC_ORIGIN`, then rerun the production wiring command.

### webhook verification failure

Confirm public HTTPS health first:

```bash
curl --fail https://caravan.tracerxbrhd.ru/health
```

Then rerun the wiring command. Do not disable the webhook secret check to make delivery appear healthy.

### menu-button verification failure

Rerun the wiring command after confirming the real bot token/username pair. The command intentionally treats unexpected effective Telegram configuration as a failure rather than silently accepting drift.

## Rotating Telegram credentials

When rotating `BOT_TOKEN` or `TELEGRAM_WEBHOOK_SECRET`:

1. update only the VPS `.env.production`;
2. confirm `BOT_USERNAME` still identifies the intended bot;
3. redeploy/restart the affected server and bot runtime so Telegram authentication/webhook validation use the new values;
4. rerun the production wiring command;
5. perform `/start` plus Mini App authentication with a real account.

A bot-token rotation affects both the bot runtime and server-side Telegram `initData` verification. Treat it as an application authentication change, not merely a webhook change.

## What is intentionally not automated

CARAVAN does not automate BotFather account interaction. That would add a brittle user-account automation path outside the Bot API and outside the project's server-authoritative boundary.

The repository also does not keep a second polling bot transport as a fallback. Production uses the single webhook path documented above.
