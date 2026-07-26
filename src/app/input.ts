/**
 * Keyboard and gamepad input, reduced to the three flight controls.
 *
 * The 1996 original's exact key map is not documented anywhere online, so this
 * follows the genre convention it and Thrust share (turn left / turn right /
 * thrust) and offers arrows, WASD and a gamepad simultaneously rather than
 * making the player pick.
 */

import type { InputFrame } from '../sim/types';

const TURN_LEFT = new Set(['ArrowLeft', 'KeyA', 'KeyJ']);
const TURN_RIGHT = new Set(['ArrowRight', 'KeyD', 'KeyL']);
const THRUST = new Set(['ArrowUp', 'KeyW', 'Space', 'KeyK']);
const LEVEL_OUT = new Set(['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight']);

export type Command =
  | 'pause'
  | 'restart'
  | 'confirm'
  | 'back'
  | 'up'
  | 'down'
  | 'debug'
  | 'mute';

export class Input {
  private readonly down = new Set<string>();
  private readonly commands: ((c: Command) => void)[] = [];
  private padIndex: number | null = null;
  /** Rising-edge memory for gamepad buttons, which have no keydown event. */
  private padPrev = new Map<number, boolean>();

  /** Set while a text field owns the keyboard, e.g. password entry. */
  captureText = false;

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    target.addEventListener('gamepadconnected', this.onPad as EventListener);
  }

  dispose() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('gamepadconnected', this.onPad as EventListener);
  }

  onCommand(fn: (c: Command) => void) {
    this.commands.push(fn);
  }

  private emit(c: Command) {
    for (const fn of this.commands) fn(c);
  }

  private onPad = (e: GamepadEvent) => {
    this.padIndex = e.gamepad.index;
  };

  private onBlur = () => {
    this.down.clear();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.captureText) {
      if (e.code === 'Escape') this.emit('back');
      return;
    }
    // Space and the arrows scroll the page by default, which fights the game.
    if (
      THRUST.has(e.code) ||
      TURN_LEFT.has(e.code) ||
      TURN_RIGHT.has(e.code) ||
      LEVEL_OUT.has(e.code)
    ) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.down.add(e.code);

    switch (e.code) {
      case 'Escape':
      case 'KeyP':
        this.emit('pause');
        break;
      case 'KeyR':
        this.emit('restart');
        break;
      case 'Enter':
      case 'NumpadEnter':
        this.emit('confirm');
        break;
      case 'Backspace':
        this.emit('back');
        break;
      case 'F3':
        e.preventDefault();
        this.emit('debug');
        break;
      case 'KeyM':
        this.emit('mute');
        break;
      default:
        break;
    }
    if (TURN_LEFT.has(e.code) || e.code === 'ArrowUp') this.emit('up');
    if (TURN_RIGHT.has(e.code) || e.code === 'ArrowDown') this.emit('down');
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private pad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.padIndex !== null && pads[this.padIndex]) return pads[this.padIndex];
    for (const p of pads) if (p) return p;
    return null;
  }

  /** Poll gamepad buttons for menu navigation; returns nothing, emits commands. */
  pollCommands() {
    const pad = this.pad();
    if (!pad) return;
    const edge = (i: number) => {
      const now = pad.buttons[i]?.pressed ?? false;
      const was = this.padPrev.get(i) ?? false;
      this.padPrev.set(i, now);
      return now && !was;
    };
    if (edge(0)) this.emit('confirm');
    if (edge(1)) this.emit('back');
    if (edge(9)) this.emit('pause');
    if (edge(12)) this.emit('up');
    if (edge(13)) this.emit('down');
    if (edge(2)) this.emit('restart');
  }

  /**
   * An extra analog source merged into every frame, used by the on-screen
   * touch controls. Null when they are not mounted.
   */
  touch: (() => { turn: number; throttle: number; levelOut: boolean }) | null = null;

  /** The flight controls for this frame. */
  frame(): InputFrame {
    let turn = 0;
    if (this.down.has('ArrowLeft') || this.down.has('KeyA') || this.down.has('KeyJ')) turn += 1;
    if (this.down.has('ArrowRight') || this.down.has('KeyD') || this.down.has('KeyL')) turn -= 1;
    // A key is always full power; analog sources can ask for less.
    let throttle = 0;
    for (const k of THRUST) if (this.down.has(k)) throttle = 1;
    let levelOut = false;
    for (const k of LEVEL_OUT) if (this.down.has(k)) levelOut = true;

    const pad = this.pad();
    if (pad) {
      const axis = pad.axes[0] ?? 0;
      if (Math.abs(axis) > 0.18) turn -= axis; // stick right = rotate clockwise
      if (pad.buttons[14]?.pressed) turn += 1;
      if (pad.buttons[15]?.pressed) turn -= 1;
      const trigger = pad.buttons[7]?.value ?? 0;
      if (pad.buttons[0]?.pressed) throttle = 1;
      else if (trigger > 0.08) throttle = Math.max(throttle, trigger);
      if (pad.buttons[3]?.pressed) levelOut = true;
    }

    if (this.touch) {
      const t = this.touch();
      if (Math.abs(t.turn) > Math.abs(turn)) turn = t.turn;
      throttle = Math.max(throttle, t.throttle);
      levelOut = levelOut || t.levelOut;
    }

    return {
      turn: Math.max(-1, Math.min(1, turn)),
      throttle: Math.max(0, Math.min(1, throttle)),
      levelOut,
    };
  }

  clear() {
    this.down.clear();
  }
}
