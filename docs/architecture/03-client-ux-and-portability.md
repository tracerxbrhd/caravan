# 03. Client UX and Portability

## Status

Accepted as the initial client architecture and presentation direction.

## Client technology direction

The first client is a Telegram Mini App. React + Vite is the current preferred implementation direction, following the proven UNDERGAMMON stack, unless an implementation spike provides a concrete reason to change it.

The main game UI must not directly depend on Telegram globals throughout the component tree.

## Platform boundary

Use a small application-facing platform interface, conceptually:

```text
Game/Application UI
        |
  PlatformAdapter
   /          \
Telegram     Browser/Native
Adapter         Adapter
                   |
               Capacitor
               /       \
           Android     iOS
```

The adapter may own platform capabilities such as:

- launch/auth context acquisition;
- deep links/sharing;
- haptics;
- viewport/safe-area information;
- theme integration;
- close/minimize/back behavior;
- later push-notification registration.

Game rules, match ownership, and account domain logic must not depend on Telegram objects.

## Standalone migration

Telegram is the launch/validation platform, not the final architectural boundary.

A future Android/iOS application should reuse the deterministic engine, protocol, application UI, realtime client, and backend. Native packaging should mainly replace or extend platform integrations such as authentication, notifications, haptics, deep links, app lifecycle, and store-specific requirements.

Capacitor is the current likely packaging strategy, but this remains replaceable if later evidence demonstrates a better option.

## Card-table rendering

Start with DOM/CSS/React unless measured rendering requirements justify a dedicated canvas/WebGL renderer.

Prefer GPU-friendly animation properties:

- `transform`;
- `opacity`;
- composited layers where justified.

Avoid frequent layout reads/writes or DOM reflow as part of frame-by-frame animation.

Card geometry and hit targets must derive from available container geometry rather than assuming one Telegram viewport size.

## Interaction quality

The UI should support:

- touch-first hit targets;
- clear selected-card state;
- legal target guidance;
- short draw/deal/placement/discard transitions;
- visually attached face/special cards where the rules create such relationships;
- unambiguous route/caravan totals and status;
- concise invalid-action feedback;
- subtle sound and haptic confirmation.

Presentation state is disposable. After reconnect/resync, the UI must be able to reconstruct a correct scene from the latest server `PlayerView` without trusting stale local animation state.

## Accessibility and weaker devices

Respect reduced-motion and sound preferences.

Animations should degrade gracefully on weaker mobile WebViews. Visual fidelity must not compromise input correctness or make authoritative game state unclear.

Avoid effects that obscure cards, values, legal targets, or turn ownership.
