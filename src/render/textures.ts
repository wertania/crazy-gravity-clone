/**
 * The renderer's only bitmap assets.
 *
 * Everything else here is generated at runtime - the audio has no samples, the
 * particles are procedural, the rock mass behind the cave wall is painted
 * straight from the tile grid. These two are images because noise is the one
 * thing a reasonable amount of code does not produce convincingly: hand-written
 * value noise reads as static rather than as stone, and a coded nebula reads as
 * a blurry blob.
 *
 * Both are imported through Vite rather than dropped in `public/`, so they land
 * in `dist/assets/` under a content hash and inherit the year-long immutable
 * cache the nginx config grants that directory. Together they are under 100 kB.
 *
 * Loading is best-effort. `preloadTextures` is awaited by the boot screen, but
 * if it fails - offline, a blocked request, a browser without WebP - the
 * getters return null and both renderers fall back to the flat-shaded look they
 * had before. A missing decoration must never cost anyone the game.
 */

import * as THREE from 'three';
import rockUrl from './textures/rock-grain.webp?url';
import nebulaUrl from './textures/nebula.webp?url';

/**
 * Rock crops per axis in the albedo atlas.
 *
 * The rock is one InstancedMesh, so every tile shares one geometry and one set
 * of UVs; mapping the whole texture onto each tile would squeeze 512 px into
 * the ~26 px a tile covers on screen and paint every tile identically. Instead
 * the texture is treated as a 4x4 grid of independent crops and each tile picks
 * one, which gives 16 distinct rock faces out of a single 81 kB image. Four
 * rather than eight per axis keeps each crop at 128 px, so mip levels stay
 * clean enough that neighbouring crops do not bleed into one another.
 */
export const ROCK_ATLAS = 4;

/**
 * What the rock material must multiply back out to undo the grain map's bias.
 *
 * The map is a *multiplier*, not an albedo: the rock's colour comes from the
 * per-instance colours, and `map` only carves grain and cracks into it. An
 * ideal multiplier averages 1.0, which an 8-bit texture cannot do without
 * clipping every highlight, so the map is baked to an average of 0.72 in linear
 * light and the material carries the reciprocal. Ship a rebaked map with a
 * different average and this constant has to move with it, or the whole cave
 * changes brightness.
 */
export const ROCK_GRAIN_MEAN = 0.72;
export const ROCK_GRAIN_GAIN = 1 / ROCK_GRAIN_MEAN;

/** One nebula copy spans this much of the world, in tiles. Wraps beyond it. */
export const NEBULA_SPAN_X = 160;
export const NEBULA_SPAN_Y = 63;

let rockTex: THREE.Texture | null = null;
let nebulaTex: THREE.Texture | null = null;
let pending: Promise<void> | null = null;

function load(url: string, configure: (tex: THREE.Texture) => void) {
  return new Promise<THREE.Texture | null>((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        configure(tex);
        resolve(tex);
      },
      undefined,
      // Resolve rather than reject: a failed decoration is not a failed boot.
      () => resolve(null),
    );
  });
}

/**
 * Fetch and decode both textures. Safe to call more than once - the second
 * caller awaits the first one's work instead of loading again.
 */
export function preloadTextures(): Promise<void> {
  pending ??= Promise.all([
    load(rockUrl, (tex) => {
      // Atlas: clamp so a crop cannot sample its neighbour, and pre-shrink the
      // UV transform to one cell. Terrain adds the per-instance cell offset.
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.setScalar(1 / ROCK_ATLAS);
      tex.anisotropy = 4;
    }),
    load(nebulaUrl, (tex) => {
      // Seamless on both axes, so it can simply repeat across a wide level.
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    }),
  ]).then(([rock, nebula]) => {
    rockTex = rock;
    nebulaTex = nebula;
  });
  return pending;
}

/** The rock grain atlas, or null if it never loaded. */
export const rockGrain = () => rockTex;

/** The parallax nebula field, or null if it never loaded. */
export const nebulaField = () => nebulaTex;
