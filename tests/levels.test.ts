import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/sim/levels';
import { buildLevel, reachableMask, validateLevel } from '../src/sim/level';
import { Tile } from '../src/sim/types';

describe('level campaign', () => {
  it('has 20 levels with unique ids, names and passwords', () => {
    expect(LEVELS).toHaveLength(20);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(20);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(20);
    expect(new Set(LEVELS.map((l) => l.password)).size).toBe(20);
    LEVELS.forEach((l, i) => expect(l.id).toBe(i + 1));
  });

  it.each(LEVELS.map((l) => [l.id, l.name, l] as const))(
    'level %i "%s" bakes into a valid, fully connected cave',
    (_id, _name, spec) => {
      const level = buildLevel(spec);
      expect(validateLevel(level)).toEqual([]);
    },
  );

  it.each(LEVELS.map((l) => [l.id, l.name, l] as const))(
    'level %i "%s" bakes deterministically',
    (_id, _name, spec) => {
      const a = buildLevel(spec);
      const b = buildLevel(spec);
      expect(Array.from(a.grid)).toEqual(Array.from(b.grid));
    },
  );

  it('difficulty ramps: par time never decreases along the campaign spine', () => {
    const pars = LEVELS.map((l) => l.par);
    // Allow local dips (a short level can follow a long one) but the trend must rise.
    expect(pars[19]).toBeGreaterThan(pars[0] * 2.5);
    const firstHalf = pars.slice(0, 10).reduce((a, b) => a + b, 0);
    const secondHalf = pars.slice(10).reduce((a, b) => a + b, 0);
    expect(secondHalf).toBeGreaterThan(firstHalf);
  });

  it('every level has enough open space to fly in', () => {
    for (const spec of LEVELS) {
      const level = buildLevel(spec);
      const open = reachableMask(level).reduce((a, b) => a + b, 0);
      expect(open, `${spec.name} open tiles`).toBeGreaterThan(600);
    }
  });

  it('keeps a solid border on every level', () => {
    for (const spec of LEVELS) {
      const l = buildLevel(spec);
      for (let x = 0; x < l.width; x++) {
        expect(l.grid[x]).not.toBe(Tile.EMPTY);
        expect(l.grid[(l.height - 1) * l.width + x]).not.toBe(Tile.EMPTY);
      }
      for (let y = 0; y < l.height; y++) {
        expect(l.grid[y * l.width]).not.toBe(Tile.EMPTY);
        expect(l.grid[y * l.width + l.width - 1]).not.toBe(Tile.EMPTY);
      }
    }
  });
});
