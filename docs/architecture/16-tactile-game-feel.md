# 16. Tactile Game Feel

## Status

Implemented as the presentation layer that turns authoritative Mini App snapshots into short, physical-feeling card transitions, optional original audio cues, and platform-safe haptic feedback.

This layer extends the interactive table from [`13-interactive-card-table.md`](13-interactive-card-table.md). It does not change game rules, protocol authority, server state, command acceptance, or hidden-information projection.

## Authority boundary

Presentation remains downstream of the authoritative snapshot:

```text
previous sanitized MatchSnapshot
              +
next sanitized MatchSnapshot
              |
       presentation diff
              |
   visual/audio/haptic cue
              |
      render next snapshot
```

The client never creates a replacement gameplay event or mutates a route, hand, discard pile, timer, result, or legal action in order to make an animation look plausible.

Local selection feedback may occur immediately because it communicates input focus only. Table-changing feedback is derived only after a fresh server snapshot arrives.

If the connection reconnects or resynchronizes, the latest sanitized snapshot remains sufficient to reconstruct the correct scene. No animation queue is required for correctness.

## Snapshot-diff presentation model

`apps/miniapp/src/presentation.ts` compares two player-safe snapshots and classifies a concise presentation cue:

- `DRAW`;
- `PLACE`;
- `MODIFIER`;
- `DISCARD`;
- `REMOVE`;
- `RESULT`.

The classification is deliberately presentation-only. When one authoritative update contains several visible changes, the cue priority favors the most consequential visible effect rather than pretending to reconstruct a missing server event stream.

The actual DOM still renders the complete new snapshot, so a coarse sound/haptic cue cannot hide or alter state.

## Stable card motion

Public cards use their existing stable card IDs as presentation identities. The browser View Transition API is used when available to interpolate the same public card between rendered locations, including:

- own hand -> own route for a confirmed value-card play;
- own hand -> attached modifier slot for a confirmed modifier play;
- own hand -> public discard pile for direct discard;
- route -> original owner's public discard area for removals/disband where the destination card is visible.

Unsupported browsers and weaker WebViews fall back to the normal immediate snapshot replacement plus lightweight CSS effects. Gameplay never depends on View Transition support.

Route totals also receive stable presentation identities so value changes remain visually connected to the card action.

The initial snapshot is not treated as a historical action sequence. CARAVAN does not invent a deal animation from information that was not observed by the client.

## Hidden information

Hidden information remains a security boundary during motion.

The opponent hand is still rendered only as anonymous backs plus the public hand count. An opponent draw may animate an additional anonymous back, but the presentation layer never receives or synthesizes that card's identity or face.

Only cards already present in the sanitized `PlayerView` may receive public card transition identities. Future deck order and opponent hand contents never enter DOM attributes, animation metadata, sound selection, logs, or preferences.

## Hand and attachment presentation

The player's hand uses a compact dock plus an on-demand cyclic drawer built from CSS transforms. The drawer centers one active card, keeps neighboring cards partially visible, and cycles through the real hand without cloning authoritative card state. Selecting a card returns focus to the fixed table without reflowing the match surface.

Horizontal hand browsing uses pointer-driven transform/opacity updates only. An upward pointer gesture may drag the active playable card toward a highlighted legal target, but this is presentation/intent collection only: the drop resolves through the current server-projected `legalActions`, and the card does not leave the authoritative hand until the next snapshot confirms the action.

Modifier cards retain a compact attached slot beside their target value card. Stable transition identity lets a confirmed modifier visibly settle from the hand into that attachment rather than appearing unrelated to the selected card.

Route-node entry, anonymous opponent draws, in-range route confirmation, and rejection feedback use short transform/opacity effects. These effects are explanatory accents, not rule indicators by themselves.

## Public discard presentation

Each player has a compact public discard pile derived directly from `PlayerView.players[seat].discardPile`.

The top few cards are rendered visually while the full public count remains shown. This gives accepted discard/removal actions a concrete destination without turning the table into a large discard browser.

When one effect removes more cards than the compact pile displays, removed route cards can still fade/group away through the transition system. The authoritative discard list remains the source of truth.

## Sound

Sound is synthesized locally with the Web Audio API from simple generated tone/noise envelopes. No borrowed game audio or external copyrighted asset is required.

Cues are intentionally short and restrained:

- selection tick;
- paper-like draw/discard movement;
- table-contact placement;
- compact two-stage modifier attachment;
- heavier removal cue;
- concise result cadence.

Audio failure is non-fatal. Browsers that block or lack Web Audio simply remain silent.

Sound is presentation-only and never consumes or influences gameplay RNG. Any local noise generation is unrelated to server shuffle/random authority.

## Haptics and platform portability

Haptics are exposed through `PlatformAdapter`, not through game components calling Telegram directly.

The Telegram implementation uses `WebApp.HapticFeedback` when present. A browser vibration fallback is used where supported. Future Capacitor/native clients can replace this platform behavior without touching the game domain or table interaction model.

Selection/ordinary accepted actions use light feedback. Destructive/removal actions may use a medium impact, and result feedback may use a concise success notification.

Haptics are never required to understand state.

## Preferences

The table exposes independent presentation preferences for:

- sound on/off;
- haptics on/off when the platform supports them;
- system motion vs explicit reduced motion.

These preferences are optional local presentation state stored under a versioned browser key. Storage failure must not affect gameplay or authentication.

They are intentionally not server-authoritative account settings in this first implementation.

## Reduced motion and graceful degradation

System `prefers-reduced-motion` remains respected globally. The explicit table reduced-motion preference additionally bypasses View Transition choreography and suppresses the larger table effects.

Important state remains visible through cards, text, values, status, legal-target affordances, and authoritative snapshots when motion, sound, and haptics are all disabled.

The implementation favors transform/opacity and browser-composited transitions. It does not run frame-by-frame JavaScript geometry loops or make layout reads part of an animation tick.

## Testing boundary

Pure presentation tests cover snapshot classification and preference parsing without React, Telegram, or WebSocket dependencies.

A server-render test verifies that the table can render its public discard/presentation controls without browser globals. This protects the platform abstraction and makes accidental hard Telegram coupling visible in CI.

The existing game-engine, protocol, server, realtime, hidden-information, and legal-action tests remain responsible for gameplay correctness and security.

## Deferred

This layer intentionally does not add:

- a client-authoritative animation/event state machine;
- drag-and-drop as a required interaction (drag is implemented only as an optional enhancement over tap-target);
- large cinematic match-start sequences;
- downloadable/custom sound packs;
- cloud-synchronized presentation settings;
- canvas/WebGL rendering;
- production deployment composition.

Those are separate decisions and should be added only when product evidence justifies them.
