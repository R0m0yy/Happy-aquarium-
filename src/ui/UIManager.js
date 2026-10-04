// DOM user interface: HUD, panels, floating fish card, mode toolbars, toasts,
// modals, world labels and the interaction-led tutorial.
import * as THREE from 'three';
import { icon } from './icons.js';
import { bus } from '../core/EventBus.js';
import { formatNumber, clamp } from '../core/util.js';
import { xpForLevel } from '../data/progression.js';
import { SPECIES_BY_ID, RARITY_COLORS, RARITIES } from '../data/species.js';
import { express, fishBeauty, describeGenome, cap } from '../systems/Genetics.js';
import { Panels } from './Panels.js';
import { Tutorial } from './Tutorial.js';

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UIManager {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.thumbIds = new Map();
    this.thumbSeq = 0;
    this.panel = null;
    this.panelName = null;
    this.fishCardId = null;
    this.fishSub = null;
    this.unread = 0;
    this.labels = [];
    this.build();
    this.panels = new Panels(this);
    this.tutorial = new Tutorial(this);
    this.wire();
    this.timer = 0;
  }
  get s() {
    return this.game.state;
  }

  // ------------------------------------------------------------- skeleton
  build() {
    this.root.innerHTML = `
      <div class="hud top-left">
        <div class="profile glass pe" data-act="open:room:keeper">
          <div class="portrait"><img id="portrait" src="${BLANK}" alt=""></div>
          <div>
            <div class="profile-name" id="pname">My Aquarium</div>
            <div class="xp-row"><span class="lvl-pill" id="plevel">Lv.1</span>
              <div class="xp-bar"><div class="xp-fill" id="pxp"></div><div class="xp-text" id="pxptext"></div></div></div>
          </div>
        </div>
      </div>
      <div class="hud top-right">
        <div class="currency glass pe" id="coins">${icon('coin')}<span class="amt">0</span><button class="plus" data-act="earn:coins" title="How to earn coins">${icon('plus')}</button></div>
        <div class="currency glass pe" id="pearls">${icon('pearl')}<span class="amt">0</span><button class="plus" data-act="earn:pearls" title="How to earn pearls">${icon('plus')}</button></div>
        <button class="top-icon mail" data-act="open:mail" title="Mail">${icon('mail')}<span class="badge hidden" id="mailBadge"></span></button>
        <button class="top-icon" data-act="open:notifications" title="Notifications">${icon('bell')}<span class="badge hidden" id="bellBadge"></span></button>
        <button class="top-icon" data-act="open:settings" title="Settings">${icon('settings')}</button>
      </div>
      <nav class="hud rail rail-left glass">
        <button class="rail-btn" data-act="open:tank">${icon('tank')}<span>Tank</span></button>
        <button class="rail-btn" data-act="open:fish">${icon('fish')}<span>Fish</span></button>
        <button class="rail-btn" data-act="open:plants">${icon('plant')}<span>Plants</span></button>
        <button class="rail-btn" data-act="mode:decorate">${icon('decor')}<span>Decor</span></button>
        <button class="rail-btn" data-act="open:shop">${icon('shop')}<span>Shop</span></button>
        <button class="rail-btn" data-act="open:quests" id="railQuests">${icon('quests')}<span>Quests</span><span class="badge hidden" id="questBadge"></span></button>
        <button class="rail-btn" data-act="open:events">${icon('events')}<span>Events</span></button>
      </nav>
      <nav class="hud rail rail-right glass" id="railRight">
        <button class="rail-btn" data-act="feed" id="btnFeed">${icon('feed', 'feed-ic')}<span>Feed</span></button>
        <button class="rail-btn" data-act="open:care" id="btnCare">${icon('care', 'care-ic')}<span>Care</span></button>
        <button class="rail-btn" data-act="mode:decorate" id="btnDecorate">${icon('decorate', 'deco-ic')}<span>Decorate</span></button>
        <button class="rail-btn" data-act="mode:photo">${icon('photo', 'photo-ic')}<span>Photo</span></button>
      </nav>
      <div class="hud dock dock-left" id="dockLeft">
        <button class="dock-btn glass primary" data-act="mode:decorate">${icon('edit', 'c-edit')}<span>Edit Tank</span></button>
        <button class="dock-btn glass" data-act="open:fish">${icon('fish', 'c-fish')}<span>Fish</span></button>
        <button class="dock-btn glass" data-act="decor:plants">${icon('plant', 'c-plant')}<span>Plants</span></button>
        <button class="dock-btn glass" data-act="decor:ornaments">${icon('decor', 'c-decor')}<span>Decorations</span></button>
        <button class="dock-btn glass" data-act="decor:backgrounds">${icon('backgrounds', 'c-bg')}<span>Backgrounds</span></button>
      </div>
      <div class="hud dock dock-right" id="dockRight">
        <button class="dock-btn glass" data-act="open:gallery">${icon('gallery')}<span>Gallery</span></button>
        <button class="dock-btn glass primary" data-act="open:room">${icon('home', 'c-home')}<span>Aquarium Room</span></button>
        <button class="dock-btn glass" data-act="open:shop">${icon('store')}<span>Store</span></button>
      </div>
      <div id="panels"></div>
      <div id="modeUI"></div>
      <div id="labels"></div>
      <div id="fishCard"></div>
      <div id="toasts"></div>
      <div id="coach"></div>
      <div id="modals"></div>
      <div class="fps glass hidden" id="fps"></div>
    `;
    this.$ = (sel) => this.root.querySelector(sel);
    this.panelsEl = this.$('#panels');
    this.modeEl = this.$('#modeUI');
    this.cardEl = this.$('#fishCard');
    this.toastEl = this.$('#toasts');
    this.modalEl = this.$('#modals');
    this.labelsEl = this.$('#labels');
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => this.panels.onInput?.(e));
    this.root.addEventListener('change', (e) => this.panels.onChange?.(e));
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.panel, .fish-card, .glass, button, .modal-back, .tray')) e.stopPropagation();
    });
    this.root.addEventListener('wheel', (e) => {
      if (e.target.closest('.panel, .tray, .fish-card')) e.stopPropagation();
    });
    this.refreshHUD();
  }

  show() {
    this.root.classList.remove('hidden');
  }

  // ---------------------------------------------------------- thumbnails
  thumb(kind, data, extraClass = '') {
    const pr = this.game.preview;
    const key = pr.key(kind, data);
    let id = this.thumbIds.get(key);
    if (!id) {
      id = `t${++this.thumbSeq}`;
      this.thumbIds.set(key, id);
    }
    const url = pr.thumb(kind, data, (u) => {
      if (!u) return;
      this.root.querySelectorAll(`img[data-tk="${id}"]`).forEach((img) => (img.src = u));
    });
    return `<img data-tk="${id}" class="${extraClass}" src="${url ?? BLANK}" alt="">`;
  }

  // ---------------------------------------------------------------- HUD
  refreshHUD() {
    const p = this.s.player;
    this.$('#pname').textContent = p.name;
    this.$('#plevel').textContent = `Lv.${p.level}`;
    const need = xpForLevel(p.level);
    this.$('#pxp').style.width = `${clamp(p.xp / need, 0, 1) * 100}%`;
    this.$('#pxptext').textContent = `${formatNumber(p.xp)} / ${formatNumber(need)}`;
    this.setAmount('#coins', p.coins);
    this.setAmount('#pearls', p.pearls);
    const mail = this.s.inbox.filter((m) => !m.claimed).length;
    this.badge('#mailBadge', mail);
    this.badge('#bellBadge', this.unread);
    const claimable = this.s.quests.completed.filter((q) => !this.s.quests.claimed.includes(q)).length;
    this.badge('#questBadge', claimable);
  }
  setAmount(sel, v) {
    const el = this.$(`${sel} .amt`);
    const txt = formatNumber(v);
    if (el.textContent !== txt) {
      el.textContent = txt;
      el.parentElement.classList.remove('bump');
      void el.parentElement.offsetWidth;
      el.parentElement.classList.add('bump');
    }
  }
  badge(sel, n) {
    const b = this.$(sel);
    b.textContent = n;
    b.classList.toggle('hidden', !n);
  }
  setPortrait(url) {
    if (url) this.$('#portrait').src = url;
  }

  // ------------------------------------------------------------- clicks
  onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const [cmd, a, b] = act.split(':');
    this.game.audio.click();
    const g = this.game;
    switch (cmd) {
      case 'open':
        this.open(a, b);
        break;
      case 'close':
        this.close();
        break;
      case 'mode':
        if (g.mode === a) g.setMode('normal');
        else g.setMode(a);
        break;
      case 'decor':
        g.setMode('decorate', a);
        break;
      case 'feed':
        g.feed();
        break;
      case 'earn':
        this.earnInfo(a);
        break;
      case 'modal-close':
        this.closeModal();
        break;
      default:
        this.panels.action(cmd, a, b, el, e);
    }
  }

  // ------------------------------------------------------------- panels
  open(name, arg) {
    if (this.game.mode !== 'normal' && this.game.mode !== 'clean') this.game.setMode('normal');
    if (this.panelName === name && !arg) {
      this.close();
      return;
    }
    this.panelName = name;
    this.panelArg = arg;
    this.game.preview.stopLive();
    this.renderPanel();
    this.game.audio.open();
    bus.emit('ui:open', { name });
    this.root.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('active', b.dataset.act === `open:${name}`));
    if (name === 'notifications') {
      this.unread = 0;
      this.refreshHUD();
    }
  }
  renderPanel() {
    if (!this.panelName) return;
    const def = this.panels.render(this.panelName, this.panelArg);
    if (!def) return this.close();
    const keepScroll = this.panelsEl.querySelector('.panel-body')?.scrollTop ?? 0;
    const same = this.panelsEl.firstElementChild?.dataset.name === this.panelName;
    this.panelsEl.innerHTML = `<section class="panel ${def.cls ?? ''}" data-name="${this.panelName}">
      <div class="panel-head">${icon(def.icon ?? 'info')}<h2>${def.title}</h2>${def.headExtra ?? ''}<button class="icon-btn" data-act="close" title="Close">${icon('close')}</button></div>
      ${def.tabs ?? ''}
      <div class="panel-body">${def.body}</div>
    </section>`;
    if (same) this.panelsEl.querySelector('.panel-body').scrollTop = keepScroll;
    def.after?.(this.panelsEl.querySelector('.panel'));
  }
  refreshPanel(...names) {
    if (this.panelName && (!names.length || names.includes(this.panelName))) this.renderPanel();
  }
  close() {
    if (!this.panelName) return;
    this.panelName = null;
    this.panelsEl.innerHTML = '';
    this.game.preview.stopLive();
    this.game.audio.close();
    this.root.querySelectorAll('.rail-btn').forEach((b) => b.classList.remove('active'));
  }

  // ------------------------------------------------------------- modals
  modal(html, { dismiss = true } = {}) {
    this.modalEl.innerHTML = `<div class="modal-back" data-back="1"><div class="modal glass">${html}</div></div>`;
    if (dismiss) this.modalEl.querySelector('.modal-back').addEventListener('click', (e) => {
      if (e.target.dataset.back) this.closeModal();
    });
  }
  closeModal() {
    this.modalEl.innerHTML = '';
  }
  earnInfo(kind) {
    const lines = kind === 'coins'
      ? ['Complete quests and weekly events', 'Level up', 'Trim overgrown plants', 'Sell fish you have bred', 'Discover hidden treasures your fish find']
      : ['Level up (pearls every level)', 'Unlock achievements', 'Discover genetic mutations', 'Teach your fish tricks', 'Claim quest & event rewards'];
    this.modal(`<div class="big-ic">${icon(kind === 'coins' ? 'coin' : 'pearl')}</div><h2>Earn ${cap(kind)}</h2>
      <p>Everything in AQUARIA is earned by playing — no purchases, no ads.</p>
      <div style="text-align:left">${lines.map((l) => `<div class="list-item">${icon('check')}<span>${l}</span></div>`).join('')}</div>
      <button class="btn primary" data-act="modal-close">Got it</button>`);
  }

  // ------------------------------------------------------------- toasts
  toast(title, sub = '', ic = 'sparkle', tone = '') {
    const t = document.createElement('div');
    t.className = `toast glass ${tone}`;
    t.innerHTML = `<div class="ti">${icon(ic)}</div><div><div class="tt">${esc(title)}</div>${sub ? `<div class="ts">${esc(sub)}</div>` : ''}</div>`;
    this.toastEl.appendChild(t);
    while (this.toastEl.children.length > 4) this.toastEl.firstElementChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 320);
    }, 3800);
    this.log(title, sub, ic);
  }
  log(title, sub, ic) {
    this.s.notifications.unshift({ time: Date.now(), title, sub, icon: ic });
    this.s.notifications = this.s.notifications.slice(0, 60);
    if (this.panelName !== 'notifications') this.unread = Math.min(99, this.unread + 1);
    this.refreshHUD();
  }
  floatReward(r) {
    const parts = [];
    if (r.coins) parts.push(['#coins', `+${formatNumber(r.coins)}`, 'coin']);
    if (r.pearls) parts.push(['#pearls', `+${formatNumber(r.pearls)}`, 'pearl']);
    for (const [sel, txt, ic] of parts) {
      const box = this.$(sel).getBoundingClientRect();
      const f = document.createElement('div');
      f.className = 'float-reward';
      f.style.left = `${box.left + 30}px`;
      f.style.top = `${box.bottom + 6}px`;
      f.innerHTML = `${icon(ic)}${txt}`;
      this.root.appendChild(f);
      setTimeout(() => f.remove(), 1500);
    }
  }
  flash() {
    const f = document.createElement('div');
    f.className = 'flash';
    this.root.appendChild(f);
    setTimeout(() => f.remove(), 520);
  }

  // ---------------------------------------------------------- fish card
  showFishCard(id, sub = null) {
    this.fishCardId = id;
    this.fishSub = sub;
    this.renderFishCard();
  }
  hideFishCard() {
    this.fishCardId = null;
    this.fishSub = null;
    this.cardEl.innerHTML = '';
  }
  renderFishCard() {
    const id = this.fishCardId;
    const rec = this.game.fishRecord(id);
    if (!rec) return this.hideFishCard();
    const sp = SPECIES_BY_ID[rec.species];
    const beauty = fishBeauty(rec);
    const stars = Math.round(1 + RARITIES.indexOf(rec.rarity) * 0.8 + beauty);
    const ageMin = Math.floor((rec.age ?? 0) / 60);
    const following = this.game.camera.mode === 'follow' && this.game.camera.follow?.rec.id === id;
    const egg = rec.stage === 'EGG';
    const traits = describeGenome(rec.species, rec.genome);
    const breedStatus = rec.pregnant ? `Expecting (${Math.ceil(rec.pregnant.due / 60)}m)` : rec.breedCooldown > 0 ? `Resting ${Math.ceil(rec.breedCooldown / 60)}m` : rec.stage === 'ADULT' ? 'Ready' : 'Too young';
    const desc = egg ? `A clutch of ${sp.name} eggs, quietly developing.` : sp.desc;
    this.cardEl.innerHTML = `<div class="fish-card glass" id="fc">
      <button class="fav ${rec.favorite ? 'on' : ''}" data-act="fish:fav:${id}" title="Favorite">${icon(rec.favorite ? 'heartFill' : 'heart')}</button>
      <button class="icon-btn close" data-act="fish:close" title="Close">${icon('close')}</button>
      <div class="fc-head">
        <div class="fc-portrait">${this.thumb('fish', rec)}</div>
        <div>
          <h3>${esc(rec.name)} ${rec.sex && !egg ? `<span class="pill" title="${rec.sex === 'M' ? 'Male' : 'Female'}">${rec.sex === 'M' ? '♂' : '♀'}</span>` : ''}</h3>
          <div class="fc-sub">${esc(sp.name)} · ${esc(cap(rec.stage.toLowerCase()))}${egg ? '' : ` · ${ageMin < 60 ? `${ageMin}m` : `${Math.floor(ageMin / 60)}h`} old`}</div>
          <div class="row" style="margin-top:4px"><span class="pill" style="background:${RARITY_COLORS[rec.rarity]}33;color:${RARITY_COLORS[rec.rarity]}">${rec.rarity}</span>
          <span class="stars">${[0, 1, 2, 3, 4].map((i) => icon('star', i < stars ? '' : 'off')).join('')}</span></div>
        </div>
      </div>
      <div class="desc">${esc(desc)}</div>
      ${egg ? `<div class="stat">${icon('egg')}<span>Hatching</span><div class="bar happy"><div style="width:${(rec.stageProgress ?? 0) * 100}%"></div></div><span>${Math.round((rec.stageProgress ?? 0) * 100)}%</span></div>` : `
      <div class="stat">${icon('heart')}<span>Health</span><div class="bar health"><div style="width:${rec.health * 100}%"></div></div><span>${Math.round(rec.health * 100)}%</span></div>
      <div class="stat">${icon('feed')}<span>Hunger</span><div class="bar hunger"><div style="width:${rec.hunger * 100}%"></div></div><span>${Math.round(rec.hunger * 100)}%</span></div>
      <div class="stat">${icon('sparkle')}<span>Happiness</span><div class="bar happy"><div style="width:${rec.happiness * 100}%"></div></div><span>${Math.round(rec.happiness * 100)}%</span></div>
      <div class="stat">${icon('star')}<span>Beauty</span><div class="bar beauty"><div style="width:${beauty * 100}%"></div></div><span>${Math.round(beauty * 100)}</span></div>
      <div class="traits"><span class="pill">${icon('user')} ${rec.personality.map(cap).join(' · ')}</span><span class="pill">Loves ${esc(rec.favoriteFood)}</span><span class="pill">${icon('breed')} ${breedStatus}</span>${rec.stage !== 'ADULT' ? `<span class="pill">Growth ${Math.round((rec.stageProgress ?? 0) * 100)}%</span>` : ''}<span class="pill">Gen ${rec.generation ?? 1}</span></div>
      <div class="traits">${traits.map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>`}
      <div class="actions">
        <button class="act ${following ? 'on' : ''}" data-act="fish:follow:${id}">${icon('eye')}Follow</button>
        <button class="act" data-act="fish:sub:rename">${icon('pencil')}Rename</button>
        <button class="act" data-act="fish:feed:${id}">${icon('feed')}Feed</button>
        <button class="act" data-act="fish:sub:train">${icon('train')}Train</button>
        <button class="act" data-act="fish:sub:breed">${icon('breed')}Breed</button>
        <button class="act" data-act="fish:photo:${id}">${icon('photo')}Photo</button>
        <button class="act" data-act="fish:sub:move">${icon('swap')}Move</button>
        <button class="act" data-act="fish:family:${id}">${icon('family')}Family</button>
        <button class="act" data-act="fish:sub:info">${icon('dna')}Genes</button>
        <button class="act" data-act="fish:sub:sell">${icon('sell')}Sell</button>
      </div>
      ${this.fishSub ? `<div class="sub-panel">${this.panels.fishSub(rec, this.fishSub)}</div>` : ''}
    </div>`;
    this.positionFishCard();
    const inp = this.cardEl.querySelector('input');
    if (inp && this.fishSub === 'rename') {
      inp.focus();
      inp.select();
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') this.panels.action('fish', 'renameOk', id);
      });
    }
  }
  positionFishCard() {
    const card = this.cardEl.firstElementChild;
    if (!card || window.innerWidth <= 760) return;
    const a = this.game.fish.get(this.fishCardId);
    const W = window.innerWidth, H = window.innerHeight;
    let x = W * 0.62, y = H * 0.18;
    if (a) {
      const v = a.pos.clone().project(this.game.renderer.camera);
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      x = sx + 70;
      y = sy - 140;
      if (x + 340 > W - 110) x = sx - 70 - 330;
    }
    const h = card.offsetHeight || 380;
    const panel = this.panelsEl.querySelector('.panel:not(.right)');
    if (panel) x = Math.max(x, panel.getBoundingClientRect().right + 16);
    x = clamp(x, 110, W - 440);
    y = clamp(y, 90, H - h - 120);
    // smooth follow
    const cx = parseFloat(card.style.left) || x, cy = parseFloat(card.style.top) || y;
    card.style.left = `${cx + (x - cx) * 0.15}px`;
    card.style.top = `${cy + (y - cy) * 0.15}px`;
  }

  // ------------------------------------------------------------- mode UI
  setModeUI(mode, arg) {
    const g = this.game;
    this.root.classList.toggle('photo-hide', mode === 'photo');
    for (const sel of ['#dockLeft', '#dockRight', '#railRight']) this.$(sel).classList.toggle('hidden', mode === 'decorate');
    if (mode === 'decorate') this.panels.renderDecorUI(arg);
    else if (mode === 'clean') this.panels.renderCleanUI(arg);
    else if (mode === 'photo') this.panels.renderPhotoUI();
    else this.modeEl.innerHTML = '';
    if (mode !== 'decorate') this.labelsEl.innerHTML = '';
  }

  // per-frame/tick updates
  update(dt) {
    this.timer += dt;
    if (this.fishCardId) this.positionFishCard();
    if (this.game.mode === 'decorate') this.updateDecorLabel();
    this.tutorial.update(dt);
    if (this.timer > 0.5) {
      this.timer = 0;
      if (this.fishCardId && !this.cardEl.querySelector('input:focus')) {
        // refresh live stats (cheap redraw of the bars only)
        const rec = this.game.fishRecord(this.fishCardId);
        if (rec) {
          const bars = this.cardEl.querySelectorAll('.stat');
          const vals = rec.stage === 'EGG' ? [rec.stageProgress ?? 0] : [rec.health, rec.hunger, rec.happiness, fishBeauty(rec)];
          bars.forEach((b, i) => {
            if (vals[i] === undefined) return;
            b.querySelector('.bar > div').style.width = `${vals[i] * 100}%`;
            b.lastElementChild.textContent = i === 3 ? Math.round(vals[i] * 100) : `${Math.round(vals[i] * 100)}%`;
          });
          if (rec.stage !== this._cardStage) {
            this._cardStage = rec.stage;
            this.renderFishCard();
          }
        } else this.hideFishCard();
      }
      if (this.game.mode === 'clean') this.panels.updateCleanUI();
      if (['tank', 'care', 'plants'].includes(this.panelName) && !this.panelsEl.querySelector(':focus')) this.panels.liveRefresh?.();
    }
  }

  updateDecorLabel() {
    const d = this.game.decor;
    const sel = d.selection;
    if (!sel) {
      this.labelsEl.innerHTML = '';
      return;
    }
    const lab = d.label();
    const t = d.target();
    if (!lab || !t) return;
    const box = new THREE.Box3().setFromObject(t.obj);
    const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 0.08, (box.min.z + box.max.z) / 2);
    const v = top.project(this.game.renderer.camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth, y = (-v.y * 0.5 + 0.5) * window.innerHeight - 26;
    const icn = { rocks: 'decor', plants: 'plant', driftwood: 'decor', ornaments: 'tank', caves: 'decor' }[lab.cat] ?? 'decor';
    const html = `<div class="world-label glass" style="left:${x}px;top:${y}px">${icon(icn)}${esc(lab.name)}</div>`;
    if (this.labelsEl.innerHTML !== html) this.labelsEl.innerHTML = html;
  }

  // ------------------------------------------------------------- events
  wire() {
    const g = this.game;
    bus.on('wallet', () => this.refreshHUD());
    bus.on('xp', () => this.refreshHUD());
    bus.on('reward', (r) => {
      this.floatReward(r);
      g.audio.coin();
    });
    bus.on('quest:complete', (q) => {
      this.toast('Quest complete!', `${q.title} — claim your reward`, 'quests', 'green');
      g.audio.reward();
      this.refreshHUD();
      this.refreshPanel('quests');
    });
    bus.on('quest:claimed', () => {
      this.refreshHUD();
      this.refreshPanel('quests');
    });
    bus.on('quest:progress', () => this.refreshPanel('quests'));
    bus.on('achievement', (a) => {
      this.toast(`Achievement: ${a.name}`, a.desc, 'trophy', 'gold');
      g.audio.reward();
    });
    bus.on('level:up', (e) => {
      g.audio.levelUp();
      this.modal(`<div class="big-ic">${icon('trophy')}</div><h2>Level ${e.level}!</h2>
        <p>Your aquarium keeping skills are growing.</p>
        <div class="row" style="justify-content:center;gap:18px"><span class="price">${icon('coin')} +${formatNumber(e.coins)}</span><span class="price">${icon('pearl')} +${e.pearls}</span></div>
        ${e.unlocks.length ? `<div class="section-title">Unlocked</div><div class="unlock-list">${e.unlocks.map((u) => `<span class="pill">${esc(u)}</span>`).join('')}</div>` : ''}
        <button class="btn primary" data-act="modal-close">Wonderful</button>`);
      this.refreshHUD();
    });
    bus.on('collection:species', (sp) => {
      this.toast('New species discovered!', `${sp.name} added to your Collection Book`, 'book', 'gold');
      g.audio.discovery();
    });
    bus.on('notify', (n) => this.toast(n.title, n.sub, n.icon, n.tone));
    bus.on('fish:selected', () => this.refreshPanel('fish'));
  }
}
