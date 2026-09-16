# 06. First Playable Scope

## Status

Accepted as the initial vertical-slice scope. This document describes what must exist before CARAVAN is considered genuinely playable with real users. It does not claim that any item is implemented yet.

## Goal

The first playable should answer one question:

> Can two real people enter CARAVAN with little friction, understand enough to play, complete a correct match reliably, and want to play again?

Everything that does not materially help answer that question is secondary.

## Required player journey

A successful first-playable journey is:

```text
open from Telegram
-> authenticate
-> reach Play
-> complete or skip the interactive tutorial
-> challenge a friend or enter casual matchmaking
-> connect to a match
-> play a complete authoritative game
-> survive temporary disconnect/reconnect
-> receive a clear result
-> rematch or return to Play
```

## In scope

### Telegram entry and identity

- Telegram Mini App launch;
- backend validation of raw Telegram `initData`;
- internal CARAVAN account ID separate from Telegram ID;
- minimal public player identity sufficient for a match;
- thin Telegram bot entry/deep-link flow.

A large profile system is not required for the first playable.

### Tutorial

A short interactive tutorial is required because onboarding is part of the core product hypothesis.

It must teach at minimum:

- the three opposing route pairs;
- the 21-26 target range;
- ascending/descending placement;
- same-suit direction changes;
- Jack, Queen, King, and Joker behavior;
- attacking the opponent's routes;
- ties and overall victory.

The tutorial should use deterministic scripted states rather than random live situations.

### Match entry

Both of these are required:

- private challenge/invite flow;
- casual matchmaking queue.

Ranked matchmaking is not required for the first playable.

### Complete match rules

The match must implement the accepted canonical rules in `05-game-rules.md`, including special cards and destructive edge cases.

Do not ship a simplified placeholder ruleset merely to make multiplayer appear functional.

### Decks

The first playable uses one server-defined legal starter deck available equally to everyone.

The engine and server boundaries should accept validated deck definitions so custom deck building can be added later without rewriting match rules, but a player-facing deck builder is deferred.

There is no collectible card acquisition system. No player can obtain competitively stronger card availability through progression or payment.

### Server-authoritative multiplayer

Required:

- server-side shuffle/deck order;
- authoritative hands/draws;
- legal-action validation;
- hidden-information projection;
- versioned commands;
- duplicate-command safety;
- stale-command rejection;
- persisted active-match snapshots;
- reconnect/resync from fresh `PlayerView`;
- authoritative result/finalization.

The client must never be able to submit a replacement game state.

### Match UX

Required presentation quality:

- responsive touch-first table;
- readable three-lane competition;
- clear own hand and opponent hand count;
- card selection and legal-target guidance;
- understandable route values/status;
- animations for draw, play, modifier attachment, removals, and discard;
- clear pending/server-confirmed action states;
- basic original sound/haptic feedback;
- reduced-motion and sound controls.

The first playable does not need final art polish, but it must already feel like a card game rather than a debug board.

### Recovery

Temporary network interruption must not destroy an active match.

On reconnect the client replaces local match state with a new sanitized server projection. Normal server/container restart recovery should be designed into persistence before public testing.

### Results and rematch

At match completion show:

- winner/loser clearly;
- finish reason when relevant (normal victory, surrender, timeout/deck exhaustion if supported by the lifecycle);
- a direct rematch action for a private/opponent-compatible flow;
- return-to-play action.

A rich historical statistics page is not required yet.

## Minimal operational requirements

Before inviting external testers, the project should also have:

- repeatable local setup;
- committed database migrations;
- CI for format/lint/typecheck/tests/build;
- game-engine unit/regression/property tests;
- server integration tests for hidden information, stale/duplicate commands, reconnect, and finalization;
- production-like Docker deployment path;
- health endpoint/logging sufficient to diagnose failures.

UNDERGAMMON may be used as a reference for these patterns, but CARAVAN must implement only what it currently needs.

## Explicitly deferred

The following must not delay the first playable:

- ranked matchmaking and ratings;
- seasons;
- XP/levels;
- Coins or other economy;
- store;
- cosmetic inventory/equipment;
- daily rewards;
- battle pass;
- achievements;
- AI opponent;
- tournaments/leagues;
- spectator mode;
- chat/reactions beyond what is essential;
- custom player deck builder;
- card collection/acquisition;
- Android/iOS store packaging;
- browser authentication;
- push notification infrastructure outside the Telegram launch loop;
- elaborate account settings;
- generic multi-game platform extraction.

These are future candidates, not implied commitments.

## Success criteria

The first playable is successful technically when two real Telegram accounts can repeatedly complete matches without state corruption, hidden-information leakage, duplicate actions, or reconnect loss.

It is successful as a product experiment when testers can learn the game, find/challenge an opponent, understand what happened on the table, and express willingness to play again without requiring developer explanation during each match.

Quantitative retention/routing targets should be defined only after instrumentation exists; do not invent success percentages in advance.

## Exit from first-playable phase

Only after the core loop is stable should the next product decision choose among:

- stronger onboarding/polish;
- custom deck building;
- ranked/rating layer;
- profiles/history;
- AI practice;
- standalone Android/iOS packaging.

The choice should be driven by real tester behavior rather than by feature-completeness aesthetics.
