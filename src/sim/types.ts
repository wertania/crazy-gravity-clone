/** Shared value types for the simulation layer. */

export type KeyColor = 'red' | 'green' | 'blue' | 'amber';

/** Tile codes stored in the level grid. Anything >= ROCK is solid. */
export const Tile = {
  EMPTY: 0,
  ROCK: 1,
  /** Plain landable surface. */
  PAD: 2,
  /** Delivery pad (home base). Landable. */
  BASE: 3,
  /** Refuelling pad. Landable. */
  FUEL: 4,
  /** Lethal on contact regardless of speed. */
  SPIKE: 5,
} as const;
export type TileCode = (typeof Tile)[keyof typeof Tile];

export const SOLID_FROM = Tile.ROCK;
export const LANDABLE = new Set<number>([Tile.PAD, Tile.BASE, Tile.FUEL]);

export interface Vec2 {
  x: number;
  y: number;
}

export type ShipState = 'flying' | 'landed' | 'dead';

export interface InputFrame {
  /** -1 = rotate clockwise (right), +1 = rotate counter-clockwise (left). */
  turn: number;
  /**
   * Engine power, 0..1. Anything at or below THROTTLE_DEADZONE counts as off.
   *
   * The original was strictly on/off, and a key still gives a full 1. Analog
   * throttle exists for the touch slider and gamepad triggers, where holding a
   * steady hover is otherwise very hard - it is a control-fidelity change, not
   * a change to how much thrust the ship has.
   */
  throttle: number;
  /** Auto-level assist: eases the nose back to vertical. */
  levelOut: boolean;
}

/** Below this the engine is considered off, so a resting slider cannot idle-burn. */
export const THROTTLE_DEADZONE = 0.04;

export const NO_INPUT: InputFrame = { turn: 0, throttle: 0, levelOut: false };

/** Emitted by the simulation, drained once per frame by audio/VFX. */
export type SimEventType =
  | 'pickup'
  | 'deliver'
  | 'key'
  | 'gate-open'
  | 'land'
  | 'liftoff'
  | 'crash'
  | 'shoot'
  | 'bullet-hit'
  | 'refuel'
  | 'flow-peak'
  | 'level-clear'
  | 'out-of-fuel'
  | 'timeout';

export interface SimEvent {
  type: SimEventType;
  x: number;
  y: number;
  /** Type-specific magnitude: impact speed, cargo index, etc. */
  value?: number;
  color?: KeyColor;
}
