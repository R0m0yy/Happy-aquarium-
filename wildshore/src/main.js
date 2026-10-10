// Bootstrap: settings, loading screen, game construction and the frame loop.
import { Game } from './game.js';
import { UI } from './ui/ui.js';
import { defaultQuality } from './render/pipeline.js';

const params = new URLSearchParams(location.search);
let settings = { quality: defaultQuality(), dayLength: 24, volume: 0.8, tips: '1' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('wildshore_settings') || '{}')); } catch {}
if (params.get('q')) settings.quality = params.get('q');

const canvas = document.getElementById('game');
const game = new Game(canvas, settings.quality, settings);
const ui = new UI(game, document.getElementById('ui'));
window.__game = game;

let failed = false;
function fail(e) {
  console.error(e);
  failed = true;
  const el = document.querySelector('.ltext');
  if (el) { el.textContent = 'Could not start: ' + (e && e.message ? e.message : e) + '. Close and reopen the page to retry.'; el.style.color = '#ffb4a4'; el.style.maxWidth = '80vw'; el.style.textAlign = 'center'; }
}
window.addEventListener('error', (e) => { if (!game.started) fail(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { if (!game.started) fail(e.reason); });

(async () => {
  try {
    await Promise.race([
      game.init((p, t) => ui.setLoading(p, t)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('loading timed out')), 90000)),
    ]);
  } catch (e) { fail(e); return; }
  ui.hideLoading();
  game.audio.setVolume(settings.volume);
  // dev/test hooks
  if (params.has('autostart')) {
    ui.startGame(params.get('autostart') === 'continue');
    if (params.get('t')) game.env.time = parseFloat(params.get('t'));
    if (params.get('w')) game.env.setWeather(params.get('w'), true);
    if (params.get('p')) { const [x, z] = params.get('p').split(',').map(Number); game.player.pos.set(x, game.groundAt(x, z), z); game.rig.focus.copy(game.player.pos); }
    if (params.get('yaw')) game.rig.yaw = game.rig.targetYaw = parseFloat(params.get('yaw'));
    if (params.get('zoom')) game.rig.zoom.explore = parseFloat(params.get('zoom'));
    if (params.has('freeze')) game.env.dayLengthMin = 1e9;
  } else ui.showTitle(Game.hasSave());
  let last = performance.now();
  window.__frames = 0;
  const loop = (now) => {
    const dt = Math.max(0, (now - last) / 1000);
    last = now;
    try { game.update(dt); } catch (e) { console.error(e); }
    window.__frames++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.started && !game.paused) { game.save(); } });
})();
