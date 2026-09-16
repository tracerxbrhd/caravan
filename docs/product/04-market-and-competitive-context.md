# 04. Market and Competitive Context

## Status

Research snapshot as of 2026-09-16. This document is context for product decisions, not a claim that market conditions will remain unchanged.

## Product hypothesis

CARAVAN is a niche product opportunity rather than an assumed mass-market game.

The thesis is not that no alternatives exist. Multiple independent implementations already exist, which is useful evidence that players continue to seek standalone/mobile/online versions of the underlying card game.

The opportunity is to compete on execution:

- accurate rules;
- excellent onboarding;
- reliable server-authoritative multiplayer;
- low-friction friend challenges and matchmaking;
- tactile card presentation;
- original identity rather than franchise-dependent presentation;
- a clean Telegram -> Android/iOS/Web portability path.

## Current analogs

### Caravan — Invisible Unicorns (Android)

Google Play currently lists `Caravan` by Invisible Unicorns with 5K+ downloads, a 4.5-star rating, and roughly 281 reviews. Its listing describes tutorial content, AI opponents, story/tower modes, card collection/deck building, and internet multiplayer.

The app also uses explicit Fallout: New Vegas branding/content references. CARAVAN should not follow that IP strategy.

Source: <https://play.google.com/store/apps/details?id=com.unicorns.invisible.caravan>

### Caravan Cards (iOS)

`Caravan Cards` remains available on the Apple App Store for iPhone/iPad. The US listing shows roughly 130 ratings and a 4.1/5 score. Reviews demonstrate that some players specifically seek a convenient phone/tablet implementation and also highlight recurring concerns around rule accuracy, target selection, deck-building expectations, and crashes.

Those complaints reinforce two CARAVAN priorities: rules correctness and touch UX.

Source: <https://apps.apple.com/us/app/caravan-cards/id483773247>

### CARAVAN — raspbyte (browser)

A browser implementation by raspbyte supports play against CPU, local same-device multiplayer, and online play with a friend.

This confirms that the game maps naturally to a lightweight web client and that a dedicated heavy game engine is not required merely to deliver the core card experience.

Source: <https://raspbyte.github.io/caravan/>

### Merchant's Trail (Android)

A new Android project, `Merchant's Trail`, appeared in 2026 with a deliberately independent identity while using closely related card-game ideas. Public descriptions advertise real-time 1v1 multiplayer, ranked/ELO play, friend/random matchmaking, AI, progression/challenges, and a desert/merchant presentation.

This is the closest current validation of the same broad product direction and also means that "mobile online Caravan-like game" alone is not a sufficient differentiator.

Sources:

- <https://appagg.com/android-games/card/merchants-trail-43996095.html>
- <https://www.reddit.com/r/playmygame/comments/1w4cjet/i_made_a_mobile_card_game_inspired_by_fallout_new/>

## What the evidence does and does not show

The current analogs demonstrate persistent niche interest. They do **not** prove a large addressable market or guarantee that a new implementation will retain enough concurrent players for healthy matchmaking.

Therefore the initial product strategy remains:

```text
Telegram launch
-> validate onboarding and repeat play
-> validate challenge/matchmaking liquidity
-> improve the core match experience
-> expand to Android/iOS only when evidence justifies the extra distribution work
```

## Differentiation target

CARAVAN should not try to win by accumulating the largest feature list before launch.

The intended differentiation is the combination of:

1. deterministic and well-tested rules;
2. a concise visual rules guide that makes the game understandable without blocking entry to play;
3. high-quality tactile card-table UX;
4. robust server-authoritative multiplayer and reconnect;
5. effortless Telegram friend challenges;
6. original visual/audio identity;
7. architecture ready for standalone mobile clients.

## Research maintenance

Revisit this document before a public beta or store release. Verify active competitors, store availability, current ratings/download bands, multiplayer health where observable, and naming/trademark conditions rather than relying on this 2026-09-16 snapshot indefinitely.
