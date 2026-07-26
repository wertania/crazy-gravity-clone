/**
 * On-screen flight controls for touch devices.
 *
 * Two paddles, each a *gesture zone* with a slider drawn inside it:
 *
 * - **Steering** (left half of the lower screen). Drag sideways; the further
 *   from where you pressed, the harder the turn. Springs back to zero on
 *   release, so letting go stops the turn rather than leaving the ship spinning.
 * - **Throttle** (right half). Drag upwards for power.
 *
 * Two deliberate decisions, both from the first version being unpleasant to use:
 *
 * 1. **The hit area is the whole half of the lower screen, not the drawn
 *    slider.** The visible track is an indicator. A thumb that lands next to a
 *    52-pixel-wide track and swipes up should not silently do nothing, and in
 *    the first version that is exactly what happened.
 * 2. **The mapping is relative, not absolute.** Value comes from how far you
 *    have dragged since pressing, not from where your thumb is on screen. You
 *    can start anywhere and push; there is no invisible origin to find first,
 *    and the resting state is always "engine off". Drag distance for the full
 *    range equals the length of the drawn track, so the knob tracks your thumb
 *    one-to-one.
 *
 * Each zone captures its own pointer, so two thumbs work simultaneously and a
 * finger that wanders outside its zone keeps control of it.
 */

export interface TouchState {
  turn: number;
  throttle: number;
  levelOut: boolean;
}

/** How fast the steering value springs back to centre, in units per second. */
const RECENTRE_RATE = 6;
/** Throttle decay per second once the thumb lifts, so the engine eases off. */
const THROTTLE_RELEASE_RATE = 5;
/** Smallest usable drag distance, in case a track renders tiny. */
const MIN_TRAVEL_PX = 60;

interface Paddle {
  zone: HTMLElement;
  track: HTMLElement;
  knob: HTMLElement;
  pointerId: number | null;
  anchor: number;
  /** Value at the moment of the press, so a re-grab does not snap to zero. */
  anchorValue: number;
}

export class TouchControls {
  readonly root: HTMLElement;
  private readonly steer: Paddle;
  private readonly throttlePaddle: Paddle;
  private readonly throttleFill: HTMLElement;
  private readonly levelBtn: HTMLElement;
  private readonly pauseBtn: HTMLElement;

  private turn = 0;
  private throttle = 0;
  private levelOut = false;
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
      <div class="touch-zone touch-zone-left" data-role="steer">
        <div class="touch-steer" role="slider" aria-label="Steering"
             aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0">
          <div class="touch-track"><span class="touch-centre"></span><i class="touch-knob"></i></div>
          <span class="touch-label">◄ DRAG TO TURN ►</span>
        </div>
      </div>
      <div class="touch-mid">
        <button class="touch-btn" data-role="level" type="button" aria-label="Auto-level assist">LEVEL</button>
        <button class="touch-btn" data-role="pause" type="button" aria-label="Pause">II</button>
      </div>
      <div class="touch-zone touch-zone-right" data-role="throttle">
        <div class="touch-throttle" role="slider" aria-label="Throttle"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="touch-vtrack"><b class="touch-fill"></b><i class="touch-knob"></i></div>
          <span class="touch-label">▲ DRAG UP</span>
        </div>
      </div>`;

    const pick = (sel: string): HTMLElement => this.root.querySelector(sel)!;
    this.steer = {
      zone: pick('[data-role="steer"]'),
      track: pick('.touch-track'),
      knob: pick('.touch-steer .touch-knob'),
      pointerId: null,
      anchor: 0,
      anchorValue: 0,
    };
    this.throttlePaddle = {
      zone: pick('[data-role="throttle"]'),
      track: pick('.touch-vtrack'),
      knob: pick('.touch-throttle .touch-knob'),
      pointerId: null,
      anchor: 0,
      anchorValue: 0,
    };
    this.throttleFill = pick('.touch-fill');
    this.levelBtn = pick('[data-role="level"]');
    this.pauseBtn = pick('[data-role="pause"]');

    this.wirePaddle(this.steer, 'x');
    this.wirePaddle(this.throttlePaddle, 'y');
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
    this.steer.pointerId = null;
    this.throttlePaddle.pointerId = null;
    this.steer.zone.classList.remove('engaged');
    this.throttlePaddle.zone.classList.remove('engaged');
    this.levelBtn.classList.remove('held');
    this.paint();
  }

  /** Spring the knobs back when nothing is holding them. */
  update(dt: number) {
    if (!this.mounted) return;
    let changed = false;
    if (this.steer.pointerId === null && this.turn !== 0) {
      const step = RECENTRE_RATE * dt;
      this.turn = Math.abs(this.turn) <= step ? 0 : this.turn - Math.sign(this.turn) * step;
      changed = true;
    }
    if (this.throttlePaddle.pointerId === null && this.throttle > 0) {
      this.throttle = Math.max(0, this.throttle - THROTTLE_RELEASE_RATE * dt);
      changed = true;
    }
    if (changed) this.paint();
  }

  /** Drag distance that spans the full range: the length of the drawn track. */
  private travel(p: Paddle, axis: 'x' | 'y'): number {
    const box = p.track.getBoundingClientRect();
    // Steering runs -1..1 across the track, so half its width is a full deflection.
    const span = axis === 'x' ? box.width / 2 : box.height;
    return Math.max(MIN_TRAVEL_PX, span);
  }

  private wirePaddle(p: Paddle, axis: 'x' | 'y') {
    const apply = (e: PointerEvent) => {
      const travel = this.travel(p, axis);
      if (axis === 'x') {
        // Dragging right turns clockwise, which is a negative angle rate.
        const delta = (e.clientX - p.anchor) / travel;
        this.turn = Math.max(-1, Math.min(1, p.anchorValue - delta));
      } else {
        // Screen y grows downwards, so dragging up is a positive delta.
        const delta = (p.anchor - e.clientY) / travel;
        this.throttle = Math.max(0, Math.min(1, p.anchorValue + delta));
      }
      this.paint();
    };

    p.zone.addEventListener('pointerdown', (e) => {
      if (p.pointerId !== null) return;
      e.preventDefault();
      p.pointerId = e.pointerId;
      p.anchor = axis === 'x' ? e.clientX : e.clientY;
      // Re-grabbing mid-flight continues from the current value rather than
      // dumping the engine or snapping the rudder straight.
      p.anchorValue = axis === 'x' ? this.turn : this.throttle;
      p.zone.setPointerCapture(e.pointerId);
      p.zone.classList.add('engaged');
      this.paint();
    });

    p.zone.addEventListener('pointermove', (e) => {
      if (p.pointerId !== e.pointerId) return;
      apply(e);
    });

    const end = (e: PointerEvent) => {
      if (p.pointerId !== e.pointerId) return;
      p.pointerId = null;
      p.zone.classList.remove('engaged');
    };
    p.zone.addEventListener('pointerup', end);
    p.zone.addEventListener('pointercancel', end);
    p.zone.addEventListener('lostpointercapture', end);
  }

  private wireButtons() {
    const hold = (on: boolean) => {
      this.levelOut = on;
      this.levelBtn.classList.toggle('held', on);
    };
    this.levelBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      hold(true);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      this.levelBtn.addEventListener(ev, () => hold(false));
    }
    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onPause();
    });
  }

  private paint() {
    // -1..1 maps across the full track width; the knob is translated, not re-laid out.
    this.steer.knob.style.transform = `translate(calc(-50% + ${(-this.turn * 50).toFixed(2)}%), -50%)`;
    this.steer.track.parentElement?.setAttribute('aria-valuenow', this.turn.toFixed(2));

    const pct = this.throttle * 100;
    this.throttlePaddle.knob.style.transform = `translate(-50%, calc(50% - ${pct.toFixed(1)}%))`;
    this.throttleFill.style.height = `${pct.toFixed(1)}%`;
    this.throttlePaddle.track.parentElement?.setAttribute('aria-valuenow', Math.round(pct).toString());
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.root.remove();
    document.body.classList.remove('has-touch-controls');
    document.body.style.removeProperty('--touch-h');
  }
}
