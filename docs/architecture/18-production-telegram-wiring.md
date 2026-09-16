# 18. Production Telegram Wiring

## Status

Accepted and implemented as the production Telegram wiring layer that follows the Docker/deployment baseline in [`17-production-docker-and-deployment.md`](17-production-docker-and-deployment.md).

This layer does not introduce a second bot/runtime path. It configures Telegram to use the already deployed public CARAVAN origin and the existing `/telegram/webhook` boundary.

Where older documents still describe production Telegram wiring as deferred, this newer and more specific document supersedes those deployment-status statements.

## Production target

The intended first-playable production origin remains:

```text
https://caravan.tracerxbrhd.ru
```

The bot and Mini App must use the same `PUBLIC_ORIGIN`. Private challenge links continue to use the Main Mini App transport:

```text
https://t.me/<BOT_USERNAME>?startapp=challenge_<inviteToken>
```

No Telegram identifier becomes gameplay authority. Telegram remains an entry/authentication platform boundary around the provider-independent CARAVAN account and authoritative server runtime.

## Telegram-side prerequisite

The bot's **Main Mini App** must be configured in BotFather to the exact production `PUBLIC_ORIGIN` before production wiring is considered complete.

The Bot API exposes whether a bot has a Main Mini App through `getMe`, but it does not expose the configured Main Mini App URL as the same mutable deployment setting used by BotFather. CARAVAN therefore treats this as one explicit operator prerequisite rather than pretending it can be safely automated.

The production wiring command fails before changing webhook/menu settings when `getMe` does not report a Main Mini App.

## Automated wiring

`apps/bot/src/configure-production.ts` is compiled into the production bot image and invokes an idempotent production wiring contract.

The command:

1. requires `NODE_ENV=production`;
2. calls Telegram `getMe` using the configured `BOT_TOKEN`;
3. verifies that the authenticated bot username matches `BOT_USERNAME` case-insensitively;
4. verifies that Telegram reports a Main Mini App;
5. configures the webhook to `${PUBLIC_ORIGIN}/telegram/webhook`;
6. supplies `TELEGRAM_WEBHOOK_SECRET` as the Telegram webhook secret token;
7. restricts webhook delivery to the `message` update type currently consumed by CARAVAN;
8. configures the default private-chat menu button as a `web_app` button named `CARAVAN` pointing at `PUBLIC_ORIGIN`;
9. reads back `getWebhookInfo` and `getChatMenuButton`;
10. fails closed if the effective webhook URL, allowed update set, menu-button type/text, or menu-button URL do not match the expected production configuration.

The command is intentionally safe to run after every deployment. Re-running it corrects supported Telegram configuration drift instead of requiring a one-time undocumented setup command.

## Webhook security

The webhook continues to terminate at the existing bot runtime:

```text
Telegram
  -> HTTPS PUBLIC_ORIGIN/telegram/webhook
  -> host TLS proxy
  -> CARAVAN web/Caddy edge
  -> bot:3001/telegram/webhook
```

`setWebhook` sends the configured `TELEGRAM_WEBHOOK_SECRET` as Telegram's `secret_token`. Telegram then supplies that value in `X-Telegram-Bot-Api-Secret-Token` on webhook requests, and the existing bot runtime validates it before parsing the request body.

The wiring command never prints the bot token or webhook secret. Telegram API transport/API failures remain generic rather than echoing upstream response bodies that could contain sensitive context.

The raw webhook secret remains only in the VPS `.env.production`. The deployment workflow does not duplicate `BOT_TOKEN` or `TELEGRAM_WEBHOOK_SECRET` into GitHub Actions secrets.

## Bot identity safety

A valid-looking bot token plus a mistyped `BOT_USERNAME` is dangerous because challenge URLs and the Mini App build could point at a different bot from the one receiving production webhooks.

Production wiring therefore treats bot identity as a cross-configuration invariant:

```text
getMe(BOT_TOKEN).username == BOT_USERNAME
```

Comparison is case-insensitive because Telegram usernames are case-insensitive. A mismatch fails before webhook or menu-button mutation.

This protects the shared configuration used by:

- Telegram `initData` verification on the server (`BOT_TOKEN`);
- bot webhook delivery (`BOT_TOKEN`);
- `/start` command address filtering (`BOT_USERNAME`);
- Mini App challenge links (`VITE_TELEGRAM_BOT_USERNAME`, built from production `BOT_USERNAME`).

## Deployment ordering

The manual production workflow now uses this order:

```text
repository Verify
-> SSH checkout/build
-> PostgreSQL healthy
-> migrations
-> server/bot/web healthy
-> public HTTPS /health succeeds
-> configure + verify Telegram production wiring
```

Telegram mutation deliberately happens after public HTTPS health succeeds. A deploy must not register a webhook URL that the public internet cannot yet reach.

If Telegram wiring fails after the application rollout is already healthy, the workflow reports failure but does not destroy the healthy stack or database. The operator should correct the Telegram/BotFather/environment prerequisite and rerun the deployment/wiring step rather than rolling back unrelated application state automatically.

## Menu button vs Main Mini App

These are related but distinct Telegram surfaces:

- **Main Mini App** — configured through BotFather; required for `?startapp=` Main Mini App deep links used by private challenges;
- **default menu button** — configured automatically through Bot API `setChatMenuButton`; opens `PUBLIC_ORIGIN` from the private bot chat.

Both should lead to the same Mini App origin, but only the menu button is mutable and readable through the Bot API contract used by CARAVAN.

## Verification boundary

Repository tests use injected Telegram API fakes and never call real Telegram production credentials.

Automated tests protect:

- production-only mutation;
- bot-token/username mismatch failing before mutation;
- missing Main Mini App failing before mutation;
- exact webhook URL/secret/allowed-update payload construction;
- exact menu-button payload construction;
- read-back verification failing closed on configuration drift;
- Telegram transport/API errors not echoing secret token material.

The deploy workflow performs the real Telegram API calls only on the production VPS, where `.env.production` already holds the application secrets.

## Real-account smoke test

Bot API wiring verification is necessary but not sufficient for first-playable release confidence. After the first successful production deploy, two real Telegram accounts should exercise the complete journey documented in [`../development/production-telegram-wiring.md`](../development/production-telegram-wiring.md).

That human smoke test validates Telegram client behavior that the Bot API cannot prove by itself, especially the exact BotFather Main Mini App URL and `startapp` launch propagation.

## Deferred

This layer does not add:

- Telegram polling as a second production transport;
- notification infrastructure for every match event;
- inline-mode sharing;
- Telegram identities as gameplay ownership;
- automated BotFather account interaction;
- browser/native authentication;
- ranked/rating/profile systems.

Those remain separate product decisions after the first playable is validated.
