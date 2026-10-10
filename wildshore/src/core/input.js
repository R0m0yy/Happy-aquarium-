// Unified keyboard / mouse / touch input. Produces a move vector, look deltas and action edges.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.move = { x: 0, y: 0 };
    this.joy = { x: 0, y: 0, active: false };
    this.touchButtons = new Set();
    this.touchPressed = new Set();
    this.lookDX = 0;
    this.zoomDelta = 0;
    this.mouse = { x: 0, y: 0, down: false, rdown: false, clicked: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const k = e.code;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      if (e.button === 2 || e.button === 1) this.mouse.rdown = true;
      this.mouse.lx = e.clientX;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2 || e.button === 1) this.mouse.rdown = false;
    });
    window.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.pointerType !== 'touch' && this.mouse.rdown) this.lookDX += e.movementX || 0;
    });
    canvas.addEventListener('wheel', (e) => { this.zoomDelta += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    // touch: two-finger pinch zoom / twist-rotate on the canvas
    this.pinch = null;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) this.pinch = this.pinchState(e.touches);
      else if (e.touches.length === 1) this.drag = { x: e.touches[0].clientX };
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this.pinch) {
        const s = this.pinchState(e.touches);
        this.zoomDelta += (this.pinch.d - s.d) * 0.02;
        this.lookDX += angleDelta(this.pinch.a, s.a) * 180;
        this.pinch = s;
      } else if (e.touches.length === 1 && this.drag) {
        const x = e.touches[0].clientX;
        this.lookDX += (x - this.drag.x) * 0.6;
        this.drag.x = x;
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { this.pinch = null; this.drag = null; });
  }

  pinchState(t) {
    const dx = t[1].clientX - t[0].clientX, dy = t[1].clientY - t[0].clientY;
    return { d: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
  }

  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  btn(name) { return this.enabled && this.touchButtons.has(name); }
  btnHit(name) { return this.enabled && this.touchPressed.has(name); }
  pressTouch(name) { this.touchButtons.add(name); this.touchPressed.add(name); }
  releaseTouch(name) { this.touchButtons.delete(name); }

  update() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.joy.active) { x += this.joy.x; y += this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = this.enabled ? x : 0;
    this.move.y = this.enabled ? y : 0;
  }

  endFrame() {
    this.pressed.clear();
    this.touchPressed.clear();
    this.lookDX = 0;
    this.zoomDelta = 0;
    this.mouse.clicked = false;
  }
}

function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
