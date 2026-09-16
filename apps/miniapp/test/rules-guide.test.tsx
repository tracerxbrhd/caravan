import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RulesGuide } from '../src/RulesGuide.js';

describe('RulesGuide', () => {
  it('renders the accepted first-playable rule concepts and visual examples', () => {
    const html = renderToStaticMarkup(<RulesGuide onClose={() => undefined} />);

    expect(html).toContain('CARAVAN rules');
    expect(html).toContain('between <strong>21 and 26</strong>');
    expect(html).toContain('Same suit can reverse direction');
    expect(html).toContain('King · doubles contribution');
    expect(html).toContain('Jack · removes a whole card group');
    expect(html).toContain('Queen · reverses and sets suit');
    expect(html).toContain('Joker · one-time table-wide removal');
    expect(html).toContain('All three lanes must resolve');
    expect(html.match(/<figure/g)?.length).toBeGreaterThanOrEqual(7);
  });

  it('does not present the removed interactive tutorial as onboarding', () => {
    const html = renderToStaticMarkup(<RulesGuide onClose={() => undefined} />);

    expect(html.toLowerCase()).not.toContain('interactive tutorial');
    expect(html).toContain('Quick memory aid');
  });
});
