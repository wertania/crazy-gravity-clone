/**
 * Level authoring and baking.
 *
 * Levels are not painted tile by tile. They are *carved*: a level starts as
 * solid rock and a short list of shapes (rooms, caverns, tubes) is subtracted
 * from it. A seeded value-noise field perturbs every carve boundary, so the
 * result reads as an organic cave instead of a rectangle collage, while the
 * authoring data stays small enough to reason about and diff.
 *
 * `buildLevel` is deterministic: same spec in, byte-identical grid out. That is
 * what makes the reachability validator (and the replay system) trustworthy.
 */

import { Tile, type KeyColor, type Vec2 } from './types';

// ---------------------------------------------------------------------------
// Authoring types
// ---------------------------------------------------------------------------

export type Carve =
  /** Axis-aligned room. x,y is the lower-left corner. */
  | { t: 'room'; x: number; y: number; w: number; h: number; rough?: number }
  /** Elliptical cavern centred on cx,cy. */
  | { t: 'cave'; cx: number; cy: number; rx: number; ry: number; rough?: number }
  /** Polyline tunnel of radius r through the given points. */
  | { t: 'tube'; pts: [number, number][]; r: number; rough?: number };

export type PadKind = 'pad' | 'base' | 'fuel';

export interface PadSpec {
  /** Left-most tile column of the pad surface. */
  x: number;
  /** Row of the pad surface itself. */
  y: number;
  w: number;
  kind: PadKind;
}

export type ObjectSpec =
  | { t: 'cargo'; x: number; y: number }
  | { t: 'key'; x: number; y: number; color: KeyColor }
  | { t: 'gate'; x: number; y: number; w: number; h: number; color: KeyColor }
  /** Fires a projectile along `dir` (degrees, 0 = +x, 90 = +y) every `period` seconds. */
  | { t: 'cannon'; x: number; y: number; dir: number; period: number; phase?: number }
  /** Leads the ship and fires when it is within `range`. */
  | { t: 'turret'; x: number; y: number; period: number; range?: number; phase?: number }
  /** Radial attractor (negative strength repels). */
  | { t: 'magnet'; x: number; y: number; strength: number; radius: number }
  /** Rectangular wind volume pushing along `dir`. */
  | { t: 'fan'; x: number; y: number; w: number; h: number; dir: number; force: number }
  /** Solid bar oscillating `travel` tiles along `axis`. */
  | {
      t: 'rod';
      x: number;
      y: number;
      w: number;
      h: number;
      axis: 'x' | 'y';
      travel: number;
      period: number;
      phase?: number;
    }
  /** Membrane you can only cross while moving along `dir` fast enough. */
  | { t: 'sluice'; x: number; y: number; w: number; h: number; dir: number }
  /** Lethal tiles, stamped straight into the grid. */
  | { t: 'spikes'; x: number; y: number; w: number; h: number };

/** Rectangular region overriding gravity (e.g. an updraft shaft or an inversion). */
export interface ZoneSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Multiplies the level gravity inside the zone. -1 flips it. */
  gravityScale: number;
  label?: string;
}

/** Point mass pulling the ship radially - used for the finale. */
export interface WellSpec {
  x: number;
  y: number;
  strength: number;
  radius: number;
}

export interface LevelSpec {
  id: number;
  name: string;
  password: string;
  /** One line of teaching text shown on the level card. */
  hint: string;
  width: number;
  height: number;
  seed: number;
  /** Target completion time in seconds, before difficulty scaling. */
  par: number;
  gravity?: number;
  /** Starting fuel before difficulty scaling. Defaults to SHIP.maxFuel. */
  fuel?: number;
  /** If set, the cave is unlit and this is the ship's light radius in tiles. */
  dark?: number;
  spawn: Vec2;
  carve: Carve[];
  pads: PadSpec[];
  objects: ObjectSpec[];
  zones?: ZoneSpec[];
  wells?: WellSpec[];
}

export interface Level {
  spec: LevelSpec;
  width: number;
  height: number;
  /** Row-major, y = 0 is the bottom of the cave. */
  grid: Uint8Array;
  spawn: Vec2;
  par: number;
  gravity: number;
  dark: number;
  objects: ObjectSpec[];
  pads: PadSpec[];
  zones: ZoneSpec[];
  wells: WellSpec[];
}

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Two-octave value noise sampled on a lattice; returns roughly [-1, 1]. */
class ValueNoise {
  private readonly lattice: Float32Array;
  private readonly size: number;

  constructor(seed: number, size = 64) {
    this.size = size;
    const rnd = mulberry32(seed);
    this.lattice = new Float32Array(size * size);
    for (let i = 0; i < this.lattice.length; i++) this.lattice[i] = rnd() * 2 - 1;
  }

  private at(ix: number, iy: number): number {
    const s = this.size;
    return this.lattice[(((iy % s) + s) % s) * s + (((ix % s) + s) % s)];
  }

  private octave(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = this.at(x0, y0);
    const b = this.at(x0 + 1, y0);
    const c = this.at(x0, y0 + 1);
    const d = this.at(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  sample(x: number, y: number): number {
    return this.octave(x * 0.16, y * 0.16) * 0.68 + this.octave(x * 0.41, y * 0.41) * 0.32;
  }
}

// ---------------------------------------------------------------------------
// Signed distance helpers (negative = inside the carved space)
// ---------------------------------------------------------------------------

function sdBox(px: number, py: number, x: number, y: number, w: number, h: number): number {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = Math.abs(px - cx) - w / 2;
  const dy = Math.abs(py - cy) - h / 2;
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0);
}

function sdEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  // Cheap but monotone approximation - good enough to threshold against noise.
  return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry);
}

function sdSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return Math.hypot(wx - vx * t, wy - vy * t);
}

function carveDistance(c: Carve, px: number, py: number): number {
  switch (c.t) {
    case 'room':
      return sdBox(px, py, c.x, c.y, c.w, c.h);
    case 'cave':
      return sdEllipse(px, py, c.cx, c.cy, c.rx, c.ry);
    case 'tube': {
      let best = Infinity;
      for (let i = 0; i < c.pts.length - 1; i++) {
        const a = c.pts[i];
        const b = c.pts[i + 1];
        best = Math.min(best, sdSegment(px, py, a[0], a[1], b[0], b[1]) - c.r);
      }
      if (c.pts.length === 1) best = Math.hypot(px - c.pts[0][0], py - c.pts[0][1]) - c.r;
      return best;
    }
  }
}

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------

const BORDER = 2;

export function buildLevel(spec: LevelSpec): Level {
  const { width: w, height: h } = spec;
  const grid = new Uint8Array(w * h).fill(Tile.ROCK);
  const noise = new ValueNoise(spec.seed);

  // 1. Subtract the carve shapes, perturbed by the noise field.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let best = Infinity;
      let bestRough = 0;
      for (const c of spec.carve) {
        const d = carveDistance(c, px, py);
        if (d < best) {
          best = d;
          bestRough = c.rough ?? 0.55;
        }
      }
      if (best === Infinity) continue;
      const jitter = noise.sample(px, py) * bestRough;
      if (best + jitter < 0) grid[y * w + x] = Tile.EMPTY;
    }
  }

  // 2. Hard border so nothing can ever leave the map.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < BORDER || y < BORDER || x >= w - BORDER || y >= h - BORDER) {
        grid[y * w + x] = Tile.ROCK;
      }
    }
  }

  const set = (x: number, y: number, v: number) => {
    if (x < BORDER || y < BORDER || x >= w - BORDER || y >= h - BORDER) return;
    grid[y * w + x] = v;
  };

  // 3. Stamp pads: a solid landable lip, rock underneath, guaranteed headroom.
  const padTile: Record<PadKind, number> = {
    pad: Tile.PAD,
    base: Tile.BASE,
    fuel: Tile.FUEL,
  };
  for (const p of spec.pads) {
    for (let i = -1; i <= p.w; i++) {
      const x = p.x + i;
      // Clearance above so a pad is never buried by noise.
      for (let dy = 1; dy <= 4; dy++) set(x, p.y + dy, Tile.EMPTY);
      if (i < 0 || i >= p.w) continue;
      set(x, p.y, padTile[p.kind]);
      for (let dy = 1; dy <= 3; dy++) set(x, p.y - dy, Tile.ROCK);
    }
  }

  // 4. Stamp static lethal tiles.
  for (const o of spec.objects) {
    if (o.t !== 'spikes') continue;
    for (let yy = 0; yy < o.h; yy++) {
      for (let xx = 0; xx < o.w; xx++) set(o.x + xx, o.y + yy, Tile.SPIKE);
    }
  }

  // 5. Guarantee breathing room around the spawn point.
  const sx = Math.floor(spec.spawn.x);
  const sy = Math.floor(spec.spawn.y);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy > 6) continue;
      set(sx + dx, sy + dy, Tile.EMPTY);
    }
  }

  return {
    spec,
    width: w,
    height: h,
    grid,
    spawn: { ...spec.spawn },
    par: spec.par,
    gravity: spec.gravity ?? 9.0,
    dark: spec.dark ?? 0,
    objects: spec.objects,
    pads: spec.pads,
    zones: spec.zones ?? [],
    wells: spec.wells ?? [],
  };
}

export function tileAt(level: Level, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return Tile.ROCK;
  return level.grid[y * level.width + x];
}

export function isSolidTile(v: number): boolean {
  return v !== Tile.EMPTY;
}

// ---------------------------------------------------------------------------
// Validation - runs in the test suite so a broken level can never ship
// ---------------------------------------------------------------------------

/** Flood fill of open space starting at the spawn tile. */
export function reachableMask(level: Level): Uint8Array {
  const { width: w, height: h, grid } = level;
  const seen = new Uint8Array(w * h);
  const start = Math.floor(level.spawn.y) * w + Math.floor(level.spawn.x);
  if (grid[start] !== Tile.EMPTY) return seen;
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    const push = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const ni = ny * w + nx;
      if (seen[ni] || grid[ni] !== Tile.EMPTY) return;
      seen[ni] = 1;
      stack.push(ni);
    };
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return seen;
}

/** True if any open tile within `r` of (x,y) is reachable from the spawn. */
function nearReachable(level: Level, mask: Uint8Array, x: number, y: number, r = 2): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) continue;
      if (mask[ny * level.width + nx]) return true;
    }
  }
  return false;
}

/**
 * Structural checks. A level that fails any of these is unplayable, so the test
 * suite treats every returned string as a build failure.
 */
export function validateLevel(level: Level): string[] {
  const problems: string[] = [];
  const spec = level.spec;
  const mask = reachableMask(level);
  const open = mask.reduce((a, b) => a + b, 0);

  if (open < 200) problems.push(`spawn is walled in (only ${open} reachable tiles)`);

  const bases = spec.pads.filter((p) => p.kind === 'base');
  if (bases.length === 0) problems.push('no base pad');

  const cargo = spec.objects.filter((o) => o.t === 'cargo');
  if (cargo.length === 0) problems.push('no cargo');

  for (const p of spec.pads) {
    // Pads must be flown to, so the air directly above must be reachable.
    if (!nearReachable(level, mask, p.x + p.w / 2, p.y + 2, 3)) {
      problems.push(`${p.kind} pad at ${p.x},${p.y} is unreachable`);
    }
    if (p.w < 3) problems.push(`${p.kind} pad at ${p.x},${p.y} is narrower than 3 tiles`);
  }

  for (const o of spec.objects) {
    if (o.t === 'cargo' || o.t === 'key') {
      if (!nearReachable(level, mask, o.x, o.y, 3)) {
        problems.push(`${o.t} at ${o.x},${o.y} is unreachable`);
      }
    }
    if ('x' in o && (o.x < 1 || o.x >= level.width - 1 || o.y < 1 || o.y >= level.height - 1)) {
      problems.push(`${o.t} at ${o.x},${o.y} lies outside the map`);
    }
  }

  // Every gate colour needs a key, and vice versa.
  const gateColors = new Set(spec.objects.filter((o) => o.t === 'gate').map((o) => o.color));
  const keyColors = new Set(spec.objects.filter((o) => o.t === 'key').map((o) => o.color));
  for (const c of gateColors) if (!keyColors.has(c)) problems.push(`gate colour ${c} has no key`);
  for (const c of keyColors) if (!gateColors.has(c)) problems.push(`key colour ${c} opens nothing`);

  if (tileAt(level, Math.floor(level.spawn.x), Math.floor(level.spawn.y)) !== Tile.EMPTY) {
    problems.push('spawn tile is solid');
  }

  return problems;
}
