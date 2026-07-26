import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/sim/levels';
import { buildLevel } from '../src/sim/level';
import { createWorld, medalFor, type World } from '../src/sim/world';
import { difficultyById } from '../src/sim/config';
import { flyLevel } from './autopilot';

/**
 * End-to-end runs driven by the scripted pilot in `autopilot.ts`.
 *
 * Scope, stated honestly:
 *
 * - NAVIGABLE is the set of levels the pilot finishes with all timing hazards
 *   (cannons, turrets, rods) switched off. That isolates geometry and game
 *   logic: routing, gates and keys, one-way sluices, magnets, blowers,
 *   inverted-gravity zones, the gravity well, refuelling, cargo mass, delivery
 *   and the clear condition.
 * - UNASSISTED is the subset it also finishes with every hazard live.
 *
 * The six levels outside NAVIGABLE (7, 10, 12, 13, 14, 17) are a limitation of
 * this pilot, not evidence that they are unwinnable: it plans a static route
 * and follows it with a PD controller, so it loses time in long tunnels and
 * dies at sharp bends in narrow tubes. Their geometry is covered instead by
 * `validateLevel` in levels.test.ts, which proves every crate, key and pad is
 * reachable from the spawn.
 */
const NAVIGABLE = [1, 2, 3, 4, 5, 6, 8, 9, 11, 15, 16, 18, 19, 20];
const UNASSISTED = [1, 2, 3, 4, 6, 9, 11, 15, 16, 20];

function levelWorld(id: number, opts: { hazards: boolean }): World {
  const spec = LEVELS[id - 1];
  // Generous hull count: the point is to prove the level completes, not to
  // grade the pilot's dodging.
  const world = createWorld(buildLevel(spec), { ...difficultyById('rookie'), lives: 400 });
  if (!opts.hazards) {
    world.cannons.length = 0;
    world.rods.length = 0;
  }
  return world;
}

describe('full level loop (timing hazards disabled)', () => {
  it.each(NAVIGABLE)('level %i is completable by the scripted pilot', (id) => {
    const world = levelWorld(id, { hazards: false });
    const result = flyLevel(world, { maxSeconds: 900 });
    expect(result.reason).toBe('cleared');
    expect(world.status).toBe('cleared');
    expect(world.cargo.every((c) => c.state === 'delivered')).toBe(true);
    expect(world.ship.state).toBe('landed');
    expect(world.ship.landedOn?.kind).toBe('base');
    expect(world.score).toBeGreaterThan(0);
    expect(world.clearBreakdown?.total).toBe(world.score);
  });
});

describe('full level loop (every hazard live)', () => {
  it.each(UNASSISTED)('level %i survives its own hazards', (id) => {
    const world = levelWorld(id, { hazards: true });
    const result = flyLevel(world, { maxSeconds: 900 });
    expect(result.reason).toBe('cleared');
    expect(world.cargo.every((c) => c.state === 'delivered')).toBe(true);
  });
});

describe('mechanics exercised end to end', () => {
  it('opens a colour gate only after its key is aboard (level 4)', () => {
    const world = levelWorld(4, { hazards: false });
    expect(world.gates.every((g) => !g.open)).toBe(true);
    flyLevel(world, { maxSeconds: 900 });
    expect(world.keys.every((k) => k.taken)).toBe(true);
    expect(world.gates.every((g) => g.open)).toBe(true);
  });

  it('chains three key/gate pairs in order (level 16)', () => {
    const world = levelWorld(16, { hazards: false });
    flyLevel(world, { maxSeconds: 900 });
    expect(world.keysHeld.size).toBe(3);
    expect(world.status).toBe('cleared');
  });

  it('refuels at pads on a fuel-critical route (level 19)', () => {
    const world = levelWorld(19, { hazards: false });
    const start = world.ship.fuel;
    flyLevel(world, { maxSeconds: 900 });
    // More fuel was burned than the tanks ever held, so pads must have been used.
    expect(world.stats.fuelUsed).toBeGreaterThan(start);
    expect(world.status).toBe('cleared');
  });

  it('awards a medal and a full score breakdown on a clean run (level 1)', () => {
    const world = levelWorld(1, { hazards: false });
    flyLevel(world, { maxSeconds: 900 });
    const b = world.clearBreakdown!;
    expect(b.cargo + b.keys + b.time + b.fuel + b.flawless + b.flowBonus).toBeGreaterThan(0);
    expect(b.flawless).toBeGreaterThan(0); // the pilot did not die
    expect(['gold', 'silver', 'bronze']).toContain(medalFor(world));
  });

  it('the results breakdown itemises the whole score', () => {
    // Freight and key points are banked during the run at whatever flow
    // multiplier was live at the time, so they have to be tracked separately;
    // if they are not, the card silently shows rows that do not add up.
    const world = levelWorld(16, { hazards: false });
    flyLevel(world, { maxSeconds: 900 });
    const b = world.clearBreakdown!;
    expect(b.cargo).toBeGreaterThan(0);
    expect(b.keys).toBeGreaterThan(0);
    expect(b.cargo + b.keys + b.time + b.fuel + b.flawless + b.flowBonus).toBe(b.total);
  });

  it('is deterministic: identical runs produce identical results', () => {
    const a = levelWorld(2, { hazards: true });
    const b = levelWorld(2, { hazards: true });
    const ra = flyLevel(a, { maxSeconds: 900 });
    const rb = flyLevel(b, { maxSeconds: 900 });
    expect(ra).toEqual(rb);
    expect(a.ship.pos).toEqual(b.ship.pos);
    expect(a.score).toBe(b.score);
  });
});
