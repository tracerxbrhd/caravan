# 13. Interactive Card Table

## Status

Implemented as the first fully interactive competitive match surface in the Mini App. This layer consumes the authoritative `MatchSnapshot` and realtime helpers introduced by the Mini App Play flow; it does not introduce another gameplay state machine or transport.

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

The baseline competitive interaction is `tap card -> tap target`.

For a selected value card, only own routes with a matching `PLAY_VALUE_CARD` action are highlighted.

For a selected modifier, only exact value-card nodes named by matching `PLAY_MODIFIER_CARD` actions are highlighted. Highlighting the entire route is intentionally avoided because a modifier's legal target is a particular value card.

A selected card may expose a direct discard control only when `DISCARD_HAND_CARD` exists for that card.

Route disband is exposed only when the projection contains the corresponding `DISBAND_ROUTE` action and requires an explicit second confirmation.

Surrender remains a server lifecycle command rather than a game-engine action and also requires explicit confirmation.

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

## Responsive and motion behavior

Desktop/tablet layouts can show the three lane pairs side by side. Compact portrait layouts stack lane pairs vertically rather than shrinking cards below useful touch/readability size.

Hand and long route contents may scroll horizontally within their local region.

Selection and legal-target feedback use transform, opacity, border, and shadow animation. Reduced-motion users inherit the Mini App's existing `prefers-reduced-motion` fallback, which collapses decorative animation without removing state information.

This PR establishes tactile selection/target feedback only. Confirmed deal/play/removal travel animation, sound, haptics, and richer causal transition choreography remain later presentation work.

## Pure interaction model

`apps/miniapp/src/table-model.ts` isolates the translation from `WireGameAction[]` to UI affordances. It has no React, Telegram, WebSocket, or game-engine dependency.

Its helpers intentionally return the exact matching wire action from the current projection for submission. Tests protect that unsupported UI intents fail closed rather than being synthesized client-side.

## Deferred

This layer does not yet implement:

- event-level confirmed card travel/deal/removal choreography;
- sound and haptic settings/effects;
- rematch negotiation;
- production deployment composition;
- browser/native authentication.

The optional visual rules guide is implemented separately in [`14-rules-guide.md`](14-rules-guide.md), so opening help does not add rules or tutorial state to the competitive table. The remaining items stay focused first-playable or presentation layers rather than hidden inside the table implementation.
