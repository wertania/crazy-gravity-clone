import './style.css';
import { Game } from './app/game';

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;

function fatal(message: string) {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  overlay.hidden = false;
  overlay.innerHTML = `<div class="panel"><h2>Cannot start</h2><p>${message}</p></div>`;
}

if (!canvas) {
  fatal('The render surface is missing from the page.');
} else {
  try {
    const game = new Game(canvas);
    // Expose for the end-to-end tests and for poking at the sim in a console.
    (window as unknown as { game: Game }).game = game;
    window.addEventListener('pagehide', () => game.dispose(), { once: true });
  } catch (err) {
    console.error(err);
    fatal(
      'WebGL could not be initialised. Gravity Hauler needs a browser with hardware-accelerated WebGL 2.',
    );
  }
}
