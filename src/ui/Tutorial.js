// Interaction-led tutorial: one short hint at a time, anchored to the thing
// to interact with, advancing when the player actually does it.
import { icon } from './icons.js';
import { bus } from '../core/EventBus.js';

const STEPS = [
  { text: 'Drag to look around your room.', event: 'camera:panned', anchor: 'center' },
  { text: 'Tap a fish to meet it.', event: 'fish:selected', anchor: 'fish' },
  { text: 'Give your fish a name.', event: 'fish:renamed', anchor: '[data-act="fish:sub:rename"]', onShow: (ui) => ui.fishCardId && !ui.fishSub && ui.panels.action('fish', 'sub', 'rename') },
  { text: 'Time to eat! Tap Feed.', event: 'fish:fed', anchor: '#btnFeed' },
  { text: 'Watch your keeper feed them — the fish chase every flake.', event: 'fish:ate', count: 4, anchor: 'tank' },
  { text: 'Tap the aquarium glass.', event: 'glass:tapped', anchor: 'glass' },
  { text: 'Algae! Open Care and wipe a patch clean.', event: 'clean:patch', anchor: '#btnCare' },
  { text: 'Plant your Anubias: tap Plants, then pick it.', event: 'plant:placed', anchor: '[data-act="decor:plants"]' },
  { text: 'You completed a quest — claim the reward.', event: 'quest:claimed', anchor: '#railQuests' },
  { text: 'Welcome a new fish from the Store.', event: 'fish:bought', anchor: '[data-act="open:shop"]' },
  { text: 'Unlock your first decoration in the Store.', event: 'decor:bought', anchor: '[data-act="open:shop"]' },
];

export class Tutorial {
  constructor(ui) {
    this.ui = ui;
    this.el = ui.root.querySelector('#coach');
    this.count = 0;
    this.active = false;
    bus.on('*', ({ type }) => this.onEvent(type));
  }
  get st() {
    return this.ui.game.state.tutorial;
  }
  start() {
    if (this.st.done) return;
    this.active = true;
    this.show();
  }
  restart() {
    this.st.step = 0;
    this.st.done = false;
    this.start();
  }
  skip() {
    this.st.done = true;
    this.active = false;
    this.el.innerHTML = '';
  }
  onEvent(type) {
    if (!this.active || this.st.done) return;
    const step = STEPS[this.st.step];
    if (!step || type !== step.event) return;
    this.count++;
    if (this.count < (step.count ?? 1)) return;
    this.count = 0;
    this.st.step++;
    if (this.st.step >= STEPS.length) {
      this.skip();
      this.ui.toast('You’re all set!', 'Your aquarium is yours to grow.', 'sparkle', 'gold');
      return;
    }
    this.ui.game.audio.sparkle();
    setTimeout(() => this.show(), 900);
  }
  show() {
    const step = STEPS[this.st.step];
    if (!step) return;
    this.shownAt = performance.now();
    step.onShow?.(this.ui);
    this.el.innerHTML = `<div class="coach glass pe" id="coachBox">${icon('sparkle')}<div>${step.text}<br><button class="skip" id="coachSkip">Skip tutorial</button></div></div><div id="coachMark"></div>`;
    this.el.querySelector('#coachSkip').addEventListener('click', () => this.skip());
    this.place();
  }
  // compute anchor screen point each frame (UI moves, fish swim)
  anchorRect(step) {
    const g = this.ui.game;
    const W = window.innerWidth, H = window.innerHeight;
    const proj = (v) => {
      const p = v.clone().project(g.renderer.camera);
      return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H };
    };
    if (step.anchor === 'center') return { point: { x: W / 2, y: H * 0.45 }, boxAt: { x: W / 2 - 140, y: H * 0.26 } };
    if (step.anchor === 'fish') {
      const f = g.fish.list.find((a) => a.rec.stage !== 'EGG');
      return f ? { point: proj(f.pos) } : null;
    }
    if (step.anchor === 'tank') return { point: proj(g.aquarium.center.clone().setY(g.aquarium.waterY - 0.15)) };
    if (step.anchor === 'glass') return { point: proj(g.aquarium.center.clone().setY(g.aquarium.center.y + g.aquarium.dim.h * 0.55).setZ(g.aquarium.frontZ)) };
    const el = this.ui.root.querySelector(step.anchor);
    if (!el || el.offsetParent === null) return null;
    return { rect: el.getBoundingClientRect() };
  }
  place() {
    const step = STEPS[this.st.step];
    const box = this.el.querySelector('#coachBox');
    const mark = this.el.querySelector('#coachMark');
    if (!step || !box) return;
    const a = this.anchorRect(step);
    const W = window.innerWidth, H = window.innerHeight;
    let x = W / 2 - 140, y = H * 0.25;
    if (a?.rect) {
      const r = a.rect;
      mark.className = 'coach-ring';
      mark.style.cssText = `left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px`;
      x = r.left + r.width / 2 < W / 2 ? r.right + 16 : r.left - 300;
      y = r.top + r.height / 2 - 30;
      if (r.top > H * 0.75) {
        x = r.left + r.width / 2 - 140;
        y = r.top - 90;
      }
    } else if (a?.point) {
      mark.className = 'coach-dot';
      mark.style.cssText = `left:${a.point.x}px;top:${a.point.y}px`;
      x = a.boxAt?.x ?? a.point.x + 40;
      y = a.boxAt?.y ?? a.point.y - 80;
      if (this.ui.fishCardId && !a.boxAt) y = Math.min(y, 100);
    } else mark.className = '';
    box.style.left = `${Math.max(10, Math.min(W - 290, x))}px`;
    box.style.top = `${Math.max(80, Math.min(H - 120, y))}px`;
  }
  update() {
    if (this.active && !this.st.done && this.el.firstElementChild) this.place();
  }
}
