/**
 * A scripted pilot used by the integration tests.
 *
 * It is deliberately *naive*: it plans a route with Dijkstra over the tile grid
 * and follows it with a thrust-vector controller. It has no idea that cannons
 * or rods exist. That is the point - if this pilot can finish a level given
 * enough hulls, the level's geometry, key/gate ordering, pickup radii, refuel
 * pads and delivery logic all genuinely work end to end.
 */

import { FIXED_DT, SHIP } from '../src/sim/config';
import { tileAt, type Level } from '../src/sim/level';
import { Tile, type InputFrame } from '../src/sim/types';
import { environmentAccel, stepWorld, type World } from '../src/sim/world';

interface Field {
  dist: Float32Array;
  /** Distance to the nearest wall, shared with the steering code. */
  clear: Float32Array;
  w: number;
  h: number;
}

const INF = Infinity;

const R2 = Math.SQRT2;
const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, R2],
  [1, -1, R2],
  [-1, 1, R2],
  [-1, -1, R2],
];

/** Bilinear sample of a scalar field at world coordinates. */
function sampleField(f: Float32Array, w: number, h: number, x: number, y: number): number {
  const fx = Math.max(0, Math.min(w - 1.001, x - 0.5));
  const fy = Math.max(0, Math.min(h - 1.001, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (px: number, py: number) => {
    const v = f[Math.min(h - 1, py) * w + Math.min(w - 1, px)];
    return Number.isFinite(v) ? v : 0;
  };
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/**
 * Distance from every open tile to the nearest solid tile, in tiles.
 *
 * Two-pass chamfer transform with 1 / sqrt(2) costs. A plain 4-neighbour BFS
 * gives Manhattan distance, whose gradient jumps between cells and makes the
 * steering chatter; the chamfer version is smooth enough to differentiate.
 */
function clearanceField(level: Level, blocked: Uint8Array): Float32Array {
  const { width: w, height: h } = level;
  const d = new Float32Array(w * h);
  const BIG = 1e6;
  for (let i = 0; i < w * h; i++) d[i] = blocked[i] ? 0 : BIG;

  const relax = (i: number, ji: number, cost: number) => {
    const v = d[ji] + cost;
    if (v < d[i]) d[i] = v;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) relax(i, i - w, 1);
      if (x > 0 && y > 0) relax(i, i - w - 1, R2);
      if (x < w - 1 && y > 0) relax(i, i - w + 1, R2);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      if (x < w - 1) relax(i, i + 1, 1);
      if (y < h - 1) relax(i, i + w, 1);
      if (x < w - 1 && y < h - 1) relax(i, i + w + 1, R2);
      if (x > 0 && y < h - 1) relax(i, i + w - 1, R2);
    }
  }
  return d;
}

/** Cells the pilot refuses to route through: rock plus any closed gate. */
function blockedMask(w: World): Uint8Array {
  const level = w.level;
  const mask = new Uint8Array(level.width * level.height);
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (tileAt(level, x, y) !== Tile.EMPTY) mask[y * level.width + x] = 1;
    }
  }
  for (const g of w.gates) {
    if (g.open) continue;
    for (let y = Math.floor(g.box.y) - 1; y < g.box.y + g.box.h + 1; y++) {
      for (let x = Math.floor(g.box.x) - 1; x < g.box.x + g.box.w + 1; x++) {
        if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
        mask[y * level.width + x] = 1;
      }
    }
  }
  return mask;
}

/**
 * Per-cell one-way constraint from sluices: travelling through this cell is
 * only allowed with a positive component along (dx, dy).
 */
function sluiceMask(w: World): Map<number, [number, number]> {
  const m = new Map<number, [number, number]>();
  for (const s of w.sluices) {
    const r = (s.dir * Math.PI) / 180;
    const d: [number, number] = [Math.cos(r), Math.sin(r)];
    for (let y = Math.floor(s.box.y) - 1; y <= s.box.y + s.box.h; y++) {
      for (let x = Math.floor(s.box.x) - 1; x <= s.box.x + s.box.w; x++) {
        if (x < 0 || y < 0 || x >= w.level.width || y >= w.level.height) continue;
        m.set(y * w.level.width + x, d);
      }
    }
  }
  return m;
}

/** Dijkstra towards a goal, biased away from walls so the route hugs tunnel centres. */
function routeTo(w: World, gx: number, gy: number): Field | null {
  const level = w.level;
  const { width: W, height: H } = level;
  const blocked = blockedMask(w);
  const clear = clearanceField(level, blocked);
  const sluices = sluiceMask(w);
  const dist = new Float32Array(W * H).fill(INF);

  const goal = Math.floor(gy) * W + Math.floor(gx);
  if (blocked[goal]) {
    // Snap the goal to the nearest open cell (crates can sit close to a wall).
    let best = -1;
    let bestD = INF;
    for (let y = Math.floor(gy) - 4; y <= Math.floor(gy) + 4; y++) {
      for (let x = Math.floor(gx) - 4; x <= Math.floor(gx) + 4; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (blocked[i]) continue;
        const d = Math.hypot(x - gx, y - gy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best < 0) return null;
    return dijkstra(best);
  }
  return dijkstra(goal);

  function dijkstra(start: number): Field {
    // Binary heap keyed on cost; grids are small so this is comfortably fast.
    const heap: number[] = [start];
    const key: number[] = [0];
    dist[start] = 0;
    const push = (node: number, cost: number) => {
      heap.push(node);
      key.push(cost);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (key[p] <= key[i]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        [key[p], key[i]] = [key[i], key[p]];
        i = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const n = heap.pop()!;
      const k = key.pop()!;
      if (heap.length) {
        heap[0] = n;
        key[0] = k;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && key[l] < key[m]) m = l;
          if (r < heap.length && key[r] < key[m]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          [key[m], key[i]] = [key[i], key[m]];
          i = m;
        }
      }
      return top;
    };

    key[0] = 0;
    while (heap.length) {
      const i = pop();
      const x = i % W;
      const y = (i / W) | 0;
      const base = dist[i];
      for (const [dx, dy, step] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (blocked[ni]) continue;
        // Diagonal moves must not cut a corner through rock.
        if (dx && dy && (blocked[y * W + nx] || blocked[ny * W + x])) continue;
        // The search runs backwards from the goal, so an expansion edge a->b
        // means the ship would actually fly b->a. Reject it when that would
        // push through a sluice the wrong way.
        if (sluices.size) {
          const sd = sluices.get(ni) ?? sluices.get(i);
          if (sd && -dx * sd[0] + -dy * sd[1] < -0.01) continue;
        }
        // Centring pressure: the cost keeps falling all the way to clear = 6,
        // so wide tunnels still have a single cheapest line down the middle
        // instead of a plateau of equal-cost routes along the walls.
        const penalty = Math.pow(Math.max(0, 6 - clear[ni]), 1.6) * 0.5;
        const nd = base + step + penalty;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          push(ni, nd);
        }
      }
    }
    return { dist, clear, w: W, h: H };
  }
}

/** Walk down the gradient a few cells to get something to aim at. */
function waypoint(f: Field, x: number, y: number, lookahead = 7): { x: number; y: number } {
  let cx = Math.floor(x);
  let cy = Math.floor(y);
  for (let step = 0; step < lookahead; step++) {
    let bx = cx;
    let by = cy;
    let bd = f.dist[cy * f.w + cx];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= f.w || ny >= f.h) continue;
        const d = f.dist[ny * f.w + nx];
        if (d < bd) {
          bd = d;
          bx = nx;
          by = ny;
        }
      }
    }
    if (bx === cx && by === cy) break;
    cx = bx;
    cy = by;
  }
  return { x: cx + 0.5, y: cy + 0.5 };
}

type Phase = 'travel' | 'approach' | 'descend';

export interface AutopilotResult {
  cleared: boolean;
  time: number;
  deaths: number;
  score: number;
  reason: string;
}

/**
 * Fly `world` to completion. Returns as soon as the level clears, the run ends
 * or the simulated time budget is exhausted.
 */
export function flyLevel(
  world: World,
  opts: { maxSeconds?: number; trace?: (line: string) => void } = {},
): AutopilotResult {
  const maxSeconds = opts.maxSeconds ?? 900;
  const steps = Math.round(maxSeconds / FIXED_DT);

  let field: Field | null = null;
  let targetKey = '';
  let phase: Phase = 'travel';
  let replanIn = 0;
  let pwm = 0;
  const fuelFields = new Map<string, Field | null>();
  let fuelFieldGates = -1;
  let bestProgress = INF;
  let stuckFor = 0;
  const env = { x: 0, y: 0 };
  let committedCargo: number | null = null;
  let smoothVx = 0;
  let smoothVy = 0;

  const basePad = world.level.pads.find((p) => p.kind === 'base')!;
  const baseX = basePad.x + basePad.w / 2;
  const baseTop = basePad.y + 1;

  for (let i = 0; i < steps; i++) {
    if (world.status === 'cleared') {
      return {
        cleared: true,
        time: world.time,
        deaths: world.stats.deaths,
        score: world.score,
        reason: 'cleared',
      };
    }
    if (world.status === 'gameover') {
      return {
        cleared: false,
        time: world.time,
        deaths: world.stats.deaths,
        score: world.score,
        reason: 'out of hulls',
      };
    }
    if (world.status === 'dying') {
      stepWorld(world, { turn: 0, thrust: false, levelOut: false }, FIXED_DT);
      field = null;
      targetKey = '';
      phase = 'travel';
      smoothVx = 0;
      smoothVy = 0;
      continue;
    }

    const ship = world.ship;

    // --- pick an objective -------------------------------------------------
    const nextKey = world.keys.find((k) => !k.taken);
    const waiting = world.cargo.filter((c) => c.state === 'waiting');
    const full = ship.carrying.length >= 3;
    const goHome = full || waiting.length === 0;

    let tx: number;
    let ty: number;
    let key: string;
    if (nextKey && !goHome) {
      tx = nextKey.pos.x;
      ty = nextKey.pos.y;
      key = `key${nextKey.id}`;
    } else if (!goHome) {
      // Commit to one crate until it is aboard. Re-picking the nearest crate
      // every step makes the pilot oscillate between two chambers forever the
      // moment it passes the midpoint between them.
      let target = waiting.find((c) => c.id === committedCargo);
      if (!target) {
        let best = waiting[0];
        let bestD = INF;
        for (const c of waiting) {
          const d = Math.hypot(c.pos.x - ship.pos.x, c.pos.y - ship.pos.y);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        target = best;
        committedCargo = best.id;
      }
      tx = target.pos.x;
      ty = target.pos.y;
      key = `cargo${target.id}`;
    } else {
      committedCargo = null;
      tx = baseX;
      ty = baseTop + 5;
      key = 'base';
    }

    // Refuel detour when the tanks will not make it home. Pads are ranked by
    // route length, not straight-line distance - the nearest pad as the crow
    // flies is regularly the one on the far side of a wall.
    const fuelPads = world.level.pads.filter((p) => p.kind === 'fuel');
    if (fuelPads.length && ship.fuel < world.fuelMax * 0.35 && ship.state !== 'landed') {
      const openGates = world.gates.filter((g) => g.open).length;
      if (openGates !== fuelFieldGates) {
        fuelFields.clear();
        fuelFieldGates = openGates;
      }
      let best = fuelPads[0];
      let bestD = INF;
      const cell = Math.floor(ship.pos.y) * world.level.width + Math.floor(ship.pos.x);
      for (const p of fuelPads) {
        const id = `fuel${p.x},${p.y}`;
        let f = fuelFields.get(id);
        if (f === undefined) {
          f = routeTo(world, p.x + p.w / 2, p.y + 6);
          fuelFields.set(id, f);
        }
        const d = f ? f.dist[cell] : INF;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      tx = best.x + best.w / 2;
      ty = best.y + 6;
      key = `fuel${best.x},${best.y}`;
    }

    replanIn -= FIXED_DT;
    if (key !== targetKey || !field || replanIn <= 0) {
      field = routeTo(world, tx, ty);
      if (key !== targetKey) {
        bestProgress = INF;
        stuckFor = 0;
      }
      targetKey = key;
      replanIn = 1.5; // gates open and crates vanish; refresh periodically
    }

    // Deadlock watchdog: if the route cost under the hull stops falling the
    // pilot is wedged somewhere, so break the symmetry with a hard replan.
    if (field) {
      const here = field.dist[Math.floor(ship.pos.y) * world.level.width + Math.floor(ship.pos.x)];
      if (Number.isFinite(here) && here < bestProgress - 0.5) {
        bestProgress = here;
        stuckFor = 0;
      } else {
        stuckFor += FIXED_DT;
      }
    }
    if (stuckFor > 10) {
      stuckFor = 0;
      bestProgress = INF;
      field = routeTo(world, tx, ty);
      targetKey = key;
    }

    // --- landing state machine --------------------------------------------
    const overPad = (px: number, top: number) =>
      Math.abs(ship.pos.x - px) < 1.4 && ship.pos.y > top && ship.pos.y - top < 8;

    let padX = baseX;
    let padTop = baseTop;
    let wantLanding = key === 'base';
    if (key.startsWith('fuel')) {
      const p = world.level.pads.find((q) => `fuel${q.x},${q.y}` === key)!;
      padX = p.x + p.w / 2;
      padTop = p.y + 1;
      wantLanding = true;
    }

    if (ship.state === 'landed') {
      const refuelling = ship.landedOn?.kind === 'fuel' && ship.fuel < world.fuelMax * 0.95;
      const done = !refuelling;
      stepWorld(world, { turn: 0, thrust: done, levelOut: false }, FIXED_DT);
      if (done) {
        field = null;
        targetKey = '';
      }
      continue;
    }

    if (wantLanding && overPad(padX, padTop)) {
      // Hysteresis, otherwise the phase flaps on the boundary every step.
      const height = ship.pos.y - padTop;
      if (phase === 'descend') phase = height > 4.0 ? 'approach' : 'descend';
      else phase = height < 3.0 ? 'descend' : 'approach';
    } else {
      phase = 'travel';
    }

    // --- steering ----------------------------------------------------------
    let desVx: number;
    let desVy: number;
    if (phase === 'travel') {
      const clear = field
        ? sampleField(field.clear, field.w, field.h, ship.pos.x, ship.pos.y)
        : 4;
      // Look further ahead in open rooms, barely ahead in tight tubes.
      const look = Math.max(3, Math.min(9, Math.round(clear * 2)));
      const wp = field ? waypoint(field, ship.pos.x, ship.pos.y, look) : { x: tx, y: ty };
      let dx = wp.x - ship.pos.x;
      let dy = wp.y - ship.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const goalDist = Math.hypot(tx - ship.pos.x, ty - ship.pos.y);

      // Slow down for bends: compare the near heading with the far heading.
      let bend = 1;
      if (field) {
        const far = waypoint(field, ship.pos.x, ship.pos.y, look + 8);
        const fx = far.x - ship.pos.x;
        const fy = far.y - ship.pos.y;
        const fl = Math.hypot(fx, fy) || 1;
        const dot = (dx * fx + dy * fy) / fl;
        bend = Math.max(0.5, dot);
      }

      // Speed is bounded by how much room there is, how sharp the turn is and
      // how close the goal is. The floor stays above the sluice-opening
      // threshold so one-way membranes still yield.
      const boost = stuckFor > 4 ? 2.5 : 0;
      const cruise = Math.max(3.0, Math.min(clear * 1.6 * bend + boost, 7.0, goalDist * 0.9));
      desVx = dx * cruise;
      desVy = dy * cruise;

      // Push away from whichever wall is closest, proportional to how close it is.
      if (field && clear < 2.5) {
        const cl = (ox: number, oy: number) =>
          sampleField(field!.clear, field!.w, field!.h, ship.pos.x + ox, ship.pos.y + oy);
        const gx = cl(1, 0) - cl(-1, 0);
        const gy = cl(0, 1) - cl(0, -1);
        const gl = Math.hypot(gx, gy);
        if (gl > 0.001) {
          const push = (2.5 - clear) * 1.2;
          desVx += (gx / gl) * push;
          desVy += (gy / gl) * push;
        }
        const dv = Math.hypot(desVx, desVy);
        if (dv > cruise) {
          desVx = (desVx / dv) * cruise;
          desVy = (desVy / dv) * cruise;
        }
      }
    } else if (phase === 'approach') {
      desVx = (padX - ship.pos.x) * 1.8;
      desVy = -2.0;
    } else {
      const height = ship.pos.y - padTop;
      desVx = (padX - ship.pos.x) * 1.8;
      desVy = height < 1.0 ? -0.6 : -1.1;
    }

    // Feed-forward the *actual* environment force, not just gravity: on levels
    // with magnets, blowers, inverted zones or a gravity well, compensating
    // only for -g leaves a standing error the feedback term cannot close.
    environmentAccel(world, ship.pos, env);
    const loadScale = 1 + ship.carrying.length * 0.05;
    const envX = env.x;
    const envY = env.y * loadScale;
    const gEff = Math.hypot(envX, envY) || world.gravity;

    // Low-pass the demand. Without it, small discontinuities in the route field
    // flip the target heading between steps, the alignment gate never opens and
    // the pilot hangs in place with the engine off.
    const k = Math.min(1, FIXED_DT * 14);
    smoothVx += (desVx - smoothVx) * k;
    smoothVy += (desVy - smoothVy) * k;

    const ax = (smoothVx - ship.vel.x) * 3.4 - envX;
    const ay = (smoothVy - ship.vel.y) * 3.4 - envY;

    const mag = Math.hypot(ax, ay);
    let wantAngle = mag < 0.01 ? 0 : Math.atan2(-ax, ay);
    // Keep the nose nearly vertical on final descent or the landing check will
    // reject it. In flight the limit has to allow past 90 degrees: inside an
    // updraft the only way to stop climbing is to thrust downwards.
    const limit = phase === 'descend' ? 0.12 : 2.8;
    wantAngle = Math.max(-limit, Math.min(limit, wantAngle));

    let err = wantAngle - ship.angle;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const turn = Math.max(-1, Math.min(1, err * 4.0 - ship.angVel * 0.35));

    // Thrust is binary but the controller needs a continuous magnitude, so run
    // it as PWM: accumulate the demanded duty cycle and fire whole steps.
    // A plain "thrust if demand > threshold" rule settles at a hover with a
    // permanent upward bias and can never touch down.
    // The duty is divided by cos(error) so a partly-turned hull still delivers
    // the demanded component. A hard "only thrust when aligned" gate deadlocks:
    // a chattering target heading keeps the gate shut and the ship just hangs
    // there with the engine off until it falls into something.
    const cosErr = Math.cos(err);
    const thrustPower = SHIP.thrust * (1 - ship.carrying.length * 0.07);
    let thrust = false;
    if (cosErr > 0.25 && ship.fuel > 0) {
      pwm += Math.max(0, Math.min(1, mag / (thrustPower * cosErr)));
      if (pwm >= 1) {
        pwm -= 1;
        thrust = true;
      }
    } else {
      pwm = 0;
    }

    const input: InputFrame = { turn, thrust, levelOut: false };
    if (opts.trace) {
      const wp = field ? waypoint(field, ship.pos.x, ship.pos.y) : { x: tx, y: ty };
      opts.trace(
        `t=${world.time.toFixed(2)} ${phase} key=${key} p=${ship.pos.x.toFixed(1)},${ship.pos.y.toFixed(1)} ` +
          `v=${ship.vel.x.toFixed(1)},${ship.vel.y.toFixed(1)} ang=${ship.angle.toFixed(2)} want=${wantAngle.toFixed(2)} ` +
          `wp=${wp.x.toFixed(1)},${wp.y.toFixed(1)} thr=${thrust ? 1 : 0} fuel=${ship.fuel.toFixed(0)}`,
      );
    }
    stepWorld(world, input, FIXED_DT);
  }

  return {
    cleared: false,
    time: world.time,
    deaths: world.stats.deaths,
    score: world.score,
    reason: 'time budget exhausted',
  };
}

export const AUTOPILOT_LAND_SPEED = SHIP.safeLandSpeed;
