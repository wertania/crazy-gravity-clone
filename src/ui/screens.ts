/**
 * Alle Vollbild-Tafeln: Titel, Schwierigkeit, Einstellungen, Höhlenauswahl,
 * Passworteingabe, Einweisung, Pause, Ergebnis, Lauf beendet.
 *
 * Jede Tafel ist einfaches DOM, bei Bedarf gebaut. Die Menüs sind
 * tastaturzuerst (Pfeile + Enter, wie damals), aber jeder Eintrag ist auch
 * anklickbar, und die Auswahl steht in `aria-selected`, damit ein Screenreader
 * mitkommt.
 *
 * Layout-Regel: eine Zeile besteht aus Beschriftung plus Erklärung darunter,
 * der aktuelle Wert steht rechts als Chip. Vier Fakten in ein rechtsbündiges
 * Kleingedrucktes zu quetschen war der Grund, warum diese Bildschirme vorher
 * schwer zu lesen waren.
 */

import { DIFFICULTIES, GAME_SPEEDS, gameSpeedById, type DifficultyId } from '../sim/config';
import { LEVELS } from '../sim/levels';
import type { SaveData } from '../app/save';
import { THROTTLE_MODE_LABEL } from './touch';
import type { ScoreBreakdown } from '../sim/world';

export interface MenuItem {
  label: string;
  /** Erklärende Zeile unter der Beschriftung. */
  desc?: string;
  /** Aktueller Wert oder Tastenkürzel, rechts als Chip. */
  value?: string;
  /** Längere Erklärung, die unter der Liste erscheint, solange der Eintrag gewählt ist. */
  detail?: string;
  disabled?: boolean;
  action: () => void;
}

type Medal = 'gold' | 'silver' | 'bronze' | 'none';

const MEDAL_DE: Record<Medal, string> = {
  gold: 'Gold',
  silver: 'Silber',
  bronze: 'Bronze',
  none: 'keine',
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`;

const num = (n: number) => n.toLocaleString('de-DE');
const pct = (x: number) => `${Math.round(x * 100)} %`;

export class Screens {
  private readonly root: HTMLElement;
  private items: MenuItem[] = [];
  private index = 0;
  private listEl: HTMLElement | null = null;
  private detailEl: HTMLElement | null = null;
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
    this.detailEl = null;
  }

  // --- Menü-Mechanik --------------------------------------------------------

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
      li.innerHTML =
        `<span class="mi-main"><span class="mi-label">${esc(item.label)}</span>` +
        (item.desc ? `<small class="mi-desc">${esc(item.desc)}</small>` : '') +
        '</span>' +
        (item.value ? `<span class="mi-value">${esc(item.value)}</span>` : '');
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

    if (items.some((it) => it.detail)) {
      const p = document.createElement('p');
      p.className = 'menu-detail';
      host.appendChild(p);
      this.detailEl = p;
    } else {
      this.detailEl = null;
    }
    this.paint();
  }

  private paint() {
    if (!this.listEl) return;
    Array.from(this.listEl.children).forEach((li, i) =>
      li.setAttribute('aria-selected', String(i === this.index)),
    );
    if (this.detailEl) this.detailEl.textContent = this.items[this.index]?.detail ?? '';
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

  // --- Tafeln ---------------------------------------------------------------

  title(
    save: SaveData,
    actions: {
      play: () => void;
      levels: () => void;
      difficulty: () => void;
      settings: () => void;
      password: () => void;
      help: () => void;
      reset: () => void;
    },
  ) {
    const next = Math.min(save.unlocked, LEVELS.length);
    const diff = DIFFICULTIES.find((d) => d.id === save.difficulty)!;
    const cleared = Object.values(save.levels).filter((l) => l.cleared).length;
    const golds = Object.values(save.levels).filter((l) => l.medal === 'gold').length;
    const started = save.unlocked > 1 || cleared > 0;

    const host = this.panel(`
      <h1>GRAVITY HAULER</h1>
      <p class="tagline">Zwanzig Höhlen. Eine zerbrechliche Hülle. Bring die Fracht heim.</p>
      <p>
        Der Schub geht immer in Nasenrichtung, die Schwerkraft zieht ununterbrochen, und der
        Fels ist tödlich. Weich aufsetzen kannst du nur auf einem Landefeld.
      </p>
      <div class="statline">
        <span><b>${cleared}</b>/${LEVELS.length} Höhlen</span>
        <span><b>${golds}</b> Gold</span>
        <span><b>${num(save.totalScore)}</b> Punkte</span>
        <span><b>${num(save.wrecks)}</b> Hüllen verloren</span>
      </div>
    `);

    this.mountMenu(host, [
      {
        label: started ? 'Weiterfliegen' : 'Starten',
        desc: `Höhle ${next.toString().padStart(2, '0')} · ${LEVELS[next - 1].name}`,
        value: 'Enter',
        action: actions.play,
      },
      {
        label: 'Höhle wählen',
        desc: `${save.unlocked} von ${LEVELS.length} freigeschaltet`,
        action: actions.levels,
      },
      {
        label: 'Schwierigkeit',
        desc: 'Tempo, Schub, Hüllen und Landetoleranz des Schiffs',
        value: diff.name,
        action: actions.difficulty,
      },
      {
        label: 'Einstellungen',
        desc: 'Spieltempo, Bildschirmsteuerung, Ton',
        value: gameSpeedById(save.gameSpeed).label,
        action: actions.settings,
      },
      {
        label: 'Passwort eingeben',
        desc: 'Direkt zu einer Höhle, die du schon gesehen hast',
        action: actions.password,
      },
      {
        label: 'Steuerung',
        desc: 'Tasten, Gamepad und Bildschirmsteuerung erklärt',
        action: actions.help,
      },
      {
        label: 'Fortschritt löschen',
        desc: 'Setzt Höhlen, Bestzeiten und Punkte zurück',
        value: 'endgültig',
        action: actions.reset,
      },
    ]);
  }

  difficulty(current: DifficultyId, pick: (id: DifficultyId) => void, back: () => void) {
    const host = this.panel(`
      <h2>SCHWIERIGKEIT</h2>
      <p>
        Jede Stufe spielt alle zwanzig Höhlen – es ändert sich nur dein Spielraum für Fehler
        und die Punkte, die du dafür bekommst.
      </p>
      <p class="hint">
        Tempo und Schub sind die großen Hebel: eine langsamere Hülle kann Geschwindigkeit,
        die sie nicht mehr abbauen kann, gar nicht erst aufbauen.
      </p>
    `);
    this.mountMenu(
      host,
      [
        ...DIFFICULTIES.map<MenuItem>((d) => ({
          label: d.name,
          desc:
            `Tempo ${pct(d.speedScale)} · Schub ${pct(d.thrustScale)} · ` +
            `${d.lives} ${d.lives === 1 ? 'Hülle' : 'Hüllen'}`,
          value: `${d.scoreScale.toFixed(2).replace('.', ',')}× Punkte`,
          detail: d.blurb + (d.id === current ? '   (aktuell eingestellt)' : ''),
          action: () => pick(d.id),
        })),
        { label: 'Zurück', detail: 'Zurück zum Titelbildschirm.', action: back },
      ],
      DIFFICULTIES.findIndex((d) => d.id === current),
    );
  }

  settings(
    save: SaveData,
    actions: {
      speed: () => void;
      touch: () => void;
      throttleMode: () => void;
      sound: () => void;
      back: () => void;
    },
  ) {
    const speed = gameSpeedById(save.gameSpeed);
    const nextSpeed =
      GAME_SPEEDS[(GAME_SPEEDS.findIndex((g) => g.id === speed.id) + 1) % GAME_SPEEDS.length];
    const touchLabel = { auto: 'Automatisch', on: 'Immer an', off: 'Aus' }[save.touch];
    const touchDetail = {
      auto: 'Erscheint auf Geräten mit Touchscreen, sonst nicht.',
      on: 'Die beiden Bildschirm-Paddles sind immer eingeblendet.',
      off: 'Nur Tastatur und Gamepad.',
    }[save.touch];

    const host = this.panel(`
      <h2>EINSTELLUNGEN</h2>
      <p>
        Das Tempo bestimmt, wie viel Spielzeit pro echter Sekunde vergeht. Es ist keine
        Änderung der Physik – das Schiff fliegt sich exakt gleich, du bekommst nur mehr
        Millisekunden zum Reagieren.
      </p>
    `);
    this.mountMenu(host, [
      {
        label: 'Tempo',
        desc: `${speed.label} · ${Math.round(speed.scale * 100)} % der Normalgeschwindigkeit`,
        value: 'ändern',
        detail: `${speed.blurb}   Weiter zu: ${nextSpeed.label}.`,
        action: actions.speed,
      },
      {
        label: 'Bildschirmsteuerung',
        desc: 'Zwei Paddles zum Ziehen: links lenken, rechts Schub',
        value: touchLabel,
        detail: touchDetail,
        action: actions.touch,
      },
      {
        label: 'Schub-Modus',
        desc: 'Wie das rechte Paddle einen Druck versteht',
        value: THROTTLE_MODE_LABEL[save.throttleMode],
        detail:
          save.throttleMode === 'push'
            ? 'Aufdrücken gibt sofort volle Kraft – wie die Schub-Taste. Ziehst du vom ' +
              'Druckpunkt nach unten, nimmst du Gas weg. Auch direkt im Flug über den ' +
              'GAS-Knopf umschaltbar.'
            : 'Kraft kommt nur aus dem Zugweg: aufdrücken tut nichts, hochziehen gibt Gas. ' +
              'Auch direkt im Flug über den GAS-Knopf umschaltbar.',
        action: actions.throttleMode,
      },
      {
        label: 'Ton',
        desc: 'Triebwerk, Treffer und Menügeräusche',
        value: save.muted ? 'Aus' : 'An',
        detail: 'Lässt sich im Spiel jederzeit mit M umschalten.',
        action: actions.sound,
      },
      { label: 'Zurück', detail: 'Zurück zum Titelbildschirm.', action: actions.back },
    ]);
  }

  levelSelect(save: SaveData, pick: (id: number) => void, back: () => void) {
    const host = this.panel(`
      <h2>HÖHLE WÄHLEN</h2>
      <p>Geschaffte Höhlen bleiben offen. Bestzeit und Medaille sind deine persönlichen Bestwerte.</p>
    `);
    const items: MenuItem[] = LEVELS.map((l) => {
      const rec = save.levels[l.id];
      const locked = l.id > save.unlocked;
      return {
        label: `${l.id.toString().padStart(2, '0')}  ${l.name}`,
        desc: locked
          ? 'Noch gesperrt – schaffe erst die Höhle davor'
          : rec?.cleared
            ? `Bestzeit ${fmt(rec.bestTime)} · ${num(rec.bestScore)} Punkte`
            : 'Freigeschaltet, noch nicht geschafft',
        value: locked ? 'gesperrt' : rec?.cleared && rec.medal !== 'none' ? MEDAL_DE[rec.medal] : undefined,
        detail: locked ? undefined : l.hint,
        disabled: locked,
        action: () => pick(l.id),
      };
    });
    items.push({ label: 'Zurück', detail: 'Zurück zum Titelbildschirm.', action: back });
    this.mountMenu(host, items, Math.max(0, save.unlocked - 1));
  }

  password(submit: (pw: string) => void, back: () => void) {
    const host = this.panel(`
      <h2>PASSWORT</h2>
      <p>
        Jede Höhle ab der zweiten hat eines. Du bekommst es angezeigt, sobald du die Höhle
        davor geschafft hast.
      </p>
      <div class="pwfield"><input id="pw" maxlength="12" autocomplete="off" spellcheck="false" placeholder="········" /></div>
      <p class="footnote">Enter zum Bestätigen · Esc für zurück</p>
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
      <h2>STEUERUNG</h2>
      <div class="keycaps">
        <div><kbd>A</kbd><kbd>←</kbd> <b>links drehen</b></div>
        <div><kbd>D</kbd><kbd>→</kbd> <b>rechts drehen</b></div>
        <div><kbd>W</kbd><kbd>↑</kbd><kbd>Leer</kbd> <b>Schub</b></div>
        <div><kbd>S</kbd><kbd>↓</kbd> <b>Lage-Assistent</b></div>
        <div><kbd>R</kbd> <b>Höhle neu starten</b></div>
        <div><kbd>Esc</kbd><kbd>P</kbd> <b>Pause</b></div>
        <div><kbd>M</kbd> <b>Ton an/aus</b></div>
        <div><kbd>F3</kbd> <b>Technik-Anzeige</b></div>
      </div>
      <p class="hint">
        Der Schub geht immer in Nasenrichtung. Zum Bremsen musst du dich erst umdrehen –
        dieses Umdrehen ist das ganze Spiel.
      </p>
      <div class="grid2">
        <div>
          <p><b>Landen</b><br />
            Die Anzeige ist grün, solange Tempo und Neigung beide im Rahmen sind. Gelb heißt
            grenzwertig. Rot heißt, du wirst gleich zu Schrott.</p>
          <p><b>Fracht</b><br />
            Flieg eine Kiste an, um sie aufzunehmen – bis zu drei gleichzeitig. Jede Kiste
            an Bord macht die Hülle schwerer und träger, alles auf einmal zu schleppen ist
            also eine echte Wette. Auf der blauen Basis landen lädt ab; die Höhle ist
            geschafft, sobald alles daheim ist.</p>
        </div>
        <div>
          <p><b>Treibstoff</b><br />
            Das Triebwerk kostet Sprit, und zwar so viel, wie du Gas gibst. Grüne Felder
            betanken dich, solange du darauf stehst. Ein leerer Tank ist kein sofortiger
            Tod, aber die Schwerkraft hat das letzte Wort.</p>
          <p><b>Flow</b><br />
            Wer mit Tempo dicht am Fels entlangschrammt, füllt die Flow-Anzeige. Sie
            vervielfacht alle Punkte und tropft Sprit zurück in den Tank. Die schnellste
            Linie ist die gefährliche – genau das ist der Punkt.</p>
        </div>
      </div>
      <p class="footnote">
        Gamepads gehen auch: linker Stick oder Steuerkreuz zum Drehen, A oder rechter
        Trigger für Schub – der Trigger ist stufenlos. Auf dem Touchscreen bekommst du zwei
        Paddles: die linke Bildschirmhälfte lenkt, die rechte gibt Schub. Du drückst
        irgendwo in der Hälfte auf und ziehst; es zählt, wie weit du ziehst, nicht wo du
        angefasst hast. Lenken ist stufenlos, du kannst also fein dosieren.
      </p>
      <p class="footnote">
        Der Schub hat zwei Modi, umschaltbar mit dem GAS-Knopf zwischen den Paddles oder in
        den Einstellungen. <b>PUSH</b> (Standard): einfach aufdrücken gibt volle Kraft, und
        wer feiner dosieren will, zieht vom Druckpunkt nach unten. <b>REGLER</b>: die Kraft
        kommt allein aus dem Zugweg, Schweben liegt bei rund einem Drittel davon.
      </p>
    `);
    this.mountMenu(host, [{ label: 'Zurück', action: back }]);
  }

  briefing(
    levelId: number,
    password: string,
    hint: string,
    best: { time: number; medal: Medal } | null,
    go: () => void,
    back: () => void,
  ) {
    const level = LEVELS[levelId - 1];
    const crates = level.objects.filter((o) => o.t === 'cargo').length;
    const host = this.panel(`
      <span class="badge">HÖHLE ${levelId.toString().padStart(2, '0')} VON ${LEVELS.length}</span>
      <h2 style="margin-top:.7em">${esc(level.name.toUpperCase())}</h2>
      <p class="hint">${esc(hint)}</p>
      <div class="keycaps">
        <div><b>Zielzeit</b> ${fmt(level.par)}</div>
        <div><b>Fracht</b> ${crates} ${crates === 1 ? 'Kiste' : 'Kisten'}</div>
        ${levelId > 1 ? `<div><b>Passwort</b> ${esc(password)}</div>` : '<div></div>'}
        ${best ? `<div><b>Deine Bestzeit</b> ${fmt(best.time)} · ${MEDAL_DE[best.medal]}</div>` : '<div></div>'}
      </div>
    `);
    this.mountMenu(host, [
      { label: 'Losfliegen', value: 'Enter', action: go },
      { label: 'Zurück zum Titel', action: back },
    ]);
  }

  paused(
    resume: () => void,
    restart: () => void,
    quit: () => void,
    muted: boolean,
    toggleMute: () => void,
  ) {
    const host = this.panel(`
      <h2>PAUSE</h2>
      <p>Die Simulation steht still. Nichts bewegt sich, nichts verbrennt.</p>
    `);
    this.mountMenu(host, [
      { label: 'Weiterfliegen', value: 'Esc', action: resume },
      { label: 'Höhle neu starten', desc: 'Von vorn, mit vollem Tank', value: 'R', action: restart },
      { label: 'Ton', desc: 'Triebwerk und Menügeräusche', value: muted ? 'Aus' : 'An', action: toggleMute },
      {
        label: 'Lauf abbrechen',
        desc: 'Zurück zum Titel – der Fortschritt bleibt gespeichert',
        action: quit,
      },
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
      ['Fracht geliefert', breakdown.cargo],
      ['Schlüssel geborgen', breakdown.keys],
      ['Restzeit', breakdown.time],
      ['Resttreibstoff', breakdown.fuel],
      ['Flow-Bonus', breakdown.flowBonus],
      ['Ohne Verluste', breakdown.flawless],
    ];
    const host = this.panel(`
      <span class="badge">HÖHLE GESCHAFFT</span>
      <h2 style="margin-top:.7em">${esc(level.name.toUpperCase())}</h2>
      <p>
        <span class="medal ${medal}">${MEDAL_DE[medal].toUpperCase()}</span>
        &nbsp; ${fmt(time)} bei einer Zielzeit von ${fmt(level.par)}
        &nbsp;·&nbsp; ${deaths} ${deaths === 1 ? 'Hülle' : 'Hüllen'} verloren
      </p>
      <table class="scoretable">
        ${rows
          .filter(([, v]) => v !== 0)
          .map(([k, v]) => `<tr><td>${k}</td><td>${num(v)}</td></tr>`)
          .join('')}
        <tr class="total"><td>Gesamt</td><td>${num(breakdown.total)}</td></tr>
      </table>
      ${nextPassword ? `<p class="hint">Passwort für die nächste Höhle: <b>${esc(nextPassword)}</b></p>` : ''}
    `);
    const items: MenuItem[] = [];
    if (levelId < LEVELS.length) items.push({ label: 'Nächste Höhle', value: 'Enter', action: next });
    items.push({
      label: 'Nochmal fliegen',
      desc: 'Für eine bessere Zeit oder Medaille',
      value: 'R',
      action: replay,
    });
    items.push({ label: 'Zurück zum Titel', action: quit });
    this.mountMenu(host, items);
  }

  gameOver(levelId: number, score: number, reason: string, retry: () => void, quit: () => void) {
    const host = this.panel(`
      <h2 style="color:var(--bad)">LAUF BEENDET</h2>
      <p>${esc(reason)}</p>
      <p>Du bist in <b>${esc(LEVELS[levelId - 1].name)}</b> geblieben, mit ${num(score)} Punkten auf dem Konto.</p>
      <p class="footnote">
        Der Fortschritt bis zu dieser Höhle ist gespeichert. Verloren ist nur der Lauf.
      </p>
    `);
    this.mountMenu(host, [
      { label: 'Höhle nochmal fliegen', value: 'Enter', action: retry },
      { label: 'Zurück zum Titel', action: quit },
    ]);
  }

  campaignComplete(save: SaveData, quit: () => void) {
    const golds = Object.values(save.levels).filter((l) => l.medal === 'gold').length;
    const host = this.panel(`
      <h1>ALLE HÖHLEN GEFLOGEN</h1>
      <p class="tagline">Zwanzig von zwanzig. Die Fracht ist daheim.</p>
      <div class="keycaps">
        <div><b>Punkte gesamt</b> ${num(save.totalScore)}</div>
        <div><b>Gold-Läufe</b> ${golds} von ${LEVELS.length}</div>
        <div><b>Verlorene Hüllen</b> ${num(save.wrecks)}</div>
      </div>
      <p>
        Es gibt immer noch eine härtere Stufe, und jede Höhle hat eine Gold-Zeit, die du dir
        noch nicht geholt hast.
      </p>
    `);
    this.mountMenu(host, [{ label: 'Zurück zum Titel', action: quit }]);
  }
}
