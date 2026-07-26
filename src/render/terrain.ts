/**
 * Static level geometry.
 *
 * The whole cave is four InstancedMeshes (rock, pads, spikes, plus a floor
 * plane), so a 140x82 level costs four draw calls no matter how convoluted it
 * is. Instance colours give the rock a hand-shaded look without a texture.
 */

import * as THREE from 'three';
import { Tile } from '../sim/types';
import type { Level } from '../sim/level';
import { WALL_DEPTH } from './scene';

const TMP = new THREE.Object3D();
const COLOR = new THREE.Color();

/**
 * How many tiles of rock to keep behind the cave wall. The camera's widest
 * grazing angle can see under one tile of overhang at the screen edge, so two
 * is a comfortable margin.
 */
const SHELL = 2;

/** Marks every solid tile within `radius` (Chebyshev) of an empty one. */
function nearOpenMask(level: Level, radius: number): Uint8Array {
  const { width: w, height: h, grid } = level;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] !== Tile.EMPTY) continue;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(h - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) mask[ny * w + nx] = 1;
      }
    }
  }
  return mask;
}

/** Deterministic hash so a level always shades identically. */
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Terrain {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(level: Level) {
    const solid: number[] = [];
    const pads: { i: number; tile: number }[] = [];
    const spikes: number[] = [];

    // Only rock within SHELL tiles of open space is ever visible: everything
    // deeper is hidden behind it, and the floor plane covers the hollow. On a
    // dense level this removes most of the instances for free.
    const near = nearOpenMask(level, SHELL);

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const i = y * level.width + x;
        const t = level.grid[i];
        if (t === Tile.EMPTY) continue;
        if (t === Tile.SPIKE) spikes.push(i);
        else if (t !== Tile.ROCK) pads.push({ i, tile: t });
        else if (near[i]) solid.push(i);
      }
    }

    this.group.add(this.buildFloor(level));
    if (solid.length) this.group.add(this.buildRock(level, solid));
    if (pads.length) this.group.add(...this.buildPads(level, pads));
    if (spikes.length) this.group.add(this.buildSpikes(level, spikes));
  }

  private track<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /**
   * The slab the caves are cut into.
   *
   * It is textured straight from the tile grid rather than being a flat colour:
   * rock cells get a solid slate tone and open cells a much darker one. That is
   * what lets us skip instancing the rock deeper than SHELL tiles - the mass
   * behind the cave wall still reads as solid rock instead of as empty void,
   * while cave floors read as pits below the walls.
   */
  private buildFloor(level: Level): THREE.Mesh {
    const { width: w, height: h } = level;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const solid = level.grid[i] !== Tile.EMPTY;
        const r = hash2(x, y, level.spec.seed + 31);
        // Deep rock: dark slate with grain. Cave floor: near-black, still lit
        // enough that the player can see the shape of the room they are in.
        const base = solid ? 40 + r * 15 : 27 + r * 11;
        data[i * 4] = base * 0.72;
        data[i * 4 + 1] = base * 0.86;
        data[i * 4 + 2] = base * 1.18;
        data[i * 4 + 3] = 255;
      }
    }
    const tex = this.track(new THREE.DataTexture(data, w, h, THREE.RGBAFormat));
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const geo = this.track(new THREE.PlaneGeometry(w, h, 1, 1));
    const mat = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(w / 2, h / 2, -WALL_DEPTH - 0.05);
    return mesh;
  }

  private buildRock(level: Level, cells: number[]): THREE.InstancedMesh {
    const geo = this.track(new THREE.BoxGeometry(1, 1, WALL_DEPTH));
    const mat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.06,
        vertexColors: false,
      }),
    );
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    for (let n = 0; n < cells.length; n++) {
      const i = cells[n];
      const x = i % level.width;
      const y = (i / level.width) | 0;
      const r = hash2(x, y, level.spec.seed);

      // Exposed tiles sit a touch proud and shade lighter: cheap edge relief.
      const exposed =
        level.grid[(y + 1) * level.width + x] === Tile.EMPTY ||
        level.grid[(y - 1) * level.width + x] === Tile.EMPTY ||
        level.grid[y * level.width + x + 1] === Tile.EMPTY ||
        level.grid[y * level.width + x - 1] === Tile.EMPTY;

      const lift = exposed ? 0.1 + r * 0.12 : -0.25 - r * 0.2;
      TMP.position.set(x + 0.5, y + 0.5, -WALL_DEPTH / 2 + lift);
      TMP.rotation.set(0, 0, 0);
      TMP.scale.set(1.001, 1.001, 1);
      TMP.updateMatrix();
      mesh.setMatrixAt(n, TMP.matrix);

      const base = exposed ? 0.3 : 0.16;
      COLOR.setHSL(0.58 + r * 0.045, 0.26 + r * 0.1, base + r * 0.09);
      mesh.setColorAt(n, COLOR);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private buildPads(level: Level, pads: { i: number; tile: number }[]): THREE.InstancedMesh[] {
    const kinds: { tile: number; color: number; emissive: number; intensity: number }[] = [
      { tile: Tile.BASE, color: 0x12395c, emissive: 0x38b6ff, intensity: 1.05 },
      { tile: Tile.FUEL, color: 0x0f3d24, emissive: 0x46e08a, intensity: 0.95 },
      { tile: Tile.PAD, color: 0x3a4454, emissive: 0x8fa4bd, intensity: 0.35 },
    ];
    const out: THREE.InstancedMesh[] = [];
    for (const kind of kinds) {
      const cells = pads.filter((p) => p.tile === kind.tile);
      if (!cells.length) continue;
      const geo = this.track(new THREE.BoxGeometry(1, 1, WALL_DEPTH + 0.18));
      const mat = this.track(
        new THREE.MeshStandardMaterial({
          color: kind.color,
          emissive: kind.emissive,
          emissiveIntensity: kind.intensity,
          roughness: 0.45,
          metalness: 0.35,
        }),
      );
      const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
      cells.forEach((c, n) => {
        const x = c.i % level.width;
        const y = (c.i / level.width) | 0;
        TMP.position.set(x + 0.5, y + 0.5, -(WALL_DEPTH + 0.18) / 2 + 0.09);
        TMP.rotation.set(0, 0, 0);
        TMP.scale.set(1, 1, 1);
        TMP.updateMatrix();
        mesh.setMatrixAt(n, TMP.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      out.push(mesh);
    }
    return out;
  }

  private buildSpikes(level: Level, cells: number[]): THREE.InstancedMesh {
    // Four-sided cones read as crystal shards and are unmistakably "do not touch".
    const geo = this.track(new THREE.ConeGeometry(0.62, 1.5, 4));
    geo.rotateX(Math.PI / 2);
    const mat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x5a1020,
        emissive: 0xff3355,
        emissiveIntensity: 1.1,
        roughness: 0.3,
        metalness: 0.2,
      }),
    );
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    cells.forEach((i, n) => {
      const x = i % level.width;
      const y = (i / level.width) | 0;
      const r = hash2(x, y, level.spec.seed + 7);
      TMP.position.set(x + 0.5, y + 0.5, -0.2);
      TMP.rotation.set(0, 0, r * Math.PI);
      TMP.scale.set(0.9 + r * 0.25, 0.9 + r * 0.25, 0.8 + r * 0.5);
      TMP.updateMatrix();
      mesh.setMatrixAt(n, TMP.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.clear();
  }
}
