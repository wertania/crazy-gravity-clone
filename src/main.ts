import './style.css';
import { Game } from './app/game';

/** Set up by the inline boot script in index.html; absent only in odd embeds. */
declare global {
  interface Window {
    __boot?: {
      phase(pct: number, text: string): void;
      fail(text: string): void;
      done(): void;
    };
    game?: Game;
  }
}

const boot = window.__boot;
// Reaching this line means the bundle is downloaded, parsed and running - the
// single longest phase on a phone, and the one no script could report on.
boot?.phase(55, 'Höhlen werden geladen …');

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;

function fatal(message: string) {
  boot?.fail(message);
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  overlay.hidden = false;
  overlay.innerHTML = `<div class="panel"><h2>Start nicht möglich</h2><p>${message}</p></div>`;
}

if (!canvas) {
  fatal('Die Zeichenfläche fehlt auf dieser Seite.');
} else {
  try {
    const game = new Game(canvas, {
      onRendererReady: () => boot?.phase(80, 'Shader werden übersetzt …'),
      // Fires after the first frame has actually been composited, so the boot
      // screen never disappears onto a still-black canvas.
      onFirstFrame: () => boot?.done(),
    });
    // Exposed for the end-to-end tests and for poking at the sim in a console.
    window.game = game;
    window.addEventListener('pagehide', () => game.dispose(), { once: true });
  } catch (err) {
    console.error(err);
    fatal(
      'WebGL konnte nicht gestartet werden. Gravity Pilot benötigt einen Browser mit hardwarebeschleunigtem WebGL 2.',
    );
  }
}
