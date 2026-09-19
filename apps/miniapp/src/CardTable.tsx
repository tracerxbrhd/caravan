import type { MatchSnapshot, WireGameAction, WirePlayerView } from '@caravan/protocol';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  playConfirmedFeedback,
  playSelectionFeedback,
  unlockPresentationAudio,
} from './feedback.js';
import { classifyHandGesture, cyclicHandOffset, stepHandIndex } from './hand-model.js';
import { platform } from './platform.js';
import {
  cardTransitionName,
  deriveTableFeedbackCue,
  loadPresentationPreferences,
  savePresentationPreferences,
  type PresentationPreferences,
} from './presentation.js';
import {
  cardInteraction,
  discardAction,
  disbandAction,
  handDropAction,
  isModifierTarget,
  modifierPlayAction,
  selectableCardIds,
  valuePlayAction,
  type CardInteraction,
  type HandDropTarget,
  type RouteIndex,
} from './table-model.js';

type Seat = WirePlayerView['viewer'];
type PublicCard = WirePlayerView['hand'][number];
type RouteView = WirePlayerView['players']['A']['routes'][number];
type RouteCardView = RouteView['cards'][number];
type CardPresentationStyle = CSSProperties & {
  viewTransitionName?: string;
};

type HandCarouselStyle = CSSProperties & {
  '--hand-x'?: string;
  '--hand-y'?: string;
  '--hand-rotate'?: string;
  '--hand-scale'?: string;
  '--hand-opacity'?: string;
};

type HandPointerMode = 'PENDING' | 'SWIPE' | 'DRAG';

interface HandPointerSession {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly cardId: string | null;
  readonly startedOnActive: boolean;
  mode: HandPointerMode;
}

interface HandDragVisual {
  readonly cardId: string | null;
  readonly x: number;
  readonly y: number;
  readonly dragging: boolean;
}

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

function transitionStyle(cardId: string): CardPresentationStyle {
  return { viewTransitionName: cardTransitionName(cardId) };
}

function handCarouselStyle(
  offset: number,
  drag: HandDragVisual,
  cardId: string,
  swipeX: number,
): HandCarouselStyle {
  const visible = Math.abs(offset) <= 2;
  const active = offset === 0;
  const dragging = drag.dragging && drag.cardId === cardId;
  const x = dragging ? drag.x : offset * 76 + swipeX;
  const y = dragging ? drag.y : active ? -8 : Math.min(8, Math.abs(offset) * 4);
  return {
    '--hand-x': `${x}px`,
    '--hand-y': `${y}px`,
    '--hand-rotate': `${dragging ? 0 : offset * 4}deg`,
    '--hand-scale': dragging ? '1.08' : active ? '1' : '0.86',
    '--hand-opacity': visible ? (active ? '1' : '0.76') : '0',
  };
}

function routeIndexFromData(value: string | undefined): RouteIndex | null {
  if (value === '0') return 0;
  if (value === '1') return 1;
  if (value === '2') return 2;
  return null;
}

function dropTargetFromPoint(clientX: number, clientY: number): HandDropTarget | null {
  if (typeof document === 'undefined') return null;
  const element = document.elementFromPoint(clientX, clientY);
  if (!(element instanceof HTMLElement)) return null;
  const target = element.closest<HTMLElement>('[data-hand-drop-kind]');
  if (target === null) return null;

  const route = routeIndexFromData(target.dataset.routeIndex);
  if (route === null) return null;
  if (target.dataset.handDropKind === 'route') return { kind: 'ROUTE', route };
  if (target.dataset.handDropKind !== 'card') return null;

  const targetPlayer = target.dataset.targetPlayer;
  const targetCardId = target.dataset.targetCardId;
  if ((targetPlayer !== 'A' && targetPlayer !== 'B') || targetCardId === undefined) return null;
  return { kind: 'CARD', targetPlayer, route, targetCardId };
}

function handDockCardStyle(index: number, count: number): CSSProperties {
  const midpoint = (count - 1) / 2;
  const offset = index - midpoint;
  return {
    zIndex: index + 1,
    transform: `translateX(${offset * 10}px) translateY(${Math.abs(offset) * 1.2}px) rotate(${offset * 2.4}deg)`,
  };
}

function routeValueStyle(seat: Seat, routeIndex: RouteIndex): CSSProperties {
  return { viewTransitionName: `caravan-route-value-${seat}-${routeIndex}` };
}

function PlayingCard({
  card,
  selected = false,
  selectable = false,
  target = false,
  disabled = false,
  style,
  onClick,
}: {
  readonly card: PublicCard;
  readonly selected?: boolean;
  readonly selectable?: boolean;
  readonly target?: boolean;
  readonly disabled?: boolean;
  readonly style?: CardPresentationStyle;
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
  const presentationStyle = { ...transitionStyle(card.id), ...style };
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
      <div
        className={className}
        style={presentationStyle}
        aria-label={`${rankLabel(card)} ${suitName(card)}`}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={presentationStyle}
      aria-label={`${rankLabel(card)} ${suitName(card)}${target ? ', legal target' : ''}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

function DiscardPile({
  cards,
  label,
}: {
  readonly cards: readonly PublicCard[];
  readonly label: string;
}) {
  const visibleCards = cards.slice(-3);
  return (
    <div className="discard-pile" aria-label={`${label} discard pile, ${cards.length} cards`}>
      <div className="discard-pile__cards" aria-hidden="true">
        {visibleCards.length === 0 ? (
          <span className="discard-pile__empty">Discard</span>
        ) : (
          visibleCards.map((card) => <PlayingCard key={card.id} card={card} />)
        )}
      </div>
      <strong className="discard-pile__count">{cards.length}</strong>
    </div>
  );
}

function RouteCardNode({
  node,
  seat,
  routeIndex,
  target,
  disabled,
  onTarget,
}: {
  readonly node: RouteCardView;
  readonly seat: Seat;
  readonly routeIndex: RouteIndex;
  readonly target: boolean;
  readonly disabled: boolean;
  onTarget(): void;
}) {
  return (
    <div
      className="route-node"
      data-hand-drop-kind={target ? 'card' : undefined}
      data-target-player={target ? seat : undefined}
      data-route-index={target ? routeIndex : undefined}
      data-target-card-id={target ? node.card.id : undefined}
    >
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
              style={transitionStyle(modifier.id)}
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
  const densityClass =
    route.cards.length >= 7
      ? 'route-strip--very-dense'
      : route.cards.length >= 5
        ? 'route-strip--dense'
        : '';

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
    <section
      className={`route-strip ${ownRoute ? 'route-strip--own' : 'route-strip--rival'} ${densityClass}`}
    >
      <header className="route-strip__header">
        <span>{label}</span>
        <div className="route-metrics">
          <strong style={routeValueStyle(seat, routeIndex)}>{route.value}</strong>
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
              seat={seat}
              routeIndex={routeIndex}
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
          data-hand-drop-kind="route"
          data-route-index={routeIndex}
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
  const [activeHandCardId, setActiveHandCardId] = useState<string | null>(game.hand[0]?.id ?? null);
  const [handExpanded, setHandExpanded] = useState(false);
  const [handSwipeX, setHandSwipeX] = useState(0);
  const [handDrag, setHandDrag] = useState<HandDragVisual>({
    cardId: null,
    x: 0,
    y: 0,
    dragging: false,
  });
  const [confirmDisband, setConfirmDisband] = useState<RouteIndex | null>(null);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const [preferences, setPreferences] = useState<PresentationPreferences>(
    loadPresentationPreferences,
  );
  const preferencesRef = useRef(preferences);
  const previousSnapshot = useRef<MatchSnapshot | null>(null);
  const handPointer = useRef<HandPointerSession | null>(null);
  preferencesRef.current = preferences;

  const interaction = useMemo(
    () => (selectedCardId === null ? null : cardInteraction(legalActions, selectedCardId)),
    [legalActions, selectedCardId],
  );
  const activeHandIndex = Math.max(
    0,
    game.hand.findIndex((card) => card.id === activeHandCardId),
  );
  const activeHandCard = game.hand[activeHandIndex] ?? null;
  const selectedHandCard = game.hand.find((card) => card.id === selectedCardId) ?? null;

  useEffect(() => {
    setSelectedCardId((current) => (current !== null && !selectable.has(current) ? null : current));
    setActiveHandCardId((current) => {
      if (game.hand.length === 0) return null;
      return current !== null && game.hand.some((card) => card.id === current)
        ? current
        : (game.hand[0]?.id ?? null);
    });
    if (game.hand.length === 0) setHandExpanded(false);
    setHandSwipeX(0);
    setHandDrag({ cardId: null, x: 0, y: 0, dragging: false });
    handPointer.current = null;
    setConfirmDisband(null);
  }, [game.actionSequence, game.hand, selectable]);

  useEffect(() => {
    const cue = deriveTableFeedbackCue(previousSnapshot.current, snapshot);
    previousSnapshot.current = snapshot;
    if (cue !== null) playConfirmedFeedback(cue, preferencesRef.current);
  }, [snapshot]);

  const waitingForOpponent = snapshot.status === 'ACTIVE' && snapshot.turnDeadlineAtMs === null;
  const matchReady = snapshot.status === 'ACTIVE' && snapshot.turnDeadlineAtMs !== null;
  const disabled = !connectionReady || pending || !matchReady;
  const yourTurn = matchReady && game.activePlayer === viewer;
  const hapticsAvailable = platform.hapticsAvailable();
  const activeHandPlayable =
    activeHandCard !== null && selectable.has(activeHandCard.id) && yourTurn && !disabled;

  const updatePreferences = (next: PresentationPreferences): void => {
    preferencesRef.current = next;
    setPreferences(next);
    savePresentationPreferences(next);
  };

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

  const moveActiveHand = (step: -1 | 1): void => {
    if (game.hand.length === 0) return;
    const nextIndex = stepHandIndex(activeHandIndex, step, game.hand.length);
    const nextCard = game.hand[nextIndex];
    if (nextCard === undefined) return;
    setActiveHandCardId(nextCard.id);
    setSelectedCardId(null);
    setConfirmDisband(null);
  };

  const selectActiveHandCard = (): void => {
    if (!activeHandPlayable || activeHandCard === null) return;
    const alreadySelected = selectedCardId === activeHandCard.id;
    if (!alreadySelected) playSelectionFeedback(preferencesRef.current);
    setSelectedCardId(alreadySelected ? null : activeHandCard.id);
    setConfirmDisband(null);
    if (!alreadySelected) setHandExpanded(false);
  };

  const openHand = (): void => {
    if (game.hand.length === 0 || snapshot.status === 'FINISHED') return;
    if (selectedCardId !== null && game.hand.some((card) => card.id === selectedCardId)) {
      setActiveHandCardId(selectedCardId);
    }
    setHandExpanded(true);
    setHandSwipeX(0);
  };

  const closeHand = (): void => {
    handPointer.current = null;
    setHandSwipeX(0);
    setHandDrag({ cardId: null, x: 0, y: 0, dragging: false });
    setHandExpanded(false);
  };

  const handleHandPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!handExpanded || game.hand.length === 0) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-hand-card-id]')
        : null;
    const cardId = target?.dataset.handCardId ?? activeHandCard?.id ?? null;
    handPointer.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cardId,
      startedOnActive: cardId !== null && cardId === activeHandCard?.id,
      mode: 'PENDING',
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setHandSwipeX(0);
    setHandDrag({ cardId: null, x: 0, y: 0, dragging: false });
  };

  const handleHandPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const session = handPointer.current;
    if (session === null || session.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    const canDrag =
      session.startedOnActive &&
      session.cardId !== null &&
      selectable.has(session.cardId) &&
      yourTurn &&
      !disabled;
    const gesture = classifyHandGesture(deltaX, deltaY, canDrag);

    if (session.mode === 'PENDING' && gesture.kind === 'DRAG') {
      session.mode = 'DRAG';
      if (session.cardId !== null && selectedCardId !== session.cardId) {
        playSelectionFeedback(preferencesRef.current);
        setSelectedCardId(session.cardId);
        setConfirmDisband(null);
      }
    } else if (session.mode === 'PENDING' && gesture.kind === 'SWIPE') {
      session.mode = 'SWIPE';
      setSelectedCardId(null);
    }

    if (session.mode === 'DRAG') {
      setHandSwipeX(0);
      setHandDrag({
        cardId: session.cardId,
        x: deltaX,
        y: deltaY,
        dragging: true,
      });
      event.preventDefault();
      return;
    }

    if (
      session.mode === 'SWIPE' ||
      (session.mode === 'PENDING' && Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY))
    ) {
      setHandSwipeX(Math.max(-64, Math.min(64, deltaX)));
      event.preventDefault();
    }
  };

  const handleHandPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const session = handPointer.current;
    if (session === null || session.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    const canDrag =
      session.startedOnActive &&
      session.cardId !== null &&
      selectable.has(session.cardId) &&
      yourTurn &&
      !disabled;
    const gesture =
      session.mode === 'DRAG'
        ? ({ kind: 'DRAG' } as const)
        : classifyHandGesture(deltaX, deltaY, canDrag);

    if (gesture.kind === 'DRAG' && session.cardId !== null) {
      const draggedElement = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>('[data-hand-card-id]'),
      ).find((element) => element.dataset.handCardId === session.cardId);
      const previousPointerEvents = draggedElement?.style.pointerEvents ?? '';
      if (draggedElement !== undefined) draggedElement.style.pointerEvents = 'none';
      const dropTarget = dropTargetFromPoint(event.clientX, event.clientY);
      if (draggedElement !== undefined) draggedElement.style.pointerEvents = previousPointerEvents;

      const action =
        dropTarget === null ? null : handDropAction(legalActions, session.cardId, dropTarget);
      if (action !== null && submit(action)) {
        setHandExpanded(false);
      } else {
        setSelectedCardId(session.cardId);
        setHandExpanded(false);
      }
    } else if (gesture.kind === 'SWIPE') {
      moveActiveHand(gesture.step);
    } else if (gesture.kind === 'TAP' && session.cardId !== null) {
      if (session.cardId !== activeHandCard?.id) {
        setActiveHandCardId(session.cardId);
        setSelectedCardId(null);
        setConfirmDisband(null);
      } else {
        selectActiveHandCard();
      }
    }

    handPointer.current = null;
    setHandSwipeX(0);
    setHandDrag({ cardId: null, x: 0, y: 0, dragging: false });
  };

  const handleHandPointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (handPointer.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    handPointer.current = null;
    setHandSwipeX(0);
    setHandDrag({ cardId: null, x: 0, y: 0, dragging: false });
  };

  const opponentStatus = !snapshot.connected[opponent]
    ? 'Not connected'
    : game.activePlayer === opponent
      ? 'Thinking'
      : 'Waiting';

  return (
    <div
      className="card-table"
      data-motion={preferences.motion.toLowerCase()}
      data-hand-expanded={handExpanded ? 'true' : 'false'}
    >
      <section className="table-opponent" aria-label="Opponent area">
        <div className="player-ribbon">
          <div>
            <span className="section-kicker">Opponent</span>
            <strong>{opponentStatus}</strong>
          </div>
          <div className="player-counts">
            <span>Deck {game.players[opponent].remainingDeckCount}</span>
            <span>Discard {game.players[opponent].discardPile.length}</span>
          </div>
        </div>
        <div className="opponent-piles">
          <DiscardPile cards={game.players[opponent].discardPile} label="Opponent" />
          <div
            className="opponent-hand"
            aria-label={`${game.players[opponent].handSize} hidden cards`}
          >
            {Array.from({ length: Math.min(game.players[opponent].handSize, 8) }, (_, index) => (
              <span className="card-back" key={index} />
            ))}
            <strong>{game.players[opponent].handSize}</strong>
          </div>
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
            {snapshot.status === 'FINISHED'
              ? 'Result'
              : waitingForOpponent
                ? 'Waiting'
                : game.phase === 'OPENING'
                  ? 'Opening'
                  : 'Your move'}
          </span>
          <strong>
            {!connectionReady
              ? 'Recovering connection…'
              : pending
                ? 'Waiting for the server…'
                : snapshot.status === 'FINISHED'
                  ? resultLabel(snapshot)
                  : waitingForOpponent
                    ? 'Opponent has not connected yet.'
                    : yourTurn
                      ? selectionHint(interaction)
                      : 'Opponent is acting.'}
          </strong>
        </div>

        {waitingForOpponent ? (
          <div className="waiting-match-actions">
            {confirmSurrender ? (
              <>
                <span>Leave this waiting match?</span>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={!connectionReady || pending}
                  onClick={surrender}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => setConfirmSurrender(false)}
                >
                  Stay
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button button--quiet"
                disabled={!connectionReady || pending}
                onClick={() => setConfirmSurrender(true)}
              >
                Leave table
              </button>
            )}
          </div>
        ) : (
          rejection !== null && <p className="table-rejection">{rejection}</p>
        )}
      </section>

      <section
        className={`hand-zone ${handExpanded ? 'hand-zone--expanded' : ''}`}
        aria-label="Your hand"
      >
        {handExpanded ? (
          <div className="hand-drawer">
            <header className="hand-drawer__header">
              <div>
                <span className="section-kicker">Your hand</span>
                <strong>
                  {activeHandCard === null
                    ? 'No cards'
                    : `${activeHandIndex + 1} of ${game.hand.length} · ${rankLabel(activeHandCard)}${suitGlyph(activeHandCard)}`}
                </strong>
              </div>
              <button type="button" className="button button--quiet" onClick={closeHand}>
                Close
              </button>
            </header>

            <div className="hand-carousel">
              <button
                type="button"
                className="hand-carousel__step hand-carousel__step--previous"
                aria-label="Previous card"
                disabled={game.hand.length <= 1}
                onClick={() => moveActiveHand(-1)}
              >
                ‹
              </button>

              <div
                className="hand-carousel__stage"
                aria-label="Swipe left or right to browse your hand"
                onPointerDown={handleHandPointerDown}
                onPointerMove={handleHandPointerMove}
                onPointerUp={handleHandPointerUp}
                onPointerCancel={handleHandPointerCancel}
              >
                {game.hand.map((card, index) => {
                  const offset = cyclicHandOffset(index, activeHandIndex, game.hand.length);
                  const active = offset === 0;
                  const canSelect = selectable.has(card.id);
                  const dragging = handDrag.dragging && handDrag.cardId === card.id;
                  return (
                    <div
                      className={[
                        'hand-carousel-card',
                        active ? 'hand-carousel-card--active' : '',
                        dragging ? 'hand-carousel-card--dragging' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      key={card.id}
                      data-hand-card-id={card.id}
                      aria-hidden={Math.abs(offset) > 2}
                      style={handCarouselStyle(offset, handDrag, card.id, handSwipeX)}
                    >
                      <PlayingCard
                        card={card}
                        selected={selectedCardId === card.id}
                        selectable={canSelect && yourTurn}
                      />
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                className="hand-carousel__step hand-carousel__step--next"
                aria-label="Next card"
                disabled={game.hand.length <= 1}
                onClick={() => moveActiveHand(1)}
              >
                ›
              </button>
            </div>

            <footer className="hand-drawer__footer">
              <div className="hand-status">
                <DiscardPile cards={game.players[viewer].discardPile} label="Your" />
                <div className="player-counts">
                  <span>Deck {game.players[viewer].remainingDeckCount}</span>
                  <span>Discard {game.players[viewer].discardPile.length}</span>
                </div>
              </div>
              <div className="hand-drawer__actions">
                <button
                  type="button"
                  className="button button--primary"
                  disabled={!activeHandPlayable}
                  onClick={selectActiveHandCard}
                >
                  {activeHandCard !== null && selectedCardId === activeHandCard.id
                    ? 'Deselect card'
                    : 'Select card'}
                </button>
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
            </footer>
            <p className="hand-drawer__hint">
              Swipe to browse. Tap a playable card to select it, or drag it to a highlighted target.
            </p>
          </div>
        ) : (
          <div className="hand-dock">
            <div className="hand-status">
              <DiscardPile cards={game.players[viewer].discardPile} label="Your" />
              <div className="player-counts">
                <span>Deck {game.players[viewer].remainingDeckCount}</span>
                <span>Discard {game.players[viewer].discardPile.length}</span>
              </div>
            </div>

            <button
              type="button"
              className="hand-dock__open"
              disabled={game.hand.length === 0 || snapshot.status === 'FINISHED'}
              onClick={openHand}
              aria-label={`Open your hand, ${game.hand.length} cards`}
            >
              <span className="hand-dock__mini-cards" aria-hidden="true">
                {game.hand.map((card, index) => (
                  <span
                    className={[
                      'hand-mini-card',
                      selectedCardId === card.id ? 'hand-mini-card--selected' : '',
                      selectable.has(card.id) && yourTurn ? 'hand-mini-card--playable' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={card.id}
                    style={handDockCardStyle(index, game.hand.length)}
                  >
                    <strong>{rankLabel(card)}</strong>
                    <span>{suitGlyph(card)}</span>
                  </span>
                ))}
              </span>
              <span className="hand-dock__copy">
                <span className="section-kicker">Your hand</span>
                <strong>
                  {selectedHandCard === null
                    ? `${game.hand.length} cards · tap to open`
                    : `${rankLabel(selectedHandCard)}${suitGlyph(selectedHandCard)} selected · tap to change`}
                </strong>
              </span>
            </button>

            {interaction?.canDiscard === true && (
              <button
                type="button"
                className="button button--quiet hand-dock__discard"
                disabled={disabled}
                onClick={discardSelected}
              >
                Discard
              </button>
            )}
          </div>
        )}
      </section>

      <details className="table-menu">
        <summary aria-label="Open table controls">⋯</summary>
        <div className="table-menu__panel">
          <div className="table-feel-controls" aria-label="Table feel settings">
            <button
              type="button"
              className="table-feel-toggle"
              aria-pressed={preferences.sound}
              onClick={() => {
                const sound = !preferences.sound;
                if (sound) unlockPresentationAudio();
                updatePreferences({ ...preferences, sound });
              }}
            >
              Sound {preferences.sound ? 'on' : 'off'}
            </button>
            <button
              type="button"
              className="table-feel-toggle"
              aria-pressed={preferences.haptics}
              disabled={!hapticsAvailable}
              onClick={() => updatePreferences({ ...preferences, haptics: !preferences.haptics })}
            >
              Haptics {hapticsAvailable ? (preferences.haptics ? 'on' : 'off') : 'unavailable'}
            </button>
            <button
              type="button"
              className="table-feel-toggle"
              aria-pressed={preferences.motion === 'REDUCED'}
              onClick={() =>
                updatePreferences({
                  ...preferences,
                  motion: preferences.motion === 'REDUCED' ? 'SYSTEM' : 'REDUCED',
                })
              }
            >
              Motion {preferences.motion === 'REDUCED' ? 'reduced' : 'system'}
            </button>
          </div>

          {snapshot.status === 'ACTIVE' && !waitingForOpponent && (
            <div className="surrender-control">
              {confirmSurrender ? (
                <>
                  <span>End the match and concede?</span>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={!connectionReady || pending}
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
                  disabled={!connectionReady || pending}
                  onClick={() => setConfirmSurrender(true)}
                >
                  Surrender
                </button>
              )}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
