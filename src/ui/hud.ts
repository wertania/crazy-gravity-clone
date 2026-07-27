/**
 * The in-flight overlay.
 *
 * Mirrors the information set of the original's HUD - hulls, freight waiting
 * versus carried, colour keys held, elapsed time against a target, and the
 * green/yellow/red landing indicator - and adds the fuel and flow gauges.
 *
 * Every setter compares against the last written value first: touching the DOM
 * 120 times a second for text that has not changed is the easiest way to make a
 * smooth game feel janky.
 */

import { FLOW } from '../sim/config';
import type { World } from '../sim/world';
import { cargoDelivered } from '../sim/world';
import type { KeyColor } from '../sim/types';
import { KEY_HEX } from '../render/actors';

const KEY_ORDER: KeyColor[] = ['red', 'green', 'blue', 'amber'];

function fmtTime(s: number): string {
  const clamped = Math.max(0, s);
  const m = Math.floor(clamped / 60);
  const sec = Math.floor(clamped % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly fuelBar: HTMLElement;
  private readonly fuelVal: HTMLElement;
  private readonly fuelGauge: HTMLElement;
  private readonly flowBar: HTMLElement;
  private readonly flowVal: HTMLElement;
  private readonly levelNo: HTMLElement;
  private readonly levelName: HTMLElement;
  private readonly time: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly par: HTMLElement;
  private readonly score: HTMLElement;
  private readonly lives: HTMLElement;
  private readonly cargo: HTMLElement;
  private readonly carry: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly landing: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly rotate: HTMLElement;

  private last = {
    fuel: -1,
    flow: -1,
    time: '',
    score: -1,
    lives: -1,
    cargo: '',
    keys: '',
    landing: '',
    over: false,
    low: false,
  };
  private toastTimer = 0;
  private cargoPips: HTMLElement[] = [];
  private keyIcons = new Map<KeyColor, HTMLElement>();

  constructor(doc: Document = document) {
    const q = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
    this.root = q('hud');
    this.fuelGauge = q('g-fuel');
    this.fuelBar = this.fuelGauge.querySelector('.bar > i')!;
    this.fuelVal = this.fuelGauge.querySelector('.gauge-value')!;
    const flowGauge = q('g-flow');
    this.flowBar = flowGauge.querySelector('.bar > i')!;
    this.flowVal = flowGauge.querySelector('.gauge-value')!;
    this.levelNo = q('h-levelno');
    this.levelName = q('h-levelname');
    this.time = q('h-time');
    this.clock = this.time.parentElement as HTMLElement;
    this.par = q('h-par');
    this.score = q('h-score');
    this.lives = q('h-lives');
    this.cargo = q('h-cargo');
    this.carry = q('h-carry');
    this.keys = q('h-keys');
    this.landing = q('h-landing');
    this.toast = q('toast');

    // Portrait on a phone is playable but cramped; say so once, quietly, rather
    // than blocking the screen with a rotate-your-device wall.
    this.rotate = document.createElement('div');
    this.rotate.className = 'rotate-hint';
    this.rotate.hidden = true;
    this.rotate.textContent = '↻ Im Querformat siehst du mehr von der Höhle';
    document.body.appendChild(this.rotate);
  }

  /** Show the portrait hint only while the on-screen controls are in use. */
  setRotateHint(show: boolean) {
    this.rotate.hidden = !show;
  }

  show(visible: boolean) {
    this.root.hidden = !visible;
  }

  /** Rebuild the parts whose *shape* depends on the level, not its state. */
  bind(world: World) {
    const spec = world.level.spec;
    this.levelNo.textContent = spec.id.toString().padStart(2, '0');
    this.levelName.textContent = spec.name.toUpperCase();
    this.par.textContent = fmtTime(world.timeLimit);

    this.cargo.textContent = '';
    this.cargoPips = world.cargo.map(() => {
      const el = document.createElement('span');
      el.className = 'pip';
      this.cargo.appendChild(el);
      return el;
    });

    this.keys.textContent = '';
    this.keyIcons.clear();
    const needed = new Set(world.keys.map((k) => k.color));
    for (const color of KEY_ORDER) {
      if (!needed.has(color)) continue;
      const el = document.createElement('span');
      el.className = 'keyicon';
      el.style.color = `#${KEY_HEX[color].toString(16).padStart(6, '0')}`;
      el.title = `Schlüssel ${color}`;
      this.keys.appendChild(el);
      this.keyIcons.set(color, el);
    }

    this.last = {
      fuel: -1,
      flow: -1,
      time: '',
      score: -1,
      lives: -1,
      cargo: '',
      keys: '',
      landing: '',
      over: false,
      low: false,
    };
  }

  update(world: World, dt: number) {
    const fuelPct = world.fuelMax > 0 ? world.ship.fuel / world.fuelMax : 0;
    const fuelRounded = Math.round(fuelPct * 100);
    if (fuelRounded !== this.last.fuel) {
      this.last.fuel = fuelRounded;
      this.fuelBar.style.transform = `scaleX(${Math.max(0, fuelPct)})`;
      this.fuelVal.textContent = String(Math.ceil(world.ship.fuel));
      const low = fuelPct < 0.22;
      if (low !== this.last.low) {
        this.last.low = low;
        this.fuelGauge.classList.toggle('low', low);
      }
    }

    const flowPct = world.flow / FLOW.max;
    const flowRounded = Math.round(flowPct * 50);
    if (flowRounded !== this.last.flow) {
      this.last.flow = flowRounded;
      this.flowBar.style.transform = `scaleX(${flowPct})`;
      this.flowVal.textContent = `${world.multiplier.toFixed(1)}×`;
    }

    const t = fmtTime(world.time);
    if (t !== this.last.time) {
      this.last.time = t;
      this.time.textContent = t;
      const over = world.time > world.timeLimit;
      if (over !== this.last.over) {
        this.last.over = over;
        this.clock.classList.toggle('over', over);
      }
    }

    if (world.score !== this.last.score) {
      this.last.score = world.score;
      this.score.textContent = world.score.toLocaleString('en-US');
    }

    if (world.lives !== this.last.lives) {
      this.last.lives = world.lives;
      this.lives.textContent = '◆'.repeat(Math.min(9, world.lives)) || '—';
    }

    const cargoKey = world.cargo.map((c) => c.state[0]).join('');
    if (cargoKey !== this.last.cargo) {
      this.last.cargo = cargoKey;
      world.cargo.forEach((c, i) => {
        const pip = this.cargoPips[i];
        pip.classList.toggle('carried', c.state === 'carried');
        pip.classList.toggle('delivered', c.state === 'delivered');
      });
      const carried = world.ship.carrying.length;
      this.carry.textContent = `${cargoDelivered(world)}/${world.cargo.length} geliefert${
        carried ? ` · ${carried} an Bord` : ''
      }`;
    }

    const keyKey = [...world.keysHeld].sort().join(',');
    if (keyKey !== this.last.keys) {
      this.last.keys = keyKey;
      for (const [color, el] of this.keyIcons) el.classList.toggle('held', world.keysHeld.has(color));
    }

    if (world.landing !== this.last.landing) {
      this.last.landing = world.landing;
      this.landing.className = `landing ${world.landing}`;
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
  }

  flash(message: string, seconds = 1.8) {
    this.toast.textContent = message;
    this.toast.classList.add('show');
    this.toastTimer = seconds;
  }
}
