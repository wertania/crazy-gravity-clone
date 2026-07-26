/**
 * Every moving thing: the hauler itself plus all level props.
 *
 * Meshes are built once per level and only their transforms and emissive
 * strengths change per frame, so the per-frame cost is bookkeeping rather than
 * allocation. Nothing here reads input or advances state - it is a pure view
 * over the simulation.
 */

import * as THREE from 'three';
import type { World } from '../sim/world';
import type { KeyColor } from '../sim/types';
import type { Particles } from './particles';

export const KEY_HEX: Record<KeyColor, number> = {
  red: 0xff4d6a,
  green: 0x4dffa0,
  blue: 0x4db4ff,
  amber: 0xffc44d,
};

const deg = (d: number) => (d * Math.PI) / 180;

/** Soft radial falloff used for halos and glows. */
function radialGlow(inner = 'rgba(255,255,255,0.95)'): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.28, 'rgba(255,255,255,0.34)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Ship
// ---------------------------------------------------------------------------

function hullShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.58);
  s.bezierCurveTo(0.2, 0.42, 0.3, 0.12, 0.3, -0.06);
  s.lineTo(0.46, -0.3);
  s.lineTo(0.18, -0.3);
  s.lineTo(0.12, -0.16);
  s.lineTo(-0.12, -0.16);
  s.lineTo(-0.18, -0.3);
  s.lineTo(-0.46, -0.3);
  s.lineTo(-0.3, -0.06);
  s.bezierCurveTo(-0.3, 0.12, -0.2, 0.42, 0, 0.58);
  return s;
}

export class ShipView {
  readonly group = new THREE.Group();
  private readonly flame: THREE.Mesh;
  private readonly flameMat: THREE.MeshBasicMaterial;
  private readonly canopy: THREE.Mesh;
  private readonly canopyMat: THREE.MeshStandardMaterial;
  private readonly hullMat: THREE.MeshStandardMaterial;
  private readonly glow: THREE.Sprite;
  private readonly disposables: { dispose(): void }[] = [];
  private flicker = 0;

  constructor() {
    const shape = hullShape();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.26,
      bevelEnabled: true,
      bevelSize: 0.045,
      bevelThickness: 0.05,
      bevelSegments: 2,
      curveSegments: 8,
    });
    geo.center();
    this.hullMat = new THREE.MeshStandardMaterial({
      color: 0xd7e3f2,
      roughness: 0.32,
      metalness: 0.72,
    });
    const hull = new THREE.Mesh(geo, this.hullMat);

    const canopyGeo = new THREE.SphereGeometry(0.15, 16, 12);
    this.canopyMat = new THREE.MeshStandardMaterial({
      color: 0x0d2b3a,
      emissive: 0x59e0ff,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.1,
    });
    this.canopy = new THREE.Mesh(canopyGeo, this.canopyMat);
    this.canopy.position.set(0, 0.14, 0.17);
    this.canopy.scale.set(1, 1.25, 0.7);

    const nozzleGeo = new THREE.CylinderGeometry(0.13, 0.19, 0.16, 12);
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x39434f,
      roughness: 0.55,
      metalness: 0.8,
    });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(0, -0.28, 0);

    const flameGeo = new THREE.ConeGeometry(0.17, 1, 12, 1, true);
    flameGeo.translate(0, -0.5, 0);
    this.flameMat = new THREE.MeshBasicMaterial({
      color: 0xffb15c,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.flame = new THREE.Mesh(flameGeo, this.flameMat);
    this.flame.position.set(0, -0.34, 0);
    this.flame.visible = false;

    // A SpriteMaterial with no map is a hard square, not a halo - the texture
    // is what makes this read as a glow at all.
    const glowTex = radialGlow();
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x6fd8ff,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.disposables.push(glowTex);
    this.glow = new THREE.Sprite(glowMat);
    this.glow.scale.setScalar(1.5);

    // A dark shell one size up, rendered back-face only, gives the hull a
    // read-at-a-glance silhouette against pale rock without any post pass.
    const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a1220, side: THREE.BackSide });
    const outline = new THREE.Mesh(geo, outlineMat);
    outline.scale.setScalar(1.16);
    this.disposables.push(outlineMat);

    this.group.add(outline, hull, this.canopy, nozzle, this.flame, this.glow);
    // Slightly larger than the collision hull: the ship has to be readable at a
    // glance, and a forgiving collider is better than a big one.
    this.group.scale.setScalar(1.18);
    this.group.position.z = 0.42;
    this.disposables.push(geo, this.hullMat, canopyGeo, this.canopyMat, nozzleGeo, nozzleMat, flameGeo, this.flameMat, glowMat);
  }

  update(world: World, x: number, y: number, angle: number, dt: number, particles: Particles) {
    const ship = world.ship;
    this.group.visible = ship.state !== 'dead';
    this.group.position.set(x, y, 0.42);
    this.group.rotation.z = angle;

    const thrusting = ship.thrusting;
    this.flame.visible = thrusting;
    if (thrusting) {
      // The plume length tracks the throttle, so an analog stick reads back.
      const power = 0.35 + ship.throttle * 0.65;
      this.flicker = this.flicker * 0.7 + Math.random() * 0.3;
      const len = (0.85 + this.flicker * 0.55) * power;
      this.flame.scale.set((1 + this.flicker * 0.18) * (0.7 + power * 0.3), len, 1);
      this.flameMat.opacity = (0.65 + this.flicker * 0.3) * power;

      // Exhaust particles are emitted in world space so they trail properly.
      const back = -angle;
      const ex = x + Math.sin(back) * -0.45;
      const ey = y - Math.cos(back) * 0.45;
      const dirx = Math.sin(angle);
      const diry = -Math.cos(angle);
      const puffs = ship.throttle > 0.55 ? 2 : 1;
      for (let i = 0; i < puffs; i++) {
        const spread = (Math.random() - 0.5) * 1.6;
        particles.spawn(
          ex,
          ey,
          0.35,
          dirx * (7 + Math.random() * 5) * power + -diry * spread + world.ship.vel.x * 0.25,
          diry * (7 + Math.random() * 5) * power + dirx * spread + world.ship.vel.y * 0.25,
          (Math.random() - 0.5) * 1.2,
          Math.random() < 0.35 ? 0xfff0c0 : 0xff8a3c,
          0.34 + Math.random() * 0.22,
          0.22 + Math.random() * 0.2,
          3.4,
        );
      }
    }

    // The canopy and the halo brighten with the flow multiplier - the meter is
    // readable from the ship itself, without looking at the HUD. Kept subtle at
    // rest: a permanent bright halo drowns out the hull it is supposed to
    // highlight, which is exactly what it used to do.
    const flow = world.flow / 100;
    this.canopyMat.emissiveIntensity = 0.8 + flow * 1.8;
    this.canopyMat.emissive.setHex(flow > 0.66 ? 0xc77dff : 0x59e0ff);
    this.glow.material.opacity = 0.1 + flow * 0.3;
    this.glow.scale.setScalar(1.5 + flow * 0.9);

    // Landing tolerance readout on the hull: warms up when you are too hot.
    const tint = world.landing === 'green' ? 0xdce8f6 : world.landing === 'yellow' ? 0xf2e2b4 : 0xf6bcc4;
    this.hullMat.color.lerp(new THREE.Color(tint), Math.min(1, dt * 8));
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Trackable {
  dispose(): void;
}

const BULLET_POOL = 96;

export class Props {
  readonly group = new THREE.Group();
  private readonly disposables: Trackable[] = [];

  private cargoMeshes: THREE.Group[] = [];
  private keyMeshes: THREE.Group[] = [];
  private gateMeshes: THREE.Mesh[] = [];
  private rodMeshes: THREE.Mesh[] = [];
  private sluiceMeshes: THREE.Mesh[] = [];
  private cannonMeshes: { root: THREE.Group; barrel: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
  private fieldMeshes: THREE.Object3D[] = [];
  private bullets!: THREE.InstancedMesh;
  private clock = 0;

  constructor(world: World) {
    this.buildCargo(world);
    this.buildKeys(world);
    this.buildGates(world);
    this.buildRods(world);
    this.buildSluices(world);
    this.buildCannons(world);
    this.buildFields(world);
    this.buildWells(world);
    this.buildZones(world);
    this.buildBullets();
  }

  private track<T extends Trackable>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private buildCargo(world: World) {
    const geo = this.track(new THREE.BoxGeometry(0.62, 0.62, 0.62));
    const ringGeo = this.track(new THREE.TorusGeometry(0.62, 0.045, 8, 24));
    for (let i = 0; i < world.cargo.length; i++) {
      const mat = this.track(
        new THREE.MeshStandardMaterial({
          color: 0x8a6a2a,
          emissive: 0xffb547,
          emissiveIntensity: 0.75,
          roughness: 0.5,
          metalness: 0.4,
        }),
      );
      const ringMat = this.track(
        new THREE.MeshBasicMaterial({
          color: 0xffc46a,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo, mat), new THREE.Mesh(ringGeo, ringMat));
      this.cargoMeshes.push(g);
      this.group.add(g);
    }
  }

  private buildKeys(world: World) {
    const geo = this.track(new THREE.OctahedronGeometry(0.34, 0));
    const haloGeo = this.track(new THREE.TorusGeometry(0.55, 0.035, 8, 24));
    for (const k of world.keys) {
      const hex = KEY_HEX[k.color];
      const mat = this.track(
        new THREE.MeshStandardMaterial({
          color: hex,
          emissive: hex,
          emissiveIntensity: 1.7,
          roughness: 0.25,
          metalness: 0.5,
        }),
      );
      const haloMat = this.track(
        new THREE.MeshBasicMaterial({
          color: hex,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo, mat), new THREE.Mesh(haloGeo, haloMat));
      g.position.set(k.pos.x, k.pos.y, 0.4);
      this.keyMeshes.push(g);
      this.group.add(g);
    }
  }

  private buildGates(world: World) {
    for (const gate of world.gates) {
      const hex = KEY_HEX[gate.color];
      const geo = this.track(new THREE.BoxGeometry(gate.box.w, gate.box.h, 1.1));
      const mat = this.track(
        new THREE.MeshStandardMaterial({
          color: hex,
          emissive: hex,
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.85,
          roughness: 0.2,
          metalness: 0.5,
        }),
      );
      const m = new THREE.Mesh(geo, mat);
      m.position.set(gate.box.x + gate.box.w / 2, gate.box.y + gate.box.h / 2, 0.1);
      this.gateMeshes.push(m);
      this.group.add(m);
    }
  }

  private buildRods(world: World) {
    for (const rod of world.rods) {
      const geo = this.track(new THREE.BoxGeometry(rod.base.w, rod.base.h, 1.25));
      const mat = this.track(
        new THREE.MeshStandardMaterial({
          color: 0x6a2530,
          emissive: 0xff5a3c,
          emissiveIntensity: 0.75,
          roughness: 0.45,
          metalness: 0.65,
        }),
      );
      const m = new THREE.Mesh(geo, mat);
      this.rodMeshes.push(m);
      this.group.add(m);
    }
  }

  private buildSluices(world: World) {
    for (const s of world.sluices) {
      const geo = this.track(new THREE.BoxGeometry(s.box.w, s.box.h, 1.0));
      const mat = this.track(
        new THREE.MeshStandardMaterial({
          color: 0x1d5566,
          emissive: 0x37d5ff,
          emissiveIntensity: 0.7,
          transparent: true,
          opacity: 0.6,
          roughness: 0.1,
          metalness: 0.2,
        }),
      );
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.box.x + s.box.w / 2, s.box.y + s.box.h / 2, 0.1);
      this.sluiceMeshes.push(m);
      this.group.add(m);

      // An arrow so the permitted direction is legible at a glance.
      const arrowGeo = this.track(new THREE.ConeGeometry(0.28, 0.7, 4));
      const arrowMat = this.track(
        new THREE.MeshBasicMaterial({
          color: 0x9ff0ff,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.set(s.box.x + s.box.w / 2, s.box.y + s.box.h / 2, 0.75);
      arrow.rotation.z = deg(s.dir) - Math.PI / 2;
      this.group.add(arrow);
    }
  }

  private buildCannons(world: World) {
    const baseGeo = this.track(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 10));
    baseGeo.rotateX(Math.PI / 2);
    const barrelGeo = this.track(new THREE.CylinderGeometry(0.15, 0.19, 0.9, 8));
    barrelGeo.translate(0, 0.45, 0);
    for (const c of world.cannons) {
      const mat = this.track(
        new THREE.MeshStandardMaterial({
          color: c.tracking ? 0x50324f : 0x3d4653,
          emissive: c.tracking ? 0xff5ad0 : 0xff8844,
          emissiveIntensity: 0.35,
          roughness: 0.5,
          metalness: 0.7,
        }),
      );
      const root = new THREE.Group();
      const barrel = new THREE.Mesh(barrelGeo, mat);
      root.add(new THREE.Mesh(baseGeo, mat), barrel);
      root.position.set(c.pos.x, c.pos.y, 0.25);
      this.cannonMeshes.push({ root, barrel, mat });
      this.group.add(root);
    }
  }

  private buildFields(world: World) {
    for (const f of world.fields) {
      if (f.kind === 'magnet') {
        const attract = f.strength > 0;
        const hex = attract ? 0x6a8cff : 0xff8a6a;
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const r = f.radius * (0.35 + i * 0.28);
          const geo = this.track(new THREE.TorusGeometry(r, 0.06, 8, 48));
          const mat = this.track(
            new THREE.MeshBasicMaterial({
              color: hex,
              transparent: true,
              opacity: 0.16 - i * 0.03,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          );
          g.add(new THREE.Mesh(geo, mat));
        }
        const coreGeo = this.track(new THREE.IcosahedronGeometry(0.55, 1));
        const coreMat = this.track(
          new THREE.MeshStandardMaterial({
            color: hex,
            emissive: hex,
            emissiveIntensity: 1.4,
            roughness: 0.3,
            metalness: 0.6,
          }),
        );
        g.add(new THREE.Mesh(coreGeo, coreMat));
        g.position.set(f.pos.x, f.pos.y, 0.3);
        g.userData.kind = 'magnet';
        g.userData.attract = attract;
        this.fieldMeshes.push(g);
        this.group.add(g);
      } else if (f.box) {
        // Blower volume: a translucent slab plus chevrons that stream along it.
        const geo = this.track(new THREE.BoxGeometry(f.box.w, f.box.h, 0.05));
        const mat = this.track(
          new THREE.MeshBasicMaterial({
            color: 0x3fd8ff,
            transparent: true,
            opacity: 0.055,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const slab = new THREE.Mesh(geo, mat);
        slab.position.set(f.box.x + f.box.w / 2, f.box.y + f.box.h / 2, -0.5);
        this.group.add(slab);

        const g = new THREE.Group();
        const chevGeo = this.track(new THREE.ConeGeometry(0.3, 0.55, 3));
        const chevMat = this.track(
          new THREE.MeshBasicMaterial({
            color: 0x8feaff,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        const count = Math.max(6, Math.round((f.box.w * f.box.h) / 22));
        for (let i = 0; i < count; i++) {
          const m = new THREE.Mesh(chevGeo, chevMat);
          m.rotation.z = deg(f.dir) - Math.PI / 2;
          m.userData.t = Math.random();
          m.userData.lane = Math.random();
          g.add(m);
        }
        g.userData.kind = 'fan';
        g.userData.box = f.box;
        g.userData.dir = f.dir;
        this.fieldMeshes.push(g);
        this.group.add(g);
      }
    }
  }

  private buildWells(world: World) {
    for (const well of world.wells) {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const geo = this.track(new THREE.TorusGeometry(well.radius * (0.3 + i * 0.24), 0.09, 8, 64));
        const mat = this.track(
          new THREE.MeshBasicMaterial({
            color: 0xb46cff,
            transparent: true,
            opacity: 0.2 - i * 0.035,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        g.add(new THREE.Mesh(geo, mat));
      }
      g.position.set(well.x, well.y, -0.3);
      g.userData.kind = 'well';
      this.fieldMeshes.push(g);
      this.group.add(g);
    }
  }

  private buildZones(world: World) {
    for (const z of world.level.zones) {
      if (z.gravityScale >= 0.999 && z.gravityScale <= 1.001) continue;
      const inverted = z.gravityScale < 0;
      const geo = this.track(new THREE.BoxGeometry(z.w, z.h, 0.05));
      const mat = this.track(
        new THREE.MeshBasicMaterial({
          color: inverted ? 0x9a5cff : 0xff9a5c,
          transparent: true,
          opacity: 0.07,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const m = new THREE.Mesh(geo, mat);
      m.position.set(z.x + z.w / 2, z.y + z.h / 2, -0.55);
      this.group.add(m);
    }
  }

  private buildBullets() {
    const geo = this.track(new THREE.SphereGeometry(0.2, 8, 6));
    const mat = this.track(
      new THREE.MeshBasicMaterial({ color: 0xffd08a, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.bullets = new THREE.InstancedMesh(geo, mat, BULLET_POOL);
    this.bullets.frustumCulled = false;
    this.bullets.count = 0;
    this.group.add(this.bullets);
  }

  update(world: World, dt: number, particles: Particles) {
    this.clock += dt;
    const t = this.clock;

    // Cargo: waiting crates bob in their stasis ring, carried ones tail the ship.
    for (let i = 0; i < world.cargo.length; i++) {
      const c = world.cargo[i];
      const g = this.cargoMeshes[i];
      if (c.state === 'delivered') {
        g.visible = false;
        continue;
      }
      g.visible = true;
      const carried = c.state === 'carried';
      const idx = world.ship.carrying.indexOf(c.id);
      const trail = carried ? 0.55 + idx * 0.42 : 0;
      const ang = world.ship.angle;
      g.position.set(
        c.pos.x + (carried ? Math.sin(ang) * trail : 0),
        c.pos.y - (carried ? Math.cos(ang) * trail : 0) + (carried ? 0 : Math.sin(t * 1.6 + c.phase) * 0.16),
        carried ? 0.35 : 0.35,
      );
      g.rotation.z = carried ? ang : Math.sin(t * 0.7 + c.phase) * 0.25;
      g.scale.setScalar(carried ? 0.72 : 1);
      const ring = g.children[1] as THREE.Mesh;
      ring.visible = !carried;
      ring.rotation.z = t * 0.9;
    }

    for (let i = 0; i < world.keys.length; i++) {
      const k = world.keys[i];
      const g = this.keyMeshes[i];
      g.visible = !k.taken;
      if (!k.taken) {
        g.rotation.y = t * 1.6;
        g.rotation.z = Math.sin(t * 1.1) * 0.3;
        g.position.z = 0.4 + Math.sin(t * 2 + i) * 0.12;
      }
    }

    for (let i = 0; i < world.gates.length; i++) {
      const gate = world.gates[i];
      const m = this.gateMeshes[i];
      const open = gate.openness;
      m.visible = open < 0.995;
      // Gates retract into their frame rather than fading out.
      if (gate.box.h >= gate.box.w) m.scale.set(1, 1 - open, 1);
      else m.scale.set(1 - open, 1, 1);
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.2;
    }

    for (let i = 0; i < world.rods.length; i++) {
      const rod = world.rods[i];
      const m = this.rodMeshes[i];
      m.position.set(rod.box.x + rod.box.w / 2, rod.box.y + rod.box.h / 2, 0.2);
    }

    for (let i = 0; i < world.sluices.length; i++) {
      const s = world.sluices[i];
      const mat = this.sluiceMeshes[i].material as THREE.MeshStandardMaterial;
      mat.opacity = s.passable ? 0.16 : 0.62;
      mat.emissiveIntensity = s.passable ? 1.5 : 0.6;
    }

    for (let i = 0; i < world.cannons.length; i++) {
      const c = world.cannons[i];
      const v = this.cannonMeshes[i];
      v.barrel.rotation.z = deg(c.dir) - Math.PI / 2;
      v.mat.emissiveIntensity = 0.3 + c.flash * 1.9;
      if (c.flash > 0.85) {
        const d = deg(c.dir);
        particles.burst(c.pos.x + Math.cos(d), c.pos.y + Math.sin(d), 4, 5, 0xffc88a, 0.3, 0.25);
      }
    }

    for (const f of this.fieldMeshes) {
      if (f.userData.kind === 'magnet') {
        const dir = f.userData.attract ? -1 : 1;
        f.children.forEach((c, i) => {
          if (i < 3) c.scale.setScalar(1 + Math.sin(t * 1.6 * dir + i * 0.9) * 0.08);
        });
        f.rotation.z = t * 0.25 * dir;
      } else if (f.userData.kind === 'fan') {
        const box = f.userData.box as { x: number; y: number; w: number; h: number };
        const d = deg(f.userData.dir as number);
        const dx = Math.cos(d);
        const dy = Math.sin(d);
        const span = Math.abs(dx) * box.w + Math.abs(dy) * box.h;
        for (const c of f.children) {
          c.userData.t = (c.userData.t + dt * 0.55) % 1;
          const along = (c.userData.t - 0.5) * span;
          const lane = (c.userData.lane - 0.5) * (Math.abs(dx) * box.h + Math.abs(dy) * box.w);
          const cx = box.x + box.w / 2 + dx * along - dy * lane;
          const cy = box.y + box.h / 2 + dy * along + dx * lane;
          c.position.set(cx, cy, -0.35);
        }
      } else if (f.userData.kind === 'well') {
        f.rotation.z = -t * 0.4;
        f.children.forEach((c, i) => c.scale.setScalar(1 + Math.sin(t * 2 - i * 0.7) * 0.05));
      }
    }

    const n = Math.min(BULLET_POOL, world.bullets.length);
    this.bullets.count = n;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const b = world.bullets[i];
      dummy.position.set(b.pos.x, b.pos.y, 0.4);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.bullets.setMatrixAt(i, dummy.matrix);
    }
    this.bullets.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.group.clear();
  }
}
