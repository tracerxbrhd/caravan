# 13. Interactive Card Table

## Status

Implemented as the first fully interactive competitive match surface in the Mini App. This layer consumes the authoritative `MatchSnapshot` and realtime helpers introduced by the Mini App Play flow; it does not introduce another gameplay state machine or transport.

PR24 replaces the original vertically serialized compact layout with a fixed three-caravan composition. All three opposing route pairs remain visible side by side in portrait and the live table is bounded to the Telegram stable viewport rather than turning the match into a scrollable dashboard. PR26 replaces the permanently open hand fan with a compact dock plus an on-demand cyclic hand drawer and adds pointer drag as an optional enhancement over the existing authoritative tap-target model. Confirmed card travel, public discard destinations, sound, haptics, and richer causal presentation remain the separate downstream layer in [`16-tactile-game-feel.md`](16-tactile-game-feel.md).

## Authority model

The table is a presentation and intent-collection layer only.

The server-projected `PlayerView.legalActions` is the source for every gameplay affordance shown to the player. The table may organize those actions into selection and target hints, but it must not invent a move that is absent from the current authoritative projection.

The client therefore follows:

```text
server SNAPSHOT
-> validated PlayerView + legalActions
-> derive selectable cards / exact targets
-> player chooses intent
-> send the matching WireGameAction unchanged
-> pending input lock
-> next server SNAPSHOT or rejection
-> replace rendered authoritative state
```

No route, hand, discard pile, turn, result, or card ownership is permanently mutated optimistically.

## Interaction model

The baseline competitive interaction remains `tap card -> tap target`. The expanded hand also supports swipe browsing and drag-to-target as convenience gestures; neither gesture creates a second gameplay authority model.

For a selected value card, only own routes with a matching `PLAY_VALUE_CARD` action are highlighted.

For a selected modifier, only exact value-card nodes named by matching `PLAY_MODIFIER_CARD` actions are highlighted. Highlighting the entire route is intentionally avoided because a modifier's legal target is a particular value card.

A selected card may expose a direct discard control only when `DISCARD_HAND_CARD` exists for that card.

Route disband is exposed only when the projection contains the corresponding `DISBAND_ROUTE` action and requires an explicit second confirmation.

Surrender remains a server lifecycle command rather than a game-engine action and also requires explicit confirmation. A match that has been created but has not reached initial readiness must still be escapable: the player may explicitly leave/surrender the waiting table even when the opponent has not connected yet. Gameplay actions remain blocked until both seats have connected and the first authoritative turn deadline exists.

## Pending commands and rejection recovery

When a state-changing command is sent successfully, conflicting gameplay input is locked until the realtime boundary receives either:

- a fresh authoritative snapshot; or
- a command rejection.

A disconnect also releases local pending presentation state because reconnect/`RESYNC` becomes the source of recovery truth.

Stale/illegal/deadline/connection-owner rejections never preserve a local preview as game state. The UI presents concise feedback and continues from the latest server projection.

## Card and route presentation

The table renders:

- the player's full permitted hand;
- only opponent hand count/anonymous backs;
- both players' three public routes;
- value cards and attached modifiers;
- route value, status, direction, and active suit;
- lane ownership;
- deck/discard public counts;
- connection/pending/turn state;
- the authoritative final result while leaving the final table visible.

No opponent hidden hand identity or future deck information is introduced by the presentation layer.

Cards use original lightweight DOM/CSS presentation rather than borrowed game assets or a canvas renderer. Rank and suit remain readable as text/glyph information at phone scale.

## Fixed responsive table

The live match shell uses Telegram's stable viewport height and content-safe insets as a hard presentation boundary. The match page itself must not scroll during normal play. The table occupies the flexible center of that viewport; header, opponent rail, contextual status and hand consume bounded surrounding space.

The table is composed as three parallel caravans on desktop, tablet, and portrait phone layouts. A compact screen must not serialize the three lane pairs into a long vertical dashboard because comparison between caravan 1/2/3 is primary gameplay information.

Each caravan is a bounded column with the rival route above, a compact ownership crossing in the middle, and the viewer route below. Rival/viewer route values and statuses face the middle crossing so the paired competition can be read immediately.

Public route cards overlap along the route axis. Dense routes increase overlap rather than introducing a route scrollbar or making the entire match surface movable. Rank/suit corners remain the minimum always-visible information. If later playtests show that unusually dense routes need more inspection space, the preferred follow-up is a temporary route-focus expansion over the fixed table, not permanent page or board scrolling.

Secondary presentation controls such as sound, haptics, motion and surrender are not allocated permanent vertical dashboard rows. They live behind a compact expandable table menu. Critical transient state remains directly visible; in particular, a waiting match whose opponent has not connected exposes a direct confirmed `Leave table` action so durable recovery cannot trap a player in an old match.

The hand is normally a compact dock so the public table keeps most of the phone viewport. Tapping it opens a bounded drawer over the lower table with one active card centered and neighboring cards partially visible. Horizontal swipe and previous/next controls cycle through the real hand without duplicating authoritative cards. Tapping a playable active card selects it and collapses the drawer back to the table so the normal legal-target flow remains easy to use.

An upward drag from the active playable card is an enhancement. The pointer release is resolved only against currently highlighted route/card drop descriptors, which are translated back through the existing `legalActions` helpers. A miss does not mutate the board; it falls back to the selected-card state so the player can finish through tap-target. Card removal from hand still occurs only after a fresh server snapshot.

Selection and legal-target feedback use transform, opacity, border, and shadow animation. Reduced-motion users inherit the Mini App's existing `prefers-reduced-motion` fallback, which collapses decorative animation without removing state information.

Confirmed deal/play/removal travel, public discard choreography, original sound, platform haptics, and explicit presentation preferences are layered on top of this interaction model by architecture document 16. That later layer still replaces the rendered authoritative snapshot rather than creating optimistic game state.

## Pure interaction model

`apps/miniapp/src/table-model.ts` isolates the translation from `WireGameAction[]` to UI affordances. It has no React, Telegram, WebSocket, or game-engine dependency.

Its helpers intentionally return the exact matching wire action from the current projection for submission. Tests protect that unsupported UI intents fail closed rather than being synthesized client-side.

## Deferred

This interaction layer itself does not own:

- server lifecycle/result logic beyond presenting authoritative lifecycle state;
- rematch negotiation;
- production deployment composition;
- browser/native authentication.

Authoritative results/rematches are implemented separately in [`15-results-and-rematch.md`](15-results-and-rematch.md). Tactile confirmed transitions and feedback are implemented separately in [`16-tactile-game-feel.md`](16-tactile-game-feel.md). Keeping those concerns downstream preserves the table's narrow role as an authoritative-action affordance surface.

The optional visual rules guide is implemented separately in [`14-rules-guide.md`](14-rules-guide.md), so opening help does not add rules or tutorial state to the competitive table.
