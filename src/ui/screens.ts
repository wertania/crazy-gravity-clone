/**
 * Alle Vollbild-Tafeln: Titel, Einstellungen, Schwierigkeit, Missionsauswahl,
 * Passworteingabe, Einsatzbesprechung, Pause, Auswertung, Missionsende.
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
 *
 * Der Aufbau ist bewusst flach: das Hauptmenü kennt nur "Missionen fliegen"
 * und "Einstellungen". Alles, was man selten anfasst, liegt eine Ebene tiefer,
 * und die Passwortfreischaltung sitzt dort, wo sie hingehört – bei der
 * Missionsauswahl.
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
      settings: () => void;
    },
  ) {
    const next = Math.min(save.unlocked, LEVELS.length);
    const cleared = Object.values(save.levels).filter((l) => l.cleared).length;
    const golds = Object.values(save.levels).filter((l) => l.medal === 'gold').length;
    const started = save.unlocked > 1 || cleared > 0;

    const host = this.panel(`
      <h1>GRAVITY PILOT</h1>
      <p class="tagline">Zwanzig Höhlen, ein empfindliches Schiff. Bring die Fracht nach Hause.</p>
      <p>
        Der Schub wirkt immer in Richtung der Schiffsnase, die Schwerkraft zieht ohne Pause,
        und jede Felswand ist tödlich. Sanft aufsetzen kannst du nur auf einem Landefeld.
      </p>
      <div class="statline">
        <span><b>${cleared}</b> von ${LEVELS.length} Missionen</span>
        <span><b>${golds}</b> × Gold</span>
        <span><b>${num(save.totalScore)}</b> Punkte</span>
        <span><b>${num(save.wrecks)}</b> Schiffe verloren</span>
      </div>
    `);

    this.mountMenu(host, [
      {
        label: 'Missionen fliegen',
        desc: started
          ? `Weiter mit Mission ${next.toString().padStart(2, '0')} · ${LEVELS[next - 1].name}`
          : `Beginne mit Mission ${next.toString().padStart(2, '0')} · ${LEVELS[next - 1].name}`,
        value: 'Enter',
        detail: 'In der Einsatzbesprechung kannst du auch eine andere Mission auswählen.',
        action: actions.play,
      },
      {
        label: 'Einstellungen',
        desc: 'Schwierigkeit, Spieltempo, Steuerung und Ton',
        action: actions.settings,
      },
    ]);
  }

  difficulty(current: DifficultyId, pick: (id: DifficultyId) => void, back: () => void) {
    const host = this.panel(`
      <h2>SCHWIERIGKEIT</h2>
      <p>
        Auf jeder Stufe kannst du alle zwanzig Missionen fliegen. Es ändern sich nur dein
        Spielraum für Fehler und die Punkte, die du dafür bekommst.
      </p>
      <p class="hint">
        Tempo und Schub sind die größten Hebel: ein langsameres Schiff baut Geschwindigkeit,
        die es nicht mehr abbauen kann, gar nicht erst auf.
      </p>
    `);
    this.mountMenu(
      host,
      [
        ...DIFFICULTIES.map<MenuItem>((d) => ({
          label: d.name,
          desc:
            `Tempo ${pct(d.speedScale)} · Schub ${pct(d.thrustScale)} · ` +
            `${d.lives} ${d.lives === 1 ? 'Schiff' : 'Schiffe'}`,
          value: `${d.scoreScale.toFixed(2).replace('.', ',')}× Punkte`,
          detail: d.blurb + (d.id === current ? '   (zurzeit eingestellt)' : ''),
          action: () => pick(d.id),
        })),
        { label: 'Zurück', detail: 'Zurück zu den Einstellungen.', action: back },
      ],
      DIFFICULTIES.findIndex((d) => d.id === current),
    );
  }

  settings(
    save: SaveData,
    actions: {
      difficulty: () => void;
      speed: () => void;
      touch: () => void;
      throttleMode: () => void;
      sound: () => void;
      help: () => void;
      reset: () => void;
      back: () => void;
    },
  ) {
    const diff = DIFFICULTIES.find((d) => d.id === save.difficulty)!;
    const speed = gameSpeedById(save.gameSpeed);
    const nextSpeed =
      GAME_SPEEDS[(GAME_SPEEDS.findIndex((g) => g.id === speed.id) + 1) % GAME_SPEEDS.length];
    const touchLabel = { auto: 'Automatisch', on: 'Immer an', off: 'Aus' }[save.touch];
    const touchDetail = {
      auto: 'Wird auf Geräten mit Touchscreen eingeblendet, sonst nicht.',
      on: 'Die beiden Regler am Bildschirmrand sind immer sichtbar.',
      off: 'Nur Tastatur und Gamepad.',
    }[save.touch];

    const host = this.panel(`
      <h2>EINSTELLUNGEN</h2>
      <p>
        Die Schwierigkeit bestimmt, wie viel dein Schiff aushält. Das Spieltempo bestimmt,
        wie schnell die Zeit vergeht – das ändert nichts an der Physik, du bekommst nur mehr
        Millisekunden zum Reagieren.
      </p>
    `);
    this.mountMenu(host, [
      {
        label: 'Schwierigkeit',
        desc: 'Schub, Schwerkraft, Anzahl der Schiffe und Landetoleranz',
        value: diff.name,
        detail: diff.blurb,
        action: actions.difficulty,
      },
      {
        label: 'Spieltempo',
        desc: `${speed.label} · ${Math.round(speed.scale * 100)} % der normalen Geschwindigkeit`,
        value: 'ändern',
        detail: `${speed.blurb}   Nächste Stufe: ${nextSpeed.label}.`,
        action: actions.speed,
      },
      {
        label: 'Bildschirmsteuerung',
        desc: 'Zwei Regler zum Ziehen: links lenken, rechts Schub geben',
        value: touchLabel,
        detail: touchDetail,
        action: actions.touch,
      },
      {
        label: 'Schub-Modus',
        desc: 'Wie der rechte Regler eine Berührung auffasst',
        value: THROTTLE_MODE_LABEL[save.throttleMode],
        detail:
          save.throttleMode === 'push'
            ? 'Antippen gibt sofort vollen Schub – genau wie die Schub-Taste. Ziehst du vom ' +
              'Berührungspunkt nach unten, nimmst du Gas weg. Lässt sich auch während des ' +
              'Flugs umschalten: über die Taste ☰ oben rechts.'
            : 'Der Schub kommt allein aus dem Zugweg: Antippen bewirkt nichts, Hochziehen ' +
              'gibt Gas. Lässt sich auch während des Flugs umschalten: über die Taste ☰ ' +
              'oben rechts.',
        action: actions.throttleMode,
      },
      {
        label: 'Ton',
        desc: 'Triebwerk, Einschläge und Menügeräusche',
        value: save.muted ? 'Aus' : 'An',
        detail: 'Lässt sich im Spiel jederzeit mit M umschalten.',
        action: actions.sound,
      },
      {
        label: 'Steuerung',
        desc: 'Tastatur, Gamepad und Touchscreen erklärt',
        detail: 'Zeigt außerdem, wie Landen, Fracht, Treibstoff und Flow funktionieren.',
        action: actions.help,
      },
      {
        label: 'Fortschritt löschen',
        desc: 'Setzt freigeschaltete Missionen, Bestzeiten und Punkte zurück',
        value: 'endgültig',
        detail: 'Das lässt sich nicht rückgängig machen.',
        action: actions.reset,
      },
      { label: 'Zurück', detail: 'Zurück zum Hauptmenü.', action: actions.back },
    ]);
  }

  levelSelect(
    save: SaveData,
    current: number,
    pick: (id: number) => void,
    password: () => void,
    back: () => void,
  ) {
    const host = this.panel(`
      <h2>MISSION WÄHLEN</h2>
      <p>
        Geschaffte Missionen bleiben freigeschaltet. Bestzeit und Medaille sind deine
        persönlichen Rekorde.
      </p>
    `);
    const items: MenuItem[] = LEVELS.map((l) => {
      const rec = save.levels[l.id];
      const locked = l.id > save.unlocked;
      return {
        label: `${l.id.toString().padStart(2, '0')}  ${l.name}`,
        desc: locked
          ? 'Noch gesperrt – schaffe zuerst die Mission davor'
          : rec?.cleared
            ? `Bestzeit ${fmt(rec.bestTime)} · ${num(rec.bestScore)} Punkte`
            : 'Freigeschaltet, noch nicht geschafft',
        value: locked ? 'gesperrt' : rec?.cleared && rec.medal !== 'none' ? MEDAL_DE[rec.medal] : undefined,
        detail: locked ? undefined : l.hint,
        disabled: locked,
        action: () => pick(l.id),
      };
    });
    items.push({
      label: 'Passwort eingeben',
      desc: 'Schaltet eine Mission frei, deren Passwort du kennst',
      detail: 'Das Passwort einer Mission bekommst du, sobald du die Mission davor schaffst.',
      action: password,
    });
    items.push({ label: 'Zurück', detail: 'Zurück zur Einsatzbesprechung.', action: back });
    this.mountMenu(host, items, Math.max(0, Math.min(current, save.unlocked) - 1));
  }

  password(submit: (pw: string) => void, back: () => void) {
    const host = this.panel(`
      <h2>PASSWORT</h2>
      <p>
        Ab der zweiten Mission hat jede ein eigenes Passwort. Du bekommst es angezeigt,
        sobald du die Mission davor geschafft hast.
      </p>
      <div class="pwfield"><input id="pw" maxlength="12" autocomplete="off" spellcheck="false" placeholder="········" /></div>
      <p class="footnote">Enter zum Bestätigen · Esc zum Zurückgehen</p>
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
        <div><kbd>A</kbd><kbd>←</kbd> <b>nach links drehen</b></div>
        <div><kbd>D</kbd><kbd>→</kbd> <b>nach rechts drehen</b></div>
        <div><kbd>W</kbd><kbd>↑</kbd><kbd>Leer</kbd> <b>Schub</b></div>
        <div><kbd>S</kbd><kbd>↓</kbd> <b>Lage-Assistent</b></div>
        <div><kbd>R</kbd> <b>Mission neu starten</b></div>
        <div><kbd>Esc</kbd><kbd>P</kbd> <b>Pause</b></div>
        <div><kbd>M</kbd> <b>Ton an/aus</b></div>
        <div><kbd>F3</kbd> <b>Technikanzeige</b></div>
      </div>
      <p class="hint">
        Der Schub wirkt immer in Richtung der Schiffsnase. Zum Bremsen musst du dich also
        erst umdrehen – dieses Umdrehen ist der Kern des Spiels.
      </p>
      <div class="grid2">
        <div>
          <p><b>Landen</b><br />
            Die Landeanzeige ist grün, solange Geschwindigkeit und Neigung im Rahmen
            liegen. Gelb bedeutet grenzwertig, Rot bedeutet: gleich zerschellst du.</p>
          <p><b>Fracht</b><br />
            Flieg eine Kiste an, um sie aufzunehmen – bis zu drei Stück gleichzeitig. Jede
            Kiste an Bord macht das Schiff schwerer und träger; alles auf einmal zu
            transportieren ist deshalb ein echtes Risiko. Auf der blauen Basis landen lädt
            ab. Die Mission ist geschafft, sobald die gesamte Fracht dort ist.</p>
        </div>
        <div>
          <p><b>Treibstoff</b><br />
            Das Triebwerk verbraucht so viel Treibstoff, wie du Gas gibst. Auf grünen
            Feldern tankst du auf, solange du darauf stehst. Ein leerer Tank bedeutet nicht
            sofort das Ende – aber die Schwerkraft hat das letzte Wort.</p>
          <p><b>Flow</b><br />
            Wer schnell fliegt und dabei dicht am Fels bleibt, füllt die Flow-Anzeige. Sie
            vervielfacht alle Punkte und gibt nach und nach Treibstoff zurück. Die
            schnellste Linie ist die gefährlichste – genau darum geht es.</p>
        </div>
      </div>
      <p class="footnote">
        Gamepads werden ebenfalls unterstützt: linker Stick oder Steuerkreuz zum Drehen, A
        oder rechter Trigger für Schub – der Trigger arbeitet stufenlos. Auf dem Touchscreen
        bekommst du zwei Regler: die linke Bildschirmhälfte lenkt, die rechte gibt Schub. Du
        berührst irgendeine Stelle der jeweiligen Hälfte und ziehst; entscheidend ist, wie
        weit du ziehst, nicht wo du das Display berührst. Das Lenken ist stufenlos und lässt
        sich deshalb fein dosieren. Lage-Assistent, Pause und die Umschaltung des
        Schub-Modus liegen hinter der Taste ☰ oben rechts – so steht keine Taste mitten in
        der Höhle.
      </p>
      <p class="footnote">
        Für den Schub gibt es zwei Modi. Du schaltest sie mit der GAS-Taste im Tastenfach
        oder in den Einstellungen um. <b>PUSH</b> (Standard): Antippen gibt sofort
        vollen Schub, und wer feiner dosieren möchte, zieht vom Berührungspunkt nach unten.
        <b>REGLER</b>: Der Schub kommt allein aus dem Zugweg; zum Schweben brauchst du etwa
        ein Drittel davon.
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
    choose: () => void,
    back: () => void,
  ) {
    const level = LEVELS[levelId - 1];
    const crates = level.objects.filter((o) => o.t === 'cargo').length;
    const host = this.panel(`
      <span class="badge">MISSION ${levelId.toString().padStart(2, '0')} VON ${LEVELS.length}</span>
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
      {
        label: 'Andere Mission wählen',
        desc: 'Alle freigeschalteten Missionen mit Bestzeit und Medaille',
        action: choose,
      },
      { label: 'Zurück zum Hauptmenü', action: back },
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
      {
        label: 'Mission neu starten',
        desc: 'Von vorn, mit vollem Tank',
        value: 'R',
        action: restart,
      },
      { label: 'Ton', desc: 'Triebwerk und Menügeräusche', value: muted ? 'Aus' : 'An', action: toggleMute },
      {
        label: 'Mission abbrechen',
        desc: 'Zurück zum Hauptmenü – dein Fortschritt bleibt gespeichert',
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
      <span class="badge">MISSION GESCHAFFT</span>
      <h2 style="margin-top:.7em">${esc(level.name.toUpperCase())}</h2>
      <p>
        <span class="medal ${medal}">${MEDAL_DE[medal].toUpperCase()}</span>
        &nbsp; ${fmt(time)} bei einer Zielzeit von ${fmt(level.par)}
        &nbsp;·&nbsp; ${deaths} ${deaths === 1 ? 'Schiff' : 'Schiffe'} verloren
      </p>
      <table class="scoretable">
        ${rows
          .filter(([, v]) => v !== 0)
          .map(([k, v]) => `<tr><td>${k}</td><td>${num(v)}</td></tr>`)
          .join('')}
        <tr class="total"><td>Gesamt</td><td>${num(breakdown.total)}</td></tr>
      </table>
      ${nextPassword ? `<p class="hint">Passwort für die nächste Mission: <b>${esc(nextPassword)}</b></p>` : ''}
    `);
    const items: MenuItem[] = [];
    if (levelId < LEVELS.length) items.push({ label: 'Nächste Mission', value: 'Enter', action: next });
    items.push({
      label: 'Noch einmal fliegen',
      desc: 'Für eine bessere Zeit oder eine bessere Medaille',
      value: 'R',
      action: replay,
    });
    items.push({ label: 'Zurück zum Hauptmenü', action: quit });
    this.mountMenu(host, items);
  }

  gameOver(levelId: number, score: number, reason: string, retry: () => void, quit: () => void) {
    const host = this.panel(`
      <h2 style="color:var(--bad)">MISSION GESCHEITERT</h2>
      <p>${esc(reason)}</p>
      <p>Du bist in <b>${esc(LEVELS[levelId - 1].name)}</b> gescheitert, mit ${num(score)} Punkten auf dem Konto.</p>
      <p class="footnote">
        Dein Fortschritt bis zu dieser Mission ist gespeichert. Verloren ist nur dieser
        Versuch.
      </p>
    `);
    this.mountMenu(host, [
      { label: 'Mission noch einmal fliegen', value: 'Enter', action: retry },
      { label: 'Zurück zum Hauptmenü', action: quit },
    ]);
  }

  campaignComplete(save: SaveData, quit: () => void) {
    const golds = Object.values(save.levels).filter((l) => l.medal === 'gold').length;
    const host = this.panel(`
      <h1>ALLE MISSIONEN GEFLOGEN</h1>
      <p class="tagline">Zwanzig von zwanzig. Die Fracht ist zu Hause.</p>
      <div class="keycaps">
        <div><b>Punkte gesamt</b> ${num(save.totalScore)}</div>
        <div><b>Gold-Medaillen</b> ${golds} von ${LEVELS.length}</div>
        <div><b>Verlorene Schiffe</b> ${num(save.wrecks)}</div>
      </div>
      <p>
        Es gibt immer noch eine höhere Schwierigkeitsstufe – und in jeder Mission eine
        Gold-Zeit, die du dir noch nicht geholt hast.
      </p>
    `);
    this.mountMenu(host, [{ label: 'Zurück zum Hauptmenü', action: quit }]);
  }
}
