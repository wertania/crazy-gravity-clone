/**
 * On-screen flight controls for touch devices.
 *
 * Two analog sliders, because the two axes of this game are genuinely analog:
 *
 * - **Steering** (bottom left, horizontal). The knob springs back to centre on
 *   release, so letting go stops the turn rather than leaving the ship spinning.
 * - **Throttle** (bottom right, vertical). Drag up for power. Analog throttle is
 *   the reason this works at all on a touchscreen: with an on/off button you
 *   cannot hold a hover, and hovering is most of the game. Hover sits at roughly
 *   a third of the travel, which leaves usable resolution on both sides of it.
 *
 * Both use pointer capture per element, so two thumbs work simultaneously and a
 * finger that slides off the widget keeps controlling it.
 */

export interface TouchState {
  turn: number;
  throttle: number;
  levelOut: boolean;
}

/** How fast the steering knob springs back to centre, in units per second. */
const RECENTRE_RATE = 6;
/** Throttle decay per second once the thumb lifts, so the engine eases off. */
const THROTTLE_RELEASE_RATE = 5;

export class TouchControls {
  readonly root: HTMLElement;
  private readonly steerTrack: HTMLElement;
  private readonly steerKnob: HTMLElement;
  private readonly throttleTrack: HTMLElement;
  private readonly throttleKnob: HTMLElement;
  private readonly throttleFill: HTMLElement;
  private readonly levelBtn: HTMLElement;
  private readonly pauseBtn: HTMLElement;

  private turn = 0;
  private throttle = 0;
  private levelOut = false;
  private steerPointer: number | null = null;
  private throttlePointer: number | null = null;
  private mounted = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly onPause: () => void,
    doc: Document = document,
  ) {
    this.root = doc.createElement('div');
    this.root.className = 'touch';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="touch-steer" role="slider" aria-label="Steering" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0">
        <div class="touch-track"><span class="touch-centre"></span><i class="touch-knob"></i></div>
        <span class="touch-label">◄ TURN ►</span>
      </div>
      <div class="touch-mid">
        <button class="touch-btn" data-role="level" type="button" aria-label="Auto-level assist">LEVEL</button>
        <button class="touch-btn" data-role="pause" type="button" aria-label="Pause">II</button>
      </div>
      <div class="touch-throttle" role="slider" aria-label="Throttle" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="touch-vtrack"><b class="touch-fill"></b><i class="touch-knob"></i></div>
        <span class="touch-label">THRUST</span>
      </div>`;

    this.steerTrack = this.root.querySelector('.touch-steer .touch-track')!;
    this.steerKnob = this.root.querySelector('.touch-steer .touch-knob')!;
    this.throttleTrack = this.root.querySelector('.touch-throttle .touch-vtrack')!;
    this.throttleKnob = this.root.querySelector('.touch-throttle .touch-knob')!;
    this.throttleFill = this.root.querySelector('.touch-fill')!;
    this.levelBtn = this.root.querySelector('[data-role="level"]')!;
    this.pauseBtn = this.root.querySelector('[data-role="pause"]')!;

    this.wireSteering();
    this.wireThrottle();
    this.wireButtons();
    doc.body.appendChild(this.root);
    this.observeHeight();
    this.paint();
  }

  /**
   * Publish the widget height as a CSS variable so the HUD can sit clear of it.
   * Guessing a margin does not survive an orientation change; measuring does.
   */
  private observeHeight() {
    const publish = () => {
      const h = this.mounted ? this.root.offsetHeight : 0;
      document.body.style.setProperty('--touch-h', `${h}px`);
    };
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(publish);
      this.resizeObserver.observe(this.root);
    }
    window.addEventListener('resize', publish);
    publish();
  }

  /** True when the device looks like a touchscreen. */
  static deviceHasTouch(): boolean {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    return coarse || navigator.maxTouchPoints > 0;
  }

  setVisible(v: boolean) {
    if (v === this.mounted) return;
    this.mounted = v;
    this.root.hidden = !v;
    document.body.classList.toggle('has-touch-controls', v);
    document.body.style.setProperty('--touch-h', v ? `${this.root.offsetHeight}px` : '0px');
    if (!v) this.reset();
  }

  get visible() {
    return this.mounted;
  }

  state(): TouchState {
    return { turn: this.turn, throttle: this.throttle, levelOut: this.levelOut };
  }

  reset() {
    this.turn = 0;
    this.throttle = 0;
    this.levelOut = false;
    this.steerPointer = null;
    this.throttlePointer = null;
    this.levelBtn.classList.remove('held');
    this.paint();
  }

  /** Spring the knobs back when nothing is holding them. */
  update(dt: number) {
    if (!this.mounted) return;
    let changed = false;
    if (this.steerPointer === null && this.turn !== 0) {
      const step = RECENTRE_RATE * dt;
      this.turn = Math.abs(this.turn) <= step ? 0 : this.turn - Math.sign(this.turn) * step;
      changed = true;
    }
    if (this.throttlePointer === null && this.throttle > 0) {
      this.throttle = Math.max(0, this.throttle - THROTTLE_RELEASE_RATE * dt);
      changed = true;
    }
    if (changed) this.paint();
  }

  private wireSteering() {
    const el = this.steerTrack;
    const read = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const t = (e.clientX - r.left) / Math.max(1, r.width);
      // A small dead zone in the middle stops a resting thumb from drifting.
      const raw = Math.max(-1, Math.min(1, t * 2 - 1));
      this.turn = Math.abs(raw) < 0.06 ? 0 : -raw; // right on screen = clockwise
      this.paint();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.steerPointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      read(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.steerPointer !== e.pointerId) return;
      read(e);
    });
    const end = (e: PointerEvent) => {
      if (this.steerPointer !== e.pointerId) return;
      this.steerPointer = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private wireThrottle() {
    const el = this.throttleTrack;
    const read = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      // Track runs bottom (0) to top (1).
      const t = 1 - (e.clientY - r.top) / Math.max(1, r.height);
      this.throttle = Math.max(0, Math.min(1, t));
      this.paint();
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.throttlePointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      read(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.throttlePointer !== e.pointerId) return;
      read(e);
    });
    const end = (e: PointerEvent) => {
      if (this.throttlePointer !== e.pointerId) return;
      this.throttlePointer = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private wireButtons() {
    const hold = (on: boolean) => {
      this.levelOut = on;
      this.levelBtn.classList.toggle('held', on);
    };
    this.levelBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      hold(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      this.levelBtn.addEventListener(ev, () => hold(false));
    }
    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onPause();
    });
  }

  private paint() {
    // -1..1 maps to the full track width; the knob is translated, not re-laid-out.
    this.steerKnob.style.transform = `translate(calc(-50% + ${(-this.turn * 50).toFixed(2)}%), -50%)`;
    this.steerTrack.parentElement?.setAttribute('aria-valuenow', this.turn.toFixed(2));
    const pct = this.throttle * 100;
    this.throttleKnob.style.transform = `translate(-50%, calc(50% - ${pct.toFixed(1)}%))`;
    this.throttleFill.style.height = `${pct.toFixed(1)}%`;
    this.throttleTrack.parentElement?.setAttribute('aria-valuenow', Math.round(pct).toString());
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.root.remove();
    document.body.classList.remove('has-touch-controls');
    document.body.style.removeProperty('--touch-h');
  }
}
