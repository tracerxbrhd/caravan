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
-> optionally review the visual rules guide
-> challenge a friend or enter casual matchmaking
-> connect to a match
-> play a complete authoritative game
-> survive temporary disconnect/reconnect
-> receive a clear result
-> rematch or return to Play
```

The lifecycle must also prevent abandoned matches from remaining active indefinitely when one player leaves and does not return.

## In scope

### Telegram entry and identity

- Telegram Mini App launch;
- backend validation of raw Telegram `initData`;
- internal CARAVAN account ID separate from Telegram ID;
- minimal public player identity sufficient for a match;
- thin Telegram bot entry/deep-link flow.

A large profile system is not required for the first playable.

### Rules guide

A concise text-and-visual rules guide is required because onboarding is part of the core product hypothesis, but reading it is not a mandatory gate before matchmaking.

It must explain with original wording and clear card examples at minimum:

- the three opposing route pairs;
- the 21-26 target range;
- opening route seeding;
- ascending/descending placement;
- same-suit direction changes;
- Jack, Queen, King, and Joker behavior;
- play, discard, and route-disband turn choices;
- lane ownership, ties, deck exhaustion, and overall victory.

The guide must remain reachable from Play and from an active match. Opening it during a match must not disconnect or replace the authoritative realtime session.

It uses illustrative DOM/CSS card scenes rather than tutorial-only gameplay state. `05-game-rules.md` and the deterministic engine remain authoritative; guide copy must be updated when a player-facing canonical rule changes.

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

- server-side shuffle/deck order and starting-seat choice;
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

### Match lifecycle

A real multiplayer first playable needs explicit ways to finish matches even when normal board victory never occurs.

Required lifecycle behavior:

- a player can surrender voluntarily;
- the server owns turn/reconnect/inactivity deadlines;
- temporary disconnect does not immediately forfeit the match;
- a disconnected player receives a bounded reconnect grace period;
- a player who does not return or act before the authoritative deadline can lose by timeout/forfeit;
- reconnect restores the match from durable authoritative state rather than extending deadlines from client claims;
- infrastructure failure that makes fair continuation impossible should be handled separately from a player-caused loss (for example, a no-contest/aborted result) rather than silently awarding a win.

Exact timeout durations are operational/product configuration and should be chosen during backend implementation/testing. They are not hard-coded game-engine rules.

Surrender and timeout are server match-lifecycle outcomes, not CARAVAN card-rule actions.

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
- reduced-motion and sound controls;
- clear connection/reconnect state and any authoritative deadline that materially affects the player.

The first playable does not need final art polish, but it must already feel like a card game rather than a debug board.

### Recovery

Temporary network interruption must not destroy an active match.

On reconnect the client replaces local match state with a new sanitized server projection. Normal server/container restart recovery should be designed into persistence before public testing.

A restarted server must preserve authoritative turn/reconnect deadlines or deliberately resolve the affected match under the accepted infrastructure-failure policy; process-local countdowns are insufficient.

### Results and rematch

At match completion show:

- winner/loser clearly when the match has a winner;
- finish reason when relevant: normal victory, deck exhaustion, surrender, timeout/forfeit, or infrastructure abort/no-contest;
- the final three lane outcomes for a normal rules finish;
- a direct rematch action for a private/opponent-compatible flow;
- return-to-play action.

A rich historical statistics page is not required yet.

## Minimal operational requirements

Before inviting external testers, the project should also have:

- repeatable local setup;
- committed database migrations;
- CI for format/lint/typecheck/tests/build;
- game-engine unit/regression/property tests;
- server integration tests for hidden information, stale/duplicate commands, reconnect, lifecycle timeout/finalization, and result idempotency;
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

The first playable is successful technically when two real Telegram accounts can repeatedly complete matches without state corruption, hidden-information leakage, duplicate actions, reconnect loss, or permanently orphaned active matches.

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
