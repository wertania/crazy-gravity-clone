/**
 * Central tuning table.
 *
 * All simulation units are *tiles* and *seconds*. One tile = 1 world unit in the
 * renderer, so nothing has to be converted between simulation and presentation.
 *
 * Every value here is a tuning knob, not a measurement of the 1996 original.
 * They were calibrated against FIXED_DT below; if you change the timestep you
 * have to re-feel the handling.
 */

/** Simulation step. 120 Hz gives crisp collision without burning CPU. */
export const FIXED_DT = 1 / 120;
/** Largest frame we are willing to simulate at once (spiral-of-death clamp). */
export const MAX_FRAME_TIME = 0.25;

export const SHIP = {
  /** Collision radius. Deliberately smaller than the visual hull: forgiving beats "fair". */
  radius: 0.34,
  /** Visual half-size, purely cosmetic. */
  visualRadius: 0.46,
  /** Thrust acceleration along the nose vector. */
  thrust: 26.0,
  /** Rotation rate at full deflection. */
  rotSpeed: 3.6,
  /** How fast rotation input ramps in/out. Small = weighty, large = twitchy. */
  rotAccel: 22.0,
  /** Speed cap. Also the tunneling budget for the collision sub-stepper. */
  maxSpeed: 22.0,
  /** Per-second velocity retention. 1.0 = pure vacuum. Slightly < 1 tames overshoot. */
  damping: 0.62,
  /** Fuel units burned per second of thrust. */
  fuelBurn: 7.0,
  maxFuel: 100,
  /** Fuel per second regained while parked on a fuel pad. */
  refuelRate: 38,
  /** Impact speed at or below which a pad landing is safe. */
  safeLandSpeed: 3.2,
  /** Tilt tolerance when landing, radians from vertical. */
  safeLandAngle: 0.38,
  /** Landing indicator turns yellow above this fraction of the safe speed. */
  warnLandFraction: 0.6,
  /** Cargo mass penalty: each carried crate scales thrust down and gravity up. */
  cargoThrustPenalty: 0.07,
  cargoGravityPenalty: 0.05,
} as const;

export const WORLD = {
  /** Baseline downward pull. Levels and difficulty scale this. */
  gravity: 9.0,
  /** Speed of cannon/turret projectiles. */
  bulletSpeed: 13.0,
  bulletRadius: 0.18,
  bulletLife: 6.0,
} as const;

/**
 * The Flow system - the main modern addition to the 1996 formula.
 *
 * The original punished wall contact and rewarded nothing for skirting it. Flow
 * pays you for controlled proximity: hold speed close to geometry and the meter
 * climbs, which raises the score multiplier and trickles fuel back. It turns a
 * punishing game into a risk/reward loop without making it easier - the fastest
 * way to bank flow is also the fastest way to die.
 */
export const FLOW = {
  /** Wall distance (beyond the hull) that counts as "grazing". */
  range: 1.15,
  /** Below this speed, grazing is just loitering and earns nothing. */
  minSpeed: 5.0,
  /** Meter gain per second at perfect graze distance and speed. */
  gain: 62,
  /** Passive decay per second when not grazing. */
  decay: 26,
  max: 100,
  /** Score multiplier at a full meter (1x .. maxMultiplier). */
  maxMultiplier: 3.0,
  /** Fuel per second regained at a full meter. */
  fuelReward: 3.2,
} as const;

export const SCORE = {
  cargoDelivered: 1000,
  keyCollected: 250,
  /** Points per second of remaining time against the level's par. */
  timeBonusPerSecond: 40,
  /** Points per remaining fuel unit. */
  fuelBonusPerUnit: 6,
  flawlessBonus: 2500,
} as const;

export type DifficultyId = 'rookie' | 'pilot' | 'ace' | 'veteran' | 'legend';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  blurb: string;
  lives: number;
  gravityScale: number;
  fuelScale: number;
  /** Multiplies safeLandSpeed / safeLandAngle. */
  landToleranceScale: number;
  /** Multiplies hazard fire rates and rod speeds. */
  hazardScale: number;
  /** Multiplies the level par time used for the timer. */
  timeScale: number;
  /** Running out of time is fatal instead of merely costing the time bonus. */
  hardTimeLimit: boolean;
  scoreScale: number;
}

/**
 * Five tiers, like the original. Modern twist: difficulty never gates content.
 * Rookie is a real, finishable run of all 20 levels - it changes the margin for
 * error, not the level list.
 */
export const DIFFICULTIES: Difficulty[] = [
  {
    id: 'rookie',
    name: 'Rookie',
    blurb: 'Light gravity, deep tanks, patient hazards. Learn the caves.',
    lives: 9,
    gravityScale: 0.78,
    fuelScale: 1.45,
    landToleranceScale: 1.5,
    hazardScale: 0.7,
    timeScale: 1.6,
    hardTimeLimit: false,
    scoreScale: 0.6,
  },
  {
    id: 'pilot',
    name: 'Pilot',
    blurb: 'The intended way to fly. Fair margins, honest caves.',
    lives: 6,
    gravityScale: 0.92,
    fuelScale: 1.15,
    landToleranceScale: 1.2,
    hazardScale: 0.88,
    timeScale: 1.3,
    hardTimeLimit: false,
    scoreScale: 1.0,
  },
  {
    id: 'ace',
    name: 'Ace',
    blurb: 'Baseline gravity and fuel. Landings start to bite.',
    lives: 4,
    gravityScale: 1.0,
    fuelScale: 1.0,
    landToleranceScale: 1.0,
    hazardScale: 1.0,
    timeScale: 1.1,
    hardTimeLimit: false,
    scoreScale: 1.35,
  },
  {
    id: 'veteran',
    name: 'Veteran',
    blurb: 'Heavy hull, thin tanks, the clock is a real enemy.',
    lives: 3,
    gravityScale: 1.12,
    fuelScale: 0.85,
    landToleranceScale: 0.85,
    hazardScale: 1.2,
    timeScale: 1.0,
    hardTimeLimit: true,
    scoreScale: 1.8,
  },
  {
    id: 'legend',
    name: 'Legend',
    blurb: 'One hull. Every hazard awake. Bring flow or bring nothing.',
    lives: 1,
    gravityScale: 1.22,
    fuelScale: 0.72,
    landToleranceScale: 0.72,
    hazardScale: 1.45,
    timeScale: 0.85,
    hardTimeLimit: true,
    scoreScale: 2.5,
  },
];

export function difficultyById(id: DifficultyId): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1];
}
