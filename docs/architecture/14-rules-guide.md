# 14. Visual Rules Guide

## Status

Implemented as the first-playable onboarding/help surface. CARAVAN deliberately does not require an interactive tutorial before competitive play.

The guide is a presentation layer over the accepted rules in [`../product/05-game-rules.md`](../product/05-game-rules.md). That normative rules document and the deterministic engine remain the source of truth; the guide must not become a second rules implementation.

## Product boundary

The guide is optional before matchmaking and always available later.

Players can open it from:

- the Play surface before entering matchmaking or creating a challenge;
- the live match surface without unmounting or replacing the realtime match session.

Opening help during a match must not disconnect the controlling WebSocket, mutate authoritative state, pause server deadlines, or create a separate local game state.

## Content model

The guide uses concise original wording plus visual examples for the concepts a new player most needs:

- three opposing route pairs and the 21–26 target range;
- opening route seeding;
- ascending/descending placement and the active-suit override;
- Jack, Queen, King, and Joker behavior;
- normal-turn play/discard/disband choices;
- route status, lane ownership, ties, victory, and deck exhaustion.

The UI may omit rare implementation edge cases from the quick guide when they would obscure first understanding. It must never state a simplified rule that contradicts the normative specification.

## Visual examples

Examples are lightweight DOM/CSS card scenes rather than screenshots or copied game assets.

This keeps them:

- readable at different Telegram WebView sizes;
- cheap to ship;
- accessible to text/screen-reader fallbacks;
- independent from another game's artwork or interface;
- easy to update alongside CARAVAN's own visual language.

Illustrations are explanatory only. They do not execute game-engine transitions and are not authoritative gameplay state.

## Accessibility and mobile behavior

The guide is a modal/full-screen help surface with semantic headings, captions, text equivalents, keyboard Escape support, and a clear close action.

On compact screens it becomes an edge-to-edge scroll surface. The live table remains mounted underneath when help is opened during a match.

Critical rules are stated in text as well as shown visually. Understanding must not depend only on color, suit color, animation, or decorative styling.

## Rule-change discipline

When a canonical gameplay rule changes, update together as applicable:

1. `docs/product/05-game-rules.md`;
2. game-engine regression/property tests;
3. protocol/server behavior if the wire/runtime boundary changes;
4. this visual guide copy/examples when the changed rule is player-facing.

A guide change by itself must not be used to redefine gameplay behavior.

## Deliberately absent

The first playable does not include:

- a scripted interactive tutorial;
- tutorial-only local game states;
- tutorial completion/progression persistence;
- tutorial rewards or competitive unlocks;
- separate tutorial copies of the game rules.

This keeps onboarding maintainable and prevents a second gameplay path from drifting away from real matches.
