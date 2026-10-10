// DOM user interface: HUD, prompts, toasts, inventory / crafting / build / map / journal
// panels, storage, menus (title, pause, settings, death) and touch controls.
import { ITEMS, RECIPES, STRUCTURES } from '../data/items.js';
import { icon } from './icons.js';
import { ISLANDS, terrainHeight } from '../world/islands.js';
import { WEATHER_LABEL } from '../systems/environment.js';
import { OBJECTIVES } from '../game.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

const STATS = [
  { k: 'health', label: 'Health', col: '#e8574a', icon: '❤' },
  { k: 'hunger', label: 'Food', col: '#e6a245', icon: '🍖' },
  { k: 'thirst', label: 'Water', col: '#45b3e6', icon: '💧' },
  { k: 'energy', label: 'Energy', col: '#b88ae8', icon: '☾' },
  { k: 'stamina', label: 'Stamina', col: '#8ad86a', icon: '⚡' },
];
const WEATHER_ICON = { clear: '☀', cloudy: '☁', rain: '🌧', heavyRain: '🌧', fog: '🌫', storm: '⛈' };

export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.panel = null;
    this.tab = 'pack';
    this.toasts = [];
    this.pointerOverUI = false;
    this.isTouch = game.input.isTouch;
    this.build();
    game.ui = this;
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    r.className = this.isTouch ? 'touch' : 'desktop';
    // ---- HUD
    this.hud = h('div', 'hud hidden');
    this.statsEl = h('div', 'stats');
    this.statEls = {};
    for (const s of STATS) {
      const row = h('div', 'stat', `<span class="si" style="color:${s.col}">${s.icon}</span><div class="bar"><i style="background:${s.col}"></i></div>`);
      row.title = s.label;
      this.statEls[s.k] = row.querySelector('i');
      this.statsEl.appendChild(row);
    }
    this.oxyRow = h('div', 'stat oxy', `<span class="si" style="color:#7fe0ff">○</span><div class="bar"><i style="background:#7fe0ff"></i></div>`);
    this.statEls.oxygen = this.oxyRow.querySelector('i');
    this.statsEl.appendChild(this.oxyRow);
    this.tempEl = h('div', 'temp');
    this.statsEl.appendChild(this.tempEl);
    this.chips = h('div', 'chips');
    this.statsEl.appendChild(this.chips);
    this.hud.appendChild(this.statsEl);

    this.clock = h('div', 'clock');
    this.hud.appendChild(this.clock);
    this.objective = h('div', 'objective');
    this.hud.appendChild(this.objective);
    this.prompt = h('div', 'prompt hidden');
    this.hud.appendChild(this.prompt);
    this.hotbar = h('div', 'hotbar');
    this.hud.appendChild(this.hotbar);
    this.toastBox = h('div', 'toasts');
    this.hud.appendChild(this.toastBox);
    this.banner = h('div', 'banner hidden');
    this.hud.appendChild(this.banner);
    this.buildBar = h('div', 'buildbar hidden');
    this.hud.appendChild(this.buildBar);
    this.menuBtn = h('button', 'menubtn', '☰');
    this.menuBtn.onclick = () => this.togglePause();
    this.hud.appendChild(this.menuBtn);
    this.bagBtn = h('button', 'bagbtn', `<img src="${icon('palmMat', 48)}" alt=""><span>Pack</span>`);
    this.bagBtn.onclick = () => this.togglePanel('inventory');
    this.hud.appendChild(this.bagBtn);
    if (!this.isTouch) {
      this.keys = h('div', 'keys', 'WASD move · Shift sprint · C crouch · E interact · Click/F use tool (hold to throw) · Space dive · X surface · Tab pack · B build · M map · Q/R or right-drag rotate · Wheel zoom');
      this.hud.appendChild(this.keys);
    }
    r.appendChild(this.hud);

    if (this.isTouch) this.buildTouch();

    // ---- panel
    this.panelEl = h('div', 'panel hidden');
    r.appendChild(this.panelEl);
    // ---- menus
    this.menu = h('div', 'menu');
    r.appendChild(this.menu);
    this.loading = h('div', 'loading', `<div class="logo"><b>WILDSHORE</b><small>Alone in the Wild</small></div><div class="lbar"><i></i></div><div class="ltext">Loading</div>`);
    r.appendChild(this.loading);
    // stop pointer events on UI reaching the game
    for (const el of [this.panelEl, this.menu, this.hotbar, this.buildBar, this.menuBtn, this.bagBtn]) {
      el.addEventListener('pointerenter', () => { this.pointerOverUI = true; });
      el.addEventListener('pointerleave', () => { this.pointerOverUI = false; });
    }
  }

  setLoading(p, text) {
    $('.lbar i', this.loading).style.width = Math.round(p * 100) + '%';
    $('.ltext', this.loading).textContent = text;
  }
  hideLoading() { this.loading.classList.add('fade'); setTimeout(() => this.loading.remove(), 800); }

  // ------------------------------------------------------------------ touch controls
  buildTouch() {
    const g = this.game, inp = g.input;
    const t = h('div', 'touchui hidden');
    const joy = h('div', 'joy', '<div class="knob"></div>');
    t.appendChild(joy);
    const knob = $('.knob', joy);
    let jid = null, cx = 0, cy = 0;
    const R = 56;
    joy.addEventListener('pointerdown', (e) => { jid = e.pointerId; joy.setPointerCapture(jid); const b = joy.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2; move(e); e.preventDefault(); });
    const move = (e) => {
      if (e.pointerId !== jid) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      inp.joy.x = dx / R; inp.joy.y = -dy / R; inp.joy.active = true;
      // push far = sprint
      if (d > R * 1.25) inp.touchButtons.add('sprint'); else if (!this.sprintLatched) inp.touchButtons.delete('sprint');
    };
    joy.addEventListener('pointermove', move);
    const end = (e) => { if (e.pointerId !== jid) return; jid = null; knob.style.transform = ''; inp.joy.x = inp.joy.y = 0; inp.joy.active = false; if (!this.sprintLatched) inp.touchButtons.delete('sprint'); };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);

    const btns = h('div', 'tbtns');
    const mk = (name, label, cls = '') => {
      const b = h('button', 'tb ' + cls, label);
      b.dataset.name = name;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); inp.pressTouch(name); b.classList.add('on'); });
      const up = () => { inp.releaseTouch(name); b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      btns.appendChild(b);
      return b;
    };
    this.tUse = mk('use', '<span>Use</span>', 'use');
    this.tInteract = mk('interact', '<span>E</span>', 'interact');
    this.tSprint = mk('sprint', '<span>Run</span>', 'sprint');
    this.tCrouch = mk('crouch', '<span>Sneak</span>', 'crouch');
    this.tDive = mk('dive', '<span>Dive</span>', 'dive');
    this.tUp = mk('up', '<span>Up</span>', 'up');
    this.tRotate = mk('rotate', '<span>⟳</span>', 'rotate');
    t.appendChild(btns);
    this.touchUI = t;
    this.root.appendChild(t);
    for (const el of [btns, joy]) {
      el.addEventListener('pointerenter', () => { this.pointerOverUI = false; });
    }
  }

  // ------------------------------------------------------------------ menus
  showTitle(hasSave) {
    this.menu.className = 'menu title';
    this.menu.innerHTML = `
      <div class="titlecard">
        <div class="logo big"><b>WILDSHORE</b><small>Alone in the Wild</small></div>
        <p class="tag">A castaway survival adventure on a tropical archipelago.</p>
        <div class="btns">
          ${hasSave ? '<button data-a="continue" class="primary">Continue</button>' : ''}
          <button data-a="new" class="${hasSave ? '' : 'primary'}">New Game</button>
          <button data-a="settings">Settings</button>
          <button data-a="credits">Credits</button>
        </div>
        <p class="hint">${this.isTouch ? 'Best in landscape · left stick moves · two-finger pinch zooms & rotates' : 'Headphones recommended'}</p>
      </div>`;
    this.menu.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a) return;
      this.game.audio.start();
      this.game.audio.ui();
      if (a === 'new') {
        if (hasSave && !confirm('Start a new game? Your current save will be overwritten when you next save.')) return;
        this.startGame(false);
      }
      if (a === 'continue') this.startGame(true);
      if (a === 'settings') this.showSettings(() => this.showTitle(hasSave));
      if (a === 'credits') this.showCredits(() => this.showTitle(hasSave));
    };
  }

  startGame(cont) {
    this.menu.className = 'menu hidden';
    this.menu.innerHTML = '';
    this.hud.classList.remove('hidden');
    this.touchUI?.classList.remove('hidden');
    if (cont) {
      const data = this.game.constructor.readSave();
      if (data) this.game.load(data); else this.game.newGame();
    } else this.game.newGame();
    this.bindInventory();
  }

  togglePause() {
    const g = this.game;
    if (!g.started) return;
    if (this.menu.classList.contains('pause')) { this.menu.className = 'menu hidden'; g.paused = false; return; }
    this.closePanel();
    g.paused = true;
    this.menu.className = 'menu pause';
    this.menu.innerHTML = `<div class="card"><h2>Paused</h2>
      <p class="sub">Day ${g.env.day} · ${g.env.clockString()} · ${WEATHER_LABEL[g.env.weatherId]}</p>
      <div class="btns"><button data-a="resume" class="primary">Resume</button><button data-a="save">Save</button>
      <button data-a="settings">Settings</button><button data-a="help">How to play</button><button data-a="quit">Save &amp; Quit</button></div></div>`;
    this.menu.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a) return;
      g.audio.ui();
      if (a === 'resume') { this.menu.className = 'menu hidden'; g.paused = false; }
      if (a === 'save') g.save();
      if (a === 'settings') this.showSettings(() => { this.menu.className = 'menu hidden'; this.togglePause(); });
      if (a === 'help') this.showHelp(() => { this.menu.className = 'menu hidden'; this.togglePause(); });
      if (a === 'quit') { g.save(); g.started = false; this.hud.classList.add('hidden'); this.touchUI?.classList.add('hidden'); this.showTitle(true); }
    };
  }

  showSettings(back) {
    const g = this.game, s = g.settings;
    this.menu.className = 'menu settings';
    this.menu.innerHTML = `<div class="card"><h2>Settings</h2>
      <label>Graphics <select data-k="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="ultra">Ultra</option></select></label>
      <p class="sub small">Graphics changes apply after reload. Resolution adapts automatically to keep play smooth.</p>
      <label>Day length <select data-k="dayLength"><option value="12">12 min</option><option value="24">24 min</option><option value="48">48 min</option></select></label>
      <label>Volume <input type="range" min="0" max="1" step="0.05" data-k="volume"></label>
      <label>Tips <select data-k="tips"><option value="1">On</option><option value="0">Off</option></select></label>
      <div class="btns"><button data-a="apply" class="primary">Apply</button><button data-a="back">Back</button></div></div>`;
    for (const el of this.menu.querySelectorAll('[data-k]')) el.value = String(s[el.dataset.k]);
    this.menu.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (!a) return;
      if (a === 'apply') {
        const prevQ = s.quality;
        for (const el of this.menu.querySelectorAll('[data-k]')) s[el.dataset.k] = el.type === 'range' ? parseFloat(el.value) : el.dataset.k === 'dayLength' ? parseInt(el.value) : el.value;
        g.env.dayLengthMin = s.dayLength;
        g.audio.setVolume(s.volume);
        try { localStorage.setItem('wildshore_settings', JSON.stringify(s)); } catch {}
        if (prevQ !== s.quality && confirm('Reload now to apply the graphics preset? (progress is saved)')) { if (g.started) g.save(); location.reload(); return; }
      }
      back();
    };
  }

  showCredits(back) {
    this.menu.className = 'menu settings';
    this.menu.innerHTML = `<div class="card credits"><h2>Credits</h2>
      <p>Design, code, shaders, procedural art &amp; audio: built for this project.</p>
      <p><b>Survivor model &amp; animations</b> — "Soldier" sample from the three.js examples (Mixamo character).</p>
      <p><b>Barramundi fish</b> — Khronos glTF Sample Assets (CC0).</p>
      <p><b>Water normal map</b> — three.js examples (MIT).</p>
      <p><b>Engine</b> — three.js r170 (MIT).</p>
      <p>See ASSETS.md for full licence details.</p>
      <div class="btns"><button class="primary">Back</button></div></div>`;
    this.menu.onclick = (e) => { if (e.target.closest('button')) back(); };
  }

  showHelp(back) {
    this.menu.className = 'menu settings';
    this.menu.innerHTML = `<div class="card help"><h2>How to survive</h2>
      <ul>
      <li><b>Gather</b>: walk up to bushes, driftwood, stones and palms and press <b>E</b> (or the <b>E</b> button).</li>
      <li><b>Craft</b>: open the pack (<b>Tab</b>). Twist fiber into cordage, then make an axe, knife and spears.</li>
      <li><b>Tools</b>: equip from the hotbar (1–8). <b>Click / F / Use</b> swings or thrusts. Hold to aim and throw a spear or draw the bow.</li>
      <li><b>Water</b>: the spring in the interior is drinkable but risky. Boil it in a clay pot or collect rain.</li>
      <li><b>Food</b>: crack coconuts, catch crabs and fish, hunt pigs on Hunter's Island. Cook on a fire; dry or smoke to preserve. Food spoils.</li>
      <li><b>Diving</b>: swim out and hold <b>Space / Dive</b>. Watch your oxygen. Spear fish with a fishing spear. Sharks smell blood.</li>
      <li><b>Shelter</b>: build a lean-to, then upgrade to a stilt hut. Sleep to restore energy; storms damage exposed builds.</li>
      <li><b>Boats</b>: build a raft or canoe in the shallows to reach the other islands. Steer with the movement controls; a sail rides the wind.</li>
      </ul><div class="btns"><button class="primary">Back</button></div></div>`;
    this.menu.onclick = (e) => { if (e.target.closest('button')) back(); };
  }

  showDeath(cause, day, stats) {
    this.closePanel();
    this.menu.className = 'menu death';
    const hasSave = this.game.constructor.hasSave();
    this.menu.innerHTML = `<div class="card"><h2>You ${cause}.</h2>
      <p class="sub">You survived ${day - 1} day${day - 1 === 1 ? '' : 's'} in the wild.</p>
      <p class="small">Fish caught: ${stats.fish} · Pigs hunted: ${stats.pigs} · Items crafted: ${stats.crafted} · Structures built: ${stats.built}</p>
      <div class="btns">${hasSave ? '<button data-a="load" class="primary">Load last save</button>' : ''}<button data-a="new">New game</button></div></div>`;
    this.menu.onclick = (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'load') { this.menu.className = 'menu hidden'; this.game.load(this.game.constructor.readSave()); }
      if (a === 'new') { this.menu.className = 'menu hidden'; this.game.newGame(); }
    };
  }

  discover(isl) {
    this.banner.innerHTML = `<small>Discovered</small><b>${isl.name}</b><span>${isl.desc}</span>`;
    this.banner.classList.remove('hidden');
    this.banner.classList.add('show');
    this.game.audio.pickup();
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => this.banner.classList.add('hidden'), 6000);
  }

  toast(text, kind = 'info', sec = 3.2) {
    const el = h('div', 'toast ' + kind, text);
    this.toastBox.prepend(el);
    const all = this.toastBox.children;
    while (all.length > 5) all[all.length - 1].remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, sec * 1000);
  }

  // ------------------------------------------------------------------ build mode bar
  setBuildMode(on, type) {
    this.buildBar.classList.toggle('hidden', !on);
    if (on) {
      const def = STRUCTURES[type];
      this.buildBar.innerHTML = `<b>${def.name}</b><span class="why"></span>
        <button data-a="rot">⟳ Rotate${this.isTouch ? '' : ' [R]'}</button><button data-a="ok" class="primary">Place${this.isTouch ? '' : ' [Click]'}</button><button data-a="no">Cancel${this.isTouch ? '' : ' [Esc]'}</button>`;
      this.buildBar.onclick = (e) => {
        const a = e.target.closest('button')?.dataset.a;
        if (a === 'rot') this.game.structures.rotateGhost(Math.PI / 8);
        if (a === 'ok') this.game.confirmBuild();
        if (a === 'no') this.game.exitBuild();
      };
    }
  }

  // ------------------------------------------------------------------ panels
  bindInventory() {
    this.game.inv.listeners.clear();
    this.game.inv.listeners.add(() => this.refresh());
    this.refresh();
  }

  togglePanel(name) {
    if (!this.game.started || this.game.paused && !this.panel) return;
    if (this.panel === name || (name === 'inventory' && this.panel)) { this.closePanel(); return; }
    const tab = name === 'build' ? 'build' : name === 'map' ? 'map' : this.tab === 'map' || this.tab === 'build' ? 'pack' : this.tab;
    this.openPanel(tab);
  }
  openPanel(tab) {
    this.panel = tab;
    this.tab = tab;
    this.panelEl.classList.remove('hidden');
    this.renderPanel();
    this.game.audio.ui();
  }
  closePanel() {
    this.panel = null;
    this.storage = null;
    this.panelEl.classList.add('hidden');
    this.pointerOverUI = false;
  }
  openStorage(s) { this.storage = s; this.openPanel('storage'); }

  refresh() {
    this.renderHotbar();
    if (this.panel) this.renderPanel();
  }

  renderHotbar() {
    const g = this.game;
    const tools = g.inv.items.filter((it) => ITEMS[it.id].tool);
    this.hotbar.innerHTML = '';
    tools.slice(0, 8).forEach((it, i) => {
      const def = ITEMS[it.id];
      const b = h('button', 'slot' + (g.player.equippedUid === it.uid ? ' eq' : ''), `<img src="${icon(it.id, 48)}" alt=""><em>${this.isTouch ? '' : i + 1}</em><u style="width:${Math.max(0, it.dur / def.dur * 100)}%"></u>`);
      b.title = def.name;
      b.onclick = () => g.equipUid(it.uid);
      this.hotbar.appendChild(b);
    });
    const quick = g.inv.items.filter((it) => (ITEMS[it.id].cat === 'food' && ITEMS[it.id].food && !ITEMS[it.id].cook) || ITEMS[it.id].cat === 'water' || it.id === 'coconut' || it.id === 'bandage');
    const seen = new Set();
    for (const it of quick) {
      if (seen.has(it.id) || seen.size >= 3) continue;
      seen.add(it.id);
      const b = h('button', 'slot quick', `<img src="${icon(it.id, 48)}" alt=""><em>${g.inv.count(it.id)}</em>`);
      b.title = (ITEMS[it.id].cat === 'water' ? 'Drink ' : it.id === 'coconut' ? 'Open ' : 'Eat ') + ITEMS[it.id].name;
      b.onclick = () => g.consumeItem(it);
      this.hotbar.appendChild(b);
    }
  }

  renderPanel() {
    const g = this.game;
    const tabs = [['pack', 'Pack'], ['craft', 'Craft'], ['build', 'Build'], ['map', 'Map'], ['journal', 'Journal']];
    if (this.panel === 'storage') tabs.unshift(['storage', 'Storage']);
    let body = '';
    const t = this.panel;
    if (t === 'pack' || t === 'storage') body = this.packHTML(t === 'storage');
    else if (t === 'craft') body = this.craftHTML();
    else if (t === 'build') body = this.buildHTML();
    else if (t === 'map') body = '<canvas class="map" width="512" height="512"></canvas><p class="small">Discovered islands are labelled. ● you · ▲ boats · ■ structures</p>';
    else if (t === 'journal') body = this.journalHTML();
    this.panelEl.innerHTML = `<div class="pwrap"><div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === t ? 'on' : ''}">${l}</button>`).join('')}<button class="close" data-a="close">✕</button></div><div class="pbody">${body}</div></div>`;
    this.panelEl.onclick = (e) => this.onPanelClick(e);
    if (t === 'map') this.drawMap($('canvas.map', this.panelEl));
  }

  packHTML(storage) {
    const g = this.game, inv = g.inv;
    const w = inv.weight();
    const slot = (it, src) => {
      const def = ITEMS[it.id];
      const fresh = def.shelf ? `<s style="width:${Math.max(0, it.fresh * 100)}%;background:${it.fresh > 0.5 ? '#7c6' : it.fresh > 0.2 ? '#ec5' : '#e64'}"></s>` : '';
      const dur = def.dur ? `<u style="width:${Math.max(0, it.dur / def.dur * 100)}%"></u>` : '';
      return `<button class="islot ${g.player.equippedUid === it.uid ? 'eq' : ''} ${this.sel === it.uid ? 'sel' : ''}" data-uid="${it.uid}" data-src="${src}"><img src="${icon(it.id, 56)}" alt=""><em>${it.n > 1 ? it.n : ''}</em>${fresh}${dur}</button>`;
    };
    let html = `<div class="packhead"><span>${inv.items.length}/${inv.slots} slots</span><span class="${w > inv.maxWeight ? 'bad' : ''}">${w.toFixed(1)} / ${inv.maxWeight} kg</span><span>Water ${inv.waterCount()}/${inv.waterCapacity()}</span></div>`;
    html += `<div class="grid">${inv.items.map((it) => slot(it, 'inv')).join('')}${'<div class="islot empty"></div>'.repeat(Math.max(0, inv.slots - inv.items.length))}</div>`;
    if (storage && this.storage) {
      const st = this.storage.storage;
      html += `<h4>${STRUCTURES[this.storage.type].name} storage — tap an item to move it</h4><div class="grid">${st.items.map((it) => slot(it, 'store')).join('')}${'<div class="islot empty"></div>'.repeat(Math.max(0, st.slots - st.items.length))}</div>`;
    }
    const sel = this.sel && (inv.findUid(this.sel) || this.storage?.storage.findUid(this.sel));
    if (sel) {
      const def = ITEMS[sel.id];
      const inStore = this.storage && this.storage.storage.findUid(sel.uid);
      const acts = [];
      if (inStore) acts.push(['take', 'Take']);
      else {
        if (def.tool) acts.push(['equip', g.player.equippedUid === sel.uid ? 'Unequip' : 'Equip']);
        if (def.food || def.water || sel.id === 'coconut') acts.push(['eat', def.cat === 'water' ? 'Drink' : sel.id === 'coconut' ? 'Crack open' : 'Eat']);
        if (def.cat === 'medical') acts.push(['eat', 'Use']);
        if (this.storage) acts.push(['store', 'Store']);
        acts.push(['drop', 'Drop']);
      }
      const extra = [];
      if (def.food) extra.push(`Food +${def.food}`);
      if (def.water) extra.push(`Water ${def.water > 0 ? '+' : ''}${def.water}`);
      if (def.risk) extra.push(`<span class="bad">Risk of illness</span>`);
      if (def.shelf) extra.push(`Freshness ${Math.round(sel.fresh * 100)}%`);
      if (def.dur) extra.push(`Durability ${Math.round(sel.dur)}/${def.dur}`);
      html += `<div class="detail"><img src="${icon(sel.id, 64)}" alt=""><div><b>${def.name}</b><p>${def.desc || ''}</p><p class="small">${extra.join(' · ')}</p></div><div class="dacts">${acts.map(([a, l]) => `<button data-act="${a}">${l}</button>`).join('')}</div></div>`;
    }
    // vitals summary
    const s = g.surv;
    html += `<div class="vitals small">Body ${s.temp.toFixed(1)}°C · Wet ${Math.round(s.wet)}% · ${s.status().map((x) => `<span class="${x.bad ? 'bad' : ''}">${x.label}</span>`).join(' · ') || 'Healthy'}</div>`;
    return html;
  }

  craftHTML() {
    const g = this.game;
    const cats = { basics: 'Basics', tools: 'Tools', weapons: 'Weapons' };
    let html = '';
    for (const [c, label] of Object.entries(cats)) {
      html += `<h4>${label}</h4><div class="recipes">`;
      for (const r of RECIPES.filter((x) => x.cat === c)) {
        const req = g.inv.has(r.in) ? r.in : r.alt && g.inv.has(r.alt) ? r.alt : r.in;
        const ok = g.inv.has(req) && g.inv.hasTools(r.tools) && (!r.near || g.structures.nearest(r.near, g.player.pos.x, g.player.pos.z, 4));
        const reqs = Object.entries(req).map(([id, n]) => `<span class="${g.inv.count(id) >= n ? '' : 'miss'}"><img src="${icon(id, 24)}" alt="">${n}</span>`).join('');
        const alt = r.alt && req === r.in ? `<span class="small alt">or ${Object.entries(r.alt).map(([id, n]) => `${n} ${ITEMS[id].name}`).join(', ')}</span>` : '';
        const extra = [...(r.tools || []).map((t) => `<span class="${g.inv.hasTools([t]) ? '' : 'miss'}">needs ${ITEMS[t].name}</span>`), r.near ? `<span>at a ${STRUCTURES[r.near].name.toLowerCase()}</span>` : ''].join(' ');
        html += `<button class="recipe ${ok ? 'ok' : ''}" data-recipe="${r.id}"><img src="${icon(r.out, 48)}" alt=""><div><b>${r.n > 1 ? r.n + '× ' : ''}${ITEMS[r.out].name}</b><div class="reqs">${reqs}</div>${alt}<div class="small">${extra}</div></div></button>`;
      }
      html += '</div>';
    }
    return html;
  }

  buildHTML() {
    const g = this.game;
    let html = '<div class="recipes">';
    for (const [id, def] of Object.entries(STRUCTURES)) {
      const ok = g.inv.has(def.in) && g.inv.hasTools(def.tools);
      const reqs = Object.entries(def.in).map(([k, n]) => `<span class="${g.inv.count(k) >= n ? '' : 'miss'}"><img src="${icon(k, 24)}" alt="">${n}</span>`).join('');
      const tools = (def.tools || []).map((t) => `<span class="${g.inv.hasTools([t]) ? '' : 'miss'}">needs ${ITEMS[t].name}</span>`).join('');
      html += `<button class="recipe ${ok ? 'ok' : ''}" data-build="${id}"><img src="${icon(id, 48)}" alt=""><div><b>${def.name}</b><div class="reqs">${reqs}</div><div class="small">${def.desc} ${tools}</div></div></button>`;
    }
    return html + '</div>';
  }

  journalHTML() {
    const g = this.game;
    let html = '<h4>Survival goals</h4><ul class="goals">';
    for (const o of OBJECTIVES) html += `<li class="${g.flags[o.id] ? 'done' : ''}"><b>${o.text}</b><span class="small">${o.hint}</span></li>`;
    html += '</ul><h4>Islands</h4><ul class="goals">';
    for (const isl of ISLANDS) html += `<li class="${g.discovered.has(isl.id) ? 'done' : ''}"><b>${g.discovered.has(isl.id) ? isl.name : 'Unknown island'}</b><span class="small">${g.discovered.has(isl.id) ? isl.desc : 'Uncharted. Find a way across the water.'}</span></li>`;
    html += `</ul><p class="small">Day ${g.env.day} · Fish ${g.stats.fish} · Pigs ${g.stats.pigs} · Crafted ${g.stats.crafted} · Built ${g.stats.built}</p>`;
    return html;
  }

  onPanelClick(e) {
    const g = this.game;
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.a === 'close') { this.closePanel(); return; }
    if (b.dataset.tab) { this.panel = b.dataset.tab; this.tab = b.dataset.tab; this.renderPanel(); g.audio.ui(); return; }
    if (b.dataset.uid) {
      const uid = +b.dataset.uid;
      if (b.dataset.src === 'store' && this.storage) { this.sel = uid; this.renderPanel(); return; }
      this.sel = this.sel === uid ? null : uid;
      this.renderPanel();
      return;
    }
    if (b.dataset.act) {
      const it = g.inv.findUid(this.sel) || this.storage?.storage.findUid(this.sel);
      if (!it) return;
      const a = b.dataset.act;
      if (a === 'equip') g.equipUid(it.uid);
      if (a === 'eat') { g.consumeItem(it); this.closePanel(); return; }
      if (a === 'drop') { g.dropItem(it, true); this.sel = null; }
      if (a === 'store') { const n = this.storage.storage.add(it.id, it.n, { fresh: it.fresh, dur: it.dur }); if (n) { if (ITEMS[it.id].tool) g.inv.removeUid(it.uid); else g.inv.remove(it.id, n); } this.sel = null; }
      if (a === 'take') { const st = this.storage.storage; const n = g.inv.add(it.id, it.n, { fresh: it.fresh, dur: it.dur }); if (n) { if (ITEMS[it.id].tool) st.removeUid(it.uid); else st.remove(it.id, n); } else this.toast('Pack is full.'); this.sel = null; }
      this.renderPanel();
      return;
    }
    if (b.dataset.recipe) {
      const r = RECIPES.find((x) => x.id === b.dataset.recipe);
      if (g.craft(r)) this.closePanel();
      return;
    }
    if (b.dataset.build) {
      const id = b.dataset.build;
      const def = STRUCTURES[id];
      if (!g.inv.has(def.in)) { this.toast('Missing materials for ' + def.name, 'bad'); g.audio.bad(); return; }
      this.closePanel();
      g.enterBuild(id);
    }
  }

  drawMap(cv) {
    const g = this.game;
    const ctx = cv.getContext('2d');
    const S = cv.width;
    const ext = 1100;
    if (!this.mapImg) {
      const img = ctx.createImageData(S, S);
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const x = -ext / 2 + (i / S) * ext, z = -ext / 2 + (j / S) * ext;
        const hh = terrainHeight(x, z);
        let r, gg, b;
        if (hh > 2.2) { r = 70 - hh * 1.5; gg = 110 - hh * 2; b = 50; }
        else if (hh > 0.2) { r = 230; gg = 215; b = 170; }
        else { const d = Math.min(1, -hh / 25); r = 60 * (1 - d) + 10; gg = 200 * (1 - d) + 50; b = 210 * (1 - d) + 110; }
        const k = (j * S + i) * 4;
        img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
      this.mapImg = img;
    }
    ctx.putImageData(this.mapImg, 0, 0);
    // fog of war over undiscovered islands
    const toPx = (x, z) => [((x + ext / 2) / ext) * S, ((z + ext / 2) / ext) * S];
    for (const isl of ISLANDS) {
      const [px, py] = toPx(isl.x, isl.z);
      if (!g.discovered.has(isl.id)) {
        ctx.fillStyle = 'rgba(20,50,80,0.85)';
        ctx.beginPath(); ctx.arc(px, py, (isl.R * 2.2 / ext) * S, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#cfe'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', px, py + 5);
      } else {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
        ctx.fillText(isl.name, px, py - (isl.R / ext) * S - 6);
        ctx.shadowBlur = 0;
      }
    }
    ctx.fillStyle = '#ffd04a';
    for (const s of g.structures.list) { const [px, py] = toPx(s.x, s.z); ctx.fillRect(px - 2, py - 2, 4, 4); }
    ctx.fillStyle = '#ff9a4a';
    for (const b of g.boats.list) { const [px, py] = toPx(b.x, b.z); ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 4, py + 3); ctx.lineTo(px - 4, py + 3); ctx.fill(); }
    const [px, py] = toPx(g.player.pos.x, g.player.pos.z);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e33'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.sin(g.player.heading) * 12, py + Math.cos(g.player.heading) * 12); ctx.stroke();
    // wind arrow
    ctx.save(); ctx.translate(S - 40, 40); ctx.rotate(Math.atan2(g.env.windDir.y, g.env.windDir.x));
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.lineTo(8, -6); ctx.moveTo(16, 0); ctx.lineTo(8, 6); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('wind', S - 40, 66);
  }

  // ------------------------------------------------------------------ per-frame HUD
  update(dt) {
    const g = this.game, s = g.surv, p = g.player;
    this.hudT = (this.hudT || 0) + dt;
    for (const st of STATS) {
      const v = st.k === 'stamina' ? s.stamina : s[st.k];
      this.statEls[st.k].style.width = Math.max(0, v) + '%';
      this.statEls[st.k].parentElement.parentElement.classList.toggle('low', v < 20);
    }
    const under = p.state === 'dive';
    this.oxyRow.style.display = under || s.oxygen < 99 ? '' : 'none';
    this.statEls.oxygen.style.width = s.oxygen + '%';
    this.oxyRow.classList.toggle('low', s.oxygen < 30);
    if (this.hudT > 0.25) {
      this.hudT = 0;
      const env = g.env;
      const tc = s.temp < 36 ? 'cold' : s.temp > 38.4 ? 'hot' : '';
      this.tempEl.innerHTML = `<span class="${tc}">🌡 ${s.temp.toFixed(1)}°</span>${s.wet > 30 ? ' <span class="wet">💦 wet</span>' : ''}`;
      this.chips.innerHTML = s.status().filter((x) => x.bad).map((x) => `<span>${x.label}</span>`).join('');
      this.clock.innerHTML = `<b>Day ${env.day}</b><span>${env.clockString()}</span><span>${WEATHER_ICON[env.weatherId]} ${WEATHER_LABEL[env.weatherId]}</span>`;
      const o = g.currentObjective();
      this.objective.style.display = g.settings.tips === '0' || !o ? 'none' : '';
      if (o) this.objective.innerHTML = `<b>${o.text}</b><span>${o.hint}</span>`;
      if (this.panel === 'map') this.drawMap($('canvas.map', this.panelEl));
    }
    // prompt
    const t = g.target;
    const fishBite = g.fishing && g.fishing.state === 'bite';
    if (fishBite) { this.prompt.innerHTML = `<b>!</b> Strike! <kbd>${this.isTouch ? 'Use' : 'Click'}</kbd>`; this.prompt.classList.remove('hidden'); }
    else if (t && !g.buildMode) { this.prompt.innerHTML = `<kbd>${this.isTouch ? 'E' : 'E'}</kbd> ${t.label}`; this.prompt.classList.remove('hidden'); }
    else this.prompt.classList.add('hidden');
    if (g.buildMode) $('.why', this.buildBar).textContent = g.structures.ghostValid ? 'Ready to build' : (g.structures.ghostReasons?.[0] || '');
    // touch button visibility
    if (this.isTouch) {
      const water = p.state === 'swim' || p.state === 'dive';
      this.tDive.style.display = water ? '' : 'none';
      this.tUp.style.display = p.state === 'dive' ? '' : 'none';
      this.tCrouch.style.display = water || p.state === 'boat' ? 'none' : '';
      this.tRotate.style.display = g.buildMode ? '' : 'none';
      this.tInteract.classList.toggle('glow', !!t);
      const it = g.equippedItem;
      $('span', this.tUse).textContent = g.buildMode ? 'Place' : fishBite ? 'Strike' : it ? ({ axe: 'Chop', spear: 'Stab', fishspear: 'Stab', rod: 'Cast', bow: 'Draw', hammer: 'Hit', knife: 'Cut', torch: 'Torch' }[ITEMS[it.id].tool] || 'Use') : 'Use';
      this.tCrouch.classList.toggle('on', !!g.crouchToggle);
    }
  }
}
