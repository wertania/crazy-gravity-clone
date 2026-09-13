/**
 * The orchestrator: owns the state machine, wires input to the simulation and
 * the simulation to the view, and keeps progress on disk.
 *
 * The simulation itself lives in src/sim and knows nothing about any of this.
 */

import * as THREE from 'three';
import {
  FIXED_DT,
  GAME_SPEEDS,
  difficultyById,
  gameSpeedById,
  type DifficultyId,
  type GameSpeedId,
} from '../sim/config';
import { buildLevel } from '../sim/level';
import { LEVELS, levelByPassword } from '../sim/levels';
import { createWorld, medalFor, stepWorld, type World } from '../sim/world';
import type { SimEvent } from '../sim/types';
import { BLOOM_BASE, Stage } from '../render/scene';
import { Terrain } from '../render/terrain';
import { Props, ShipView, KEY_HEX } from '../render/actors';
import type { KeyColor } from '../sim/types';
import { Particles } from '../render/particles';
import { Backdrop } from '../render/backdrop';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import { THROTTLE_MODES, TouchControls } from '../ui/touch';
import { Input, type Command } from './input';
import { FixedLoop } from './loop';
import { Audio } from '../audio/audio';
import * as Save from './save';

type Mode =
  | 'title'
  | 'difficulty'
  | 'settings'
  | 'levels'
  | 'password'
  | 'help'
  | 'briefing'
  | 'playing'
  | 'paused'
  | 'cleared'
  | 'gameover'
  | 'complete';

const KEY_NAME_DE: Record<KeyColor, string> = {
  red: 'rot',
  green: 'grün',
  blue: 'blau',
  amber: 'bernstein',
};

interface Snapshot {
  x: number;
  y: number;
  angle: number;
}

export interface GameHooks {
  /** The WebGL context exists; shader compilation is about to happen. */
  onRendererReady?: () => void;
  /** The first frame has been composited. */
  onFirstFrame?: () => void;
}

export class Game {
  private readonly stage: Stage;
  private readonly hud = new Hud();
  private readonly screens = new Screens();
  private readonly touch: TouchControls;
  private readonly input: Input;
  private readonly audio = new Audio();
  private readonly particles = new Particles();
  private readonly loop: FixedLoop;

  private save: Save.SaveData;
  private mode: Mode = 'title';

  private world: World | null = null;
  private levelId = 1;
  private terrain: Terrain | null = null;
  private props: Props | null = null;
  private backdrop: Backdrop | null = null;
  private readonly ship = new ShipView();

  private prev: Snapshot = { x: 0, y: 0, angle: 0 };
  private curr: Snapshot = { x: 0, y: 0, angle: 0 };

  /** Slow drift used behind menus so the title screen is not a still image. */
  private cineT = 0;
  private debug = false;
  /** Rolling frame-time budget used to pick a quality tier. */
  private slowFor = 0;
  private fastFor = 0;
  private debugEl: HTMLElement | null = null;
  private zoom = 1;

  private firstFrameDone = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly hooks: GameHooks = {},
  ) {
    this.stage = new Stage(canvas);
    hooks.onRendererReady?.();
    this.stage.world.add(this.ship.group, this.particles.points);
    this.save = Save.load();
    this.audio.setMuted(this.save.muted);

    this.input = new Input();
    this.input.onCommand((c) => this.onCommand(c));
    this.touch = new TouchControls(() => this.onCommand('pause'));
    this.input.touch = () => this.touch.state();
    // Flipping the mode on the overlay has to stick, same as flipping it in
    // the settings screen.
    this.touch.onThrottleModeChange = (m) => {
      this.save = { ...this.save, throttleMode: m };
      Save.save(this.save);
    };
    this.screens.setSoundHook((k) => this.audio.ui(k));

    // Any gesture is enough to let the browser start audio.
    const unlock = () => this.audio.resume();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.loop = new FixedLoop(
      (dt) => this.step(dt),
      (alpha, simDt, realDt) => this.draw(alpha, simDt, realDt),
    );

    this.applySettings();
    this.levelId = Math.min(this.save.unlocked, LEVELS.length);
    this.loadLevel(this.levelId);
    this.showTitle();
    this.loop.start();
  }

  /** Push the saved settings into the systems that consume them. */
  private applySettings() {
    this.loop.timeScale = gameSpeedById(this.save.gameSpeed).scale;
    this.audio.setMuted(this.save.muted);
    this.touch.setThrottleMode(this.save.throttleMode);
  }

  private updateRotateHint() {
    const portrait = window.innerHeight > window.innerWidth;
    this.hud.setRotateHint(this.mode === 'playing' && this.touch.visible && portrait);
  }

  /** Whether the on-screen sliders should be mounted right now. */
  private wantsTouch(): boolean {
    if (this.save.touch === 'on') return true;
    if (this.save.touch === 'off') return false;
    return TouchControls.deviceHasTouch();
  }

  // -------------------------------------------------------------------------
  // Level lifecycle
  // -------------------------------------------------------------------------

  private loadLevel(id: number) {
    this.levelId = id;
    const spec = LEVELS[id - 1];
    const level = buildLevel(spec);
    const diff = difficultyById(this.save.difficulty);
    this.world = createWorld(level, diff);

    this.terrain?.dispose();
    this.props?.dispose();
    this.backdrop?.dispose();
    this.particles.clear();

    this.terrain = new Terrain(level);
    this.props = new Props(this.world);
    this.backdrop = new Backdrop(spec.seed, level.width, level.height, level.dark);

    this.stage.world.add(this.terrain.group, this.props.group);
    this.stage.farField.add(this.backdrop.group);
    this.stage.setDarkness(level.dark);

    const s = this.world.ship;
    this.prev = { x: s.pos.x, y: s.pos.y, angle: s.angle };
    this.curr = { ...this.prev };
    this.stage.snapTo(s.pos.x, s.pos.y);
    this.hud.bind(this.world);
    this.cineT = 0;
  }

  private restartLevel() {
    this.loadLevel(this.levelId);
    this.enterPlaying();
  }

  // -------------------------------------------------------------------------
  // Modes
  // -------------------------------------------------------------------------

  private showTitle() {
    this.mode = 'title';
    this.hud.show(false);
    this.touch.setVisible(false);
    this.hud.setRotateHint(false);
    this.audio.ambience(0.45);
    this.screens.title(this.save, {
      play: () => this.showBriefing(Math.min(this.save.unlocked, LEVELS.length)),
      settings: () => this.showSettings(),
    });
  }

  private showDifficulty() {
    this.mode = 'difficulty';
    this.screens.difficulty(
      this.save.difficulty,
      (id: DifficultyId) => {
        this.save = { ...this.save, difficulty: id };
        Save.save(this.save);
        this.applySettings();
        // The active world caches difficulty-scaled values, so rebuild it.
        this.loadLevel(this.levelId);
        this.showSettings();
      },
      () => this.showSettings(),
    );
  }

  private showSettings() {
    this.mode = 'settings';
    this.screens.settings(this.save, {
      difficulty: () => this.showDifficulty(),
      speed: () => {
        // Cycle rather than open a submenu: four options is not worth a screen.
        const i = GAME_SPEEDS.findIndex((g) => g.id === this.save.gameSpeed);
        const next = GAME_SPEEDS[(i + 1) % GAME_SPEEDS.length].id as GameSpeedId;
        this.save = { ...this.save, gameSpeed: next };
        Save.save(this.save);
        this.applySettings();
        this.showSettings();
      },
      touch: () => {
        const order = ['auto', 'on', 'off'] as const;
        const next = order[(order.indexOf(this.save.touch) + 1) % order.length];
        this.save = { ...this.save, touch: next };
        Save.save(this.save);
        this.showSettings();
      },
      throttleMode: () => {
        const i = THROTTLE_MODES.indexOf(this.save.throttleMode);
        const next = THROTTLE_MODES[(i + 1) % THROTTLE_MODES.length];
        this.save = { ...this.save, throttleMode: next };
        Save.save(this.save);
        this.applySettings();
        this.showSettings();
      },
      sound: () => {
        this.toggleMute();
        this.showSettings();
      },
      help: () => this.showHelp(),
      reset: () => {
        this.save = Save.reset();
        this.applySettings();
        this.loadLevel(1);
        this.showSettings();
      },
      back: () => this.showTitle(),
    });
  }

  private showLevels() {
    this.mode = 'levels';
    this.screens.levelSelect(
      this.save,
      this.levelId,
      (id) => this.showBriefing(id),
      () => this.showPassword(),
      () => this.showBriefing(this.levelId),
    );
  }

  private showPassword() {
    this.mode = 'password';
    this.input.captureText = true;
    this.screens.password(
      (pw) => {
        const spec = levelByPassword(pw);
        if (!spec) {
          this.audio.ui('deny');
          this.screens.passwordError('Kein gültiges Passwort.');
          return;
        }
        this.input.captureText = false;
        this.audio.ui('select');
        // A valid password unlocks its cave, exactly like the original.
        this.save = { ...this.save, unlocked: Math.max(this.save.unlocked, spec.id) };
        Save.save(this.save);
        this.showBriefing(spec.id);
      },
      () => {
        this.input.captureText = false;
        this.showLevels();
      },
    );
  }

  private showHelp() {
    this.mode = 'help';
    this.screens.help(() => this.showSettings());
  }

  private showBriefing(id: number) {
    if (this.levelId !== id || !this.world || this.world.status !== 'playing' || this.world.time > 0) {
      this.loadLevel(id);
    }
    this.mode = 'briefing';
    this.hud.show(false);
    this.touch.setVisible(false);
    this.hud.setRotateHint(false);
    const spec = LEVELS[id - 1];
    const rec = this.save.levels[id];
    this.screens.briefing(
      id,
      spec.password,
      spec.hint,
      rec?.cleared ? { time: rec.bestTime, medal: rec.medal } : null,
      () => this.enterPlaying(),
      () => this.showLevels(),
      () => this.showTitle(),
    );
  }

  private enterPlaying() {
    if (!this.world) return;
    this.mode = 'playing';
    this.screens.hide();
    this.hud.show(true);
    this.touch.reset();
    this.touch.setVisible(this.wantsTouch());
    this.updateRotateHint();
    this.input.clear();
    this.audio.resume();
    this.audio.ambience(1);
    this.stage.snapTo(this.world.ship.pos.x, this.world.ship.pos.y);
  }

  private pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.touch.setVisible(false);
    this.audio.engine(0, 0);
    this.audio.ambience(0.4);
    this.screens.paused(
      () => this.enterPlaying(),
      () => this.restartLevel(),
      () => this.showTitle(),
      this.audio.muted,
      () => {
        this.toggleMute();
        this.pauseRefresh();
      },
    );
  }

  private pauseRefresh() {
    // Re-render the pause panel so the sound label reflects the new state.
    this.mode = 'playing';
    this.pause();
  }

  private finishLevel() {
    const world = this.world!;
    const medal = medalFor(world);
    this.save = Save.recordLevel(this.save, this.levelId, {
      score: world.score,
      time: world.time,
      medal,
    });
    this.mode = 'cleared';
    this.hud.show(false);
    this.touch.setVisible(false);
    this.hud.setRotateHint(false);
    this.audio.ambience(0.4);

    const isLast = this.levelId >= LEVELS.length;
    const nextPassword = isLast ? null : LEVELS[this.levelId].password;
    this.screens.cleared(
      this.levelId,
      world.clearBreakdown!,
      world.time,
      medal,
      world.stats.deaths,
      nextPassword,
      () => (isLast ? this.showComplete() : this.showBriefing(this.levelId + 1)),
      () => this.restartLevel(),
      () => this.showTitle(),
    );
  }

  private showComplete() {
    this.mode = 'complete';
    this.screens.campaignComplete(this.save, () => this.showTitle());
  }

  private gameOver() {
    const world = this.world!;
    this.save = { ...this.save, wrecks: this.save.wrecks + world.stats.deaths };
    Save.save(this.save);
    this.mode = 'gameover';
    this.hud.show(false);
    this.touch.setVisible(false);
    this.hud.setRotateHint(false);
    this.audio.ambience(0.4);
    const reason =
      world.time > world.timeLimit && world.diff.hardTimeLimit
        ? 'Die Zeit war abgelaufen, bevor die Fracht zu Hause war.'
        : 'Das letzte Schiff liegt in Einzelteilen auf dem Fels.';
    this.screens.gameOver(
      this.levelId,
      world.score,
      reason,
      () => this.restartLevel(),
      () => this.showTitle(),
    );
  }

  /**
   * Esc/back walks one step up the menu tree rather than jumping to the title,
   * so the submenus feel like submenus.
   */
  private goBack() {
    switch (this.mode) {
      case 'title':
        break;
      case 'difficulty':
      case 'help':
        this.showSettings();
        break;
      case 'levels':
        this.showBriefing(this.levelId);
        break;
      default:
        this.showTitle();
        break;
    }
  }

  private toggleMute() {
    this.save = { ...this.save, muted: !this.audio.muted };
    this.audio.setMuted(this.save.muted);
    Save.save(this.save);
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  private onCommand(c: Command) {
    if (c === 'debug') {
      this.debug = !this.debug;
      if (this.debugEl) this.debugEl.hidden = !this.debug;
      return;
    }
    if (c === 'mute' && !this.input.captureText) {
      this.toggleMute();
      this.hud.flash(this.audio.muted ? 'TON AUS' : 'TON AN', 1.1);
      return;
    }

    switch (this.mode) {
      case 'playing':
        if (c === 'pause') this.pause();
        if (c === 'restart') this.restartLevel();
        break;
      case 'paused':
        if (c === 'pause') this.enterPlaying();
        else if (c === 'restart') this.restartLevel();
        else if (c === 'up') this.screens.move(-1);
        else if (c === 'down') this.screens.move(1);
        else if (c === 'confirm') this.screens.confirm();
        break;
      case 'password':
        break; // the text field owns the keyboard
      default:
        if (c === 'up') this.screens.move(-1);
        else if (c === 'down') this.screens.move(1);
        else if (c === 'confirm') this.screens.confirm();
        else if (c === 'back' || c === 'pause') {
          this.goBack();
        } else if (c === 'restart' && this.mode === 'cleared') {
          this.restartLevel();
        }
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  private step(dt: number) {
    this.input.pollCommands();
    const world = this.world;
    if (!world || this.mode !== 'playing') return;

    this.prev = { ...this.curr };
    stepWorld(world, this.input.frame(), dt);
    this.curr = { x: world.ship.pos.x, y: world.ship.pos.y, angle: world.ship.angle };

    if (world.events.length) {
      for (const e of world.events) this.onSimEvent(e);
      world.events.length = 0;
    }

    if (world.status === 'cleared') this.finishLevel();
    else if (world.status === 'gameover') this.gameOver();
  }

  private onSimEvent(e: SimEvent) {
    this.audio.event(e.type, e.value ?? 0);
    const p = this.particles;
    switch (e.type) {
      case 'crash':
        p.burst(e.x, e.y, 90, 16, 0xffb060, 0.5, 1.0);
        p.burst(e.x, e.y, 50, 9, 0xff4a3c, 0.7, 1.3);
        p.burst(e.x, e.y, 30, 22, 0xffffff, 0.3, 0.4);
        this.hud.flash('SCHIFF VERLOREN', 1.2);
        break;
      case 'land':
        p.burst(e.x, e.y - 0.4, 14, 4, 0x9fd8ff, 0.3, 0.45);
        break;
      case 'liftoff':
        p.burst(e.x, e.y - 0.4, 18, 6, 0xffc27a, 0.32, 0.4);
        break;
      case 'pickup':
        p.burst(e.x, e.y, 26, 6, 0xffc46a, 0.32, 0.6);
        this.hud.flash('FRACHT AN BORD', 1.0);
        break;
      case 'deliver':
        p.burst(e.x, e.y, 34, 7, 0x62d6ff, 0.34, 0.7);
        break;
      case 'key':
        p.burst(e.x, e.y, 30, 7, e.color ? KEY_HEX[e.color] : 0xffffff, 0.34, 0.7);
        this.hud.flash(`SCHLÜSSEL ${KEY_NAME_DE[e.color ?? 'red'].toUpperCase()}`, 1.0);
        break;
      case 'gate-open':
        p.burst(e.x, e.y, 40, 10, e.color ? KEY_HEX[e.color] : 0xffffff, 0.4, 0.9);
        break;
      case 'bullet-hit':
        p.burst(e.x, e.y, 8, 6, 0xffc88a, 0.24, 0.3);
        break;
      case 'flow-peak':
        this.hud.flash('FLOW MAXIMAL — 3,0×', 1.2);
        break;
      case 'out-of-fuel':
        this.hud.flash('TANK LEER', 1.6);
        break;
      case 'timeout':
        this.hud.flash('ZEIT ABGELAUFEN', 2);
        break;
      default:
        break;
    }
  }

  private draw(alpha: number, dt: number, realDt: number) {
    const world = this.world;
    if (!world) return;

    const playing = this.mode === 'playing';
    const x = this.prev.x + (this.curr.x - this.prev.x) * alpha;
    const y = this.prev.y + (this.curr.y - this.prev.y) * alpha;
    // Shortest-arc interpolation, or the hull spins the wrong way past ±π.
    let da = this.curr.angle - this.prev.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const angle = this.prev.angle + da * alpha;

    this.ship.update(world, x, y, angle, dt, this.particles);
    this.props?.update(world, playing ? dt : dt * 0.25, this.particles);
    this.particles.update(dt);
    this.touch.update(realDt);
    this.updateRotateHint();
    this.backdrop?.update(dt);

    this.stage.lamp.position.set(x, y, 2.2);

    if (playing) {
      // Pull the camera back a little at speed so there is room to react.
      const speed = Math.hypot(world.ship.vel.x, world.ship.vel.y);
      const target = 1 + Math.min(0.22, speed / 90);
      this.zoom += (target - this.zoom) * Math.min(1, dt * 2.5);
      this.stage.aim(x, y, { w: world.level.width, h: world.level.height }, world.shake, this.zoom, dt);
      this.hud.update(world, dt);
      this.audio.engine(world.ship.thrusting ? world.ship.throttle : 0, speed / world.maxSpeed);
      this.stage.setBloom(BLOOM_BASE + (world.flow / 100) * 0.22);
    } else {
      // Menus: drift slowly across the cave so the backdrop stays alive.
      this.cineT += dt * 0.06;
      const w = world.level.width;
      const h = world.level.height;
      const cx = w / 2 + Math.sin(this.cineT) * w * 0.3;
      const cy = h / 2 + Math.cos(this.cineT * 0.77) * h * 0.22;
      this.zoom += (1.25 - this.zoom) * Math.min(1, dt * 1.5);
      this.stage.aim(cx, cy, { w, h }, 0, this.zoom, dt);
      this.audio.engine(0, 0);
    }

    this.adaptQuality(realDt);
    this.stage.render();
    if (!this.firstFrameDone) {
      this.firstFrameDone = true;
      this.hooks.onFirstFrame?.();
    }
    if (this.debug) this.drawDebug(world);
  }

  /**
   * Drop a quality tier after a sustained slow patch and claw one back after a
   * sustained fast one. Hysteresis on both sides so it never oscillates.
   */
  private adaptQuality(dt: number) {
    const slow = dt > 1 / 40;
    this.slowFor = slow ? this.slowFor + dt : 0;
    this.fastFor = slow ? 0 : this.fastFor + dt;

    const level = this.stage.qualityLevel;
    if (this.slowFor > 1.5 && level > 0) {
      this.stage.setQuality((level - 1) as 0 | 1 | 2);
      this.slowFor = 0;
    } else if (this.fastFor > 12 && level < 2) {
      this.stage.setQuality((level + 1) as 0 | 1 | 2);
      this.fastFor = 0;
    }
  }

  private drawDebug(world: World) {
    if (!this.debugEl) {
      const el = document.createElement('pre');
      el.style.cssText =
        'position:fixed;left:8px;bottom:8px;z-index:20;margin:0;padding:8px 10px;' +
        'background:rgba(4,8,14,.82);border:1px solid rgba(79,214,255,.3);color:#9fe6ff;' +
        'font:11px/1.5 ui-monospace,monospace;pointer-events:none;white-space:pre;';
      document.body.appendChild(el);
      this.debugEl = el;
    }
    const s = world.ship;
    const speed = Math.hypot(s.vel.x, s.vel.y);
    this.debugEl.textContent = [
      `fps      ${this.loop.fps.toFixed(0).padStart(5)}   sim ${this.loop.simLoad.toFixed(2)}ms   dt ${(FIXED_DT * 1000).toFixed(2)}ms`,
      `pos      ${s.pos.x.toFixed(2)}, ${s.pos.y.toFixed(2)}   state ${s.state}`,
      `vel      ${s.vel.x.toFixed(2)}, ${s.vel.y.toFixed(2)}   |v| ${speed.toFixed(2)}`,
      `angle    ${((s.angle * 180) / Math.PI).toFixed(1)}deg  omega ${s.angVel.toFixed(2)}`,
      `fuel     ${s.fuel.toFixed(1)}/${world.fuelMax}   flow ${world.flow.toFixed(0)} (${world.multiplier.toFixed(2)}x)`,
      `bullets  ${world.bullets.length}   shake ${world.shake.toFixed(2)}   landing ${world.landing}`,
      `time     ${world.time.toFixed(1)}/${world.timeLimit.toFixed(0)}   deaths ${world.stats.deaths}`,
      `draws    ${this.stage.renderer.info.render.calls}   tris ${this.stage.renderer.info.render.triangles}   quality ${this.stage.qualityLevel}`,
    ].join('\n');
  }

  dispose() {
    this.loop.stop();
    this.input.dispose();
    this.touch.dispose();
    this.audio.dispose();
    this.terrain?.dispose();
    this.props?.dispose();
    this.backdrop?.dispose();
    this.ship.dispose();
    this.particles.dispose();
    this.stage.dispose();
    THREE.Cache.clear();
  }
}
