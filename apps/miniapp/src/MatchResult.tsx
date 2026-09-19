import type { MatchSnapshot, RematchStatus } from '@caravan/protocol';

type PlayerSeat = 'A' | 'B';

function otherSeat(seat: PlayerSeat): PlayerSeat {
  return seat === 'A' ? 'B' : 'A';
}

function resultTitle(snapshot: MatchSnapshot): string {
  const result = snapshot.result;
  if (result === null || result.winner === null) return 'No contest';
  return result.winner === snapshot.game.viewer ? 'You won' : 'You lost';
}

function resultReason(snapshot: MatchSnapshot): string {
  const result = snapshot.result;
  if (result === null) return 'The match ended.';

  const viewerWon = result.winner === snapshot.game.viewer;
  switch (result.reason) {
    case 'ROUTES':
      return viewerWon
        ? 'You secured at least two of the three trade lanes.'
        : 'Your opponent secured at least two of the three trade lanes.';
    case 'DECK_EXHAUSTION':
      return viewerWon ? 'Your opponent ran out of cards.' : 'Your deck ran out of cards.';
    case 'SURRENDER':
      return viewerWon ? 'Your opponent surrendered.' : 'You surrendered the match.';
    case 'TIMEOUT':
      return viewerWon
        ? 'Your opponent missed an authoritative server deadline.'
        : 'You missed an authoritative server deadline.';
    case 'NO_CONTEST':
      return 'The match ended without assigning a winner.';
  }
}

function laneOwnerLabel(owner: PlayerSeat | null, viewer: PlayerSeat): string {
  if (owner === null) return 'Unresolved';
  return owner === viewer ? 'You' : 'Opponent';
}

function rematchCopy(status: RematchStatus): string {
  if (status.status === 'WAITING' && status.requestedBy === 'YOU') {
    return 'Rematch requested. Waiting for your opponent.';
  }
  if (status.status === 'WAITING') return 'Your opponent wants another match.';
  if (status.status === 'MATCH_FOUND') return 'Both players agreed. Preparing a fresh table…';
  return 'Play the same opponent again with a fresh shuffle and starting player.';
}

export function MatchResult({
  snapshot,
  rematch,
  rematchBusy,
  rematchError,
  onRematch,
  onExit,
}: {
  readonly snapshot: MatchSnapshot;
  readonly rematch: RematchStatus;
  readonly rematchBusy: boolean;
  readonly rematchError: string | null;
  onRematch(): void;
  onExit(): void;
}) {
  const viewer = snapshot.game.viewer;
  const opponent = otherSeat(viewer);
  const normalFinish = snapshot.result?.reason === 'ROUTES';

  return (
    <div className="match-result-overlay">
      <div className="match-result-backdrop" aria-hidden="true" />
      <section
        className="panel match-result"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-result-title"
        aria-describedby="match-result-reason"
        aria-live="polite"
      >
        <div className="match-result__heading">
          <div>
            <span className="section-kicker">Final result</span>
            <h2 id="match-result-title">{resultTitle(snapshot)}</h2>
            <p className="muted" id="match-result-reason">
              {resultReason(snapshot)}
            </p>
          </div>
          <span className="match-result__stamp" aria-hidden="true">
            Final
          </span>
        </div>

        {normalFinish && (
          <div className="result-lanes" aria-label="Final trade lane outcomes">
            {snapshot.game.laneOwners.map((owner, index) => {
              const ownValue = snapshot.game.players[viewer].routes[index]?.value ?? 0;
              const opponentValue = snapshot.game.players[opponent].routes[index]?.value ?? 0;
              return (
                <article className="result-lane" key={index}>
                  <span className="result-lane__name">Lane {index + 1}</span>
                  <strong>{laneOwnerLabel(owner, viewer)}</strong>
                  <span className="result-lane__score">
                    {ownValue} <small>you</small> · {opponentValue} <small>opponent</small>
                  </span>
                </article>
              );
            })}
          </div>
        )}

        {snapshot.result?.reason === 'NO_CONTEST' && (
          <p className="notice notice--warn">
            No player is blamed for this result. You can return to Play or try the matchup again.
          </p>
        )}

        <div className="rematch-card">
          <div>
            <span className="section-kicker">Same opponent</span>
            <p>{rematchCopy(rematch)}</p>
            {rematchError !== null && <p className="table-rejection">{rematchError}</p>}
          </div>
          <button
            className="button button--primary"
            disabled={
              rematchBusy ||
              rematch.status === 'MATCH_FOUND' ||
              (rematch.status === 'WAITING' && rematch.requestedBy === 'YOU')
            }
            onClick={onRematch}
          >
            {rematch.status === 'WAITING'
              ? rematch.requestedBy === 'OPPONENT'
                ? 'Accept rematch'
                : 'Waiting for opponent…'
              : rematch.status === 'MATCH_FOUND'
                ? 'Starting rematch…'
                : 'Play again'}
          </button>
        </div>

        <button className="button button--quiet match-result__exit" onClick={onExit}>
          Return to Play
        </button>
      </section>
    </div>
  );
}
