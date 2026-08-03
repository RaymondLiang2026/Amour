// stage2d.js — Amour 写实 2.5D 舞台合成器（根治重构版）
// 单一渲染出口：写实场景背景 + 写实人物六视角 180° 旋转 + 缩放 + 景深视差。
// 纯 DOM/CSS，无 Three.js、无 shader 抠图、无低模道具，彻底避免多来源渲染打架。

const V = 'r2d5-20260803f';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const SCENES = {
  stage: `assets/realistic/scene/stage.png?v=${V}`,
  cafe: `assets/realistic/scene/cafe.png?v=${V}`,
  bedroom: `assets/realistic/scene/bedroom.png?v=${V}`,
};
// 六视角写实人物（back 复用于 ±180°，形成正面→背面的完整 180° 转身）
// look='base' 用默认根目录素材；其余造型走 looks/<look>/ 子目录，实现「换发型/发色/服装」整套六视角切换。
const CHAR = (name, look) => (look && look !== 'base')
  ? `assets/realistic/character/looks/${look}/${name}.png?v=${V}`
  : `assets/realistic/character/${name}.png?v=${V}`;
const VIEW_NAMES = ['back', 'l90', 'l45', 'front', 'r45', 'r90'];
// 角度停靠点（度）：拖拽横向改变 yaw，就近取相邻两张做 crossfade
const STOPS = [
  { a: -180, v: 'back' },
  { a: -90, v: 'l90' },
  { a: -45, v: 'l45' },
  { a: 0, v: 'front' },
  { a: 45, v: 'r45' },
  { a: 90, v: 'r90' },
  { a: 180, v: 'back' },
];

export class Scene3D {
  constructor(root, cfg, cbs = {}) {
    this.root = root;
    this.cfg = cfg || {};
    this.cbs = cbs;

    // 状态：单一真相源
    this.theme = this.cfg.theme || 'stage';
    this.look = this.cfg.look || 'base';    // 当前造型（发型/发色/服装整套六视角）
    this.yaw = 0; this.yawDisp = 0;         // 目标/显示旋转角
    this.zoom = 1; this.zoomTarget = 1;     // 缩放
    this.parX = 0; this.parY = 0;           // 视差目标
    this.parXd = 0; this.parYd = 0;         // 视差显示
    this.light = this.cfg.light || 'warm';
    this.daynight = typeof this.cfg.daynight === 'number' ? this.cfg.daynight : 62;
    this.walkEnabled = this.cfg.walkEnabled !== false;
    this.bounce = 0;                        // 交互反馈弹跳
    this.t0 = performance.now();

    this._hideLegacyLayers();
    this._buildDom();
    this._bindEvents();
    this.applyTheme(this.theme);
    this.applyLight(this.light);
    this.setDayNight(this.daynight);
    document.getElementById('loading')?.classList.add('hidden');
    this._loop();
  }

  // 隐藏 index.html 里遗留的旧背景层，杜绝米黄底/白光圈残留
  _hideLegacyLayers() {
    ['bg-stage', 'bg-warm', 'bg-night', 'bg-glow', 'bg-vignette', 'bg-grain'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.style.opacity = '0'; }
    });
  }

  _buildDom() {
    const r = this.root;
    r.innerHTML = '';
    r.classList.add('s2-root');
    this.bg = document.createElement('div'); this.bg.className = 's2-bg';
    this.charWrap = document.createElement('div'); this.charWrap.className = 's2-char';
    this.imgs = {};
    VIEW_NAMES.forEach((name, i) => {
      const im = document.createElement('img');
      im.className = 's2-view'; im.src = CHAR(name, this.look); im.alt = 'Yui';
      im.draggable = false; im.style.opacity = name === 'front' ? '1' : '0';
      im.style.zIndex = String(i);
      this.imgs[name] = im; this.charWrap.appendChild(im);
    });
    this.vig = document.createElement('div'); this.vig.className = 's2-vignette';
    r.appendChild(this.bg); r.appendChild(this.charWrap); r.appendChild(this.vig);
  }

  _bindEvents() {
    const el = this.root;
    el.style.touchAction = 'none';
    this.drag = null; this.pointers = new Map(); this.pinchDist = 0;

    el.addEventListener('pointerdown', e => {
      el.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.drag = { x: e.clientX, yaw: this.yaw, moved: 0 };
        el.classList.add('grabbing');
      } else if (this.pointers.size === 2) {
        this.pinchDist = this._pinch();
      }
    });
    el.addEventListener('pointermove', e => {
      // 视差：指针位置驱动前后景位移差 → 3D 纵深
      const nx = (e.clientX / innerWidth - 0.5) * 2, ny = (e.clientY / innerHeight - 0.5) * 2;
      this.parX = nx; this.parY = ny;
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const d = this._pinch();
        if (this.pinchDist) this.zoomBy((this.pinchDist - d) * 0.02);
        this.pinchDist = d; return;
      }
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        this.drag.moved += Math.abs(dx);
        this.yaw = clamp(this.drag.yaw + dx * 0.55, -180, 180);
        this.drag.x = e.clientX; this.drag.yaw = this.yaw;
      }
    });
    const up = e => {
      const wasDrag = this.drag;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (this.pointers.size === 0) { el.classList.remove('grabbing'); this.drag = null; }
      // 轻点（几乎没拖动）视为点击角色
      if (wasDrag && wasDrag.moved < 6) { this.playReaction('happy'); this.cbs.onCharacterClick?.('body'); }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoomBy(Math.sign(e.deltaY) * 0.6); }, { passive: false });
  }

  _pinch() {
    const p = [...this.pointers.values()];
    if (p.length < 2) return 0;
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  /* ---------- 外部接口（与旧 Scene3D 兼容） ---------- */
  applyTheme(theme) {
    this.theme = theme; this.cfg.theme = theme;
    document.body.dataset.sceneTheme = theme;
    const url = SCENES[theme] || SCENES.stage;
    if (this.bg) this.bg.style.backgroundImage = `url("${url}")`;
    this.cbs.onChange?.();
  }
  // 切换造型：整套六视角素材热替换，保持当前旋转角/缩放/视差状态不变
  applyLook(look) {
    this.look = look || 'base'; this.cfg.look = this.look;
    VIEW_NAMES.forEach(n => { if (this.imgs[n]) this.imgs[n].src = CHAR(n, this.look); });
    this.bounce = 1;
    this.cbs.onChange?.();
  }
  applyLight(mode) {
    this.light = mode; this.cfg.light = mode;
    this._applyGrade();
  }
  setDayNight(v) {
    this.daynight = v; this.cfg.daynight = v;
    this._applyGrade();
  }
  _applyGrade() {
    // 昼夜 + 冷暖统一作用于背景与人物，保持写实调性
    const t = clamp(this.daynight, 0, 100) / 100;         // 0 夜 → 1 昼
    const bright = lerp(0.72, 1.06, t);
    const warm = this.light === 'cool' ? 'saturate(1.05) hue-rotate(-6deg)' : 'saturate(1.08) sepia(0.06)';
    if (this.bg) this.bg.style.filter = `brightness(${bright.toFixed(3)}) ${warm}`;
    if (this.charWrap) this.charWrap.style.filter = `brightness(${lerp(0.82, 1.04, t).toFixed(3)}) ${this.light === 'cool' ? 'saturate(1.02)' : 'saturate(1.04)'}`;
    if (this.vig) this.vig.style.opacity = String(lerp(0.55, 0.22, t));
  }
  setWalkEnabled(on) { this.walkEnabled = !!on; this.cfg.walkEnabled = this.walkEnabled; }
  zoomBy(dz) { this.zoomTarget = clamp(this.zoomTarget - dz * 0.12, 0.72, 1.95); }
  playReaction() { this.bounce = 1; }
  playTalk() { this.bounce = 0.7; }
  redrawCharacter() {
    this.applyTheme(this.cfg.theme || this.theme);
    this.applyLight(this.cfg.light || this.light);
    this.setDayNight(typeof this.cfg.daynight === 'number' ? this.cfg.daynight : this.daynight);
    this.walkEnabled = this.cfg.walkEnabled !== false;
    const look = this.cfg.look || 'base';
    if (look !== this.look) this.applyLook(look);
  }
  // 低模道具体系已下线：保留空实现，兼容旧调用
  addProp() {}
  clearProps() {}

  headScreen() {
    if (!this.charWrap) return { x: innerWidth / 2, y: innerHeight * 0.3, visible: true };
    const rc = this.charWrap.getBoundingClientRect();
    return { x: rc.left + rc.width / 2, y: rc.top + rc.height * 0.12, visible: true };
  }

  /* ---------- 渲染循环 ---------- */
  _crossfade() {
    const y = this.yawDisp;
    let i = 0;
    for (let k = 0; k < STOPS.length - 1; k++) { if (y >= STOPS[k].a && y <= STOPS[k + 1].a) { i = k; break; } }
    const a0 = STOPS[i], a1 = STOPS[i + 1];
    const t = (y - a0.a) / (a1.a - a0.a || 1);
    VIEW_NAMES.forEach(n => { this.imgs[n].style.opacity = '0'; });
    // 相邻两视角叠加；两端都是 back 时自动叠满
    this.imgs[a0.v].style.opacity = String(clamp(1 - t, 0, 1) + (a0.v === a1.v ? clamp(t, 0, 1) : 0));
    this.imgs[a1.v].style.opacity = String(a0.v === a1.v ? 0 : clamp(t, 0, 1));
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const now = performance.now(), tt = (now - this.t0) / 1000;
    // 平滑逼近
    this.yawDisp = lerp(this.yawDisp, this.yaw, 0.18);
    this.zoom = lerp(this.zoom, this.zoomTarget, 0.12);
    this.parXd = lerp(this.parXd, this.parX, 0.06);
    this.parYd = lerp(this.parYd, this.parY, 0.06);
    this.bounce = lerp(this.bounce, 0, 0.06);

    // 呼吸 + 可选轻微游走
    const breath = Math.sin(tt * 1.6) * 0.006;
    const walk = this.walkEnabled ? Math.sin(tt * 0.5) * 10 : 0;
    const bounceS = 1 + this.bounce * 0.03;

    // 背景视差（幅度大）与人物视差（幅度小）→ 纵深
    if (this.bg) this.bg.style.transform = `scale(1.08) translate(${(-this.parXd * 1.6).toFixed(2)}%, ${(-this.parYd * 1.0).toFixed(2)}%)`;
    if (this.charWrap) {
      const s = (this.zoom * (1 + breath) * bounceS).toFixed(4);
      const tx = (this.parXd * 0.8 + walk / innerWidth * 100).toFixed(2);
      this.charWrap.style.transform = `translateX(-50%) translate(${tx}%, ${(this.parYd * 0.4).toFixed(2)}%) scale(${s})`;
    }
    this._crossfade();
    this.cbs.onFrame?.();
  }
}
