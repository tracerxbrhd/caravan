import { useEffect, useRef } from 'react';

type Suit = 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES';
type GuideRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | '★';

function suitGlyph(suit: Suit | null): string {
  switch (suit) {
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

function suitClass(suit: Suit | null): string {
  return suit?.toLowerCase() ?? 'joker';
}

function GuideCard({
  rank,
  suit,
  modifier = false,
  removed = false,
  protectedTarget = false,
}: {
  readonly rank: GuideRank;
  readonly suit: Suit | null;
  readonly modifier?: boolean;
  readonly removed?: boolean;
  readonly protectedTarget?: boolean;
}) {
  const glyph = suitGlyph(suit);
  const className = [
    'guide-card',
    `guide-card--${suitClass(suit)}`,
    modifier ? 'guide-card--modifier' : '',
    removed ? 'guide-card--removed' : '',
    protectedTarget ? 'guide-card--protected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={className} aria-label={`${rank} ${suit?.toLowerCase() ?? 'joker'}`}>
      <span className="guide-card__corner">
        <strong>{rank}</strong>
        <span>{glyph}</span>
      </span>
      <span className="guide-card__suit" aria-hidden="true">
        {glyph}
      </span>
    </span>
  );
}

function Arrow({ children }: { readonly children: string }) {
  return (
    <span className="guide-arrow" aria-hidden="true">
      {children}
    </span>
  );
}

function Example({
  title,
  caption,
  children,
}: {
  readonly title: string;
  readonly caption: string;
  readonly children: React.ReactNode;
}) {
  return (
    <figure className="rules-example">
      <div className="rules-example__stage">{children}</div>
      <figcaption>
        <strong>{title}</strong>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

function RuleSection({
  id,
  kicker,
  title,
  children,
}: {
  readonly id: string;
  readonly kicker: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="rules-section" aria-labelledby={`${id}-title`}>
      <p className="section-kicker">{kicker}</p>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  );
}

export function RulesGuide({ onClose }: { onClose(): void }) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="rules-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div className="rules-guide">
        <header className="rules-guide__header">
          <div>
            <p className="eyebrow">How to play</p>
            <h1 id="rules-title">CARAVAN rules</h1>
            <p className="muted">
              Build three routes, contest the opposing lanes, and finish with at least two lane wins.
            </p>
          </div>
          <button ref={closeButton} type="button" className="button button--quiet" onClick={onClose}>
            Close
          </button>
        </header>

        <nav className="rules-jump" aria-label="Rules sections">
          <a href="#rules-goal">Goal</a>
          <a href="#rules-opening">Opening</a>
          <a href="#rules-values">Value cards</a>
          <a href="#rules-modifiers">Face cards</a>
          <a href="#rules-turn">Your turn</a>
          <a href="#rules-finish">Winning</a>
        </nav>

        <div className="rules-guide__content">
          <RuleSection id="rules-goal" kicker="1 · Objective" title="Win the trade lanes">
            <p>
              Each player owns three routes. Route 1 faces Route 1, Route 2 faces Route 2, and Route 3
              faces Route 3. A route is competitive when its value is between <strong>21 and 26</strong>
              inclusive.
            </p>
            <p>
              A lane belongs to the only in-range route, or to the higher route when both are in range.
              A tie stays unresolved. The match ends only when all three lanes have a non-tied owner;
              the player owning at least two lanes wins.
            </p>
            <Example
              title="A route enters range at 21"
              caption="5 + 7 + 9 = 21. The route is now in range, but it can still be changed or attacked."
            >
              <div className="guide-route">
                <GuideCard rank="5" suit="HEARTS" />
                <Arrow>→</Arrow>
                <GuideCard rank="7" suit="HEARTS" />
                <Arrow>→</Arrow>
                <GuideCard rank="9" suit="CLUBS" />
              </div>
              <span className="guide-total guide-total--ready">21 · IN RANGE</span>
            </Example>
          </RuleSection>

          <RuleSection id="rules-opening" kicker="2 · Opening" title="Seed all three routes first">
            <p>
              You start with <strong>8 cards</strong>. During your first three turns you must place one
              value card on each of your three empty routes. Players alternate these opening turns.
            </p>
            <p>
              During opening setup there are no modifiers, discards, route disbands, or replacement
              draws. After both players have seeded all three routes, normal play begins.
            </p>
            <Example
              title="One opening card per route"
              caption="The first three value cards are spread across your three routes instead of stacked onto one route."
            >
              <div className="guide-opening-grid">
                <span>Route 1</span>
                <GuideCard rank="6" suit="SPADES" />
                <span>Route 2</span>
                <GuideCard rank="4" suit="DIAMONDS" />
                <span>Route 3</span>
                <GuideCard rank="8" suit="CLUBS" />
              </div>
            </Example>
          </RuleSection>

          <RuleSection id="rules-values" kicker="3 · Value cards" title="Build direction — or break it with suit">
            <p>
              Ace counts as 1; cards 2 through 10 use their printed value. The second card on a route
              establishes ascending or descending direction. Later value cards normally have to keep
              moving strictly in that direction.
            </p>
            <p>
              There is one important override: a card matching the route's current active suit may be
              played even when it crosses against the current numeric direction. If it does, the route
              takes the direction implied by that new adjacent pair. Equal adjacent ranks are never legal.
            </p>
            <Example
              title="Same suit can reverse direction"
              caption="6♠ → 9♦ establishes ascending. Because 9♦ makes diamonds active, 4♦ may cross downward and the route becomes descending."
            >
              <div className="guide-route guide-route--direction">
                <GuideCard rank="6" suit="SPADES" />
                <Arrow>↑</Arrow>
                <GuideCard rank="9" suit="DIAMONDS" />
                <Arrow>⇢</Arrow>
                <GuideCard rank="4" suit="DIAMONDS" />
              </div>
              <span className="guide-note">Direction: ascending → descending</span>
            </Example>
          </RuleSection>

          <RuleSection id="rules-modifiers" kicker="4 · Face cards" title="Attach modifiers to value cards">
            <p>
              Jacks, Queens, Kings, and Jokers target value cards rather than standing alone. Unless a
              rule says otherwise, they may target either player's public route cards. A value card can
              hold at most three attached modifiers.
            </p>

            <div className="rules-face-grid">
              <article className="rules-face-card">
                <h3>King · doubles contribution</h3>
                <p>
                  Each surviving King doubles only its target card's contribution. Multiple Kings stack
                  exponentially: one King is ×2, two Kings are ×4, three Kings are ×8.
                </p>
                <Example title="King on 8" caption="The 8 now contributes 16 to its route total.">
                  <div className="guide-attachment">
                    <GuideCard rank="8" suit="SPADES" />
                    <GuideCard rank="K" suit="HEARTS" modifier />
                  </div>
                  <span className="guide-total">8 × 2 = 16</span>
                </Example>
              </article>

              <article className="rules-face-card">
                <h3>Jack · removes a whole card group</h3>
                <p>
                  A Jack removes its target value card, every modifier already attached to that card,
                  and the Jack itself. Removed cards return to their original owners' public discard piles.
                </p>
                <Example
                  title="Jack clears the target group"
                  caption="The targeted 7 and its attached King leave the route together; the Jack is discarded too."
                >
                  <GuideCard rank="J" suit="SPADES" modifier />
                  <Arrow>→</Arrow>
                  <div className="guide-attachment">
                    <GuideCard rank="7" suit="HEARTS" removed />
                    <GuideCard rank="K" suit="CLUBS" modifier removed />
                  </div>
                </Example>
              </article>

              <article className="rules-face-card">
                <h3>Queen · reverses and sets suit</h3>
                <p>
                  A Queen can attach only to the terminal value card. It reverses an established route
                  direction and makes the Queen's suit the active suit while that card remains terminal.
                </p>
                <Example
                  title="Queen takes control of the route"
                  caption="Q♣ on terminal 9♦ flips ascending to descending and makes clubs the active suit."
                >
                  <div className="guide-route">
                    <GuideCard rank="6" suit="SPADES" />
                    <Arrow>↑</Arrow>
                    <div className="guide-attachment">
                      <GuideCard rank="9" suit="DIAMONDS" />
                      <GuideCard rank="Q" suit="CLUBS" modifier />
                    </div>
                  </div>
                  <span className="guide-note">Direction ↓ · active suit ♣</span>
                </Example>
              </article>

              <article className="rules-face-card">
                <h3>Joker · one-time table-wide removal</h3>
                <p>
                  The target itself is protected. On an Ace, the Joker removes every other value card
                  with that printed suit. On 2–10, it removes every other value card with that printed
                  rank across all six routes. Attached modifiers leave with removed cards.
                </p>
                <Example
                  title="Joker on a 4"
                  caption="The targeted 4 survives. Every other 4 currently on the table is removed, regardless of suit."
                >
                  <div className="guide-joker-row">
                    <div className="guide-attachment">
                      <GuideCard rank="4" suit="SPADES" protectedTarget />
                      <GuideCard rank="★" suit={null} modifier />
                    </div>
                    <Arrow>⇢</Arrow>
                    <GuideCard rank="4" suit="HEARTS" removed />
                    <GuideCard rank="4" suit="CLUBS" removed />
                  </div>
                </Example>
              </article>
            </div>
          </RuleSection>

          <RuleSection id="rules-turn" kicker="5 · Normal turn" title="Choose exactly one primary action">
            <p>After opening setup, each turn is one of these:</p>
            <ul className="rules-list">
              <li>
                <strong>Play one card.</strong> Playing a hand card resolves its effect, then draws one
                replacement if the deck can supply it.
              </li>
              <li>
                <strong>Discard one hand card.</strong> It becomes public in your discard pile, then you
                draw one replacement if possible.
              </li>
              <li>
                <strong>Disband one of your own non-empty routes.</strong> Every card on that route leaves
                play and returns to its original owner's discard pile. Disbanding does not draw a card.
              </li>
            </ul>
            <p>
              CARAVAN highlights only legal choices on the live table. Selecting a card shows the exact
              routes or value cards the server currently allows it to target.
            </p>
          </RuleSection>

          <RuleSection id="rules-finish" kicker="6 · Route control and victory" title="All three lanes must resolve">
            <p>
              Route status is <strong>light</strong> below 21, <strong>in range</strong> from 21 through 26,
              and <strong>overloaded</strong> above 26. Light and overloaded routes cannot own their lane.
            </p>
            <Example
              title="Higher in-range route owns the lane"
              caption="24 beats 22. But 23 versus 23 would be a tie, so that lane would remain unresolved and the match could not end yet."
            >
              <div className="guide-lane-compare">
                <span className="guide-lane-score guide-lane-score--winner">24</span>
                <span className="guide-versus">VS</span>
                <span className="guide-lane-score">22</span>
              </div>
              <span className="guide-note">Lane owner: 24</span>
            </Example>
            <p>
              Normal victory is checked only after the acting player's whole action and effects resolve.
              If all three lanes have non-tied owners, whoever owns at least two wins the match.
            </p>
            <p>
              The deck is finite and discard piles are not reshuffled. If a play or discard requires a
              replacement draw but your deck is empty, the action resolves first and normal victory is
              checked; if that action did not already win the match for you, you lose by deck exhaustion.
            </p>
          </RuleSection>

          <section className="rules-summary" aria-labelledby="rules-summary-title">
            <p className="section-kicker">Quick memory aid</p>
            <h2 id="rules-summary-title">The six things to remember</h2>
            <ol>
              <li>Build three routes and aim for 21–26.</li>
              <li>The second value card establishes direction.</li>
              <li>Matching active suit can reverse that direction.</li>
              <li>J removes, Q reverses/sets suit, K doubles, Joker clears matches.</li>
              <li>Light/overloaded routes cannot own a lane; ties keep it unresolved.</li>
              <li>The match ends only after all three lanes resolve; win at least two.</li>
            </ol>
          </section>
        </div>

        <footer className="rules-guide__footer">
          <button type="button" className="button button--primary" onClick={onClose}>
            Back to CARAVAN
          </button>
        </footer>
      </div>
    </div>
  );
}
