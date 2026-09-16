# 05. Canonical Game Rules

## Status

Accepted as the initial normative CARAVAN rules specification for implementation.

This document defines CARAVAN's own wording and deterministic interpretation of the underlying gameplay mechanics. It is not copied rulebook text. Where historical descriptions or source-game behavior are ambiguous or buggy, this document makes an explicit project decision so the engine, protocol, player-facing rules guide, and tests have one source of truth.

If later direct runtime verification proves that a material gameplay rule was interpreted incorrectly, change this document deliberately together with regression tests. Do not silently encode a different rule in code.

## Terminology

A match has two players.

Each player owns three **routes**. Each route competes only with the opposing route in the same lane, producing three route pairs total.

Cards use ordinary playing-card ranks and suits:

- suits: Clubs, Diamonds, Hearts, Spades;
- value cards: Ace, 2 through 10;
- modifier cards: Jack, Queen, King, Joker.

Ace has numeric value `1`. Cards 2 through 10 use their printed numeric value.

The terms `route`, `value card`, and `modifier card` are CARAVAN project terminology. UI copy may evolve, but the game engine should use stable domain concepts rather than presentation wording.

## Decks

A legal match deck contains at least 30 card instances and at least three value cards so opening setup is possible.

A card instance has a stable identity in addition to rank and suit. Multiple copies of the same rank/suit may exist when they are distinct instances from different allowed source sets, but the same physical/logical card instance cannot appear twice in one deck.

Deck availability, collection UX, and deck-building presentation are product concerns outside the core rules. The engine receives already validated deck definitions.

For the first playable, all players use the same server-defined legal starter deck. Competitive card availability must not depend on progression, purchases, or random acquisition.

## Shuffle and opening hand

The authoritative server shuffles each player's deck independently and provides the resulting order to the deterministic engine.

Each player begins with 8 cards in hand.

An opening hand must contain at least three value cards. If a shuffled opening hand does not satisfy that requirement, the server performs a fresh shuffle/mulligan for that player and draws a new opening hand. This is CARAVAN's explicit deadlock-prevention rule; the historical source-game bug that permitted discarding during setup is not reproduced.

Only the accepted final opening hand/order enters gameplay. Mulligan attempts do not reveal rejected hands to the opponent.

## Starting player and turn order

The authoritative server chooses a starting seat uniformly for each match using secure server randomness and injects that choice into game initialization. The deterministic engine does not choose the starter itself.

The starting player takes the first opening turn. Players then alternate turns strictly unless the match has already finished.

Because the opening phase consists of six alternating turns total (three per player), the same starting player also takes the first normal turn after both players have seeded all three routes.

A turn changes only after the acting player's action, all resulting card effects, any required replacement draw, and victory/deck-exhaustion evaluation have fully resolved.

## Opening phase

Players alternate opening turns.

On each of their first three turns, a player must place one value card from hand onto one of their own still-empty routes. By the end of the opening phase each player has exactly one value card on each of their three routes.

During opening setup:

- modifier cards cannot be played;
- hand cards cannot be discarded;
- routes cannot be disbanded;
- played opening cards are not replaced by draws.

A player therefore normally finishes setup with 5 cards in hand.

## Normal turn actions

After both players have seeded all three routes, play enters the normal turn phase.

A player performs exactly one primary action on their turn:

1. play one card from hand;
2. discard one card from hand; or
3. disband one of their own non-empty routes.

Playing or discarding a hand card is followed by drawing one replacement card when the draw pile can supply it. Disbanding a route does not consume a hand card and therefore does not draw a replacement.

All card effects and resulting removals resolve before victory is evaluated and before the next player's turn begins.

## Playing value cards

A value card may only be played on one of the acting player's own routes and is appended to the end of that route's value-card sequence.

### Empty route

Any value card may start an empty route.

### Route with one value card

Any value card with a different rank may be appended. Equal adjacent ranks are never legal.

The second value card establishes direction:

- higher than the previous terminal card -> ascending;
- lower than the previous terminal card -> descending.

### Route with direction

For every later value-card play, the new card is legal when either:

- its rank continues the current direction strictly; or
- its suit matches the route's current active suit.

Equal adjacent ranks are illegal even when suits match.

A same-suit play may cross against the previous direction. When that happens, the direction changes to the direction implied by the newly adjacent pair.

After any value card is successfully appended, the route's base direction is the comparison between the previous terminal value card and the newly played card.

## Active suit

Without a Queen on the terminal value card, the active suit is the suit of that terminal value card.

A Queen attached to the terminal value card changes the active suit to the Queen's suit. If multiple Queens are attached there, the most recently played surviving Queen determines the active suit.

Queens attached to cards that are no longer terminal remain attached but do not control the route's current active suit.

## Modifier targeting and attachment limit

Modifier cards target value cards rather than standing alone.

Unless stated otherwise, a modifier may target a legal value card on either player's routes.

At most three modifier cards may be attached to one value card at a time. A modifier cannot be played onto a target that already has three attached modifiers.

A Jack resolves immediately and is discarded together with the card group it removes. Kings, Queens, and Jokers remain attached to their target after resolving their effect.

## Card ownership and discard destination

Every card instance keeps the owner of the deck it came from for the entire match, even when that card is played as a modifier onto an opponent's route.

Whenever a card leaves play, it enters its original owner's discard pile. This applies to:

- a card discarded directly from hand;
- a Jack after resolving;
- a Jack's target and attached modifiers;
- cards and modifiers removed by a Joker;
- every card removed when a route is disbanded.

As a result, disbanding a route can send attached opponent-owned modifiers to the opponent's discard pile while the route owner's cards return to the route owner's discard pile.

Discard piles are public information. A card discarded directly from a hidden hand becomes public when discarded.

## Jack

A Jack may target any value card with an available modifier slot.

It removes:

- the targeted value card;
- every modifier currently attached to that target;
- the Jack used for the removal.

All removed cards go to their original owners' discard piles.

The remaining value cards close the gap while retaining their relative order.

## King

A King may target any value card with an available modifier slot.

Each surviving King doubles that target card's contribution to route value.

For a base value `v` with `k` attached Kings, contribution is:

`v * 2^k`

Examples are deliberately omitted from the normative rule because tests should express the arithmetic directly.

A King does not change route ordering, direction, or active suit.

## Queen

A Queen may be played only on the terminal value card of a route and requires an available modifier slot.

When played:

- if the route has an established direction, the Queen reverses it;
- the route's active suit becomes the Queen's suit.

If the route contains only one value card, direction remains unset because there is no numeric direction to reverse; the Queen still becomes the active-suit override.

Multiple Queens may be attached to the terminal card. Each newly played Queen toggles an established direction again, while the newest surviving Queen supplies the active suit.

Once another value card is appended, the new adjacent value-card pair establishes the route's new base direction and the new terminal card supplies active suit unless it has its own Queen modifier.

## Joker

A Joker may target any value card with an available modifier slot. The target itself is protected from the Joker's removal effect.

A Joker resolves once when played and then remains attached to its target. It does not continuously affect cards played later.

### Joker on Ace

Remove every other value card currently on the table whose printed suit matches the targeted Ace's printed suit.

The targeted Ace remains. Queen suit overrides do not change a value card's printed suit for Joker resolution.

### Joker on 2 through 10

Remove every other value card currently on the table whose rank matches the targeted card's rank, regardless of suit.

The targeted value card remains.

Whenever a Joker removes a value card, every modifier attached to that removed card is removed with it.

Joker effects apply across all six routes, including both players' cards.

## Route value

A route's score is the sum of contributions from all surviving value cards on that route.

Ace contributes 1; cards 2 through 10 contribute their numeric rank; attached Kings modify only their target's contribution as specified above.

Queens and Jokers contribute no points directly. Jacks do not remain on the table after resolution.

Route status is:

- **light**: below 21;
- **in range**: 21 through 26 inclusive;
- **overloaded**: above 26.

Being in range does not lock a route. It may still be modified, extended, attacked, or disbanded until the match ends.

## Route-pair ownership

Each of the three lanes compares one route from each player.

A lane is unresolved when:

- neither route is in range; or
- both routes are in range with equal values.

Otherwise the lane is currently owned by:

- the only player whose route is in range; or
- the player with the higher in-range value when both are in range.

A light or overloaded route cannot own a lane.

## Match victory

After every fully resolved action, evaluate all three route pairs.

The match ends when all three lanes have a non-tied owner. The player who owns at least two lanes wins.

A tied in-range pair prevents normal match completion until the tie is broken.

This means a player does not win merely because two lanes are currently favorable while the third lane remains unresolved.

## Deck exhaustion

CARAVAN uses a finite deck; discard piles are not reshuffled during a normal match.

When a play/discard action requires its replacement draw but the acting player's draw pile is empty, resolve the played action first and evaluate normal victory. If that action has not already ended the match in the acting player's favor, that player loses by deck exhaustion.

This is CARAVAN's explicit deterministic interpretation of source-game exhaustion behavior. It makes the inability to complete a required replacement draw the rule boundary rather than allowing implementation-dependent play after the draw pile is exhausted.

## Discarding from hand

A player may use their normal-turn action to discard one card from hand.

That card leaves the hand, becomes public in its owner's discard pile, then the player draws one replacement card if available. Normal deck-exhaustion handling applies if a replacement cannot be drawn.

## Disbanding a route

A player may use their normal-turn action to disband one of their own routes only when that route currently contains at least one value card.

Disbanding removes every card from that route, including attached modifiers. Each removed card enters its original owner's discard pile. The route becomes empty and may later be restarted with a value card.

An empty route cannot be disbanded as a no-op action. This prevents indefinite turn stalling without changing state.

Disbanding does not draw a card because it does not consume a card from hand.

## Recomputing control state after removals

Jack and Joker effects may remove cards from the middle or end of a route.

Before applying a destructive effect, capture the route's current effective direction and current terminal value-card identity. After removal:

1. surviving value cards retain their relative order;
2. if fewer than two value cards remain, direction becomes unset;
3. otherwise identify the new terminal card and the final two surviving value-card ranks;
4. when those final two ranks differ, derive the new base direction from that numeric pair, then apply the surviving Queen toggles attached to the new terminal card;
5. when those final two ranks are equal because an intervening card was removed, preserve the route's effective direction from immediately before the destructive effect;
6. in that equal-rank case, if removal exposed a different terminal card than before, apply that newly exposed terminal card's surviving Queen toggles once because they were previously inactive; if the terminal card did not change, do not apply its Queens a second time;
7. active suit comes from the newest surviving Queen on the new terminal card, otherwise from the terminal value card's printed suit.

This explicit rule exists so removal edge cases are deterministic and testable rather than implementation-defined, including cases where a Queen-bearing internal card becomes terminal again.

## Information visibility

The rules assume hidden hands and hidden future deck order.

Public match information includes:

- all cards and modifiers currently on the table;
- route values, statuses, and current lane ownership;
- each player's hand size and remaining deck count;
- both discard piles and the identities/order of cards placed into them;
- any card revealed by a public action such as discard or removal;
- active player, phase, and final result.

The authoritative server may know more than either player is allowed to receive. Projection requirements are defined in the architecture docs.

## Bugs and historical quirks are not rules

CARAVAN does not reproduce accidental source-game behavior merely because it existed in a particular implementation.

In particular, the opening discard bug is excluded. Any future compatibility decision that intentionally reproduces a historical quirk must be documented here and covered by regression tests.

## Research basis (non-normative)

This specification was independently written after comparing multiple public descriptions of the mechanics, including the Fallout Wiki transcription/summary, StrategyWiki, Pagat's rules analysis, and independent open-source reimplementations. These references are research inputs only; this document is the project's normative wording and interpretation.

Useful references as of 2026-09-16:

- https://fallout.fandom.com/wiki/Caravan_(game)
- https://strategywiki.org/wiki/Fallout:_New_Vegas/Caravan
- https://www.pagat.com/invented/caravan.html
- https://github.com/r3w0p/caravan
