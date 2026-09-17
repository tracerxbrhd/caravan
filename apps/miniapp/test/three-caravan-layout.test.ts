import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/table.css', import.meta.url), 'utf8');
const table = readFileSync(new URL('../src/CardTable.tsx', import.meta.url), 'utf8');

describe('three-caravan table composition', () => {
  it('keeps all three caravan pairs side by side on compact portrait layouts', () => {
    expect(css).toMatch(/\.route-table\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/);
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.route-table\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/,
    );
    expect(css).not.toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.route-table\s*\{[^}]*grid-template-columns:\s*1fr/,
    );
  });

  it('bounds board growth and lets long public routes scroll inside their own lane', () => {
    expect(css).toMatch(/\.route-table\s*\{[\s\S]*?height:\s*clamp\(/);
    expect(css).toMatch(/\.route-cards\s*\{[\s\S]*?overflow-y:\s*auto/);
    expect(css).toMatch(/\.route-node \+ \.route-node\s*\{[^}]*margin-top:\s*clamp\(-/s);
  });

  it('preserves authoritative tap-target interaction instead of introducing a second placement model', () => {
    expect(table).toContain('isModifierTarget(interaction, seat, routeIndex, node.card.id)');
    expect(table).toContain('valuePlayAction(legalActions, selectedCardId, routeIndex)');
    expect(table).toContain('modifierPlayAction(');
    expect(table).not.toContain('onDragStart');
    expect(table).not.toContain('onDrop');
  });
});
