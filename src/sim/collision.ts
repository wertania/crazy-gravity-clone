/**
 * Circle-vs-world collision.
 *
 * The hull is a circle and the cave is a tile grid, so every test reduces to
 * "closest point on an AABB". We always report the *deepest* contact rather
 * than the first one found - with a hull barely larger than a tile, corner
 * cases otherwise pick a misleading normal and the crash effect fires in the
 * wrong direction.
 */

import { Tile } from './types';
import { tileAt, type Level } from './level';

export interface Contact {
  /** Tile code that was hit, or Tile.ROCK for dynamic solids. */
  tile: number;
  /** Unit normal pointing from the obstacle towards the hull centre. */
  nx: number;
  ny: number;
  depth: number;
}

export interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

function circleVsBox(
  cx: number,
  cy: number,
  r: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): Contact | null {
  const qx = Math.max(bx, Math.min(cx, bx + bw));
  const qy = Math.max(by, Math.min(cy, by + bh));
  let dx = cx - qx;
  let dy = cy - qy;
  let d = Math.hypot(dx, dy);
  if (d >= r) return null;
  if (d < 1e-6) {
    // Centre is inside the box: push out along the shallowest face.
    const left = cx - bx;
    const right = bx + bw - cx;
    const down = cy - by;
    const up = by + bh - cy;
    const m = Math.min(left, right, down, up);
    if (m === left) {
      dx = -1;
      dy = 0;
    } else if (m === right) {
      dx = 1;
      dy = 0;
    } else if (m === down) {
      dx = 0;
      dy = -1;
    } else {
      dx = 0;
      dy = 1;
    }
    d = 0;
    return { tile: Tile.ROCK, nx: dx, ny: dy, depth: r + m };
  }
  return { tile: Tile.ROCK, nx: dx / d, ny: dy / d, depth: r - d };
}

/** Deepest overlap between the hull and the static tile grid. */
export function circleVsGrid(level: Level, cx: number, cy: number, r: number): Contact | null {
  const x0 = Math.floor(cx - r);
  const x1 = Math.floor(cx + r);
  const y0 = Math.floor(cy - r);
  const y1 = Math.floor(cy + r);
  let best: Contact | null = null;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = tileAt(level, x, y);
      if (t === Tile.EMPTY) continue;
      const c = circleVsBox(cx, cy, r, x, y, 1, 1);
      if (!c) continue;
      c.tile = t;
      if (!best || c.depth > best.depth) best = c;
    }
  }
  return best;
}

export function circleVsAabb(cx: number, cy: number, r: number, box: Aabb): Contact | null {
  return circleVsBox(cx, cy, r, box.x, box.y, box.w, box.h);
}

/**
 * Distance from the hull surface to the nearest solid tile, capped at `maxRange`.
 * Feeds the Flow meter, so it only needs to be accurate close in.
 */
export function wallProximity(
  level: Level,
  cx: number,
  cy: number,
  r: number,
  maxRange: number,
): number {
  const reach = r + maxRange;
  const x0 = Math.floor(cx - reach);
  const x1 = Math.floor(cx + reach);
  const y0 = Math.floor(cy - reach);
  const y1 = Math.floor(cy + reach);
  let best = maxRange;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (tileAt(level, x, y) === Tile.EMPTY) continue;
      const qx = Math.max(x, Math.min(cx, x + 1));
      const qy = Math.max(y, Math.min(cy, y + 1));
      const d = Math.hypot(cx - qx, cy - qy) - r;
      if (d < best) best = Math.max(0, d);
    }
  }
  return best;
}

/** Sub-step count that keeps a moving hull from skipping past a 1-tile wall. */
export function subStepsFor(speed: number, dt: number, r: number): number {
  const travel = speed * dt;
  return Math.max(1, Math.min(16, Math.ceil(travel / Math.max(0.2, r * 0.8))));
}
