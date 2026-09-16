# 02. Player Experience and Platform Strategy

## Status
Accepted as the initial experience and platform direction. This document describes intended behavior, not implemented functionality.

## Experience principle

CARAVAN should feel like handling cards on a physical table.

Animation, sound, and haptics are not decorative extras: they should communicate state transitions, make legal actions legible, and give virtual cards a sense of weight and location.

The detailed interaction contract is maintained in `07-match-ux-and-tutorial.md`.

## Match presentation

The table should clearly communicate:

- the player's hand;
- the opponent's public information without leaking hidden cards;
- the three competing routes/caravans on each side;
- current values and status of each route;
- whose turn it is;
- valid action targets;
- the result of special-card effects;
- deck/discard quantities where rules permit them to be public.

The presentation must remain usable on compact Telegram WebViews and future phone screens without relying on fixed pixel geometry.

## Tactile card behavior

Target interactions include:

- deal/draw motion from a deck into the hand;
- a responsive hand fan or equivalent compact hand layout;
- selection lift/scale with clear focus;
- visible legal-target feedback;
- short placement arcs from hand to table;
- modifier-card attachment that visually associates the modifier with its target;
- discard motion that explains removals rather than teleporting cards away;
- concise value/status transitions after effects resolve;
- subtle sound and haptic confirmation.

Animations should generally be short, interruptible where practical, and based on transforms/opacity rather than layout-heavy frame-by-frame DOM changes.

Reduced-motion and sound preferences must be respected.

## Tutorial

Onboarding is a first-class feature, not documentation hidden behind a help screen.

The tutorial should teach by constrained interaction:

```text
instruction -> highlighted legal choice -> player action -> immediate explanation
```

It should progressively introduce:

- the objective;
- route/caravan values;
- ordering/direction rules;
- legal and illegal placements;
- modifier-card behavior;
- how a route becomes competitive/winning;
- how the overall match is resolved.

The exact sequence is defined in `07-match-ux-and-tutorial.md` and must remain derived from the accepted canonical rules in `05-game-rules.md`, never copied from another game's tutorial or rulebook wording.

## Telegram launch strategy

Telegram is the first distribution and validation surface because it enables a low-friction social loop:

```text
invite/challenge -> Telegram message -> open Mini App -> authenticate -> match
```

The bot should remain a thin entry/notification layer. It must not own game rules or authoritative match state.

## Standalone strategy

CARAVAN should be architected from the start so that the main client can later run as:

```text
shared application/game UI
        |
PlatformAdapter
   /         \
Telegram   Web/Native
              |
          Capacitor
          /       \
      Android     iOS
```

The exact native packaging technology may change if later evidence justifies it, but Capacitor is the current likely path because it can preserve the React/web application while exposing native lifecycle, haptics, notifications, and platform integrations.

## Authentication portability

Telegram identity is an authentication provider, not the domain account itself.

Future Apple/Google/other login providers should resolve to the same internal account model rather than creating platform-specific player identities.

## Future product surface

Potential later capabilities include ranked matchmaking, ratings, profiles/history, cosmetics, AI practice, custom deck building, and platform-native notifications. They are not considered implemented or mandatory for the first playable vertical slice unless later product docs explicitly promote them into scope.

The accepted current first-playable boundary is `06-first-playable-scope.md`.
