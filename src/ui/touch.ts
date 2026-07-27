/**
 * On-screen flight controls for touch devices.
 *
 * Two paddles, each a *gesture zone* with a slider drawn inside it:
 *
 * - **Steering** (left half of the lower screen). Drag sideways; the further
 *   from where you pressed, the harder the turn. Springs back to zero on
 *   release, so letting go stops the turn rather than leaving the ship spinning.
 * - **Throttle** (right half). Two modes, switchable in the settings and with
 *   the GAS button between the paddles:
 *   - `push` (default): pressing anywhere in the zone is **full power**, like
 *     the thrust key. Pulling *down* from where you pressed trims the power, so
 *     fine dosing is still there when you want it - it is just no longer the
 *     price of getting off the ground.
 *   - `slider`: power comes purely from how far up you drag. Nothing happens
 *     until you pull.
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
 *    and the resting state is always "engine off". The drag distance for the
 *    full range equals the knob's own travel inside its track, so the knob
 *    follows your thumb one-to-one and reaches both ends.
 *
 * Each zone captures its own pointer, so two thumbs work simultaneously and a
 * finger that wanders outside its zone keeps control of it.
 *
 * The three auxiliary buttons - throttle mode, attitude assist and pause - used
 * to sit in a column between the paddles, which on a landscape phone put them
 * squarely in the middle of the playfield. They now live behind a single toggle
 * in the top-right corner, over the frame edge rather than over the cave. The
 * tray stays open until it is closed again, so the assist is still holdable
 * mid-flight for anyone who wants it.
 */

export interface TouchState {
  turn: number;
  throttle: number;
  levelOut: boolean;
}

/**
 * How the right paddle reads a press.
 * - `push`: press = full power, pull down to trim.
 * - `slider`: power is the upward drag distance, nothing else.
 */
export type ThrottleMode = 'push' | 'slider';

export const THROTTLE_MODES: readonly ThrottleMode[] = ['push', 'slider'];

/** German labels for the two modes, used on the overlay button and in menus. */
export const THROTTLE_MODE_LABEL: Record<ThrottleMode, string> = {
  push: 'Drücken = Vollgas',
  slider: 'Schieberegler',
};

/** How fast the steering value springs back to centre, in units per second. */
const RECENTRE_RATE = 6;
/** Throttle decay per second once the thumb lifts, so the engine eases off. */
const THROTTLE_RELEASE_RATE = 5;
/** Smallest usable drag distance, in case a track renders tiny. */
const MIN_TRAVEL_PX = 60;
/**
 * Slack before a downward pull in `push` mode starts trimming power. Holding a
 * thumb still on a moving phone is not actually possible, and a press that
 * means "full power" must not lose a few percent to that wobble.
 */
const PUSH_DEADZONE_PX = 14;

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
  private readonly throttleLabel: HTMLElement;
  private readonly levelBtn: HTMLElement;
  private readonly pauseBtn: HTMLElement;
  private readonly modeBtn: HTMLElement;
  private readonly modeValue: HTMLElement;
  private readonly menuBtn: HTMLElement;
  private readonly tray: HTMLElement;

  private turn = 0;
  private throttle = 0;
  private levelOut = false;
  private mounted = false;
  private throttleMode: ThrottleMode = 'push';
  private resizeObserver: ResizeObserver | null = null;

  /** Set by the game so a flip on the overlay button is persisted. */
  onThrottleModeChange: ((m: ThrottleMode) => void) | null = null;

  constructor(
    private readonly onPause: () => void,
    doc: Document = document,
  ) {
    this.root = doc.createElement('div');
    this.root.className = 'touch';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="touch-zone touch-zone-left" data-role="steer">
        <div class="touch-steer" role="slider" aria-label="Lenkung"
             aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0">
          <div class="touch-track"><span class="touch-centre"></span><i class="touch-knob"></i></div>
          <span class="touch-label">◄ ZIEHEN ZUM LENKEN ►</span>
        </div>
      </div>
      <div class="touch-menu" data-role="menu">
        <button class="touch-btn touch-menu-btn" data-role="menu-toggle" type="button"
                aria-expanded="false" aria-controls="touch-tray"
                aria-label="Zusatztasten anzeigen">&#9776;</button>
        <div class="touch-tray" id="touch-tray" data-role="tray" hidden>
          <button class="touch-btn touch-btn-mode" data-role="mode" type="button">
            <small>GAS</small><span data-role="mode-value">PUSH</span>
          </button>
          <button class="touch-btn" data-role="level" type="button" aria-label="Lage-Assistent">LAGE</button>
          <button class="touch-btn" data-role="pause" type="button" aria-label="Pause">II</button>
        </div>
      </div>
      <div class="touch-zone touch-zone-right" data-role="throttle">
        <div class="touch-throttle" role="slider" aria-label="Schub"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="touch-vtrack"><b class="touch-fill"></b><i class="touch-knob"></i></div>
          <span class="touch-label" data-role="throttle-label">▲ HOCHZIEHEN</span>
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
    this.throttleLabel = pick('[data-role="throttle-label"]');
    this.levelBtn = pick('[data-role="level"]');
    this.pauseBtn = pick('[data-role="pause"]');
    this.modeBtn = pick('[data-role="mode"]');
    this.modeValue = pick('[data-role="mode-value"]');
    this.menuBtn = pick('[data-role="menu-toggle"]');
    this.tray = pick('[data-role="tray"]');

    this.wirePaddle(this.steer, 'x');
    this.wirePaddle(this.throttlePaddle, 'y');
    this.wireButtons();
    doc.body.appendChild(this.root);
    this.observeHeight();
    this.paintMode();
    this.paint();
  }

  get mode(): ThrottleMode {
    return this.throttleMode;
  }

  /** Adopt a mode without reporting it back - used when loading the save. */
  setThrottleMode(m: ThrottleMode) {
    if (m === this.throttleMode) return;
    this.throttleMode = m;
    // A mode change mid-hold would otherwise leave a stale anchor value.
    this.throttlePaddle.pointerId = null;
    this.throttlePaddle.zone.classList.remove('engaged');
    this.throttle = 0;
    this.paintMode();
    this.paint();
  }

  private toggleThrottleMode() {
    this.setThrottleMode(this.throttleMode === 'push' ? 'slider' : 'push');
    this.onThrottleModeChange?.(this.throttleMode);
  }

  /** Text that depends on the mode: the button's value and the paddle's hint. */
  private paintMode() {
    const push = this.throttleMode === 'push';
    this.modeValue.textContent = push ? 'PUSH' : 'REGLER';
    this.modeBtn.setAttribute(
      'aria-label',
      `Schub-Modus: ${THROTTLE_MODE_LABEL[this.throttleMode]}. Umschalten auf ` +
        `${THROTTLE_MODE_LABEL[push ? 'slider' : 'push']}.`,
    );
    this.modeBtn.classList.toggle('is-push', push);
    this.throttleLabel.textContent = push ? 'DRÜCKEN = VOLLGAS' : '▲ HOCHZIEHEN';
    this.root.classList.toggle('mode-push', push);
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
    // Geometry is only measurable once mounted, so place the knobs now.
    else this.paint();
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
    this.setTrayOpen(false);
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

  /**
   * Pixels the knob's centre can actually move inside its track: the track's
   * length minus the knob, so the knob stays fully visible at both ends.
   */
  private knobRange(p: Paddle, axis: 'x' | 'y'): number {
    // clientWidth/Height excludes the border, which is the box `left`/`bottom`
    // are measured against - using the bounding rect leaves the knob a border
    // width proud of the track at the far end.
    const span =
      axis === 'x'
        ? p.track.clientWidth - p.knob.offsetWidth
        : p.track.clientHeight - p.knob.offsetHeight;
    return Math.max(0, span);
  }

  /** Drag distance that spans the full range. */
  private travel(p: Paddle, axis: 'x' | 'y'): number {
    // Steering runs -1..1, so a full deflection is half the knob's travel.
    const span = axis === 'x' ? this.knobRange(p, 'x') / 2 : this.knobRange(p, 'y');
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
        let delta = (p.anchor - e.clientY) / travel;
        if (this.throttleMode === 'push') {
          // Already at full from the press: only a deliberate downward pull
          // means anything, and the first few millimetres of it are wobble.
          const dead = PUSH_DEADZONE_PX / travel;
          delta = delta > -dead ? 0 : delta + dead;
        }
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
      // dumping the engine or snapping the rudder straight - except in push
      // mode, where the whole point of a press is that it is full power.
      if (axis === 'x') p.anchorValue = this.turn;
      else p.anchorValue = this.throttleMode === 'push' ? 1 : this.throttle;
      if (axis === 'y') this.throttle = p.anchorValue;
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

  /** Whether the auxiliary button tray is open. */
  get trayOpen(): boolean {
    return !this.tray.hidden;
  }

  setTrayOpen(open: boolean) {
    this.tray.hidden = !open;
    this.menuBtn.setAttribute('aria-expanded', String(open));
    this.menuBtn.setAttribute(
      'aria-label',
      open ? 'Zusatztasten ausblenden' : 'Zusatztasten anzeigen',
    );
    this.menuBtn.classList.toggle('is-open', open);
    // A tray that closes while LAGE is held would leave the assist stuck on.
    if (!open && this.levelOut) {
      this.levelOut = false;
      this.levelBtn.classList.remove('held');
    }
  }

  private wireButtons() {
    this.menuBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setTrayOpen(!this.trayOpen);
    });

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
    // Reachable without leaving the flight: the mode you want is the one you
    // find out you want while flying.
    this.modeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleThrottleMode();
    });
  }

  /**
   * Knob positions are computed in pixels from measured geometry.
   *
   * They used to be CSS transform percentages, which is the bug that made the
   * throttle feel broken: a translate percentage resolves against *the element
   * being moved*, not its container. Full throttle therefore shifted the knob
   * by one knob-height instead of one track-length - about a third of the way -
   * and at zero it was translated half its own height below the track, where
   * `overflow: hidden` cut it in half.
   */
  private paint() {
    const steerRange = this.knobRange(this.steer, 'x');
    // turn = +1 is counter-clockwise, which is the left end of the track.
    this.steer.knob.style.left = `${((0.5 - this.turn / 2) * steerRange).toFixed(1)}px`;
    this.steer.knob.style.transform = 'translateY(-50%)';
    this.steer.track.parentElement?.setAttribute('aria-valuenow', this.turn.toFixed(2));

    const throttleRange = this.knobRange(this.throttlePaddle, 'y');
    this.throttlePaddle.knob.style.bottom = `${(this.throttle * throttleRange).toFixed(1)}px`;
    this.throttlePaddle.knob.style.transform = 'translateX(-50%)';
    const pct = this.throttle * 100;
    this.throttleFill.style.height = `${pct.toFixed(1)}%`;
    this.throttlePaddle.track.parentElement?.setAttribute(
      'aria-valuenow',
      Math.round(pct).toString(),
    );
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.root.remove();
    document.body.classList.remove('has-touch-controls');
    document.body.style.removeProperty('--touch-h');
  }
}
