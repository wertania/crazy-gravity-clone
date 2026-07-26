/**
 * One pooled additive point cloud for every spark in the game: exhaust,
 * explosions, pad dust, pickup bursts. A single Points object means the whole
 * effects budget is one draw call and there is nothing to allocate at runtime.
 */

import * as THREE from 'three';

const MAX = 3000;

function sprite(): THREE.Texture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Particles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly siz: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly drag: Float32Array;
  private readonly baseSize: Float32Array;
  private cursor = 0;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.PointsMaterial;
  private readonly tex: THREE.Texture;

  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.siz = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1));
    // Parked particles sit at the origin with size 0; keep them off-screen too.
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 2] = -999;

    this.tex = sprite();
    this.mat = new THREE.PointsMaterial({
      size: 0.5,
      map: this.tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    // Per-particle size: patch the built-in material rather than writing a
    // whole shader, so lighting and fog behaviour stay stock. The attribute
    // cannot be called `size` - PointsMaterial already declares that as a
    // uniform and the shader fails to compile with a redefinition error.
    this.mat.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute float aSize;\n${shader.vertexShader}`.replace(
        'gl_PointSize = size;',
        'gl_PointSize = aSize;',
      );
    };

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  /** Spawn one particle. Oldest slots are recycled silently when full. */
  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.ColorRepresentation,
    size: number,
    life: number,
    drag = 1.6,
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    const c = new THREE.Color(color);
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.baseSize[i] = size;
    this.siz[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
  }

  burst(
    x: number,
    y: number,
    count: number,
    speed: number,
    color: THREE.ColorRepresentation,
    size = 0.35,
    life = 0.7,
  ) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.25 + Math.random() * 0.95);
      this.spawn(
        x,
        y,
        0.2 + Math.random() * 0.3,
        Math.cos(a) * s,
        Math.sin(a) * s,
        (Math.random() - 0.5) * s * 0.4,
        color,
        size * (0.6 + Math.random() * 0.8),
        life * (0.6 + Math.random() * 0.8),
      );
    }
  }

  update(dt: number) {
    const { pos, vel, life, maxLife, siz, baseSize, drag, col } = this;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        siz[i] = 0;
        pos[i * 3 + 2] = -999;
        continue;
      }
      const d = Math.exp(-drag[i] * dt);
      vel[i * 3] *= d;
      vel[i * 3 + 1] *= d;
      vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = life[i] / maxLife[i];
      siz[i] = baseSize[i] * t;
      // Fade by dimming the colour: additive blending has no alpha to fade.
      const f = t * t;
      col[i * 3] *= 1 - (1 - f) * dt * 2.2;
      col[i * 3 + 1] *= 1 - (1 - f) * dt * 2.4;
      col[i * 3 + 2] *= 1 - (1 - f) * dt * 2.0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < MAX; i++) {
      this.life[i] = 0;
      this.siz[i] = 0;
      this.pos[i * 3 + 2] = -999;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
