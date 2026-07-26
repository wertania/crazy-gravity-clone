/**
 * The simulation.
 *
 * Deliberately free of any rendering, DOM or Three.js import: the whole game
 * state advances through `stepWorld(world, input, dt)` with a fixed dt, which
 * makes it unit-testable in node and makes input-replay deterministic.
 */

import {
  FLOW,
  SCORE,
  SHIP,
  WORLD,
  type Difficulty,
} from './config';
import { circleVsAabb, circleVsGrid, subStepsFor, wallProximity, type Aabb } from './collision';
import type { Level, ObjectSpec, PadSpec } from './level';
import { tileAt } from './level';
import {
  LANDABLE,
  THROTTLE_DEADZONE,
  Tile,
  type InputFrame,
  type KeyColor,
  type ShipState,
  type SimEvent,
  type Vec2,
} from './types';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface Ship {
  pos: Vec2;
  vel: Vec2;
  /** Radians, 0 = nose up, positive = counter-clockwise. */
  angle: number;
  angVel: number;
  fuel: number;
  state: ShipState;
  thrusting: boolean;
  /** Engine power actually applied this step, 0..1. Drives the exhaust plume. */
  throttle: number;
  /** Cargo ids currently aboard. */
  carrying: number[];
  landedOn: PadSpec | null;
  /** Seconds since the last state change; drives respawn and explosion timing. */
  stateTime: number;
}

export interface CargoEnt {
  id: number;
  home: Vec2;
  pos: Vec2;
  state: 'waiting' | 'carried' | 'delivered';
  /** Bobbing phase so a row of crates does not pulse in lockstep. */
  phase: number;
}

export interface KeyEnt {
  id: number;
  pos: Vec2;
  color: KeyColor;
  taken: boolean;
}

export interface GateEnt {
  box: Aabb;
  color: KeyColor;
  open: boolean;
  /** 0..1 animation progress for the renderer. */
  openness: number;
}

export interface CannonEnt {
  pos: Vec2;
  dir: number;
  period: number;
  timer: number;
  /** Turrets track the ship; cannons fire blind along `dir`. */
  tracking: boolean;
  range: number;
  /** Muzzle flash timer for the renderer. */
  flash: number;
}

export interface RodEnt {
  base: Aabb;
  axis: 'x' | 'y';
  travel: number;
  period: number;
  phase: number;
  box: Aabb;
}

export interface SluiceEnt {
  box: Aabb;
  dir: number;
  /** True while the ship is moving through it the right way. */
  passable: boolean;
}

/** A radial attractor, difficulty-scaled at construction time. */
export interface WellEnt {
  x: number;
  y: number;
  strength: number;
  radius: number;
}

export interface FieldEnt {
  kind: 'magnet' | 'fan';
  pos: Vec2;
  /** magnet: radius. fan: unused. */
  radius: number;
  strength: number;
  dir: number;
  box: Aabb | null;
}

export interface Bullet {
  pos: Vec2;
  vel: Vec2;
  life: number;
}

export type WorldStatus = 'playing' | 'cleared' | 'dying' | 'gameover';

export interface RunStats {
  deaths: number;
  /** Points banked during the run, split so the results card can itemise them. */
  cargoPoints: number;
  keyPoints: number;
  grazeTime: number;
  peakFlow: number;
  fuelUsed: number;
  distance: number;
  perfectLandings: number;
}

export interface World {
  level: Level;
  diff: Difficulty;
  ship: Ship;
  cargo: CargoEnt[];
  keys: KeyEnt[];
  gates: GateEnt[];
  cannons: CannonEnt[];
  rods: RodEnt[];
  sluices: SluiceEnt[];
  fields: FieldEnt[];
  wells: WellEnt[];
  bullets: Bullet[];
  keysHeld: Set<KeyColor>;
  /** Seconds of simulation elapsed in this level attempt. */
  time: number;
  timeLimit: number;
  fuelMax: number;
  gravity: number;
  /** Speed cap for this run: SHIP.maxSpeed scaled by the difficulty tier. */
  maxSpeed: number;
  /** Engine power for this run, before the cargo mass penalty. */
  thrust: number;
  /**
   * Fuel per second at full throttle.
   *
   * Scaled by the same factor as thrust, so fuel buys a fixed amount of *speed
   * change* rather than a fixed amount of *time*. Without this a low-thrust
   * tier silently pays ~1.4x the fuel for the same manoeuvre, which made the
   * gentlest difficulty the most fuel-starved one.
   */
  fuelBurn: number;
  flow: number;
  multiplier: number;
  score: number;
  lives: number;
  status: WorldStatus;
  events: SimEvent[];
  stats: RunStats;
  /** Decaying camera shake magnitude, consumed by the renderer. */
  shake: number;
  /** Landing indicator state, recomputed every step. */
  landing: 'green' | 'yellow' | 'red';
  /** Set once `status` becomes 'cleared'. */
  clearBreakdown: ScoreBreakdown | null;
}

export interface ScoreBreakdown {
  cargo: number;
  keys: number;
  time: number;
  fuel: number;
  flawless: number;
  flowBonus: number;
  total: number;
}

const CARGO_CAPACITY = 3;
const PICKUP_RADIUS = 1.15;
const LIFTOFF_SPEED = 4.0;
const BUMPER_RESTITUTION = 0.35;
const SLUICE_PASS_SPEED = 1.5;
const RESPAWN_DELAY = 0.85;

const deg = (d: number) => (d * Math.PI) / 180;

function dirVec(d: number): Vec2 {
  const r = deg(d);
  return { x: Math.cos(r), y: Math.sin(r) };
}

function normalizeAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createWorld(level: Level, diff: Difficulty, lives?: number): World {
  const cargo: CargoEnt[] = [];
  const keys: KeyEnt[] = [];
  const gates: GateEnt[] = [];
  const cannons: CannonEnt[] = [];
  const rods: RodEnt[] = [];
  const sluices: SluiceEnt[] = [];
  const fields: FieldEnt[] = [];

  let cargoId = 0;
  let keyId = 0;
  for (const o of level.objects) {
    switch (o.t) {
      case 'cargo':
        cargo.push({
          id: cargoId++,
          home: { x: o.x, y: o.y },
          pos: { x: o.x, y: o.y },
          state: 'waiting',
          phase: (cargoId * 1.7) % (Math.PI * 2),
        });
        break;
      case 'key':
        keys.push({ id: keyId++, pos: { x: o.x, y: o.y }, color: o.color, taken: false });
        break;
      case 'gate':
        gates.push({
          box: { x: o.x, y: o.y, w: o.w, h: o.h },
          color: o.color,
          open: false,
          openness: 0,
        });
        break;
      case 'cannon':
        cannons.push({
          pos: { x: o.x, y: o.y },
          dir: o.dir,
          period: o.period / diff.hazardScale,
          timer: (o.phase ?? 0) * o.period,
          tracking: false,
          range: Infinity,
          flash: 0,
        });
        break;
      case 'turret':
        cannons.push({
          pos: { x: o.x, y: o.y },
          dir: 0,
          period: o.period / diff.hazardScale,
          timer: (o.phase ?? 0) * o.period,
          tracking: true,
          range: o.range ?? 26,
          flash: 0,
        });
        break;
      case 'rod': {
        const base: Aabb = { x: o.x, y: o.y, w: o.w, h: o.h };
        rods.push({
          base,
          axis: o.axis,
          travel: o.travel,
          period: o.period / diff.hazardScale,
          phase: o.phase ?? 0,
          box: { ...base },
        });
        break;
      }
      case 'sluice':
        sluices.push({ box: { x: o.x, y: o.y, w: o.w, h: o.h }, dir: o.dir, passable: false });
        break;
      case 'magnet':
        fields.push({
          kind: 'magnet',
          pos: { x: o.x, y: o.y },
          radius: o.radius,
          strength: o.strength * diff.hazardScale,
          dir: 0,
          box: null,
        });
        break;
      case 'fan':
        fields.push({
          kind: 'fan',
          pos: { x: o.x + o.w / 2, y: o.y + o.h / 2 },
          radius: 0,
          strength: o.force * diff.hazardScale,
          dir: o.dir,
          box: { x: o.x, y: o.y, w: o.w, h: o.h },
        });
        break;
      case 'spikes':
        break; // Baked into the grid.
    }
  }

  const fuelMax = Math.round((level.spec.fuel ?? SHIP.maxFuel) * diff.fuelScale);

  const world: World = {
    level,
    diff,
    ship: makeShip(level.spawn, fuelMax),
    cargo,
    keys,
    gates,
    cannons,
    rods,
    sluices,
    fields,
    // Wells are an environmental force the engine has to overcome, so they are
    // scaled by thrust, not left absolute. Unscaled, the finale's well (22)
    // exceeded Rookie's thrust (18.2) and the ship could not climb out at all.
    wells: level.wells.map((w) => ({ ...w, strength: w.strength * diff.thrustScale })),
    bullets: [],
    keysHeld: new Set(),
    time: 0,
    timeLimit: level.par * diff.timeScale,
    fuelMax,
    gravity: level.gravity * diff.gravityScale,
    maxSpeed: SHIP.maxSpeed * diff.speedScale,
    thrust: SHIP.thrust * diff.thrustScale,
    fuelBurn: SHIP.fuelBurn * diff.thrustScale,
    flow: 0,
    multiplier: 1,
    score: 0,
    lives: lives ?? diff.lives,
    status: 'playing',
    events: [],
    stats: {
      deaths: 0,
      cargoPoints: 0,
      keyPoints: 0,
      grazeTime: 0,
      peakFlow: 0,
      fuelUsed: 0,
      distance: 0,
      perfectLandings: 0,
    },
    shake: 0,
    landing: 'green',
    clearBreakdown: null,
  };
  updateRods(world, 0);
  return world;
}

function makeShip(spawn: Vec2, fuel: number): Ship {
  return {
    pos: { ...spawn },
    vel: { x: 0, y: 0 },
    angle: 0,
    angVel: 0,
    fuel,
    state: 'flying',
    thrusting: false,
    throttle: 0,
    carrying: [],
    landedOn: null,
    stateTime: 0,
  };
}

function emit(w: World, e: SimEvent) {
  w.events.push(e);
}

// ---------------------------------------------------------------------------
// Per-step helpers
// ---------------------------------------------------------------------------

function updateRods(w: World, _dt: number) {
  for (const r of w.rods) {
    const t = w.time / r.period + r.phase;
    const off = Math.sin(t * Math.PI * 2) * (r.travel / 2);
    r.box.x = r.base.x + (r.axis === 'x' ? off : 0);
    r.box.y = r.base.y + (r.axis === 'y' ? off : 0);
    r.box.w = r.base.w;
    r.box.h = r.base.h;
  }
}

function updateGates(w: World, dt: number) {
  for (const g of w.gates) {
    const shouldOpen = w.keysHeld.has(g.color);
    if (shouldOpen && !g.open) {
      g.open = true;
      emit(w, { type: 'gate-open', x: g.box.x + g.box.w / 2, y: g.box.y + g.box.h / 2, color: g.color });
    }
    const target = g.open ? 1 : 0;
    g.openness += Math.sign(target - g.openness) * Math.min(Math.abs(target - g.openness), dt * 2.5);
  }
}

function updateSluices(w: World) {
  const v = w.ship.vel;
  for (const s of w.sluices) {
    const d = dirVec(s.dir);
    s.passable = v.x * d.x + v.y * d.y > SLUICE_PASS_SPEED;
  }
}

function updateCannons(w: World, dt: number) {
  const ship = w.ship;
  for (const c of w.cannons) {
    c.flash = Math.max(0, c.flash - dt * 6);
    if (w.status !== 'playing') continue;
    c.timer += dt;
    if (c.timer < c.period) continue;
    c.timer = 0;
    let dx: number;
    let dy: number;
    if (c.tracking) {
      dx = ship.pos.x - c.pos.x;
      dy = ship.pos.y - c.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > c.range || ship.state === 'dead') continue;
      // Lead the target so a moving ship is not a free pass.
      const lead = dist / WORLD.bulletSpeed;
      dx += ship.vel.x * lead * 0.65;
      dy += ship.vel.y * lead * 0.65;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      c.dir = (Math.atan2(dy, dx) * 180) / Math.PI;
    } else {
      const d = dirVec(c.dir);
      dx = d.x;
      dy = d.y;
    }
    w.bullets.push({
      pos: { x: c.pos.x + dx * 0.7, y: c.pos.y + dy * 0.7 },
      vel: { x: dx * WORLD.bulletSpeed, y: dy * WORLD.bulletSpeed },
      life: WORLD.bulletLife,
    });
    c.flash = 1;
    emit(w, { type: 'shoot', x: c.pos.x, y: c.pos.y });
  }
}

function updateBullets(w: World, dt: number) {
  const ship = w.ship;
  for (let i = w.bullets.length - 1; i >= 0; i--) {
    const b = w.bullets[i];
    b.life -= dt;
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    const hitWall = tileAt(w.level, Math.floor(b.pos.x), Math.floor(b.pos.y)) !== Tile.EMPTY;
    if (b.life <= 0 || hitWall) {
      if (hitWall) emit(w, { type: 'bullet-hit', x: b.pos.x, y: b.pos.y });
      w.bullets.splice(i, 1);
      continue;
    }
    if (ship.state !== 'dead' && w.status === 'playing') {
      const d = Math.hypot(b.pos.x - ship.pos.x, b.pos.y - ship.pos.y);
      if (d < SHIP.radius + WORLD.bulletRadius) {
        w.bullets.splice(i, 1);
        killShip(w, 'hit by fire');
      }
    }
  }
}

/**
 * Environmental acceleration at a point: gravity, zones, wells, magnets, fans.
 * Exported because the HUD draws it as a force arrow and the test pilot uses it
 * as a feed-forward term.
 */
export function environmentAccel(w: World, p: Vec2, out: Vec2) {
  let g = w.gravity;
  for (const z of w.level.zones) {
    if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) {
      g *= z.gravityScale;
      break;
    }
  }
  out.x = 0;
  out.y = -g;

  for (const well of w.wells) {
    const dx = well.x - p.x;
    const dy = well.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > well.radius || d < 0.001) continue;
    const f = well.strength * (1 - d / well.radius);
    out.x += (dx / d) * f;
    out.y += (dy / d) * f;
  }

  for (const f of w.fields) {
    if (f.kind === 'magnet') {
      const dx = f.pos.x - p.x;
      const dy = f.pos.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > f.radius || d < 0.001) continue;
      const s = f.strength * (1 - d / f.radius);
      out.x += (dx / d) * s;
      out.y += (dy / d) * s;
    } else if (f.box) {
      const b = f.box;
      if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) continue;
      const d = dirVec(f.dir);
      out.x += d.x * f.strength;
      out.y += d.y * f.strength;
    }
  }
}

/** Active dynamic solids for this step. Gates and sluices bump, rods kill. */
function dynamicSolids(w: World): { box: Aabb; lethal: boolean }[] {
  const list: { box: Aabb; lethal: boolean }[] = [];
  for (const g of w.gates) if (!g.open) list.push({ box: g.box, lethal: false });
  for (const s of w.sluices) if (!s.passable) list.push({ box: s.box, lethal: false });
  for (const r of w.rods) list.push({ box: r.box, lethal: true });
  return list;
}

function killShip(w: World, _reason: string) {
  const ship = w.ship;
  if (ship.state === 'dead') return;
  const speed = Math.hypot(ship.vel.x, ship.vel.y);
  ship.state = 'dead';
  ship.stateTime = 0;
  ship.thrusting = false;
  w.stats.deaths++;
  w.shake = Math.min(1.6, 0.6 + speed / w.maxSpeed);
  w.flow = 0;
  w.status = 'dying';
  emit(w, { type: 'crash', x: ship.pos.x, y: ship.pos.y, value: speed });

  // Carried freight is scattered back to where it was picked up.
  for (const id of ship.carrying) {
    const c = w.cargo[id];
    c.state = 'waiting';
    c.pos = { ...c.home };
  }
  ship.carrying = [];
}

function respawn(w: World) {
  // `lives` counts hulls *including* the one just lost, so 1 life = one attempt.
  w.lives--;
  if (w.lives <= 0) {
    w.lives = 0;
    w.status = 'gameover';
    return;
  }
  w.ship = makeShip(w.level.spawn, w.fuelMax);
  w.bullets.length = 0;
  w.status = 'playing';
  w.flow = 0;
}

function tryLand(w: World, tile: number, ny: number): boolean {
  const ship = w.ship;
  if (!LANDABLE.has(tile)) return false;
  if (ny < 0.55) return false; // Hit the side or underside of the pad.
  const speed = Math.hypot(ship.vel.x, ship.vel.y);
  const tol = w.diff.landToleranceScale;
  if (speed > SHIP.safeLandSpeed * tol) return false;
  if (Math.abs(normalizeAngle(ship.angle)) > SHIP.safeLandAngle * tol) return false;
  return true;
}

function padUnder(w: World, x: number, y: number): PadSpec | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y - SHIP.radius - 0.1);
  for (const p of w.level.pads) {
    if (p.y === ty && tx >= p.x && tx < p.x + p.w) return p;
  }
  return null;
}

function landShip(w: World, contact: { nx: number; ny: number; depth: number }) {
  const ship = w.ship;
  const speed = Math.hypot(ship.vel.x, ship.vel.y);
  ship.pos.x += contact.nx * contact.depth;
  ship.pos.y += contact.ny * contact.depth;
  ship.vel.x = 0;
  ship.vel.y = 0;
  ship.angVel = 0;
  ship.angle = 0;
  ship.state = 'landed';
  ship.stateTime = 0;
  ship.landedOn = padUnder(w, ship.pos.x, ship.pos.y);
  if (speed < SHIP.safeLandSpeed * 0.35) w.stats.perfectLandings++;
  emit(w, { type: 'land', x: ship.pos.x, y: ship.pos.y, value: speed });
}

// ---------------------------------------------------------------------------
// Main step
// ---------------------------------------------------------------------------

export function stepWorld(w: World, input: InputFrame, dt: number): void {
  if (w.status === 'gameover' || w.status === 'cleared') return;

  const ship = w.ship;
  ship.stateTime += dt;

  if (w.status === 'dying') {
    w.shake = Math.max(0, w.shake - dt * 2.2);
    updateBullets(w, dt);
    if (ship.stateTime >= RESPAWN_DELAY) respawn(w);
    return;
  }

  w.time += dt;
  w.shake = Math.max(0, w.shake - dt * 3.0);

  updateRods(w, dt);
  updateGates(w, dt);
  updateSluices(w);
  updateCannons(w, dt);
  updateBullets(w, dt);
  if (w.status !== 'playing') return;

  // --- Rotation ------------------------------------------------------------
  let turn = input.turn;
  if (input.levelOut && turn === 0) {
    // Auto-level assist: proportional controller towards nose-up.
    const err = normalizeAngle(-ship.angle);
    turn = Math.max(-1, Math.min(1, err * 3.2));
  }
  if (ship.state === 'flying') {
    const targetAngVel = turn * SHIP.rotSpeed;
    const k = Math.min(1, SHIP.rotAccel * dt);
    ship.angVel += (targetAngVel - ship.angVel) * k;
    ship.angle = normalizeAngle(ship.angle + ship.angVel * dt);
  }

  // --- Thrust and fuel -----------------------------------------------------
  const load = ship.carrying.length;
  const thrustPower = shipThrust(w, load);
  const throttle = Math.max(0, Math.min(1, input.throttle));
  const wantThrust = throttle > THROTTLE_DEADZONE && ship.fuel > 0;
  ship.thrusting = false;
  ship.throttle = 0;

  if (ship.state === 'landed') {
    handleLandedTick(w, dt, wantThrust);
    computeLanding(w);
    return;
  }

  const accel: Vec2 = { x: 0, y: 0 };
  environmentAccel(w, ship.pos, accel);
  accel.y *= 1 + load * SHIP.cargoGravityPenalty;

  if (wantThrust) {
    ship.thrusting = true;
    ship.throttle = throttle;
    accel.x += -Math.sin(ship.angle) * thrustPower * throttle;
    accel.y += Math.cos(ship.angle) * thrustPower * throttle;
    // Fuel follows the throttle, so feathering the engine is genuinely cheaper
    // than pumping a key on and off.
    const before = ship.fuel;
    ship.fuel = Math.max(0, ship.fuel - w.fuelBurn * throttle * dt);
    w.stats.fuelUsed += before - ship.fuel;
    if (ship.fuel === 0 && before > 0) emit(w, { type: 'out-of-fuel', x: ship.pos.x, y: ship.pos.y });
  }

  // --- Semi-implicit Euler integration ------------------------------------
  ship.vel.x += accel.x * dt;
  ship.vel.y += accel.y * dt;
  const damp = Math.pow(SHIP.damping, dt);
  ship.vel.x *= damp;
  ship.vel.y *= damp;
  let speed = Math.hypot(ship.vel.x, ship.vel.y);
  if (speed > w.maxSpeed) {
    const s = w.maxSpeed / speed;
    ship.vel.x *= s;
    ship.vel.y *= s;
    speed = w.maxSpeed;
  }

  moveAndCollide(w, dt, speed);
  if (w.status !== 'playing') return;

  w.stats.distance += speed * dt;

  updateFlow(w, dt, speed);
  collectPickups(w);
  computeLanding(w);
  checkTime(w);
}

function handleLandedTick(w: World, dt: number, wantThrust: boolean) {
  const ship = w.ship;
  const pad = ship.landedOn;

  if (pad?.kind === 'fuel' && ship.fuel < w.fuelMax) {
    const before = ship.fuel;
    ship.fuel = Math.min(w.fuelMax, ship.fuel + SHIP.refuelRate * dt);
    if (Math.floor(before / 10) !== Math.floor(ship.fuel / 10)) {
      emit(w, { type: 'refuel', x: ship.pos.x, y: ship.pos.y, value: ship.fuel });
    }
  }

  if (pad?.kind === 'base' && ship.carrying.length > 0) {
    for (const id of ship.carrying) {
      const c = w.cargo[id];
      c.state = 'delivered';
      c.pos = { x: ship.pos.x, y: ship.pos.y };
      const points = Math.round(SCORE.cargoDelivered * w.multiplier * w.diff.scoreScale);
      w.score += points;
      w.stats.cargoPoints += points;
      emit(w, { type: 'deliver', x: ship.pos.x, y: ship.pos.y, value: id });
    }
    ship.carrying = [];
  }

  if (
    pad?.kind === 'base' &&
    w.cargo.every((c) => c.state === 'delivered') &&
    w.status === 'playing'
  ) {
    finishLevel(w);
    return;
  }

  if (wantThrust) {
    ship.state = 'flying';
    ship.stateTime = 0;
    ship.landedOn = null;
    ship.vel.y = LIFTOFF_SPEED;
    ship.thrusting = true;
    ship.throttle = 1;
    emit(w, { type: 'liftoff', x: ship.pos.x, y: ship.pos.y });
  }

  checkTime(w);
}

function moveAndCollide(w: World, dt: number, speed: number) {
  const ship = w.ship;
  const steps = subStepsFor(speed, dt, SHIP.radius);
  const sub = dt / steps;
  const solids = dynamicSolids(w);

  for (let i = 0; i < steps; i++) {
    ship.pos.x += ship.vel.x * sub;
    ship.pos.y += ship.vel.y * sub;

    const c = circleVsGrid(w.level, ship.pos.x, ship.pos.y, SHIP.radius);
    if (c) {
      if (c.tile === Tile.SPIKE) {
        killShip(w, 'spikes');
        return;
      }
      if (tryLand(w, c.tile, c.ny)) {
        landShip(w, c);
        return;
      }
      killShip(w, 'wall');
      return;
    }

    for (const s of solids) {
      const hit = circleVsAabb(ship.pos.x, ship.pos.y, SHIP.radius, s.box);
      if (!hit) continue;
      if (s.lethal) {
        killShip(w, 'crushed');
        return;
      }
      // Bumper: push out and reflect, so a locked gate teaches instead of kills.
      ship.pos.x += hit.nx * hit.depth;
      ship.pos.y += hit.ny * hit.depth;
      const vn = ship.vel.x * hit.nx + ship.vel.y * hit.ny;
      if (vn < 0) {
        ship.vel.x -= (1 + BUMPER_RESTITUTION) * vn * hit.nx;
        ship.vel.y -= (1 + BUMPER_RESTITUTION) * vn * hit.ny;
      }
      w.shake = Math.max(w.shake, 0.18);
    }
  }
}

function updateFlow(w: World, dt: number, speed: number) {
  const ship = w.ship;
  const dist = wallProximity(w.level, ship.pos.x, ship.pos.y, SHIP.radius, FLOW.range);
  // The grazing threshold scales with the hull's own top speed, or a slow
  // Rookie ship could never reach it and the flow meter would be dead weight.
  const flowMin = FLOW.minSpeed * (w.maxSpeed / SHIP.maxSpeed);
  const grazing = dist < FLOW.range && speed > flowMin;

  if (grazing) {
    // Closest = best, but the meter should not spike from a single frame.
    const closeness = 1 - dist / FLOW.range;
    const speedFactor = Math.min(1, (speed - flowMin) / Math.max(1, w.maxSpeed - flowMin) + 0.35);
    w.flow = Math.min(FLOW.max, w.flow + FLOW.gain * closeness * speedFactor * dt);
    w.stats.grazeTime += dt;
    if (w.flow >= FLOW.max && w.stats.peakFlow < FLOW.max) {
      emit(w, { type: 'flow-peak', x: ship.pos.x, y: ship.pos.y });
    }
  } else {
    w.flow = Math.max(0, w.flow - FLOW.decay * dt);
  }

  w.stats.peakFlow = Math.max(w.stats.peakFlow, w.flow);
  const t = w.flow / FLOW.max;
  w.multiplier = 1 + t * (FLOW.maxMultiplier - 1);
  if (t > 0.02) {
    ship.fuel = Math.min(w.fuelMax, ship.fuel + FLOW.fuelReward * t * dt);
  }
}

function collectPickups(w: World) {
  const ship = w.ship;
  for (const c of w.cargo) {
    if (c.state !== 'waiting') continue;
    if (ship.carrying.length >= CARGO_CAPACITY) break;
    if (Math.hypot(c.pos.x - ship.pos.x, c.pos.y - ship.pos.y) > PICKUP_RADIUS + SHIP.radius) continue;
    c.state = 'carried';
    ship.carrying.push(c.id);
    emit(w, { type: 'pickup', x: c.pos.x, y: c.pos.y, value: c.id });
  }
  for (const k of w.keys) {
    if (k.taken) continue;
    if (Math.hypot(k.pos.x - ship.pos.x, k.pos.y - ship.pos.y) > PICKUP_RADIUS + SHIP.radius) continue;
    k.taken = true;
    w.keysHeld.add(k.color);
    const points = Math.round(SCORE.keyCollected * w.multiplier * w.diff.scoreScale);
    w.score += points;
    w.stats.keyPoints += points;
    emit(w, { type: 'key', x: k.pos.x, y: k.pos.y, color: k.color });
  }
  // Carried crates trail behind the hull for the renderer.
  for (let i = 0; i < ship.carrying.length; i++) {
    const c = w.cargo[ship.carrying[i]];
    c.pos.x = ship.pos.x;
    c.pos.y = ship.pos.y;
  }
}

function computeLanding(w: World) {
  const ship = w.ship;
  const speed = Math.hypot(ship.vel.x, ship.vel.y);
  const tol = w.diff.landToleranceScale;
  const safe = SHIP.safeLandSpeed * tol;
  const angleOk = Math.abs(normalizeAngle(ship.angle)) <= SHIP.safeLandAngle * tol;
  if (speed <= safe * SHIP.warnLandFraction && angleOk) w.landing = 'green';
  else if (speed <= safe && angleOk) w.landing = 'yellow';
  else w.landing = 'red';
}

function checkTime(w: World) {
  if (!w.diff.hardTimeLimit) return;
  if (w.time <= w.timeLimit) return;
  emit(w, { type: 'timeout', x: w.ship.pos.x, y: w.ship.pos.y });
  killShip(w, 'timeout');
  // A hard timeout ends the run rather than costing a single hull.
  w.lives = 0;
  w.status = 'dying';
}

function finishLevel(w: World) {
  const timeLeft = Math.max(0, w.timeLimit - w.time);
  const scale = w.diff.scoreScale;
  // Each row is scaled individually and then banked, so the itemised card adds
  // up to the total exactly. Scaling the sum instead leaves the rows lying.
  const breakdown: ScoreBreakdown = {
    // Freight and key points were banked as they happened, at whatever flow
    // multiplier was live at the time; the card itemises them after the fact.
    cargo: w.stats.cargoPoints,
    keys: w.stats.keyPoints,
    time: Math.round(timeLeft * SCORE.timeBonusPerSecond * scale),
    fuel: Math.round(w.ship.fuel * SCORE.fuelBonusPerUnit * scale),
    flawless: w.stats.deaths === 0 ? Math.round(SCORE.flawlessBonus * scale) : 0,
    flowBonus: Math.round(w.stats.grazeTime * 120 * scale),
    total: 0,
  };
  w.score += breakdown.time + breakdown.fuel + breakdown.flawless + breakdown.flowBonus;
  breakdown.total = w.score;
  w.clearBreakdown = breakdown;
  w.status = 'cleared';
  emit(w, { type: 'level-clear', x: w.ship.pos.x, y: w.ship.pos.y, value: w.score });
}

// ---------------------------------------------------------------------------
// Queries used by the presentation layer
// ---------------------------------------------------------------------------

/** Engine power available right now, after the difficulty tier and cargo mass. */
export function shipThrust(w: World, load = w.ship.carrying.length): number {
  return w.thrust * (1 - load * SHIP.cargoThrustPenalty);
}

export function cargoWaiting(w: World): number {
  return w.cargo.filter((c) => c.state === 'waiting').length;
}

export function cargoDelivered(w: World): number {
  return w.cargo.filter((c) => c.state === 'delivered').length;
}

/** Medal thresholds derived from par - shown on the level results card. */
export function medalFor(w: World): 'gold' | 'silver' | 'bronze' | 'none' {
  const par = w.level.par;
  if (w.time <= par * 0.75 && w.stats.deaths === 0) return 'gold';
  if (w.time <= par) return 'silver';
  if (w.time <= par * 1.5) return 'bronze';
  return 'none';
}

export function objectLabel(o: ObjectSpec): string {
  return o.t;
}
