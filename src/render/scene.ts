/**
 * Renderer, camera rig and post-processing.
 *
 * The cave is a 2D playfield rendered as a 3D relief: solid tiles are boxes
 * extruded *towards* the camera and open space is the dark floor between them.
 * A perspective camera (rather than an orthographic one) is deliberate - the
 * slight parallax on the wall flanks near the screen edge is what makes a tile
 * grid read as a cavern.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Height of the visible playfield in tiles. Widescreen shows more sideways. */
export const VIEW_TILES_Y = 27;
/**
 * Never frame less than this many tiles horizontally. A portrait phone cannot
 * honour the wide figure without zooming out far enough to shrink the ship to a
 * speck, so narrow aspects get a lower bar and accept a tighter view.
 */
export const MIN_TILES_X = 26;
export const MIN_TILES_X_NARROW = 18;
/** Z of the gameplay plane. Wall tops sit here; the cave floor is below. */
export const PLANE_Z = 0;
export const WALL_DEPTH = 1.7;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Everything that scrolls with the level. */
  readonly world = new THREE.Group();
  /** Parallax layers, positioned as a fraction of the camera offset. */
  readonly farField = new THREE.Group();

  readonly keyLight: THREE.DirectionalLight;
  readonly ambient: THREE.AmbientLight;
  readonly lamp: THREE.PointLight;

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private width = 1;
  private height = 1;
  private quality: 0 | 1 | 2 = 2;

  /** Camera focus in world units, driven by the game each frame. */
  private focus = new THREE.Vector2();
  private shakeOffset = new THREE.Vector2();
  private shakeSeed = Math.random() * 1000;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(0x04060c);
    // No fog: the whole playfield sits within ~2 units of depth, so distance
    // fog cannot separate anything. Unlit levels are done with light falloff
    // instead, which is both cheaper and actually controllable.

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 240);
    this.scene.add(this.world, this.farField);

    this.ambient = new THREE.AmbientLight(0x35496a, 1.5);
    this.keyLight = new THREE.DirectionalLight(0xcfe4ff, 2.0);
    this.keyLight.position.set(-0.35, 0.7, 1);
    // The ship's own lamp: a warm pool that follows the hull, and the only
    // light source at all on unlit levels.
    this.lamp = new THREE.PointLight(0x9fe6ff, 60, 18, 1.5);
    this.scene.add(this.ambient, this.keyLight, this.lamp);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.composer.dispose();
    this.renderer.dispose();
  }

  private resize = () => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /**
   * Camera distance for the current window and level.
   *
   * Three competing demands, resolved in order:
   *  1. show VIEW_TILES_Y tiles vertically;
   *  2. never show less than MIN_TILES_X horizontally, so a narrow window still
   *     lets you see what you are flying into;
   *  3. never frame more than the level actually contains, or the player gets
   *     black bands past the rock border - which is what a portrait phone hit.
   */
  private cameraDistance(zoom: number, bounds: { w: number; h: number }): number {
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const aspect = this.camera.aspect;

    const minX = aspect < 0.8 ? MIN_TILES_X_NARROW : MIN_TILES_X;
    let halfH = (VIEW_TILES_Y * zoom) / 2;
    halfH = Math.max(halfH, minX / 2 / aspect);
    halfH = Math.min(halfH, Math.max(6, bounds.h / 2), Math.max(6, bounds.w / 2 / aspect));

    return halfH / Math.tan(fovRad / 2);
  }

  /**
   * Aim the camera. `bounds` clamps the view inside the level so the player
   * never sees the void past the rock border.
   */
  aim(
    x: number,
    y: number,
    bounds: { w: number; h: number },
    shake: number,
    zoom: number,
    dt: number,
  ) {
    const dist = this.cameraDistance(zoom, bounds);
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const halfH = Math.tan(fovRad / 2) * dist;
    const halfW = halfH * this.camera.aspect;

    const cx = bounds.w <= halfW * 2 ? bounds.w / 2 : Math.min(Math.max(x, halfW), bounds.w - halfW);
    const cy = bounds.h <= halfH * 2 ? bounds.h / 2 : Math.min(Math.max(y, halfH), bounds.h - halfH);

    // Critically damped follow: snappy but never jittery.
    const k = 1 - Math.exp(-dt * 14);
    this.focus.x += (cx - this.focus.x) * k;
    this.focus.y += (cy - this.focus.y) * k;

    if (shake > 0.001) {
      this.shakeSeed += dt * 47;
      const s = shake * shake * 1.4;
      this.shakeOffset.set(
        Math.sin(this.shakeSeed * 1.7) * s + Math.sin(this.shakeSeed * 5.3) * s * 0.4,
        Math.cos(this.shakeSeed * 2.1) * s + Math.cos(this.shakeSeed * 6.1) * s * 0.4,
      );
    } else {
      this.shakeOffset.multiplyScalar(0.85);
    }

    this.camera.position.set(
      this.focus.x + this.shakeOffset.x,
      this.focus.y + this.shakeOffset.y,
      dist,
    );
    this.camera.lookAt(this.focus.x + this.shakeOffset.x, this.focus.y + this.shakeOffset.y, 0);

    // Parallax: background layers follow at a fraction of the camera motion.
    this.farField.position.set(this.focus.x * 0.72, this.focus.y * 0.72, 0);
  }

  snapTo(x: number, y: number) {
    this.focus.set(x, y);
  }

  /** Unlit levels: dim the global lights right down and widen the ship's lamp. */
  setDarkness(radius: number) {
    const dark = radius > 0;
    this.ambient.intensity = dark ? 0.16 : 1.5;
    this.keyLight.intensity = dark ? 0.12 : 2.0;
    this.lamp.intensity = dark ? radius * radius * 0.75 : 60;
    this.lamp.distance = dark ? radius * 1.6 : 18;
    this.lamp.decay = dark ? 1.25 : 1.5;
  }

  setBloom(strength: number) {
    this.bloom.strength = strength;
  }

  /**
   * Quality tiers, stepped down automatically when frames get expensive.
   * 2 = bloom at full device pixel ratio, 1 = no bloom, 0 = no bloom and a
   * reduced buffer. Software renderers and integrated GPUs land on 1 or 0;
   * the game stays entirely playable there, it just stops glowing.
   */
  setQuality(level: 0 | 1 | 2) {
    if (level === this.quality) return;
    this.quality = level;
    this.bloom.enabled = level >= 2;
    const dpr = level >= 2 ? Math.min(window.devicePixelRatio, 2) : level === 1 ? 1 : 0.55;
    this.renderer.setPixelRatio(dpr);
    this.resize();
  }

  get qualityLevel() {
    return this.quality;
  }

  render() {
    this.composer.render();
  }

  get size() {
    return { w: this.width, h: this.height };
  }
}
