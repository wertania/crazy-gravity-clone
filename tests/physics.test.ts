import { describe, expect, it } from 'vitest';
import { FIXED_DT, SHIP, difficultyById } from '../src/sim/config';
import { buildLevel, type LevelSpec } from '../src/sim/level';
import { createWorld, stepWorld, type World } from '../src/sim/world';
import { NO_INPUT, Tile, type InputFrame } from '../src/sim/types';
import { circleVsGrid, subStepsFor, wallProximity } from '../src/sim/collision';

/** A wide, empty, flat-floored box with a base pad - a physics bench, not a level. */
const BENCH: LevelSpec = {
  id: 999,
  name: 'Bench',
  password: 'BENCH',
  hint: '',
  width: 60,
  height: 40,
  seed: 7,
  par: 60,
  spawn: { x: 30, y: 28 },
  carve: [{ t: 'room', x: 5, y: 5, w: 50, h: 30, rough: 0 }],
  pads: [{ x: 28, y: 6, w: 6, kind: 'base' }],
  objects: [{ t: 'cargo', x: 45, y: 20 }],
};

function bench(diffId: Parameters<typeof difficultyById>[0] = 'ace'): World {
  return createWorld(buildLevel(BENCH), difficultyById(diffId));
}

function run(w: World, seconds: number, input: InputFrame = NO_INPUT) {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) stepWorld(w, input, FIXED_DT);
}

describe('integrator', () => {
  it('free fall tracks the analytic solution within the damping margin', () => {
    const w = bench();
    const y0 = w.ship.pos.y;
    run(w, 0.5);
    const drop = y0 - w.ship.pos.y;
    const ideal = 0.5 * w.gravity * 0.5 * 0.5;
    // Light drag makes the real drop slightly shallower than 1/2 g t^2.
    expect(drop).toBeGreaterThan(ideal * 0.9);
    expect(drop).toBeLessThan(ideal * 1.02);
  });

  it('hovers when thrust cancels gravity', () => {
    const w = bench();
    // Pulse thrust with the duty cycle that balances gravity, nose straight up.
    const duty = w.gravity / SHIP.thrust;
    const steps = Math.round(6 / FIXED_DT);
    let acc = 0;
    for (let i = 0; i < steps; i++) {
      acc += duty;
      const on = acc >= 1;
      if (on) acc -= 1;
      stepWorld(w, { turn: 0, thrust: on, levelOut: false }, FIXED_DT);
    }
    expect(Math.abs(w.ship.pos.y - 28)).toBeLessThan(1.5);
    expect(w.ship.state).toBe('flying');
  });

  it('never exceeds the speed cap', () => {
    const w = bench();
    for (let i = 0; i < 4000; i++) {
      stepWorld(w, NO_INPUT, FIXED_DT);
      expect(Math.hypot(w.ship.vel.x, w.ship.vel.y)).toBeLessThanOrEqual(SHIP.maxSpeed + 1e-6);
      if (w.status !== 'playing') break;
    }
  });

  it('is frame-rate independent at the fixed step', () => {
    const a = bench();
    const b = bench();
    const input: InputFrame = { turn: 1, thrust: true, levelOut: false };
    for (let i = 0; i < 200; i++) stepWorld(a, input, FIXED_DT);
    for (let i = 0; i < 200; i++) stepWorld(b, input, FIXED_DT);
    expect(a.ship.pos.x).toBeCloseTo(b.ship.pos.x, 10);
    expect(a.ship.pos.y).toBeCloseTo(b.ship.pos.y, 10);
    expect(a.ship.angle).toBeCloseTo(b.ship.angle, 10);
  });

  it('burns fuel only while thrusting and stops thrusting when dry', () => {
    const w = bench();
    w.ship.fuel = 1;
    run(w, 0.5, { turn: 0, thrust: true, levelOut: false });
    expect(w.ship.fuel).toBe(0);
    const before = { ...w.ship.vel };
    stepWorld(w, { turn: 0, thrust: true, levelOut: false }, FIXED_DT);
    // With no fuel the only acceleration left is gravity: strictly downward.
    expect(w.ship.vel.y).toBeLessThan(before.y);
    expect(w.ship.thrusting).toBe(false);
  });

  it('auto-level assist returns the nose to vertical', () => {
    const w = bench();
    w.ship.angle = 1.2;
    run(w, 2.0, { turn: 0, thrust: false, levelOut: true });
    expect(Math.abs(w.ship.angle)).toBeLessThan(0.12);
  });
});

describe('collision', () => {
  it('detects overlap with a solid tile and reports an outward normal', () => {
    const level = buildLevel(BENCH);
    // Floor of the bench room sits at y = 5, so a hull centred just above it overlaps.
    const c = circleVsGrid(level, 20, 5.2, SHIP.radius);
    expect(c).not.toBeNull();
    expect(c!.ny).toBeGreaterThan(0.5);
    expect(c!.depth).toBeGreaterThan(0);
  });

  it('reports no overlap in open space', () => {
    const level = buildLevel(BENCH);
    expect(circleVsGrid(level, 30, 20, SHIP.radius)).toBeNull();
  });

  it('sub-steps enough to prevent tunneling at top speed', () => {
    const n = subStepsFor(SHIP.maxSpeed, FIXED_DT, SHIP.radius);
    expect(SHIP.maxSpeed * (FIXED_DT / n)).toBeLessThan(2 * SHIP.radius);
  });

  it('never tunnels a full-speed hull through a one-tile wall', () => {
    // Purpose-built: a thin wall the ship is fired straight at.
    const spec: LevelSpec = {
      ...BENCH,
      id: 998,
      name: 'Wall',
      password: 'WALL',
      spawn: { x: 10, y: 20 },
      carve: [
        { t: 'room', x: 5, y: 15, w: 20, h: 10, rough: 0 },
        { t: 'room', x: 26, y: 15, w: 20, h: 10, rough: 0 },
        { t: 'tube', pts: [[10, 20], [40, 20]], r: 0, rough: 0 },
      ],
    };
    const level = buildLevel(spec);
    // Re-seal the connecting corridor to leave exactly one solid column at x=25.
    for (let y = 0; y < level.height; y++) level.grid[y * level.width + 25] = Tile.ROCK;
    const w = createWorld(level, difficultyById('ace'));
    w.ship.pos = { x: 20, y: 20 };
    w.ship.vel = { x: SHIP.maxSpeed, y: 0 };
    for (let i = 0; i < 60 && w.status === 'playing'; i++) {
      w.ship.vel.x = SHIP.maxSpeed; // hold the ship at the cap
      w.ship.vel.y = 0;
      stepWorld(w, NO_INPUT, FIXED_DT);
    }
    expect(w.stats.deaths).toBe(1);
    expect(w.ship.pos.x).toBeLessThan(25.5);
  });

  it('measures wall proximity for the flow meter', () => {
    const level = buildLevel(BENCH);
    expect(wallProximity(level, 30, 20, SHIP.radius, 3)).toBe(3);
    expect(wallProximity(level, 30, 6.0, SHIP.radius, 3)).toBeLessThan(1);
  });
});

describe('landing and crashing', () => {
  it('lands when slow and upright', () => {
    const w = bench();
    // The pad surface is the top of tile row 6, i.e. y = 7.
    w.ship.pos = { x: 31, y: 7.5 };
    w.ship.vel = { x: 0, y: -0.5 };
    w.ship.angle = 0;
    run(w, 1.5);
    expect(w.ship.state).toBe('landed');
    expect(w.stats.deaths).toBe(0);
  });

  it('crashes into the same pad when coming in hot', () => {
    const w = bench();
    w.ship.pos = { x: 31, y: 14 };
    w.ship.vel = { x: 0, y: -SHIP.safeLandSpeed * 4 };
    run(w, 1.5);
    expect(w.stats.deaths).toBe(1);
  });

  it('crashes when landing badly tilted', () => {
    const w = bench();
    w.ship.pos = { x: 31, y: 7.5 };
    w.ship.vel = { x: 0, y: -0.5 };
    w.ship.angle = Math.PI / 2;
    run(w, 2.0);
    expect(w.stats.deaths).toBe(1);
  });

  it('rookie tolerance permits a landing that kills an ace', () => {
    // Impact lands between the ace limit (3.2) and the rookie limit (4.8).
    const setup = (w: World) => {
      w.ship.pos = { x: 31, y: 7.45 };
      w.ship.vel = { x: 0, y: -3.8 };
    };
    const rookie = bench('rookie');
    setup(rookie);
    run(rookie, 1.5);
    const ace = bench('ace');
    setup(ace);
    run(ace, 1.5);
    expect(rookie.ship.state).toBe('landed');
    expect(ace.stats.deaths).toBe(1);
  });

  it('respawns after a crash and returns carried freight to its origin', () => {
    const w = bench();
    w.ship.pos = { x: 45, y: 20 };
    run(w, 0.2); // touch the cargo
    expect(w.ship.carrying).toHaveLength(1);
    w.ship.pos = { x: 30, y: 6.0 };
    w.ship.vel = { x: 0, y: -20 };
    run(w, 2.0);
    expect(w.stats.deaths).toBe(1);
    expect(w.status).toBe('playing');
    expect(w.cargo[0].state).toBe('waiting');
    expect(w.cargo[0].pos).toEqual(w.cargo[0].home);
    expect(w.ship.fuel).toBe(w.fuelMax);
  });

  it('ends the run when the last hull is lost', () => {
    const w = createWorld(buildLevel(BENCH), difficultyById('legend'));
    w.ship.pos = { x: 30, y: 8 };
    w.ship.vel = { x: 0, y: -20 };
    run(w, 3.0);
    expect(w.status).toBe('gameover');
  });
});

describe('flow', () => {
  it('builds while grazing at speed and decays in open space', () => {
    const w = bench();
    // Skim left along the floor, away from the raised base pad at x = 28..33.
    w.ship.pos = { x: 24, y: 5.6 };
    for (let i = 0; i < 120; i++) {
      w.ship.vel = { x: -12, y: 0 };
      w.ship.pos.y = 5.6;
      stepWorld(w, NO_INPUT, FIXED_DT);
      if (w.status !== 'playing') break;
    }
    expect(w.flow).toBeGreaterThan(10);
    expect(w.multiplier).toBeGreaterThan(1);
    const peak = w.flow;
    w.ship.pos = { x: 30, y: 20 };
    w.ship.vel = { x: 0, y: 0 };
    run(w, 1.0);
    expect(w.flow).toBeLessThan(peak);
  });

  it('earns nothing for loitering next to a wall', () => {
    const w = bench();
    for (let i = 0; i < 240; i++) {
      w.ship.pos = { x: 20, y: 5.6 };
      w.ship.vel = { x: 0.2, y: 0 };
      stepWorld(w, NO_INPUT, FIXED_DT);
    }
    expect(w.flow).toBe(0);
  });
});
