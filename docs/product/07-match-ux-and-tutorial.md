# 07. Match UX and Tutorial Contract

## Status

Accepted as the initial interaction contract for the CARAVAN match experience. This describes intended behavior, not implemented UI.

The purpose of this document is to make the first client feel like a coherent digital card table while keeping the game client non-authoritative.

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
6. secondary controls such as discard/disband/help/settings.

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

### Jack/removal

The player should see the Jack reach its target, then the target card group leave the route together. Do not make cards disappear without showing what was removed.

### Joker multi-removal

When one Joker removes matching cards across multiple routes, communicate the causal relationship without turning the board into a long cinematic sequence.

A short pulse/highlight over all affected targets followed by grouped removal is preferred over serial multi-second animations.

### Route disband

Cards should collapse/sweep toward discard in one clear motion, preserving the meaning that the entire route was intentionally abandoned.

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

## Turn state

The player should always know whether:

- it is their turn;
- the opponent is acting;
- their own command is pending;
- the connection is recovering/resynchronizing;
- the match is finished.

Do not rely only on color to communicate these states.

## Action controls outside direct card placement

Discard and route disband are destructive choices and need deliberate interaction.

Discarding a hand card should be easy but visually distinct from playing it.

Disbanding an entire route should require an explicit selection/confirmation affordance sufficient to prevent accidental taps, but not a heavy modal ceremony every time.

Surrender, when implemented, requires explicit confirmation because it ends the match.

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
5. whose turn it is.

Do not expose seed material or future deck order as part of shuffle theatrics.

## Match end

When the authoritative result arrives:

- finish any short causally necessary transition;
- clearly identify the winning player;
- show the three final lane outcomes;
- show finish reason when not a normal board victory;
- present rematch and exit/return-to-play actions.

Do not hide the table immediately behind a full-screen result before the player can understand the final action.

## Tutorial philosophy

The tutorial is a playable sequence, not a rulebook slideshow.

Each lesson should use:

```text
small goal
-> constrained legal choices
-> player acts
-> immediate visual result
-> one short explanation
```

Text should explain what the player just observed rather than dumping future rules in advance.

The tutorial uses original wording and deterministic scripted states derived from the canonical rule spec.

## Tutorial sequence

### Lesson 1 — The objective

Show the three opposing lanes and teach the 21-26 target range using simple value cards.

The player should finish one route themselves.

### Lesson 2 — Direction

Teach that after the opening cards a route develops ascending/descending order.

Show one legal directional card and one visibly illegal equal/wrong-direction example.

### Lesson 3 — Suit override

Give the player a same-suit card that can legally reverse the numeric direction.

Make the direction change visible immediately.

### Lesson 4 — King and Jack

Use a King to change a route value, then use a Jack in a controlled situation to remove a card group.

Teach both self-help and offensive targeting conceptually without requiring a full match.

### Lesson 5 — Queen and Joker

Demonstrate Queen direction/suit control on the terminal card.

Demonstrate one Joker effect with several clearly highlighted affected cards so the global removal is understandable.

### Lesson 6 — Winning a match

Give a short scripted endgame with three lane pairs, including one contested/tied lane.

The player must resolve the board so all three lanes have owners and win at least two.

This lesson should teach why "two good routes" is not by itself the end condition while another lane remains unresolved.

## Tutorial skip/replay

A player familiar with the rules may skip tutorial onboarding.

The tutorial must remain replayable later from help/learn surfaces.

Skipping tutorial must not grant competitive advantage or alter card availability.

## Tutorial architecture

The tutorial may run a deterministic local/scripted engine scenario because it does not represent a competitive authoritative match.

However, tutorial rules must call the same game-engine rule functions where practical rather than maintaining a second simplified implementation.

The tutorial should not require a live opponent or matchmaking service.

## Accessibility and legibility

Cards need readable rank/suit information at phone scale and must not rely only on decorative art.

Color-blind users must be able to distinguish suits/status through shape/icon/text cues where relevant.

Touch targets for cards and controls should remain usable on compact devices.

Critical information must not depend solely on animation, sound, haptics, or color.

## What not to copy

The desired feeling is physical cards on a worn trade-route table, not reproduction of another game's interface.

Do not copy Fallout: New Vegas table layout, HUD framing, fonts, card art, cursor behavior, sounds, transitions, or UI composition. The gameplay can be recognizable while the audiovisual and interaction design remains CARAVAN's own.
