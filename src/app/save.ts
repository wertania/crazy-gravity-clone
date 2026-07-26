/**
 * Progress persistence.
 *
 * Keeps the original's password system (a nod, and genuinely useful for sharing
 * a level with someone) but backs it with real autosaving so nobody has to
 * write anything down.
 */

import type { DifficultyId } from '../sim/config';

const KEY = 'gravity-hauler.save.v1';

export interface LevelRecord {
  bestScore: number;
  bestTime: number;
  medal: 'gold' | 'silver' | 'bronze' | 'none';
  cleared: boolean;
}

export interface SaveData {
  difficulty: DifficultyId;
  /** Highest level index unlocked, 1-based. */
  unlocked: number;
  totalScore: number;
  levels: Record<number, LevelRecord>;
  muted: boolean;
  /** Total hulls lost across every session - shown on the title screen. */
  wrecks: number;
}

const DEFAULT: SaveData = {
  difficulty: 'pilot',
  unlocked: 1,
  totalScore: 0,
  levels: {},
  muted: false,
  wrecks: 0,
};

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode, sandboxed iframe, ...
  }
}

export function load(): SaveData {
  const s = storage();
  if (!s) return { ...DEFAULT, levels: {} };
  try {
    const raw = s.getItem(KEY);
    if (!raw) return { ...DEFAULT, levels: {} };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...DEFAULT, ...parsed, levels: parsed.levels ?? {} };
  } catch {
    return { ...DEFAULT, levels: {} };
  }
}

export function save(data: SaveData) {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota or disabled storage - progress simply is not persisted */
  }
}

export function recordLevel(
  data: SaveData,
  levelId: number,
  result: { score: number; time: number; medal: LevelRecord['medal'] },
): SaveData {
  const prev = data.levels[levelId];
  const rank = { none: 0, bronze: 1, silver: 2, gold: 3 } as const;
  const next: LevelRecord = {
    bestScore: Math.max(prev?.bestScore ?? 0, result.score),
    bestTime: prev?.bestTime ? Math.min(prev.bestTime, result.time) : result.time,
    medal: rank[result.medal] >= rank[prev?.medal ?? 'none'] ? result.medal : prev!.medal,
    cleared: true,
  };
  const updated: SaveData = {
    ...data,
    unlocked: Math.max(data.unlocked, levelId + 1),
    totalScore: data.totalScore + result.score,
    levels: { ...data.levels, [levelId]: next },
  };
  save(updated);
  return updated;
}

export function reset(): SaveData {
  const s = storage();
  if (s) {
    try {
      s.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
  return { ...DEFAULT, levels: {} };
}
