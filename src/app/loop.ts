/**
 * Fixed-timestep game loop with decoupled rendering.
 *
 * The simulation only ever advances in FIXED_DT slices, which is what makes
 * physics identical on a 60 Hz laptop and a 240 Hz monitor and what makes
 * input replays reproducible. Rendering happens once per animation frame and
 * interpolates by `alpha` so motion stays smooth between simulation steps.
 */

import { FIXED_DT, MAX_FRAME_TIME } from '../sim/config';

const MAX_STEPS = Math.ceil(MAX_FRAME_TIME / FIXED_DT);

export class FixedLoop {
  /**
   * Simulated seconds per real second. Below 1 the simulation runs at fixed dt
   * as always - there are simply fewer steps per real second, so per-step
   * determinism and the physics tuning are untouched.
   */
  timeScale = 1;

  private raf = 0;
  private last = 0;
  private accumulator = 0;
  private running = false;

  /** Wall-clock seconds spent inside step() over the last second, for the debug overlay. */
  simLoad = 0;
  fps = 0;
  private frames = 0;
  private fpsClock = 0;

  constructor(
    private readonly step: (dt: number) => void,
    private readonly draw: (alpha: number, simDt: number, realDt: number) => void,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);

      // Clamp: a backgrounded tab or a long GC pause must not make the
      // simulation try to catch up forever (the "spiral of death").
      const frameTime = Math.min((now - this.last) / 1000, MAX_FRAME_TIME);
      this.last = now;
      this.accumulator += frameTime * this.timeScale;

      const t0 = performance.now();
      let steps = 0;
      while (this.accumulator >= FIXED_DT) {
        this.step(FIXED_DT);
        this.accumulator -= FIXED_DT;
        // The frameTime clamp above is what prevents the spiral of death; this
        // is only a backstop against a pathological accumulator. It must be at
        // least MAX_FRAME_TIME/FIXED_DT or a slow renderer would silently run
        // the simulation in slow motion instead of just dropping frames.
        if (++steps >= MAX_STEPS) {
          this.accumulator = 0;
          break;
        }
      }
      this.simLoad = performance.now() - t0;

      // Views animate on simulated time so effects stay in step with the ship;
      // the raw frame time goes along separately for the quality heuristic,
      // which must measure real cost, not scaled cost.
      this.draw(this.accumulator / FIXED_DT, frameTime * this.timeScale, frameTime);

      this.frames++;
      this.fpsClock += frameTime;
      if (this.fpsClock >= 0.5) {
        this.fps = this.frames / this.fpsClock;
        this.frames = 0;
        this.fpsClock = 0;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
