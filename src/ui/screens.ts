/**
 * All full-screen panels: title, difficulty, level select, password entry,
 * briefing card, pause, results, game over.
 *
 * Each screen is plain DOM built on demand. Menus are keyboard-first (arrows +
 * Enter, which is how the era played) but every entry is also clickable, and
 * the selected entry is mirrored to `aria-selected` so a screen reader follows
 * along.
 */

import { DIFFICULTIES, type DifficultyId } from '../sim/config';
import { LEVELS } from '../sim/levels';
import type { SaveData } from '../app/save';
import type { ScoreBreakdown } from '../sim/world';

export interface MenuItem {
  label: string;
  hint?: string;
  disabled?: boolean;
  action: () => void;
}

type Medal = 'gold' | 'silver' | 'bronze' | 'none';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

export class Screens {
  private readonly root: HTMLElement;
  private items: MenuItem[] = [];
  private index = 0;
  private listEl: HTMLElement | null = null;
  private onSound?: (kind: 'move' | 'select' | 'deny') => void;

  constructor(doc: Document = document) {
    this.root = doc.getElementById('overlay')!;
  }

  setSoundHook(fn: (kind: 'move' | 'select' | 'deny') => void) {
    this.onSound = fn;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  hide() {
    this.root.hidden = true;
    this.root.textContent = '';
    this.items = [];
    this.listEl = null;
  }

  // --- menu plumbing --------------------------------------------------------

  private panel(html: string): HTMLElement {
    this.root.hidden = false;
    this.root.innerHTML = `<div class="panel">${html}</div>`;
    return this.root.firstElementChild as HTMLElement;
  }

  private mountMenu(host: HTMLElement, items: MenuItem[], startIndex = 0) {
    this.items = items;
    this.index = Math.max(
      0,
      items.findIndex((it, i) => !it.disabled && i >= startIndex),
    );
    if (this.index < 0) this.index = 0;

    const ul = document.createElement('ul');
    ul.className = 'menu';
    ul.setAttribute('role', 'listbox');
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.innerHTML = `<span>${esc(item.label)}</span>${item.hint ? `<small>${esc(item.hint)}</small>` : ''}`;
      if (item.disabled) li.setAttribute('aria-disabled', 'true');
      li.addEventListener('mouseenter', () => {
        if (item.disabled) return;
        this.index = i;
        this.paint();
      });
      li.addEventListener('click', () => this.confirm(i));
      ul.appendChild(li);
    });
    host.appendChild(ul);
    this.listEl = ul;
    this.paint();
  }

  private paint() {
    if (!this.listEl) return;
    Array.from(this.listEl.children).forEach((li, i) =>
      li.setAttribute('aria-selected', String(i === this.index)),
    );
  }

  move(delta: number) {
    if (!this.items.length) return;
    let i = this.index;
    for (let n = 0; n < this.items.length; n++) {
      i = (i + delta + this.items.length) % this.items.length;
      if (!this.items[i].disabled) break;
    }
    if (i !== this.index) {
      this.index = i;
      this.paint();
      this.onSound?.('move');
    }
  }

  confirm(index = this.index) {
    const item = this.items[index];
    if (!item) return;
    if (item.disabled) {
      this.onSound?.('deny');
      return;
    }
    this.onSound?.('select');
    item.action();
  }

  // --- screens --------------------------------------------------------------

  title(save: SaveData, actions: { play: () => void; levels: () => void; difficulty: () => void; password: () => void; help: () => void; reset: () => void }) {
    const next = Math.min(save.unlocked, LEVELS.length);
    const diff = DIFFICULTIES.find((d) => d.id === save.difficulty)!;
    const cleared = Object.values(save.levels).filter((l) => l.cleared).length;
    const golds = Object.values(save.levels).filter((l) => l.medal === 'gold').length;

    const host = this.panel(`
      <h1>GRAVITY HAULER</h1>
      <p class="tagline">Twenty caves. One fragile hull. Bring the freight home.</p>
      <p>
        Rotate the ship and burn the engine along its nose. Gravity never stops pulling,
        the rock is always fatal, and the only soft place to put down is a pad.
      </p>
      <div class="keycaps">
        <div><b>Flown</b> ${cleared}/${LEVELS.length} caves</div>
        <div><b>Gold runs</b> ${golds}</div>
        <div><b>Career score</b> ${save.totalScore.toLocaleString('en-US')}</div>
        <div><b>Hulls lost</b> ${save.wrecks}</div>
      </div>
    `);

    this.mountMenu(host, [
      {
        label: save.unlocked > 1 ? `Continue — ${next.toString().padStart(2, '0')} ${LEVELS[next - 1].name}` : 'Launch',
        hint: 'Enter',
        action: actions.play,
      },
      { label: 'Select cave', hint: `${save.unlocked} unlocked`, action: actions.levels },
      { label: 'Difficulty', hint: diff.name, action: actions.difficulty },
      { label: 'Enter password', action: actions.password },
      { label: 'How to fly', action: actions.help },
      { label: 'Erase progress', hint: 'cannot be undone', action: actions.reset },
    ]);
  }

  difficulty(current: DifficultyId, pick: (id: DifficultyId) => void, back: () => void) {
    const host = this.panel(`
      <h2>DIFFICULTY</h2>
      <p>Every tier plays all twenty caves. What changes is the margin for error — and the score you earn for using it.</p>
    `);
    this.mountMenu(
      host,
      [
        ...DIFFICULTIES.map((d) => ({
          label: `${d.name}${d.id === current ? '  ·  current' : ''}`,
          hint: `${d.lives} hull${d.lives > 1 ? 's' : ''} · ${d.scoreScale.toFixed(2)}× score`,
          action: () => pick(d.id),
        })),
        { label: 'Back', action: back },
      ],
      DIFFICULTIES.findIndex((d) => d.id === current),
    );
    const list = host.querySelector('.menu')!;
    DIFFICULTIES.forEach((d, i) => {
      const li = list.children[i] as HTMLElement;
      li.title = d.blurb;
    });
  }

  levelSelect(save: SaveData, pick: (id: number) => void, back: () => void) {
    const host = this.panel(`<h2>SELECT CAVE</h2><p>Cleared caves stay open. Best time and medal are per difficulty-agnostic personal best.</p>`);
    const items: MenuItem[] = LEVELS.map((l) => {
      const rec = save.levels[l.id];
      const locked = l.id > save.unlocked;
      const bits: string[] = [];
      if (rec?.cleared) bits.push(fmt(rec.bestTime));
      if (rec?.medal && rec.medal !== 'none') bits.push(rec.medal);
      if (locked) bits.push('locked');
      return {
        label: `${l.id.toString().padStart(2, '0')}  ${l.name}`,
        hint: bits.join(' · '),
        disabled: locked,
        action: () => pick(l.id),
      };
    });
    items.push({ label: 'Back', action: back });
    this.mountMenu(host, items, Math.max(0, save.unlocked - 1));
  }

  password(submit: (pw: string) => void, back: () => void) {
    const host = this.panel(`
      <h2>PASSWORD</h2>
      <p>Every cave from the second onwards has one. It is shown when you clear the cave before it.</p>
      <div class="pwfield"><input id="pw" maxlength="12" autocomplete="off" spellcheck="false" placeholder="········" /></div>
      <p class="footnote">Enter to confirm · Esc to go back</p>
    `);
    const input = host.querySelector<HTMLInputElement>('#pw')!;
    input.focus();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit(input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        back();
      }
      e.stopPropagation();
    });
  }

  passwordError(message: string) {
    const p = this.root.querySelector('.footnote');
    if (p) {
      p.textContent = message;
      (p as HTMLElement).style.color = 'var(--bad)';
    }
  }

  help(back: () => void) {
    const host = this.panel(`
      <h2>HOW TO FLY</h2>
      <div class="keycaps">
        <div><kbd>A</kbd><kbd>←</kbd> <b>rotate left</b></div>
        <div><kbd>D</kbd><kbd>→</kbd> <b>rotate right</b></div>
        <div><kbd>W</kbd><kbd>↑</kbd><kbd>Space</kbd> <b>thrust</b></div>
        <div><kbd>S</kbd><kbd>↓</kbd> <b>auto-level assist</b></div>
        <div><kbd>R</kbd> <b>restart cave</b></div>
        <div><kbd>Esc</kbd><kbd>P</kbd> <b>pause</b></div>
        <div><kbd>M</kbd> <b>mute</b></div>
        <div><kbd>F3</kbd> <b>debug overlay</b></div>
      </div>
      <p class="hint">Thrust always fires along the nose. To slow down, turn around first — that turn is the whole game.</p>
      <div class="grid2">
        <div>
          <p><b>Landing</b><br />The indicator is green when your speed and tilt are both inside tolerance. Yellow means marginal. Red means you are about to become debris.</p>
          <p><b>Freight</b><br />Fly into a crate to take it aboard, up to three at once. Every crate aboard makes the hull heavier and lazier, so hauling all three is a real gamble. Land on the blue base to unload; clear the cave once everything is home.</p>
        </div>
        <div>
          <p><b>Fuel</b><br />Burning the engine costs fuel. Green pads refill you while you sit on them. Running dry is not instant death, but gravity gets the last word.</p>
          <p><b>Flow</b><br />Skimming close to rock at speed fills the flow meter. It multiplies everything you score and trickles fuel back into the tank. The fastest line is the dangerous one — that is the point.</p>
        </div>
      </div>
      <p class="footnote">Gamepads work too: left stick or d-pad to turn, A or right trigger to thrust.</p>
    `);
    this.mountMenu(host, [{ label: 'Back', action: back }]);
  }

  briefing(levelId: number, password: string, hint: string, best: { time: number; medal: Medal } | null, go: () => void, back: () => void) {
    const level = LEVELS[levelId - 1];
    const host = this.panel(`
      <span class="badge">CAVE ${levelId.toString().padStart(2, '0')} OF ${LEVELS.length}</span>
      <h2 style="margin-top:.6em">${esc(level.name.toUpperCase())}</h2>
      <p class="hint">${esc(hint)}</p>
      <div class="keycaps">
        <div><b>Target time</b> ${fmt(level.par)}</div>
        <div><b>Freight</b> ${level.objects.filter((o) => o.t === 'cargo').length} crate(s)</div>
        ${levelId > 1 ? `<div><b>Password</b> ${esc(password)}</div>` : '<div></div>'}
        ${best ? `<div><b>Your best</b> ${fmt(best.time)} · ${best.medal}</div>` : '<div></div>'}
      </div>
    `);
    this.mountMenu(host, [
      { label: 'Launch', hint: 'Enter', action: go },
      { label: 'Back to title', action: back },
    ]);
  }

  paused(resume: () => void, restart: () => void, quit: () => void, muted: boolean, toggleMute: () => void) {
    const host = this.panel(`<h2>PAUSED</h2><p>The simulation is frozen. Nothing moves, nothing burns.</p>`);
    this.mountMenu(host, [
      { label: 'Resume', hint: 'Esc', action: resume },
      { label: 'Restart cave', hint: 'R', action: restart },
      { label: muted ? 'Sound: off' : 'Sound: on', hint: 'M', action: toggleMute },
      { label: 'Abandon run', action: quit },
    ]);
  }

  cleared(
    levelId: number,
    breakdown: ScoreBreakdown,
    time: number,
    medal: Medal,
    deaths: number,
    nextPassword: string | null,
    next: () => void,
    replay: () => void,
    quit: () => void,
  ) {
    const level = LEVELS[levelId - 1];
    const rows: [string, number][] = [
      ['Freight delivered', breakdown.cargo],
      ['Keys recovered', breakdown.keys],
      ['Time remaining', breakdown.time],
      ['Fuel remaining', breakdown.fuel],
      ['Flow bonus', breakdown.flowBonus],
      ['Flawless run', breakdown.flawless],
    ];
    const host = this.panel(`
      <span class="badge">CAVE CLEARED</span>
      <h2 style="margin-top:.6em">${esc(level.name.toUpperCase())}</h2>
      <p><span class="medal ${medal}">${medal.toUpperCase()}</span>
         &nbsp; ${fmt(time)} against a ${fmt(level.par)} target &nbsp;·&nbsp; ${deaths} hull${deaths === 1 ? '' : 's'} lost</p>
      <table class="scoretable">
        ${rows
          .filter(([, v]) => v !== 0)
          .map(([k, v]) => `<tr><td>${k}</td><td>${v.toLocaleString('en-US')}</td></tr>`)
          .join('')}
        <tr class="total"><td>Total</td><td>${breakdown.total.toLocaleString('en-US')}</td></tr>
      </table>
      ${nextPassword ? `<p class="hint">Password for the next cave: <b>${esc(nextPassword)}</b></p>` : ''}
    `);
    const items: MenuItem[] = [];
    if (levelId < LEVELS.length) items.push({ label: 'Next cave', hint: 'Enter', action: next });
    items.push({ label: 'Fly it again', hint: 'R', action: replay });
    items.push({ label: 'Back to title', action: quit });
    this.mountMenu(host, items);
  }

  gameOver(levelId: number, score: number, reason: string, retry: () => void, quit: () => void) {
    const host = this.panel(`
      <h2 style="color:var(--bad)">RUN OVER</h2>
      <p>${esc(reason)}</p>
      <p>You went down in <b>${esc(LEVELS[levelId - 1].name)}</b> with ${score.toLocaleString('en-US')} points banked.</p>
      <p class="footnote">Progress up to this cave is saved. Nothing is lost but the run.</p>
    `);
    this.mountMenu(host, [
      { label: 'Fly the cave again', hint: 'Enter', action: retry },
      { label: 'Back to title', action: quit },
    ]);
  }

  campaignComplete(save: SaveData, quit: () => void) {
    const golds = Object.values(save.levels).filter((l) => l.medal === 'gold').length;
    const host = this.panel(`
      <h1>ALL CAVES FLOWN</h1>
      <p class="tagline">Twenty for twenty. The freight is home.</p>
      <div class="keycaps">
        <div><b>Career score</b> ${save.totalScore.toLocaleString('en-US')}</div>
        <div><b>Gold runs</b> ${golds}/${LEVELS.length}</div>
        <div><b>Hulls lost</b> ${save.wrecks}</div>
      </div>
      <p>There is still a harder tier, and every cave still has a gold time you have not taken yet.</p>
    `);
    this.mountMenu(host, [{ label: 'Back to title', action: quit }]);
  }
}
