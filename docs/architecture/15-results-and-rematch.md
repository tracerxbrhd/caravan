# 15. Match Results and Rematch

## Status

Accepted and implemented as the first-playable post-match boundary.

This layer presents the already-finalized authoritative match outcome and allows the same two participants to mutually agree to a fresh match. It does not reinterpret the result client-side and does not reuse finished game state as the starting point of a rematch.

## Result authority

`MatchSnapshot.result` remains the only match-result authority exposed to the Mini App. The existing protocol distinguishes:

- `ROUTES`;
- `DECK_EXHAUSTION`;
- `SURRENDER`;
- `TIMEOUT`;
- `NO_CONTEST`.

The result view derives win/loss/no-contest wording relative to `PlayerView.viewer`. For a normal `ROUTES` finish, the client may show final lane ownership and route values because those values already exist in the sanitized final `PlayerView`.

The client must not infer a different winner from rendered totals or locally replay the final action. If the result and player projection ever disagree, the protocol/server invariant is the defect to fix.

The finished table remains visible with the result surface rather than being immediately replaced by an unrelated screen. This preserves the causal context of the final action.

## Rematch contract

A rematch is a two-party handshake tied to one finished source match.

Protocol state is intentionally small and player-relative:

```text
IDLE
WAITING(requestedBy = YOU | OPPONENT, expiresAtMs)
MATCH_FOUND(matchId)
```

No opponent hidden information, source authoritative snapshot, deck order, or future random material belongs in this contract.

HTTP boundary:

```text
GET    /api/matches/:matchId/rematch
POST   /api/matches/:matchId/rematch
DELETE /api/matches/:matchId/rematch
```

All three endpoints require the normal CARAVAN application session. A non-participant receives the same public `MATCH_NOT_FOUND` treatment rather than learning rematch state for somebody else's match.

## Handshake behavior

The first participant to `POST` creates a durable pending request. Repeating the same request is idempotent and stays in `WAITING`.

When the other participant `POST`s while the request is still pending, that call is the acceptance. The server then, in the same transaction:

1. verifies that the source match is finished and both accounts are still free to enter a new match;
2. creates exactly one fresh match through `MatchService` + `PostgresMatchStore`;
3. clears stale casual-queue membership for both accounts;
4. cancels their pending outgoing private challenges;
5. marks the rematch request accepted with the new `matchId`.

Subsequent reads/retries return the same accepted `matchId`.

The client polls the compact rematch status while the result surface is open. Once `MATCH_FOUND` arrives, Play switches to that match ID and uses the normal authenticated WebSocket/RESYNC path. No special rematch gameplay transport exists.

## Concurrency

Rematch creation reuses the match-entry advisory lock namespace:

- global `MATCHMAKING_QUEUE` lock first;
- then sorted `MATCH_ENTRY:<accountId>` locks for both source participants.

This preserves the existing lock order and serializes rematch acceptance against casual matchmaking/private-entry decisions for the same accounts.

`source_match_id` is the primary key of the durable rematch table. Together with transaction locking and the existing match-entry locks, one source match can produce at most one accepted rematch.

If either participant has already entered another active match before the handshake completes, the pending rematch becomes unavailable rather than opening a second active match.

## Persistence and expiry

`caravan_rematch_requests` stores only coordination data:

- source match ID;
- requester account ID;
- lifecycle status;
- accepted rematch match ID when one exists;
- created/expiry/resolution timestamps.

The default pending lifetime is 15 minutes and is configured by `REMATCH_TTL_SECONDS`.

Expired/cancelled requests are terminal coordination records and are presented as `IDLE`. Returning to Play performs a best-effort cancellation of a still-pending request; correctness does not rely on the client doing so because expiry and active-match conflict checks remain server-owned.

## Fresh-match guarantee

A rematch is not a reset of the old `CaravanGameState`.

The new match goes through the same `MatchService.createMatch()` path as any other match. Therefore it receives:

- a new match ID;
- newly shuffled server-authoritative decks;
- a fresh server-selected starting player;
- clean command-idempotency/state-version state;
- no carried hidden information or deadlines from the previous game.

## Client presentation

The first-playable result surface shows:

- `You won`, `You lost`, or `No contest`;
- a human-readable finish reason;
- all three final lane outcomes and both visible route values for `ROUTES` finishes;
- a rematch request/accept/waiting state;
- `Return to Play`.

`NO_CONTEST` is described neutrally and must not visually blame either participant.

Result/rematch presentation is not a rating, history, progression, or economy system. Those remain separate future product decisions.
