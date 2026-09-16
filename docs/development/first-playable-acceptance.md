# First-Playable Acceptance Runbook

This is the final operator/tester checklist for the first CARAVAN vertical slice defined by [`../product/06-first-playable-scope.md`](../product/06-first-playable-scope.md).

It is intentionally separate from CI. Automated tests prove code contracts; this run proves that the deployed public Telegram journey works with real accounts and real Telegram clients.

## Preconditions

Do not begin until all of the following are true:

- the PR/commit being tested has a green repository Verify workflow;
- production deployment completed successfully;
- `https://caravan.tracerxbrhd.ru/health` is healthy;
- `https://caravan.tracerxbrhd.ru/ready` is ready;
- production Telegram wiring completed successfully;
- BotFather Main Mini App points to the exact production `PUBLIC_ORIGIN`;
- two separate real Telegram accounts are available;
- both accounts can open the production bot.

Do not copy real `initData`, session cookies, invite tokens, database snapshots, bot tokens or webhook secrets into this checklist, issues, screenshots or chat.

Record only the tested commit SHA and non-secret observations.

## Acceptance record

Before starting, record:

```text
Date:
Production commit SHA:
Telegram client/platform A:
Telegram client/platform B:
Tester notes/issues:
```

A failed item means the first-playable acceptance is **not complete**. File/fix the defect and rerun the affected journey; do not mark an item successful based on local mocks.

## 1. Telegram entry and authentication

With Account A:

- [ ] Open the production bot and send `/start`.
- [ ] The bot responds with a CARAVAN launch action without exposing internal/debug information.
- [ ] Open CARAVAN from the `/start` action.
- [ ] Telegram authentication succeeds and the Play screen shows the expected account identity.
- [ ] Close/reopen the Mini App from the bot's Menu Button.
- [ ] The existing application session restores without requiring a second account or changing CARAVAN identity.

With Account B:

- [ ] Repeat `/start` and Menu Button launch.
- [ ] Authentication succeeds independently and produces a different CARAVAN account identity.

If authentication fails, verify production BotFather/wiring/environment configuration before changing game code.

## 2. Rules availability

With either account:

- [ ] Open **How to play** from Play.
- [ ] The guide is readable on the target mobile viewport.
- [ ] Close it and continue without losing the Play state.
- [ ] During a live match, open the guide again.
- [ ] Closing the guide returns to the same authoritative match/session.

This is an availability/usability check, not a requirement that players read the guide before matchmaking.

## 3. Private challenge / Main Mini App deep link

With Account A:

- [ ] Create a private challenge.
- [ ] A Telegram invite can be shared/copied.
- [ ] The invite URL targets the configured production bot/Main Mini App.

With Account B:

- [ ] Open Account A's invite link.
- [ ] Telegram opens the CARAVAN Main Mini App rather than an unrelated browser page.
- [ ] The challenge launch context reaches the Mini App.
- [ ] The challenge can be accepted.

Both accounts:

- [ ] Both clients enter the same authoritative match.
- [ ] Neither client sees the opponent's card identities in the opponent hand UI.
- [ ] The match does not begin accepting gameplay before both participants have connected.

## 4. Core authoritative match

Play legal actions from both accounts.

- [ ] Only the active player can act.
- [ ] Legal card/target affordances correspond to the server-projected legal actions.
- [ ] A submitted action enters a pending/server-confirmed state; the board is not optimistically replaced with invented client state.
- [ ] Both players converge on the same public route/discard/lane information after each accepted action.
- [ ] Each player continues to see only their own hand identities plus the opponent hand count.
- [ ] Draw/play/modifier/discard/removal presentation does not block gameplay on the tested device.
- [ ] Sound/haptic/reduced-motion controls remain usable and optional.

## 5. Authoritative deadlines

While the match is active:

- [ ] A turn countdown is visible once the server has started a turn deadline.
- [ ] The countdown corresponds to whose turn it is.
- [ ] The UI remains usable as the countdown becomes urgent.
- [ ] Changing the device wall clock, if practical on a non-primary test device, does not grant extra server time or alter the server outcome.

The displayed countdown is informative. The server remains the only deadline authority.

## 6. Temporary disconnect and reconnect

Background/close Account B's Mini App or otherwise interrupt its network connection without intentionally logging it out.

On Account A:

- [ ] Account B is represented as disconnected/reconnecting through public lifecycle state.
- [ ] An opponent reconnect deadline becomes visible.
- [ ] Account A can continue to observe the authoritative match without receiving Account B's hidden hand.

On Account B:

- [ ] Reopen/reconnect before grace expires.
- [ ] The client reconnects automatically after an ordinary network interruption.
- [ ] A fresh sanitized `RESYNC` snapshot replaces local match state.
- [ ] The reconnect deadline clears after successful reconnection.
- [ ] Play can continue normally.

## 7. Controlling-client replacement

Using Account A, open the same active match in a second CARAVAN client/window/device where practical.

- [ ] The newer connection can take authoritative control.
- [ ] The previous controller is paused with a clear message instead of automatically reconnecting forever.
- [ ] The two clients do not continuously steal control from each other.
- [ ] **Take control here** on the paused client deliberately reclaims control.
- [ ] The other client then becomes the paused controller.

This test protects against a multi-tab control tug-of-war; it is not multi-device simultaneous-play support.

## 8. Session expiry/revocation recovery

Exercise this in a safe production/staging manner where the session can be revoked without exposing credentials (for example through the normal logout/session-revocation path when available to the tester).

- [ ] An invalid/expired HTTP session does not leave matchmaking/challenge/rematch polling retrying forever.
- [ ] A realtime `SESSION_EXPIRED` close does not enter an automatic WebSocket reconnect loop.
- [ ] The Mini App returns to authentication bootstrap.
- [ ] Reopening/refreshing from Telegram can establish a fresh session when valid Telegram launch data is available.
- [ ] A transient startup/server failure presents a retry path rather than permanently caching the failure.

If production-safe session revocation cannot be exercised without privileged manipulation, retain the automated integration coverage and record the manual item as not exercised rather than fabricating a pass.

## 9. Match completion

Complete at least one match through a normal rule-engine result or surrender.

- [ ] Both clients receive a consistent finished snapshot.
- [ ] Winner/loser or no-contest status is clear.
- [ ] Finish reason is clear where relevant.
- [ ] No further gameplay action can mutate the finished match.
- [ ] The result view does not reveal previously hidden future deck order/opponent hand data.

For timeout behavior, perform a separate controlled run if practical:

- [ ] Allow an authoritative turn or reconnect deadline to expire.
- [ ] The server finalizes the expected timeout/no-contest result exactly once.
- [ ] Both clients eventually receive the same result.

## 10. Rematch

After a finished match:

- [ ] Account A requests a rematch.
- [ ] The UI shows that it is waiting for the opponent.
- [ ] Account B requests/accepts the rematch.
- [ ] Both accounts transition to one fresh match ID.
- [ ] The fresh match has fresh authoritative state and does not reuse the finished match's hidden state/version.

Then exit the match:

- [ ] Return to Play works without a page reload.

## 11. Casual matchmaking

With both accounts back on Play:

- [ ] Join casual matchmaking from both accounts.
- [ ] The queue remains recoverable through brief network delay.
- [ ] The pair reaches one match rather than duplicate/stranded matches.
- [ ] Leaving queue removes the player cleanly when no match has been found.

## 12. Service restart recovery

Perform this only when it is safe to restart the CARAVAN server container for the acceptance environment.

During an active match:

- [ ] Restart the server through the documented production deployment/Compose path.
- [ ] Clients observe reconnecting rather than inventing local progress.
- [ ] The server restores durable unfinished-match state.
- [ ] Clients resync from fresh sanitized projections after restart.
- [ ] Existing authoritative deadlines are preserved or the match resolves under the documented infrastructure/no-contest policy.
- [ ] No duplicate accepted action is created by reconnect/retry.

If this cannot safely be exercised in the live acceptance environment, rely on the automated restart integration tests and record the manual item as not exercised.

## 13. Mobile/touch sanity

On the real Telegram clients used for acceptance:

- [ ] All critical actions have usable touch targets.
- [ ] All three lane pairs, own hand and opponent state remain reachable/readable without fixed-screen assumptions.
- [ ] Horizontal card/route scrolling does not make primary controls inaccessible.
- [ ] Safe-area insets do not hide controls.
- [ ] Reduced-motion mode remains functional.
- [ ] Reconnect/deadline/result messages remain readable on the smallest tested viewport.

This is a first-playable usability check, not final art-polish certification.

## Completion criteria

The first-playable production acceptance is complete only when:

- all mandatory items above pass on the deployed commit, or any explicitly environment-unsafe restart/session-revocation item is recorded as **not exercised** and remains covered by automated integration tests;
- no state corruption, hidden-information leak, duplicate action, reconnect loss or permanently orphaned active match is observed;
- both real accounts can complete the full Telegram -> match -> result/rematch loop repeatedly without developer intervention.

After that point, product work may move beyond first-playable hardening. The next feature direction should be chosen from real tester feedback rather than assumed feature-completeness pressure.
