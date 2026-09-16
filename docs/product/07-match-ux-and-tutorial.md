# 07. Match UX and Rules Guide Contract

## Status

Accepted as the interaction contract for the CARAVAN match experience. The competitive tap-select/tap-target table and visual rules guide are implemented; richer confirmed-transition choreography and sound/haptics remain follow-up work.

The purpose of this document is to keep the client feeling like a coherent digital card table while keeping the game client non-authoritative.

## Core UX principle

The player should understand the table by looking at it, not by reading logs.

Every important game action should answer three questions visually:

1. what card moved or changed;
2. where the effect happened;
3. how that changed the route/lane state.

Animation, sound, haptics, value changes, and legal-target feedback should reinforce the same state transition.

## Table hierarchy

The match screen should prioritize, in order:

1. the six public routes arranged as three opposing lane pairs;
2. route values/status and lane ownership;
3. the player's hand;
4. turn/pending-action state;
5. opponent hand/deck public counts;
6. public discard information and secondary controls such as discard/disband/help/settings.

The layout must remain understandable in portrait Telegram WebViews without requiring desktop-scale space.

Do not solve compact screens by shrinking cards until text and targets become unusable. Prefer responsive overlap, controlled fan/stack geometry, focus enlargement, and contextual detail.

## Primary interaction model

The baseline touch interaction is **tap-select -> tap-target**.

Drag-and-drop may be added as an enhancement, but core gameplay must remain fully usable without precision dragging because Telegram WebViews and different mobile devices vary in gesture behavior.

### Selecting a card

Selecting a hand card should:

- lift/scale the card slightly;
- keep it readable;
- visually mark legal actions/targets;
- suppress impossible targets rather than forcing trial-and-error;
- expose a concise action hint when needed.

Tapping the selected card again or tapping neutral table space cancels selection.

### Legal targets

For value cards, legal own-route destinations should be obvious.

For modifiers, highlight the exact value cards they may target on either side.

Do not highlight a whole route when only one particular card is a legal modifier target.

The client may use shared deterministic rule helpers to calculate presentation hints, but final acceptance still comes from the authoritative server.

## Command submission and authority

Local selection/focus animation may happen immediately.

A table-changing action must enter a short pending state after submission. The client must not permanently mutate authoritative table state before server acceptance.

Recommended flow:

```text
select
-> preview/highlight
-> submit command
-> brief pending lock for conflicting input
-> server accepted event / PlayerView
-> animate confirmed transition
```

If rejected because of stale state, reconnect/resync, or another authoritative reason, discard the local preview and render the fresh server projection with a concise explanation.

Avoid long blocking spinners during normal turns.

## Card motion language

CARAVAN should establish a consistent motion vocabulary.

### Deal/draw

A card should visibly originate from the player's deck area and join the hand with a short arc/translation and slight rotation.

Opponent draws animate as an unidentified card moving into the opponent hand area. Never reveal its face or identity.

### Hand selection

Selection should use a small transform/scale/elevation change rather than reflowing the whole layout.

### Value-card placement

A confirmed value card moves from hand to the end of the selected route, settles into the route stack, then value/direction/status indicators update.

### Modifier attachment

Kings, Queens, and Jokers should visually attach beside/overlap their target value card in a stable readable slot arrangement.

The target relationship must remain legible after several cards and modifiers accumulate.

If an opponent-owned modifier is attached to one of the player's routes, ownership should remain visually understandable where needed without adding noisy permanent labels to every card.

### Jack/removal

The player should see the Jack reach its target, then the target card group leave the route together. Do not make cards disappear without showing what was removed.

Removed cards route to their original owners' public discard piles. Presentation should not imply that attacking or disbanding transfers ownership of those cards.

### Joker multi-removal

When one Joker removes matching cards across multiple routes, communicate the causal relationship without turning the board into a long cinematic sequence.

A short pulse/highlight over all affected targets followed by grouped removal is preferred over serial multi-second animations.

### Direct discard

Discarding from hand is a public action once accepted. The discarded card should become visible as it moves into the player's discard pile rather than remaining hidden after leaving the hand.

### Route disband

Cards should collapse/sweep toward discard in one clear motion, preserving the meaning that the entire route was intentionally abandoned.

When the route contains opponent-owned modifiers, the animation may split cards toward their respective owners' discard areas or use another concise treatment that preserves original ownership without slowing the turn excessively.

## Timing

Most routine action animations should feel immediate, generally within a few hundred milliseconds.

Do not make the player wait for decorative motion before every interaction. Animation duration is a presentation value, not a rule timer.

Longer sequences may be used sparingly for match start/end, but should remain skippable/accelerated where practical.

## State communication

Each route should make the following understandable without opening a modal:

- current value;
- light / in-range / overloaded status;
- current direction where established;
- active suit where useful;
- modifier attachment relationships;
- lane ownership or unresolved/tied state.

Avoid excessive permanent badges. Prefer table composition, compact counters, and contextual emphasis.

A route entering 21-26 may receive a restrained confirmation effect. Going over 26 should look clearly undesirable without implying the route is destroyed.

## Turn, connection, and deadline state

The player should always know whether:

- it is their turn;
- the opponent is acting;
- their own command is pending;
- the connection is recovering/resynchronizing;
- an authoritative reconnect/turn deadline is approaching when it materially affects the match;
- the match is finished.

Do not rely only on color to communicate these states.

A socket interruption should visibly enter recovery state rather than immediately presenting defeat. If a server deadline is counting down, present the authoritative remaining time without allowing client time to define the outcome.

## Action controls outside direct card placement

Discard and route disband are destructive choices and need deliberate interaction.

Discarding a hand card should be easy but visually distinct from playing it.

Disbanding an entire route should require an explicit selection/confirmation affordance sufficient to prevent accidental taps, but not a heavy modal ceremony every time.

Surrender is required for the first playable and must require explicit confirmation because it ends the match as a server lifecycle result rather than a card-rule action.

## Sound

Original audio should reinforce physicality:

- light paper/card movement;
- card placement/table contact;
- shuffle/deal texture;
- modifier attachment;
- discard/removal sweep;
- concise match-found/result cues.

Do not use Fallout/Bethesda audio or imitation audio designed to be confused with it.

Sound must be independently mutable from haptics.

## Haptics

Use haptics as restrained confirmation, for example:

- light selection/valid placement;
- slightly stronger destructive/special effect;
- concise result pattern.

Never require haptics to understand state. Respect platform capability and user preference.

## Reduced motion and weaker WebViews

A reduced-motion setting must replace large travel/rotation sequences with shorter fades/scales or immediate transitions while preserving causality.

The game must remain fully playable if sound, haptics, and decorative motion are disabled.

Prefer transform/opacity animation and avoid layout-thrashing frame-by-frame geometry updates.

## Match start

A normal match start should communicate:

1. opponent identity;
2. cards/decks are being prepared/shuffled by the game;
3. initial hand arrives;
4. the opening route-seeding phase begins;
5. which player has been selected to start.

Do not expose seed material, rejected mulligan hands, or future deck order as part of shuffle theatrics.

## Match end

When the authoritative result arrives:

- finish any short causally necessary transition;
- clearly identify the winning player when one exists;
- show the three final lane outcomes for a normal rules finish;
- show finish reason for normal victory, deck exhaustion, surrender, timeout/forfeit, or infrastructure abort/no-contest;
- present rematch and exit/return-to-play actions.

Do not hide the table immediately behind a full-screen result before the player can understand the final action.

For a no-contest/infrastructure abort, do not visually blame either player.

## Rules guide

CARAVAN uses an optional text-and-visual rules guide instead of a separate scripted tutorial. It should make the game understandable without creating a second gameplay path that can drift away from competitive matches.

The guide should:

- use short sections rather than one wall of prose;
- pair difficult rules with original card illustrations/examples;
- cover objective, opening, value-card ordering, suit override, face cards, normal-turn choices, lane ownership, victory, and deck exhaustion;
- remain available from Play and the live table;
- never pause, replace, or mutate the authoritative match when opened during play;
- use the canonical rules in `05-game-rules.md` as its source of truth.

Reading the guide is optional before matchmaking. Familiar players should be able to enter a match immediately.

## Accessibility and legibility

Cards need readable rank/suit information at phone scale and must not rely only on decorative art.

Color-blind users must be able to distinguish suits/status through shape/icon/text cues where relevant.

Touch targets for cards and controls should remain usable on compact devices.

Critical information must not depend solely on animation, sound, haptics, or color.

## What not to copy

The desired feeling is physical cards on a worn trade-route table, not reproduction of another game's interface.

Do not copy Fallout: New Vegas table layout, HUD framing, fonts, card art, cursor behavior, sounds, transitions, or UI composition. The gameplay can be recognizable while the audiovisual and interaction design remains CARAVAN's own.
