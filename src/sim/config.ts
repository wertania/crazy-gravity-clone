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
  /**
   * Multiplies the hull's speed cap. This is the strongest "make it easier"
   * lever there is: a slower ship simply cannot build up a velocity it has no
   * room to shed, so most crashes stop happening rather than being survived.
   */
  speedScale: number;
  /** Multiplies engine power. Lower means gentler acceleration, not a weaker ship -
   *  gravity is scaled alongside it so the thrust-to-weight ratio stays flyable. */
  thrustScale: number;
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
    name: 'Neuling',
    blurb: 'Langsam, schwer, nachsichtig. Volle Tanks, träge Gefahren. Zum Lernen.',
    lives: 9,
    gravityScale: 0.78,
    fuelScale: 2.0,
    landToleranceScale: 1.5,
    speedScale: 0.58,
    thrustScale: 0.70,
    hazardScale: 0.7,
    timeScale: 2.0,
    hardTimeLimit: false,
    scoreScale: 0.6,
  },
  {
    id: 'pilot',
    name: 'Pilot',
    blurb: 'Spürbar flotter als Neuling. Faire Reserven, ehrliche Höhlen.',
    lives: 6,
    gravityScale: 0.92,
    fuelScale: 1.3,
    landToleranceScale: 1.2,
    speedScale: 0.76,
    thrustScale: 0.84,
    hazardScale: 0.88,
    timeScale: 1.55,
    hardTimeLimit: false,
    scoreScale: 1.0,
  },
  {
    id: 'ace',
    name: 'Ass',
    blurb: 'Volles Tempo, voller Schub. Landungen werden anspruchsvoll.',
    lives: 4,
    gravityScale: 1.0,
    fuelScale: 1.0,
    landToleranceScale: 1.0,
    speedScale: 1.0,
    thrustScale: 1.0,
    hazardScale: 1.0,
    timeScale: 1.1,
    hardTimeLimit: false,
    scoreScale: 1.35,
  },
  {
    id: 'veteran',
    name: 'Veteran',
    blurb: 'Schwere Hülle, knappe Tanks, die Uhr ist ein echter Gegner.',
    lives: 3,
    gravityScale: 1.12,
    fuelScale: 0.85,
    landToleranceScale: 0.85,
    speedScale: 1.08,
    thrustScale: 1.05,
    hazardScale: 1.2,
    timeScale: 1.0,
    hardTimeLimit: true,
    scoreScale: 1.8,
  },
  {
    id: 'legend',
    name: 'Legende',
    blurb: 'Eine Hülle. Jede Gefahr wach. Ohne Flow geht hier nichts.',
    lives: 1,
    gravityScale: 1.22,
    fuelScale: 0.72,
    landToleranceScale: 0.72,
    speedScale: 1.18,
    thrustScale: 1.12,
    hazardScale: 1.45,
    timeScale: 0.85,
    hardTimeLimit: true,
    scoreScale: 2.5,
  },
];

export function difficultyById(id: DifficultyId): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[DEFAULT_DIFFICULTY_INDEX];
}

/** Rookie. A first-time player should not have to find the difficulty menu. */
const DEFAULT_DIFFICULTY_INDEX = 0;
export const DEFAULT_DIFFICULTY: DifficultyId = DIFFICULTIES[DEFAULT_DIFFICULTY_INDEX].id;

/**
 * Overall pace.
 *
 * This scales how much simulated time passes per real second. It is *not* a
 * physics change: gravity, thrust and the speed cap keep their exact
 * relationships, so the ship handles identically - you simply get more real
 * milliseconds to react in. That makes it the single most effective difficulty
 * dial for a reaction-heavy game, and the one least likely to break level
 * balance, which is why the default sits below 1.
 */
export interface GameSpeedOption {
  id: GameSpeedId;
  label: string;
  scale: number;
  blurb: string;
}

export type GameSpeedId = 'calm' | 'gentle' | 'standard' | 'brisk';

export const GAME_SPEEDS: GameSpeedOption[] = [
  { id: 'calm', label: 'Ruhig', scale: 0.7, blurb: '70 % Tempo. Alles passiert mit reichlich Vorlauf.' },
  { id: 'gentle', label: 'Sanft', scale: 0.85, blurb: '85 % Tempo. Die Voreinstellung: nachsichtig, ohne zäh zu wirken.' },
  { id: 'standard', label: 'Normal', scale: 1.0, blurb: '100 % Tempo. So wurden die Höhlen abgestimmt.' },
  { id: 'brisk', label: 'Flott', scale: 1.15, blurb: '115 % Tempo. Alles kommt früher auf dich zu.' },
];

export const DEFAULT_GAME_SPEED: GameSpeedId = 'gentle';

export function gameSpeedById(id: GameSpeedId): GameSpeedOption {
  return GAME_SPEEDS.find((s) => s.id === id) ?? GAME_SPEEDS[1];
}
