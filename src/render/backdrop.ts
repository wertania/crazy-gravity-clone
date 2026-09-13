/**
 * Parallax depth behind the cave.
 *
 * The 1996 original advertised parallax scrolling as a feature; here it falls
 * out of the perspective camera for free. Layers are placed at different depths
 * inside a group that trails the camera, so nearer dust slides past faster than
 * the far haze without any per-layer scroll maths.
 */

import * as THREE from 'three';
import { NEBULA_SPAN_X, NEBULA_SPAN_Y, nebulaField } from './textures';

/**
 * Depth of the nebula sheet. Far enough behind the dust layers to sit clearly
 * underneath them, well inside the camera's 240-unit far plane.
 */
const NEBULA_Z = -58;

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

function haze(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(120,180,255,0.5)');
  grad.addColorStop(0.5, 'rgba(70,110,190,0.16)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Backdrop {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly drifters: THREE.Points[] = [];

  constructor(seed: number, spanX: number, spanY: number, dark = 0) {
    const rnd = mulberry32(seed);
    const tex = haze();
    this.disposables.push(tex);

    this.buildNebula(spanX, spanY, dark);

    // Three dust layers at increasing depth.
    const layers = [
      { z: -14, count: 260, size: 0.42, color: 0x9fd0ff, opacity: 0.55 },
      { z: -26, count: 220, size: 0.75, color: 0x6f9ad8, opacity: 0.4 },
      { z: -44, count: 180, size: 1.6, color: 0x4a63a8, opacity: 0.3 },
    ];

    for (const layer of layers) {
      const pos = new Float32Array(layer.count * 3);
      // Cover well beyond the level so the parallax offset never runs out.
      const w = spanX * 2.4;
      const h = spanY * 2.4;
      for (let i = 0; i < layer.count; i++) {
        pos[i * 3] = (rnd() - 0.5) * w + spanX / 2;
        pos[i * 3 + 1] = (rnd() - 0.5) * h + spanY / 2;
        pos[i * 3 + 2] = layer.z - rnd() * 6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: layer.color,
        size: layer.size,
        map: tex,
        transparent: true,
        opacity: layer.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        fog: false,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      this.disposables.push(geo, mat);
      this.drifters.push(points);
      this.group.add(points);
    }

    // A couple of slow nebula blooms for colour variation.
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: new THREE.Color().setHSL(0.55 + rnd() * 0.22, 0.5, 0.4),
        transparent: true,
        opacity: 0.1 + rnd() * 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const s = new THREE.Sprite(mat);
      s.position.set(
        (rnd() - 0.5) * spanX * 2 + spanX / 2,
        (rnd() - 0.5) * spanY * 2 + spanY / 2,
        -34 - rnd() * 20,
      );
      s.scale.setScalar(28 + rnd() * 46);
      this.disposables.push(mat);
      this.group.add(s);
    }
  }

  /**
   * A single sheet of nebula behind the dust.
   *
   * One quad, no lighting, drawn first: it costs a draw call and 15 kB and it
   * is what stops the void reading as a flat black fill. The sheet is sized
   * well past the level so the 0.28 of camera motion that the parallax group
   * does *not* absorb can never drag its edge into view, and the texture
   * repeats at a fixed scale in tiles so a wide cave does not stretch it.
   */
  private buildNebula(spanX: number, spanY: number, dark: number) {
    const map = nebulaField();
    if (!map) return;

    const w = Math.max(spanX * 2.4, 320);
    const h = Math.max(spanY * 2.4, 240);

    // Cloned so the repeat below belongs to this level and not to every level
    // that shares the cached texture.
    const tex = this.track(map.clone());
    tex.needsUpdate = true;
    tex.repeat.set(w / NEBULA_SPAN_X, h / NEBULA_SPAN_Y);

    const geo = this.track(new THREE.PlaneGeometry(w, h, 1, 1));
    const mat = this.track(
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        // Unlit levels dim the cave to the ship's lamp and nothing else, so an
        // unlit backdrop would be the brightest thing on screen and hand the
        // player exactly the orientation the level is built to withhold.
        opacity: dark > 0 ? 0.1 : 0.85,
        depthWrite: false,
        fog: false,
      }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(spanX / 2, spanY / 2, NEBULA_Z);
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  private track<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  update(dt: number) {
    // Barely-there drift keeps the background from looking like a static decal.
    for (let i = 0; i < this.drifters.length; i++) {
      this.drifters[i].rotation.z += dt * 0.0035 * (i + 1);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.clear();
  }
}
