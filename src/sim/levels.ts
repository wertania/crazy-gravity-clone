/**
 * The campaign: 20 hand-authored caves.
 *
 * Design rule inherited from modern level design rather than from 1996: each of
 * the first thirteen levels introduces exactly one new idea in a safe room
 * before it is ever combined with something else. Levels 14-20 recombine.
 *
 * Connectivity convention: every chamber is joined to another chamber by a tube
 * whose endpoints are chamber centres. Noise perturbs the walls by well under a
 * tile, so a tube of radius >= 1.6 can never be severed. `validateLevel` proves
 * it for real in the test suite.
 */

import type { Carve, LevelSpec } from './level';

const tube = (r: number, ...pts: [number, number][]): Carve => ({ t: 'tube', pts, r });

export const LEVELS: LevelSpec[] = [
  // 1 ------------------------------------------------------------------------
  {
    id: 1,
    name: 'Erstes Licht',
    password: 'IGNITION',
    hint:
      'Drehen mit A/D, Schub mit W. Kiste holen, weich auf der blauen Basis aufsetzen.',
    width: 92,
    height: 50,
    seed: 1001,
    par: 55,
    spawn: { x: 15, y: 15 },
    carve: [
      { t: 'cave', cx: 20, cy: 14, rx: 13, ry: 8 },
      { t: 'cave', cx: 70, cy: 30, rx: 12, ry: 9 },
      tube(3.2, [20, 14], [44, 17], [70, 30]),
    ],
    pads: [{ x: 13, y: 8, w: 7, kind: 'base' }],
    objects: [{ t: 'cargo', x: 70, y: 28 }],
  },

  // 2 ------------------------------------------------------------------------
  {
    id: 2,
    name: 'Ballast',
    password: 'THISTLE',
    hint:
      'Drei Kisten. Jede an Bord macht die Hülle träger – alles auf einmal oder pendeln?',
    width: 104,
    height: 58,
    seed: 1002,
    par: 80,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'cave', cx: 54, cy: 40, rx: 11, ry: 8 },
      { t: 'cave', cx: 86, cy: 18, rx: 12, ry: 9 },
      tube(2.6, [20, 15], [36, 24], [54, 40]),
      tube(2.4, [54, 40], [72, 30], [86, 18]),
      tube(1.9, [20, 15], [50, 8], [86, 18]),
    ],
    pads: [{ x: 14, y: 8, w: 7, kind: 'base' }],
    objects: [
      { t: 'cargo', x: 54, y: 38 },
      { t: 'cargo', x: 86, y: 16 },
      { t: 'cargo', x: 90, y: 22 },
    ],
  },

  // 3 ------------------------------------------------------------------------
  {
    id: 3,
    name: 'Quelle',
    password: 'QUASAR',
    hint:
      'Der Tank startet halb leer. Grüne Felder betanken dich, solange du darauf stehst.',
    width: 112,
    height: 60,
    seed: 1003,
    par: 95,
    fuel: 54,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'cave', cx: 56, cy: 22, rx: 10, ry: 8 },
      { t: 'cave', cx: 92, cy: 40, rx: 12, ry: 9 },
      { t: 'cave', cx: 60, cy: 48, rx: 9, ry: 7 },
      tube(2.4, [20, 15], [38, 18], [56, 22]),
      tube(2.4, [56, 22], [76, 30], [92, 40]),
      tube(2.2, [92, 40], [76, 48], [60, 48]),
      tube(2.0, [60, 48], [38, 38], [20, 15]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 52, y: 16, w: 6, kind: 'fuel' },
      { x: 56, y: 43, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'cargo', x: 92, y: 38 },
      { t: 'cargo', x: 96, y: 44 },
    ],
  },

  // 4 ------------------------------------------------------------------------
  {
    id: 4,
    name: 'Schlüsselloch',
    password: 'KEYSTONE',
    hint:
      'Farbige Tore sind dicht, bis du den passenden Schlüssel hast. Sie stoßen ab, sie töten nicht.',
    width: 112,
    height: 62,
    seed: 1004,
    par: 100,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'cave', cx: 52, cy: 30, rx: 11, ry: 9 },
      { t: 'cave', cx: 90, cy: 22, rx: 11, ry: 9 },
      { t: 'cave', cx: 86, cy: 50, rx: 10, ry: 7 },
      tube(2.5, [20, 15], [36, 22], [52, 30]),
      tube(2.3, [52, 30], [72, 26], [90, 22]),
      tube(2.3, [52, 30], [68, 44], [86, 50]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 48, y: 23, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'key', x: 90, y: 20, color: 'red' },
      { t: 'gate', x: 66, y: 40, w: 2, h: 10, color: 'red' },
      { t: 'cargo', x: 86, y: 48 },
      { t: 'cargo', x: 90, y: 53 },
    ],
  },

  // 5 ------------------------------------------------------------------------
  {
    id: 5,
    name: 'Kreuzfeuer',
    password: 'CROSSBOW',
    hint:
      'Kanonen feuern blind im festen Takt. Erst den Rhythmus lesen, dann durch.',
    width: 118,
    height: 62,
    seed: 1005,
    par: 105,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'room', x: 36, y: 12, w: 44, h: 12 },
      { t: 'cave', cx: 98, cy: 22, rx: 13, ry: 10 },
      { t: 'cave', cx: 60, cy: 46, rx: 12, ry: 8 },
      tube(2.4, [20, 15], [30, 17], [40, 18]),
      tube(2.4, [76, 18], [90, 20], [98, 22]),
      tube(2.2, [98, 22], [80, 40], [60, 46]),
      tube(2.0, [60, 46], [36, 34], [20, 15]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 94, y: 14, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'cannon', x: 44, y: 25, dir: 270, period: 1.9, phase: 0 },
      { t: 'cannon', x: 56, y: 25, dir: 270, period: 1.9, phase: 0.33 },
      { t: 'cannon', x: 68, y: 25, dir: 270, period: 1.9, phase: 0.66 },
      { t: 'cannon', x: 34, y: 18, dir: 0, period: 2.6, phase: 0.5 },
      { t: 'cargo', x: 98, y: 20 },
      { t: 'cargo', x: 60, y: 44 },
    ],
  },

  // 6 ------------------------------------------------------------------------
  {
    id: 6,
    name: 'Magnetstein',
    password: 'MAGNETO',
    hint:
      'Magnete ziehen dich vom Kurs. Gegen das Feld früh steuern, nicht spät.',
    width: 114,
    height: 62,
    seed: 1006,
    par: 110,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'room', x: 34, y: 10, w: 20, h: 34 },
      { t: 'cave', cx: 72, cy: 40, rx: 12, ry: 10 },
      { t: 'cave', cx: 98, cy: 18, rx: 12, ry: 9 },
      tube(2.6, [20, 15], [30, 16], [40, 16]),
      tube(2.6, [44, 40], [58, 42], [72, 40]),
      tube(2.4, [72, 40], [88, 28], [98, 18]),
      tube(1.9, [98, 18], [66, 10], [20, 15]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 94, y: 11, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'magnet', x: 34, y: 27, strength: 16, radius: 12 },
      { t: 'magnet', x: 54, y: 34, strength: 16, radius: 12 },
      { t: 'magnet', x: 72, y: 50, strength: -14, radius: 11 },
      { t: 'cargo', x: 98, y: 16 },
      { t: 'cargo', x: 72, y: 38 },
    ],
  },

  // 7 ------------------------------------------------------------------------
  {
    id: 7,
    name: 'Aufwind',
    password: 'ZEPHYR',
    hint:
      'Gebläse drücken hart in ihrem Schacht. Mitfliegen, niemals quer dagegen.',
    width: 114,
    height: 68,
    seed: 1007,
    par: 110,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'room', x: 36, y: 8, w: 12, h: 46 },
      { t: 'room', x: 64, y: 8, w: 12, h: 46 },
      { t: 'cave', cx: 96, cy: 46, rx: 13, ry: 11 },
      tube(2.6, [20, 15], [30, 14], [42, 14]),
      tube(2.4, [42, 50], [56, 52], [70, 50]),
      tube(2.4, [70, 14], [84, 20], [96, 30]),
      tube(2.4, [96, 30], [96, 46]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 90, y: 38, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'fan', x: 36, y: 8, w: 12, h: 46, dir: 90, force: 11 },
      { t: 'fan', x: 64, y: 8, w: 12, h: 46, dir: 270, force: 7 },
      { t: 'cargo', x: 96, y: 44 },
      { t: 'cargo', x: 100, y: 50 },
    ],
  },

  // 8 ------------------------------------------------------------------------
  {
    id: 8,
    name: 'Kolben',
    password: 'PISTON',
    hint:
      'Stäbe zerquetschen. Anders als Tore schieben sie dich nicht weg – die Lücke abpassen.',
    width: 118,
    height: 62,
    seed: 1008,
    par: 115,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'room', x: 34, y: 9, w: 50, h: 14 },
      { t: 'cave', cx: 100, cy: 20, rx: 12, ry: 10 },
      { t: 'cave', cx: 62, cy: 46, rx: 14, ry: 9 },
      tube(2.6, [20, 15], [30, 15], [40, 15]),
      tube(2.6, [80, 16], [92, 18], [100, 20]),
      tube(2.3, [100, 20], [82, 40], [62, 46]),
      tube(2.0, [62, 46], [34, 36], [20, 15]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 96, y: 12, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'rod', x: 44, y: 9, w: 2, h: 9, axis: 'y', travel: 9, period: 2.4, phase: 0 },
      { t: 'rod', x: 56, y: 14, w: 2, h: 9, axis: 'y', travel: 9, period: 2.4, phase: 0.5 },
      { t: 'rod', x: 68, y: 9, w: 2, h: 9, axis: 'y', travel: 9, period: 2.0, phase: 0.25 },
      { t: 'rod', x: 52, y: 42, w: 10, h: 2, axis: 'x', travel: 14, period: 3.2, phase: 0 },
      { t: 'cargo', x: 100, y: 18 },
      { t: 'cargo', x: 62, y: 44 },
    ],
  },

  // 9 ------------------------------------------------------------------------
  {
    id: 9,
    name: 'Schleuse',
    password: 'FLOODGATE',
    hint:
      'Schleusen öffnen nur für eine Hülle, die schon in ihre Richtung fliegt. Ganz oder gar nicht.',
    width: 118,
    height: 64,
    seed: 1009,
    par: 115,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'cave', cx: 52, cy: 18, rx: 11, ry: 9 },
      { t: 'cave', cx: 88, cy: 24, rx: 12, ry: 10 },
      { t: 'cave', cx: 60, cy: 50, rx: 13, ry: 9 },
      tube(2.4, [20, 15], [36, 16], [52, 18]),
      tube(2.4, [52, 18], [70, 21], [88, 24]),
      tube(2.4, [88, 24], [74, 40], [60, 50]),
      tube(2.2, [60, 50], [36, 34], [20, 15]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 48, y: 11, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'sluice', x: 70, y: 16, w: 2, h: 10, dir: 0 },
      { t: 'sluice', x: 73, y: 34, w: 8, h: 2, dir: 90 },
      { t: 'cargo', x: 88, y: 22 },
      { t: 'cargo', x: 60, y: 48 },
      { t: 'cargo', x: 64, y: 53 },
    ],
  },

  // 10 -----------------------------------------------------------------------
  {
    id: 10,
    name: 'Schmelztiegel',
    password: 'CRUCIBLE',
    hint:
      'Halbzeit. Stäbe und Kanonen teilen sich einen Raum – eine Gefahr nach der anderen ist vorbei.',
    width: 124,
    height: 66,
    seed: 1010,
    par: 125,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'room', x: 34, y: 10, w: 54, h: 16 },
      { t: 'cave', cx: 106, cy: 24, rx: 13, ry: 11 },
      { t: 'cave', cx: 66, cy: 50, rx: 15, ry: 10 },
      { t: 'cave', cx: 26, cy: 46, rx: 10, ry: 8 },
      tube(2.6, [20, 15], [30, 16], [40, 17]),
      tube(2.6, [84, 18], [96, 21], [106, 24]),
      tube(2.4, [106, 24], [86, 42], [66, 50]),
      tube(2.4, [66, 50], [44, 50], [26, 46]),
      tube(2.2, [26, 46], [20, 30], [20, 15]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 102, y: 15, w: 6, kind: 'fuel' },
      { x: 22, y: 40, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'rod', x: 48, y: 10, w: 2, h: 10, axis: 'y', travel: 8, period: 2.2, phase: 0 },
      { t: 'rod', x: 62, y: 16, w: 2, h: 10, axis: 'y', travel: 8, period: 2.2, phase: 0.5 },
      { t: 'rod', x: 76, y: 10, w: 2, h: 10, axis: 'y', travel: 8, period: 1.9, phase: 0.2 },
      { t: 'cannon', x: 42, y: 12, dir: 0, period: 2.2, phase: 0 },
      { t: 'cannon', x: 86, y: 24, dir: 180, period: 2.4, phase: 0.4 },
      { t: 'cargo', x: 106, y: 22 },
      { t: 'cargo', x: 66, y: 48 },
      { t: 'cargo', x: 70, y: 53 },
    ],
  },

  // 11 -----------------------------------------------------------------------
  {
    id: 11,
    name: 'Frostbiss',
    password: 'FROSTBITE',
    hint:
      'Rotes Kristall tötet bei jedem Tempo. Fels lässt dich wenigstens auf einem Feld landen.',
    width: 124,
    height: 66,
    seed: 1011,
    par: 120,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'room', x: 34, y: 12, w: 20, h: 34 },
      { t: 'room', x: 58, y: 12, w: 22, h: 12 },
      { t: 'cave', cx: 102, cy: 20, rx: 14, ry: 11 },
      { t: 'cave', cx: 92, cy: 50, rx: 12, ry: 9 },
      tube(2.6, [20, 15], [30, 16], [40, 17]),
      tube(2.4, [44, 40], [56, 34], [68, 20]),
      tube(2.4, [76, 18], [92, 19], [102, 20]),
      tube(2.4, [102, 20], [100, 36], [92, 50]),
      tube(2.0, [92, 50], [50, 52], [20, 24]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 98, y: 12, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'spikes', x: 36, y: 12, w: 16, h: 2 },
      { t: 'spikes', x: 58, y: 12, w: 22, h: 2 },
      { t: 'spikes', x: 58, y: 22, w: 22, h: 2 },
      { t: 'spikes', x: 34, y: 30, w: 8, h: 2 },
      { t: 'spikes', x: 46, y: 38, w: 8, h: 2 },
      { t: 'cargo', x: 102, y: 18 },
      { t: 'cargo', x: 92, y: 48 },
    ],
  },

  // 12 -----------------------------------------------------------------------
  {
    id: 12,
    name: 'Nest',
    password: 'HORNET',
    hint:
      'Geschütze zielen vorausschauend. Sichtlinie brechen oder die Vorhaltung ausfliegen.',
    width: 124,
    height: 68,
    seed: 1012,
    par: 125,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'cave', cx: 56, cy: 26, rx: 14, ry: 11 },
      { t: 'cave', cx: 100, cy: 22, rx: 13, ry: 10 },
      { t: 'cave', cx: 78, cy: 52, rx: 13, ry: 9 },
      { t: 'cave', cx: 30, cy: 48, rx: 11, ry: 8 },
      tube(2.4, [20, 15], [38, 20], [56, 26]),
      tube(2.4, [56, 26], [80, 24], [100, 22]),
      tube(2.4, [100, 22], [90, 40], [78, 52]),
      tube(2.4, [78, 52], [54, 52], [30, 48]),
      tube(2.2, [30, 48], [22, 30], [20, 15]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 96, y: 14, w: 6, kind: 'fuel' },
      { x: 26, y: 42, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'turret', x: 56, y: 34, period: 2.1, range: 20 },
      { t: 'turret', x: 90, y: 30, period: 2.4, range: 22, phase: 0.4 },
      { t: 'turret', x: 60, y: 50, period: 2.6, range: 20, phase: 0.7 },
      { t: 'cargo', x: 100, y: 20 },
      { t: 'cargo', x: 78, y: 50 },
      { t: 'cargo', x: 30, y: 46 },
    ],
  },

  // 13 -----------------------------------------------------------------------
  {
    id: 13,
    name: 'Glühwürmchen',
    password: 'GLOWORM',
    hint:
      'Die Höhle ist unbeleuchtet. Deine Lampe ist alles – langsam genug fliegen, um die Kurve zu sehen.',
    width: 124,
    height: 66,
    seed: 1013,
    par: 130,
    dark: 13,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 12, ry: 9 },
      tube(2.3, [20, 15], [40, 12], [58, 22], [46, 36], [30, 44], [50, 54], [76, 50], [88, 36], [74, 26], [96, 18], [110, 30]),
      { t: 'cave', cx: 110, cy: 32, rx: 10, ry: 9 },
      { t: 'cave', cx: 50, cy: 55, rx: 8, ry: 6 },
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 106, y: 25, w: 6, kind: 'fuel' },
      // Playtesting: the snake is long enough that a single pad at the far end
      // makes the return leg a coin flip. This one sits at the halfway bend.
      { x: 47, y: 50, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'cargo', x: 110, y: 32 },
      { t: 'cargo', x: 50, y: 55 },
    ],
  },

  // 14 -----------------------------------------------------------------------
  {
    id: 14,
    name: 'Kehrtwende',
    password: 'UPTURN',
    hint:
      'Violette Felder drehen die Schwerkraft um. Unten wird oben, sobald du die Linie kreuzt.',
    width: 124,
    height: 72,
    seed: 1014,
    par: 130,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'room', x: 34, y: 10, w: 26, h: 52 },
      { t: 'room', x: 64, y: 10, w: 24, h: 52 },
      { t: 'cave', cx: 106, cy: 50, rx: 13, ry: 11 },
      tube(2.6, [20, 15], [30, 15], [42, 15]),
      tube(2.6, [52, 56], [62, 58], [72, 56]),
      tube(2.6, [82, 20], [96, 32], [106, 44]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      // Keep the pad clear of the tunnel mouth: pad foundations are solid rock
      // and would otherwise seal the only way in.
      { x: 110, y: 42, w: 6, kind: 'fuel' },
      { x: 66, y: 12, w: 6, kind: 'pad' },
    ],
    zones: [
      { x: 34, y: 10, w: 26, h: 52, gravityScale: -0.85, label: 'inverted' },
      { x: 64, y: 10, w: 24, h: 52, gravityScale: 1.15 },
    ],
    objects: [
      { t: 'cargo', x: 46, y: 56 },
      { t: 'cargo', x: 106, y: 48 },
      { t: 'cargo', x: 110, y: 54 },
    ],
  },

  // 15 -----------------------------------------------------------------------
  {
    id: 15,
    name: 'Katarakt',
    password: 'CATARACT',
    hint:
      'Ein langer Sturz ist gratis Tempo und gratis Flow – wenn du unten noch bremsen kannst.',
    width: 100,
    height: 92,
    seed: 1015,
    par: 125,
    spawn: { x: 20, y: 80 },
    carve: [
      { t: 'cave', cx: 22, cy: 80, rx: 13, ry: 8 },
      tube(2.6, [22, 80], [40, 74], [30, 62], [48, 52], [34, 40], [52, 30], [40, 20]),
      { t: 'cave', cx: 34, cy: 16, rx: 14, ry: 9 },
      { t: 'cave', cx: 76, cy: 24, rx: 13, ry: 10 },
      { t: 'cave', cx: 78, cy: 62, rx: 12, ry: 10 },
      tube(2.4, [34, 16], [56, 20], [76, 24]),
      tube(2.4, [76, 24], [80, 44], [78, 62]),
      tube(2.2, [78, 62], [50, 76], [22, 80]),
    ],
    pads: [
      { x: 28, y: 9, w: 8, kind: 'base' },
      { x: 72, y: 16, w: 6, kind: 'fuel' },
      { x: 16, y: 74, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'cargo', x: 76, y: 22 },
      { t: 'cargo', x: 78, y: 60 },
      { t: 'cargo', x: 82, y: 66 },
    ],
  },

  // 16 -----------------------------------------------------------------------
  {
    id: 16,
    name: 'Mäander',
    password: 'MEANDER',
    hint:
      'Drei Schlüssel, drei Tore, eine Hülle. Reihenfolge planen, bevor der Sprit weg ist.',
    width: 134,
    height: 72,
    seed: 1016,
    par: 150,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'cave', cx: 52, cy: 20, rx: 11, ry: 9 },
      { t: 'cave', cx: 86, cy: 16, rx: 11, ry: 9 },
      { t: 'cave', cx: 116, cy: 30, rx: 12, ry: 10 },
      { t: 'cave', cx: 88, cy: 52, rx: 12, ry: 9 },
      { t: 'cave', cx: 52, cy: 56, rx: 11, ry: 9 },
      { t: 'cave', cx: 22, cy: 46, rx: 10, ry: 8 },
      tube(2.3, [20, 15], [36, 17], [52, 20]),
      tube(2.3, [52, 20], [70, 18], [86, 16]),
      tube(2.3, [86, 16], [104, 22], [116, 30]),
      tube(2.3, [116, 30], [104, 44], [88, 52]),
      tube(2.3, [88, 52], [70, 56], [52, 56]),
      tube(2.3, [52, 56], [34, 52], [22, 46]),
      tube(2.1, [22, 46], [20, 30], [20, 15]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 48, y: 13, w: 6, kind: 'fuel' },
      { x: 84, y: 46, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'key', x: 52, y: 20, color: 'red' },
      { t: 'gate', x: 68, y: 11, w: 2, h: 11, color: 'red' },
      { t: 'key', x: 116, y: 30, color: 'green' },
      { t: 'gate', x: 100, y: 40, w: 2, h: 12, color: 'green' },
      { t: 'key', x: 88, y: 52, color: 'blue' },
      { t: 'gate', x: 68, y: 50, w: 2, h: 12, color: 'blue' },
      { t: 'cargo', x: 52, y: 56 },
      { t: 'cargo', x: 22, y: 46 },
      { t: 'cargo', x: 86, y: 14 },
    ],
  },

  // 17 -----------------------------------------------------------------------
  {
    id: 17,
    name: 'Blasebalg',
    password: 'BELLOWS',
    hint:
      'Wind und Magnetismus gleichzeitig. Kurs gegen beide trimmen, bevor du dich festlegst.',
    width: 128,
    height: 72,
    seed: 1017,
    par: 145,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'room', x: 34, y: 10, w: 14, h: 50 },
      { t: 'room', x: 52, y: 10, w: 14, h: 50 },
      { t: 'room', x: 70, y: 10, w: 14, h: 50 },
      { t: 'cave', cx: 110, cy: 24, rx: 13, ry: 11 },
      { t: 'cave', cx: 104, cy: 56, rx: 11, ry: 9 },
      tube(2.6, [20, 15], [30, 14], [40, 14]),
      tube(2.6, [40, 54], [52, 56], [58, 54]),
      tube(2.6, [58, 16], [70, 14], [76, 16]),
      tube(2.6, [76, 50], [92, 54], [104, 56]),
      tube(2.6, [104, 56], [112, 40], [110, 24]),
      tube(2.2, [110, 24], [98, 14], [84, 14]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 106, y: 16, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'fan', x: 34, y: 10, w: 14, h: 50, dir: 90, force: 13 },
      { t: 'fan', x: 52, y: 10, w: 14, h: 50, dir: 270, force: 11 },
      { t: 'fan', x: 70, y: 10, w: 14, h: 50, dir: 90, force: 12 },
      { t: 'magnet', x: 48, y: 34, strength: 15, radius: 11 },
      { t: 'magnet', x: 68, y: 40, strength: -15, radius: 11 },
      { t: 'cargo', x: 110, y: 22 },
      { t: 'cargo', x: 104, y: 54 },
      { t: 'cargo', x: 114, y: 28 },
    ],
  },

  // 18 -----------------------------------------------------------------------
  {
    id: 18,
    name: 'Eisenpanzer',
    password: 'IRONCLAD',
    hint:
      'Alles, was die Höhle über dich gelernt hat, in einem Anlauf.',
    width: 134,
    height: 74,
    seed: 1018,
    par: 165,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'room', x: 34, y: 10, w: 44, h: 14 },
      { t: 'cave', cx: 100, cy: 20, rx: 13, ry: 10 },
      { t: 'cave', cx: 118, cy: 48, rx: 11, ry: 10 },
      { t: 'cave', cx: 82, cy: 56, rx: 13, ry: 10 },
      { t: 'cave', cx: 44, cy: 52, rx: 12, ry: 9 },
      { t: 'cave', cx: 20, cy: 44, rx: 9, ry: 8 },
      tube(2.5, [20, 15], [30, 15], [40, 16]),
      tube(2.5, [74, 17], [88, 19], [100, 20]),
      tube(2.4, [100, 20], [114, 34], [118, 48]),
      tube(2.4, [118, 48], [100, 54], [82, 56]),
      tube(2.4, [82, 56], [62, 55], [44, 52]),
      tube(2.3, [44, 52], [30, 50], [20, 44]),
      tube(2.1, [20, 44], [18, 30], [20, 15]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 96, y: 12, w: 6, kind: 'fuel' },
      { x: 40, y: 46, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'rod', x: 46, y: 10, w: 2, h: 9, axis: 'y', travel: 8, period: 2.0, phase: 0 },
      { t: 'rod', x: 60, y: 15, w: 2, h: 9, axis: 'y', travel: 8, period: 2.0, phase: 0.5 },
      { t: 'cannon', x: 70, y: 12, dir: 180, period: 2.0, phase: 0.3 },
      { t: 'turret', x: 104, y: 40, period: 2.2, range: 22 },
      { t: 'magnet', x: 118, y: 60, strength: 17, radius: 12 },
      { t: 'sluice', x: 62, y: 50, w: 2, h: 12, dir: 180 },
      { t: 'key', x: 118, y: 48, color: 'amber' },
      { t: 'gate', x: 32, y: 44, w: 2, h: 12, color: 'amber' },
      { t: 'spikes', x: 34, y: 10, w: 10, h: 1 },
      { t: 'cargo', x: 100, y: 18 },
      { t: 'cargo', x: 82, y: 54 },
      { t: 'cargo', x: 20, y: 44 },
    ],
  },

  // 19 -----------------------------------------------------------------------
  {
    id: 19,
    name: 'Sturzflug',
    password: 'PLUMMET',
    hint:
      'Knappe Tanks, tiefer Schacht. Jedes ausgelassene Feld ist eine Wette, die du zweimal gewinnen musst.',
    width: 108,
    height: 96,
    seed: 1019,
    par: 175,
    fuel: 62,
    spawn: { x: 18, y: 84 },
    carve: [
      { t: 'cave', cx: 20, cy: 84, rx: 12, ry: 8 },
      { t: 'cave', cx: 58, cy: 78, rx: 12, ry: 9 },
      { t: 'cave', cx: 88, cy: 64, rx: 11, ry: 9 },
      { t: 'cave', cx: 60, cy: 48, rx: 12, ry: 9 },
      { t: 'cave', cx: 26, cy: 36, rx: 11, ry: 9 },
      { t: 'cave', cx: 62, cy: 18, rx: 14, ry: 10 },
      { t: 'cave', cx: 94, cy: 30, rx: 11, ry: 9 },
      tube(2.3, [20, 84], [40, 82], [58, 78]),
      tube(2.3, [58, 78], [76, 72], [88, 64]),
      tube(2.3, [88, 64], [74, 56], [60, 48]),
      tube(2.3, [60, 48], [42, 44], [26, 36]),
      tube(2.3, [26, 36], [40, 24], [62, 18]),
      tube(2.3, [62, 18], [82, 22], [94, 30]),
      tube(2.0, [94, 30], [96, 50], [88, 64]),
    ],
    pads: [
      { x: 56, y: 11, w: 8, kind: 'base' },
      { x: 54, y: 71, w: 6, kind: 'fuel' },
      { x: 22, y: 30, w: 6, kind: 'fuel' },
      { x: 90, y: 24, w: 6, kind: 'fuel' },
    ],
    objects: [
      { t: 'cargo', x: 88, y: 64 },
      { t: 'cargo', x: 26, y: 36 },
      { t: 'cargo', x: 94, y: 30 },
      { t: 'turret', x: 60, y: 54, period: 2.4, range: 20 },
      { t: 'cannon', x: 44, y: 42, dir: 0, period: 2.2 },
    ],
  },

  // 20 -----------------------------------------------------------------------
  {
    id: 20,
    name: 'Abendrot',
    password: 'EVENTIDE',
    hint:
      'Ein kollabierter Kern zieht immer noch. Alles andere ist auch noch wach. Bring sie heim.',
    width: 138,
    height: 82,
    seed: 1020,
    par: 200,
    spawn: { x: 16, y: 16 },
    carve: [
      { t: 'cave', cx: 20, cy: 15, rx: 13, ry: 9 },
      { t: 'cave', cx: 69, cy: 42, rx: 26, ry: 22 },
      { t: 'cave', cx: 120, cy: 20, rx: 12, ry: 10 },
      { t: 'cave', cx: 122, cy: 64, rx: 12, ry: 10 },
      { t: 'cave', cx: 24, cy: 66, rx: 11, ry: 9 },
      tube(2.4, [20, 15], [42, 22], [58, 30]),
      tube(2.4, [88, 32], [106, 24], [120, 20]),
      tube(2.4, [120, 20], [130, 42], [122, 64]),
      tube(2.4, [122, 64], [96, 60], [82, 54]),
      tube(2.4, [52, 54], [36, 62], [24, 66]),
      tube(2.2, [24, 66], [18, 40], [20, 15]),
    ],
    pads: [
      { x: 14, y: 8, w: 7, kind: 'base' },
      { x: 116, y: 12, w: 6, kind: 'fuel' },
      { x: 20, y: 60, w: 6, kind: 'fuel' },
    ],
    wells: [{ x: 69, y: 42, strength: 22, radius: 20 }],
    objects: [
      { t: 'spikes', x: 65, y: 38, w: 8, h: 8 },
      { t: 'turret', x: 100, y: 44, period: 2.0, range: 24 },
      { t: 'turret', x: 40, y: 34, period: 2.2, range: 22, phase: 0.5 },
      { t: 'cannon', x: 69, y: 66, dir: 270, period: 1.8 },
      { t: 'rod', x: 68, y: 20, w: 2, h: 10, axis: 'x', travel: 20, period: 3.4 },
      { t: 'magnet', x: 122, y: 78, strength: 16, radius: 12 },
      { t: 'key', x: 122, y: 64, color: 'amber' },
      { t: 'gate', x: 44, y: 58, w: 2, h: 12, color: 'amber' },
      { t: 'cargo', x: 120, y: 18 },
      { t: 'cargo', x: 24, y: 66 },
      { t: 'cargo', x: 122, y: 68 },
    ],
  },
];

export const LEVEL_COUNT = LEVELS.length;

export function levelByPassword(pw: string): LevelSpec | null {
  const norm = pw.trim().toUpperCase();
  return LEVELS.find((l) => l.password === norm) ?? null;
}
