// Entry point: boot the game behind the loading screen.
import { Game } from './core/Game.js';

const loader = document.getElementById('loader');
const fill = loader.querySelector('.loader-fill');
const msg = loader.querySelector('.loader-msg');

function progress(p, text) {
  fill.style.width = `${Math.round(p * 100)}%`;
  if (text) msg.textContent = text;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function boot() {
  if (!webglAvailable()) {
    msg.textContent = 'AQUARIA needs WebGL. Please enable hardware acceleration or try another browser.';
    return;
  }
  const game = new Game();
  try {
    await game.init(progress);
  } catch (e) {
    console.error(e);
    msg.textContent = `Something went wrong while loading: ${e.message}`;
    return;
  }
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 1000);
  game.start();
  // audio needs a user gesture
  const unlock = () => {
    game.audio.start();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

boot();
