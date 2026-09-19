import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/table.css', import.meta.url), 'utf8');
const surface = readFileSync(new URL('../src/match-surface.css', import.meta.url), 'utf8');
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

  it('locks the live table to the Telegram viewport instead of scrolling the board', () => {
    expect(surface).toMatch(
      /\.shell--match\s*\{[\s\S]*?height:\s*var\(--app-viewport-stable-height,[\s\S]*?overflow:\s*hidden/,
    );
    expect(surface).toMatch(/\.match-shell\s*\{[\s\S]*?height:\s*100%[\s\S]*?overflow:\s*hidden/);
    expect(css).toMatch(/\.card-table\s*\{[\s\S]*?grid-template-rows:[\s\S]*?minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.route-cards\s*\{[\s\S]*?overflow:\s*hidden/);
    expect(css).not.toMatch(/\.route-cards\s*\{[\s\S]*?overflow-y:\s*auto/);
    expect(css).toContain('.route-strip--dense .route-node + .route-node');
    expect(css).toContain('.route-strip--very-dense .route-node + .route-node');
  });

  it('keeps secondary table controls out of the permanent playfield', () => {
    expect(table).toContain('<details className="table-menu">');
    expect(table).toContain('Open table controls');
    expect(table).toContain('Leave table');
    expect(table).toContain('snapshot.turnDeadlineAtMs === null');
  });

  it('preserves authoritative tap-target interaction instead of introducing a second placement model', () => {
    expect(table).toContain('isModifierTarget(interaction, seat, routeIndex, node.card.id)');
    expect(table).toContain('valuePlayAction(legalActions, selectedCardId, routeIndex)');
    expect(table).toContain('modifierPlayAction(');
    expect(table).not.toContain('onDragStart');
    expect(table).not.toContain('onDrop');
  });
});
