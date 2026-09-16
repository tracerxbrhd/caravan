import type { MatchSnapshot, WireGameAction, WirePlayerView } from '@caravan/protocol';
import { useEffect, useMemo, useState } from 'react';
import {
  cardInteraction,
  discardAction,
  disbandAction,
  isModifierTarget,
  modifierPlayAction,
  selectableCardIds,
  valuePlayAction,
  type CardInteraction,
  type RouteIndex,
} from './table-model.js';

type Seat = WirePlayerView['viewer'];
type PublicCard = WirePlayerView['hand'][number];
type RouteView = WirePlayerView['players']['A']['routes'][number];
type RouteCardView = RouteView['cards'][number];

interface CardTableProps {
  readonly snapshot: MatchSnapshot;
  readonly connectionReady: boolean;
  readonly pending: boolean;
  readonly rejection: string | null;
  onAction(action: WireGameAction): boolean;
  onSurrender(): boolean;
}

const ROUTES = [0, 1, 2] as const;

function rankLabel(card: PublicCard): string {
  const rank = card.face.rank;
  if (rank === 'ACE') return 'A';
  if (rank === 'JACK') return 'J';
  if (rank === 'QUEEN') return 'Q';
  if (rank === 'KING') return 'K';
  if (rank === 'JOKER') return '★';
  return String(rank);
}

function suitGlyph(card: PublicCard): string {
  switch (card.face.suit) {
    case 'CLUBS':
      return '♣';
    case 'DIAMONDS':
      return '♦';
    case 'HEARTS':
      return '♥';
    case 'SPADES':
      return '♠';
    default:
      return '✦';
  }
}

function suitName(card: PublicCard): string {
  return card.face.suit === null ? 'Joker' : card.face.suit.toLowerCase();
}

function routeStatusLabel(route: RouteView): string {
  if (route.status === 'IN_RANGE') return 'Ready';
  if (route.status === 'OVERLOADED') return 'Over';
  return 'Light';
}

function directionLabel(route: RouteView): string {
  if (route.direction === 'ASCENDING') return '↑';
  if (route.direction === 'DESCENDING') return '↓';
  return '·';
}

function cardClass(card: PublicCard): string {
  const suit = card.face.suit?.toLowerCase() ?? 'joker';
  return `playing-card playing-card--${suit}`;
}

function PlayingCard({
  card,
  selected = false,
  selectable = false,
  target = false,
  disabled = false,
  onClick,
}: {
  readonly card: PublicCard;
  readonly selected?: boolean;
  readonly selectable?: boolean;
  readonly target?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}) {
  const className = [
    cardClass(card),
    selected ? 'playing-card--selected' : '',
    selectable ? 'playing-card--selectable' : '',
    target ? 'playing-card--target' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      <span className="playing-card__corner">
        <strong>{rankLabel(card)}</strong>
        <span>{suitGlyph(card)}</span>
      </span>
      <span className="playing-card__suit" aria-hidden="true">
        {suitGlyph(card)}
      </span>
      <span className="playing-card__corner playing-card__corner--bottom" aria-hidden="true">
        <strong>{rankLabel(card)}</strong>
        <span>{suitGlyph(card)}</span>
      </span>
    </>
  );

  if (onClick === undefined) {
    return (
      <div className={className} aria-label={`${rankLabel(card)} ${suitName(card)}`}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={`${rankLabel(card)} ${suitName(card)}${target ? ', legal target' : ''}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function RouteCardNode({
  node,
  target,
  disabled,
  onTarget,
}: {
  readonly node: RouteCardView;
  readonly target: boolean;
  readonly disabled: boolean;
  onTarget(): void;
}) {
  return (
    <div className="route-node">
      {target ? (
        <PlayingCard card={node.card} target disabled={disabled} onClick={onTarget} />
      ) : (
        <PlayingCard card={node.card} />
      )}
      {node.modifiers.length > 0 && (
        <div className="modifier-stack" aria-label={`${node.modifiers.length} attached modifiers`}>
          {node.modifiers.map((modifier) => (
            <div
              className="modifier-chip"
              key={modifier.id}
              title={`${rankLabel(modifier)} ${suitName(modifier)}`}
            >
              <span>{rankLabel(modifier)}</span>
              <span>{suitGlyph(modifier)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RouteStrip({
  seat,
  routeIndex,
  route,
  label,
  selectedCardId,
  interaction,
  ownRoute,
  disabled,
  legalActions,
  confirmDisband,
  setConfirmDisband,
  submit,
}: {
  readonly seat: Seat;
  readonly routeIndex: RouteIndex;
  readonly route: RouteView;
  readonly label: string;
  readonly selectedCardId: string | null;
  readonly interaction: CardInteraction | null;
  readonly ownRoute: boolean;
  readonly disabled: boolean;
  readonly legalActions: readonly WireGameAction[];
  readonly confirmDisband: RouteIndex | null;
  setConfirmDisband(route: RouteIndex | null): void;
  submit(action: WireGameAction): boolean;
}) {
  const valueTarget =
    ownRoute && interaction !== null && interaction.valueRoutes.includes(routeIndex);
  const canDisband = ownRoute && disbandAction(legalActions, routeIndex) !== null;

  const playValue = () => {
    if (selectedCardId === null) return;
    const action = valuePlayAction(legalActions, selectedCardId, routeIndex);
    if (action !== null) submit(action);
  };

  const disband = () => {
    const action = disbandAction(legalActions, routeIndex);
    if (action !== null && submit(action)) setConfirmDisband(null);
  };

  return (
    <section className={`route-strip ${ownRoute ? 'route-strip--own' : 'route-strip--rival'}`}>
      <header className="route-strip__header">
        <span>{label}</span>
        <div className="route-metrics">
          <strong>{route.value}</strong>
          <span className={`route-status route-status--${route.status.toLowerCase()}`}>
            {routeStatusLabel(route)}
          </span>
          <span className="route-direction" title="Route direction">
            {directionLabel(route)}
          </span>
          {route.activeSuit !== null && (
            <span className="route-suit" title={`Active suit: ${route.activeSuit.toLowerCase()}`}>
              {suitGlyph({
                id: 'route-suit',
                owner: seat,
                face: { rank: 'ACE', suit: route.activeSuit },
              })}
            </span>
          )}
        </div>
      </header>

      <div className="route-cards">
        {route.cards.length === 0 && <span className="route-empty">Empty route</span>}
        {route.cards.map((node) => {
          const target = isModifierTarget(interaction, seat, routeIndex, node.card.id);
          return (
            <RouteCardNode
              key={node.card.id}
              node={node}
              target={target}
              disabled={disabled}
              onTarget={() => {
                if (selectedCardId === null) return;
                const action = modifierPlayAction(
                  legalActions,
                  selectedCardId,
                  seat,
                  routeIndex,
                  node.card.id,
                );
                if (action !== null) submit(action);
              }}
            />
          );
        })}
      </div>

      {valueTarget && (
        <button
          type="button"
          className="route-place-target"
          disabled={disabled}
          onClick={playValue}
        >
          Place selected card here
        </button>
      )}

      {canDisband && (
        <div className="route-destructive">
          {confirmDisband === routeIndex ? (
            <>
              <button type="button" className="route-confirm" disabled={disabled} onClick={disband}>
                Confirm disband
              </button>
              <button
                type="button"
                className="route-cancel"
                onClick={() => setConfirmDisband(null)}
              >
                Keep route
              </button>
            </>
          ) : (
            <button
              type="button"
              className="route-disband"
              disabled={disabled}
              onClick={() => setConfirmDisband(routeIndex)}
            >
              Disband route
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function selectionHint(interaction: CardInteraction | null): string {
  if (interaction === null) return 'Choose a playable card from your hand.';
  if (interaction.modifierTargets.length > 0 && interaction.canDiscard) {
    return 'Choose a highlighted value card, or discard the selected card.';
  }
  if (interaction.modifierTargets.length > 0) return 'Choose a highlighted value card.';
  if (interaction.valueRoutes.length > 0 && interaction.canDiscard) {
    return 'Choose a highlighted route, or discard the selected card.';
  }
  if (interaction.valueRoutes.length > 0) return 'Choose one of your highlighted routes.';
  if (interaction.canDiscard) return 'This card can be discarded.';
  return 'No legal target remains for this card.';
}

function resultLabel(snapshot: MatchSnapshot): string {
  if (snapshot.result === null) return 'Match complete';
  if (snapshot.result.winner === null) return 'No contest';
  return snapshot.result.winner === snapshot.game.viewer ? 'You won' : 'Opponent won';
}

export function CardTable({
  snapshot,
  connectionReady,
  pending,
  rejection,
  onAction,
  onSurrender,
}: CardTableProps) {
  const game = snapshot.game;
  const viewer = game.viewer;
  const opponent: Seat = viewer === 'A' ? 'B' : 'A';
  const legalActions = game.legalActions;
  const selectable = useMemo(() => new Set(selectableCardIds(legalActions)), [legalActions]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [confirmDisband, setConfirmDisband] = useState<RouteIndex | null>(null);
  const [confirmSurrender, setConfirmSurrender] = useState(false);

  const interaction = useMemo(
    () => (selectedCardId === null ? null : cardInteraction(legalActions, selectedCardId)),
    [legalActions, selectedCardId],
  );

  useEffect(() => {
    if (selectedCardId !== null && !selectable.has(selectedCardId)) setSelectedCardId(null);
    setConfirmDisband(null);
  }, [game.actionSequence, selectedCardId, selectable]);

  const disabled = !connectionReady || pending || snapshot.status !== 'ACTIVE';
  const yourTurn = snapshot.status === 'ACTIVE' && game.activePlayer === viewer;

  const submit = (action: WireGameAction): boolean => {
    if (disabled) return false;
    const sent = onAction(action);
    if (sent) {
      setSelectedCardId(null);
      setConfirmDisband(null);
    }
    return sent;
  };

  const discardSelected = () => {
    if (selectedCardId === null) return;
    const action = discardAction(legalActions, selectedCardId);
    if (action !== null) submit(action);
  };

  const surrender = () => {
    if (!connectionReady || pending || snapshot.status !== 'ACTIVE') return;
    if (onSurrender()) setConfirmSurrender(false);
  };

  return (
    <div className="card-table">
      <section className="table-opponent" aria-label="Opponent area">
        <div className="player-ribbon">
          <div>
            <span className="section-kicker">Opponent</span>
            <strong>{game.activePlayer === opponent ? 'Thinking' : 'Waiting'}</strong>
          </div>
          <div className="player-counts">
            <span>Deck {game.players[opponent].remainingDeckCount}</span>
            <span>Discard {game.players[opponent].discardPile.length}</span>
          </div>
        </div>
        <div
          className="opponent-hand"
          aria-label={`${game.players[opponent].handSize} hidden cards`}
        >
          {Array.from({ length: Math.min(game.players[opponent].handSize, 8) }, (_, index) => (
            <span className="card-back" key={index} />
          ))}
          <strong>{game.players[opponent].handSize}</strong>
        </div>
      </section>

      <section className="route-table" aria-label="Caravan routes">
        {ROUTES.map((routeIndex) => {
          const owner = game.laneOwners[routeIndex];
          return (
            <article className="lane-pair" key={routeIndex}>
              <RouteStrip
                seat={opponent}
                routeIndex={routeIndex}
                route={game.players[opponent].routes[routeIndex]}
                label={`Rival ${routeIndex + 1}`}
                selectedCardId={selectedCardId}
                interaction={interaction}
                ownRoute={false}
                disabled={disabled}
                legalActions={legalActions}
                confirmDisband={confirmDisband}
                setConfirmDisband={setConfirmDisband}
                submit={submit}
              />

              <div
                className={`lane-marker ${owner === viewer ? 'lane-marker--yours' : owner === opponent ? 'lane-marker--rival' : ''}`}
              >
                <span>Lane {routeIndex + 1}</span>
                <strong>{owner === null ? 'Open' : owner === viewer ? 'Yours' : 'Rival'}</strong>
              </div>

              <RouteStrip
                seat={viewer}
                routeIndex={routeIndex}
                route={game.players[viewer].routes[routeIndex]}
                label={`Your ${routeIndex + 1}`}
                selectedCardId={selectedCardId}
                interaction={interaction}
                ownRoute
                disabled={disabled}
                legalActions={legalActions}
                confirmDisband={confirmDisband}
                setConfirmDisband={setConfirmDisband}
                submit={submit}
              />
            </article>
          );
        })}
      </section>

      <section className="table-guidance" aria-live="polite">
        <div>
          <span className="section-kicker">
            {game.phase === 'OPENING' ? 'Opening' : 'Your move'}
          </span>
          <strong>
            {!connectionReady
              ? 'Recovering connection…'
              : pending
                ? 'Waiting for the server…'
                : snapshot.status === 'FINISHED'
                  ? resultLabel(snapshot)
                  : yourTurn
                    ? selectionHint(interaction)
                    : 'Opponent is acting.'}
          </strong>
        </div>
        {rejection !== null && <p className="table-rejection">{rejection}</p>}
      </section>

      <section className="hand-zone" aria-label="Your hand">
        <div className="hand-fan">
          {game.hand.map((card) => {
            const canSelect = selectable.has(card.id);
            const selected = selectedCardId === card.id;
            return (
              <PlayingCard
                key={card.id}
                card={card}
                selected={selected}
                selectable={canSelect && yourTurn}
                disabled={disabled || !yourTurn || !canSelect}
                onClick={() => {
                  setConfirmDisband(null);
                  setSelectedCardId(selected ? null : card.id);
                }}
              />
            );
          })}
        </div>

        <div className="hand-controls">
          <div className="player-counts">
            <span>Deck {game.players[viewer].remainingDeckCount}</span>
            <span>Discard {game.players[viewer].discardPile.length}</span>
          </div>
          {interaction?.canDiscard === true && (
            <button
              type="button"
              className="button button--quiet"
              disabled={disabled}
              onClick={discardSelected}
            >
              Discard selected
            </button>
          )}
        </div>
      </section>

      <footer className="match-controls">
        {snapshot.status === 'ACTIVE' && (
          <div className="surrender-control">
            {confirmSurrender ? (
              <>
                <span>End the match and concede?</span>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={disabled}
                  onClick={surrender}
                >
                  Confirm surrender
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => setConfirmSurrender(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button button--quiet"
                disabled={pending}
                onClick={() => setConfirmSurrender(true)}
              >
                Surrender
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
