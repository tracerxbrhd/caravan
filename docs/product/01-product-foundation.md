# 01. Product Foundation

## Status

Accepted as the initial CARAVAN product direction. This document describes intent, not implemented functionality.

## Product vision

CARAVAN is a competitive online card game based on Caravan gameplay principles, rebuilt as an independent product with original presentation, assets, wording, and implementation.

The product should work for two audiences at the same time:

1. players already familiar with the underlying game who want a convenient, reliable way to play against real people;
2. players who have never understood or played it before and need a much clearer introduction than the source material historically provided.

The product should feel like a real digital card table rather than a web form with card-shaped buttons.

## Why build it

The game occupies a useful niche: it has recognizable mechanics and an existing enthusiast audience, but no single implementation should be assumed to own the definitive cross-platform multiplayer experience.

CARAVAN therefore competes on execution rather than on inventing a new ruleset:

- accurate and deterministic rules;
- a concise visual rules guide with concrete card examples;
- low-friction social multiplayer;
- reliable server-authoritative play;
- tactile presentation;
- original identity;
- portability beyond Telegram.

The goal is not to assume mass-market demand. Telegram is the initial validation platform precisely because it gives the project a low-friction way to test retention, matchmaking activity, onboarding quality, and player interest before investing in full native distribution.

## Core player promise

A player should be able to:

1. open CARAVAN from Telegram;
2. understand enough to start playing quickly;
3. challenge a friend or find an opponent;
4. play a fair match with clear feedback;
5. recover cleanly from temporary disconnects;
6. understand why each legal or illegal action behaves as it does;
7. return for another match without friction.

## Initial priorities

In priority order:

1. maintain the accepted canonical rules specification in `05-game-rules.md`;
2. build and heavily test the deterministic game engine from that specification;
3. keep the concise visual rules guide accurate, readable, and available before/during matches;
4. support private challenges and casual matchmaking;
5. deliver reliable authoritative PvP and reconnect/recovery;
6. make card handling feel polished on touch devices;
7. add history/profile/rating features only when the core match loop is healthy;
8. validate Telegram usage before expanding distribution.

The current vertical-slice boundary is defined in `06-first-playable-scope.md`.

Ranked play is a natural direction, but it must not delay correctness, onboarding, casual/private play, or multiplayer reliability.

## Competitive integrity

Competitive state is server-authoritative. Cosmetics, progression, or future monetization must never change card strength, shuffle odds, legal actions, hidden information, or any other competitive outcome.

No pay-to-win mechanics.

The first playable deliberately uses equal server-defined card availability for all players. Player-facing custom deck building may be introduced later, but card access itself must remain competitively fair.

## Product non-goals

The initial product is not intended to become:

- a Fallout clone or unofficial Fallout client;
- a collectible-card-game economy;
- a gacha product;
- an MMO-style progression system;
- a large live-service/FOMO platform;
- a Telegram-only codebase;
- a generic multi-game framework built before a second concrete need exists.

## Naming

`CARAVAN` is the working and current product name.

The repository is `tracerxbrhd/caravan`.

A separate store-name or subtitle may be considered before Android/iOS publication if discovery, trademark clearance, or differentiation requires it. That future marketing decision should not leak into core domain naming prematurely.
