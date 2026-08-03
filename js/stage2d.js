// stage2d.js — Amour 写实 2.5D 舞台合成器（根治重构版）
// 单一渲染出口：写实场景背景 + 写实人物六视角 180° 旋转 + 缩放 + 景深视差。
// 纯 DOM/CSS，无 Three.js、无 shader 抠图、无低模道具，彻底避免多来源渲染打架。

const V = 'r2d5-20260803n';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
const RIG_ACTIONS = ['wave', 'nod', 'shake', 'dance', 'jump', 'stretch'];
const RIG_LINES = {
  wave: '我挥挥手啦～',
  nod: '嗯嗯，我点头啦。',
  shake: '我摇摇头～',
  dance: '跟我一起跳舞吧！',
  jump: '我跳一下！',
  stretch: '伸个懒腰～',
};
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

// 动作系统：≥20 个动作名
const ACTIONS = [
  'bounce',
  'jump',
  'nod',
  'shake',
  'wobble',
  'sway',
  'tilt',
  'spin',
  'flip',
  'pulse',
  'heartbeat',
  'shiver',
  'jitter',
  'float',
  'squash',
  'leanin',
  'zoompunch',
  'swing',
  'wave',
  'celebrate',
];

// 10 种表情情绪（贴纸 + 动作 + 粒子 + 台词），用于「表情快捷条」与「点击随机」
const EMOTIONS = {
  cry: {
    sticker: '😭',
    actions: ['shiver', 'sway'],
    effect: { emoji: '💧', count: 9 },
    lines: ['呜…有点想哭。', '别丢下我嘛…', '我没事…就是有点委屈。'],
  },
  silly: {
    sticker: '😝',
    actions: ['wobble', 'jitter'],
    effect: { emoji: '💫', count: 6 },
    lines: ['略略略~', '看我搞怪！', '嘿嘿，被我逗到了吗？'],
  },
  pout: {
    sticker: '😗',
    actions: ['tilt', 'shake'],
    effect: { emoji: '💭', count: 4 },
    lines: ['哼…我才没有抱怨。', '你欠我一个解释。', '我不理你三秒！'],
  },
  laugh: {
    sticker: '😄',
    actions: ['bounce', 'celebrate'],
    effect: { emoji: '✨', count: 7 },
    lines: ['哈哈~太好玩了！', '开心！', '你一来我就笑啦~'],
  },
  shy: {
    sticker: '😳',
    stickerClass: 'blush',
    actions: ['leanin', 'tilt'],
    effect: { emoji: '💗', count: 6 },
    lines: ['别这样看着我啦…', '我会害羞的。', '你靠近一点…也可以。'],
  },
  angry: {
    sticker: '😠',
    actions: ['shiver', 'jitter'],
    effect: { emoji: '💢', count: 6 },
    lines: ['哼！我生气了！', '不许欺负我！', '我才不是小气！'],
  },
  jealous: {
    sticker: '😒',
    actions: ['shake', 'spin'],
    effect: { emoji: '🌀', count: 6 },
    lines: ['哼…你刚刚在看谁？', '我才不会吃醋呢。', '别的都不准看。'],
  },
  surprise: {
    sticker: '😲',
    actions: ['jump', 'zoompunch'],
    effect: { emoji: '❗', count: 6 },
    lines: ['呀！吓到我了！', '诶？！真的假的？', '等下等下——'],
  },
  spoiled: {
    sticker: '🥰',
    actions: ['heartbeat', 'leanin'],
    effect: { emoji: '❤️', count: 10 },
    lines: ['你再哄哄我嘛~', '今天想被你宠一下。', '抱抱~就一下。'],
  },
  grievance: {
    sticker: '🥺',
    actions: ['sway', 'nod'],
    effect: { emoji: '🥺', count: 4 },
    lines: ['我有点委屈…', '你别凶我嘛。', '我只是想你多陪我一会儿。'],
  },
};
const EMOTION_KEYS = Object.keys(EMOTIONS);

export class Scene3D {
  constructor(root, cfg, cbs = {}) {
    this.root = root;
    this.cfg = cfg || {};
    this.cbs = cbs;

    // 状态：单一真相源
    this.theme = this.cfg.theme || 'stage';
    this.look = this.cfg.look || 'base'; // 当前造型（发型/发色/服装整套六视角）
    this.yaw = 0; this.yawDisp = 0;      // 目标/显示旋转角
    this.zoom = 1; this.zoomTarget = 1;  // 缩放
    this.parX = 0; this.parY = 0;        // 视差目标
    this.parXd = 0; this.parYd = 0;      // 视差显示
    this.light = this.cfg.light || 'warm';
    this.daynight = typeof this.cfg.daynight === 'number' ? this.cfg.daynight : 62;
    this.walkEnabled = this.cfg.walkEnabled !== false;
    this.t0 = performance.now();

    // 动作控制（防重入 / 打断上一个）
    this._actClass = null;
    this._actTimer = 0;
    this._actEnd = null;
    this._rigLayer = null;
    this._rigCache = new Map();
    this._rigTimer = 0;
    this._rigActionClass = null;

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

    this.bg = document.createElement('div');
    this.bg.className = 's2-bg';

    // 关键：避免 transform 冲突
    // - JS 在 RAF 里持续写 .s2-char 的 transform（缩放/视差/位移）
    // - 动作/idle 只作用在内层 .s2-actor 上（嵌套 transform 自然叠乘，不打架）
    this.charWrap = document.createElement('div');
    this.charWrap.className = 's2-char';

    this.actor = document.createElement('div');
    this.actor.className = 's2-actor';

    this.fxLayer = document.createElement('div');
    this.fxLayer.className = 's2-fx';

    this.imgs = {};
    VIEW_NAMES.forEach((name, i) => {
      const im = document.createElement('img');
      im.className = 's2-view';
      im.src = CHAR(name, this.look);
      im.alt = 'Yui';
      im.draggable = false;
      im.style.opacity = name === 'front' ? '1' : '0';
      im.style.zIndex = String(i);
      this.imgs[name] = im;
      this.actor.appendChild(im);
    });

    this.actor.appendChild(this.fxLayer);
    this.charWrap.appendChild(this.actor);

    this.vig = document.createElement('div');
    this.vig.className = 's2-vignette';

    r.appendChild(this.bg);
    r.appendChild(this.charWrap);
    r.appendChild(this.vig);
  }

  _bindEvents() {
    const el = this.root;
    el.style.touchAction = 'none';
    this.drag = null;
    this.pointers = new Map();
    this.pinchDist = 0;
    this._gestureHadPinch = false;

    el.addEventListener('pointerdown', e => {
      el.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 1) {
        this._gestureHadPinch = false;
        this.drag = {
          x: e.clientX,
          yaw: this.yaw,
          startX: e.clientX,
          startY: e.clientY,
          t0: performance.now(),
          moved: 0,
        };
        el.classList.add('grabbing');
        return;
      }

      if (this.pointers.size === 2) {
        this._gestureHadPinch = true;
        this.pinchDist = this._pinch();
      }
    });

    el.addEventListener('pointermove', e => {
      // 视差：指针位置驱动前后景位移差 → 3D 纵深
      const nx = (e.clientX / innerWidth - 0.5) * 2;
      const ny = (e.clientY / innerHeight - 0.5) * 2;
      this.parX = nx;
      this.parY = ny;

      if (this.pointers.has(e.pointerId)) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // 双指：捏合缩放（保持原逻辑）
      if (this.pointers.size === 2) {
        const d = this._pinch();
        if (this.pinchDist) this.zoomBy((this.pinchDist - d) * 0.02);
        this.pinchDist = d;
        return;
      }

      // 单指：拖拽旋转
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        this.yaw = clamp(this.drag.yaw + dx * 0.55, -180, 180);
        this.drag.x = e.clientX;
        this.drag.yaw = this.yaw;
        this.drag.moved = Math.max(this.drag.moved, Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY));
      }
    });

    const up = e => {
      const wasDrag = this.drag;
      const now = performance.now();

      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;

      const isLastPointer = this.pointers.size === 0;
      if (isLastPointer) {
        el.classList.remove('grabbing');
        this.drag = null;
      }

      // 点击判定（不破坏拖拽旋转）：位移 < 8px 且时长 < 300ms，且未发生双指
      if (isLastPointer && wasDrag && !this._gestureHadPinch) {
        const dt = now - wasDrag.t0;
        const dist = wasDrag.moved;
        if (dist < 8 && dt < 300) {
          if (Math.random() < 0.28) {
            this.playRigAction(pick(RIG_ACTIONS), { source: 'click' });
          } else {
            const emotion = pick(EMOTION_KEYS) || 'laugh';
            this.playEmotion(emotion, { emitLine: true, source: 'click' });
            this.cbs.onCharacterClick?.('body', { silentBubble: true, emotion, source: 'click' });
          }
        }
      }
    };

    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomBy(Math.sign(e.deltaY) * 0.6);
    }, { passive: false });
  }

  _pinch() {
    const p = [...this.pointers.values()];
    if (p.length < 2) return 0;
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  /* ---------- 动作系统 ---------- */
  playAction(name) {
    if (!this.actor) return;

    const n = (name || '').toLowerCase();
    const act = ACTIONS.includes(n) ? n : pick(ACTIONS);
    const cls = `act-${act}`;

    // 打断上一个动作
    if (this._actClass) this.actor.classList.remove(this._actClass);
    if (this._actEnd) this.actor.removeEventListener('animationend', this._actEnd);
    if (this._actTimer) clearTimeout(this._actTimer);

    // 触发重播（同名动作也能重新播放）
    // eslint-disable-next-line no-unused-expressions
    this.actor.offsetWidth;

    this._actClass = cls;
    this.actor.classList.add(cls);

    const done = () => {
      if (!this.actor) return;
      if (this._actClass) this.actor.classList.remove(this._actClass);
      this._actClass = null;
      if (this._actEnd) this.actor.removeEventListener('animationend', this._actEnd);
      this._actEnd = null;
      if (this._actTimer) clearTimeout(this._actTimer);
      this._actTimer = 0;
    };

    this._actEnd = (ev) => {
      if (ev && ev.target !== this.actor) return;
      done();
    };
    this.actor.addEventListener('animationend', this._actEnd);

    // 兜底：部分浏览器/组合动画可能不触发 animationend
    this._actTimer = setTimeout(done, 1700);
  }

  spawnEffect(emoji, count = 6) {
    if (!this.fxLayer) return;
    const em = emoji || '✨';
    const n = clamp(+count || 0, 1, 18);

    for (let i = 0; i < n; i++) {
      const el = document.createElement('span');
      el.className = 's2-emoji';
      el.textContent = em;

      const dx = (Math.random() * 140 - 70).toFixed(1) + 'px';
      const dy = (-(90 + Math.random() * 90)).toFixed(1) + 'px';
      const rot = (Math.random() * 80 - 40).toFixed(1) + 'deg';
      const sc = (0.92 + Math.random() * 0.42).toFixed(3);
      const dur = (0.92 + Math.random() * 0.30).toFixed(3) + 's';
      const delay = (Math.random() * 0.12).toFixed(3) + 's';

      el.style.setProperty('--dx', dx);
      el.style.setProperty('--dy', dy);
      el.style.setProperty('--rot', rot);
      el.style.setProperty('--scale', sc);
      el.style.animationDuration = dur;
      el.style.animationDelay = delay;

      this.fxLayer.appendChild(el);
      setTimeout(() => el.remove(), 1400);
    }
  }

  _showSticker(sticker, cls, emotionKey) {
    if (!this.actor || !sticker) return;
    const el = document.createElement('div');
    el.className = `s2-sticker${cls ? ` ${cls}` : ''}`;

    // 表情触发时优先且立即使用脸模 PNG；仅图片加载失败时回退 emoji
    if (emotionKey) {
      const img = document.createElement('img');
      img.src = `assets/realistic/character/emotions/${emotionKey}.png?v=${V}`;
      img.alt = emotionKey;
      img.className = 's2-sticker-img';
      img.onerror = () => {
        el.textContent = sticker;
      };
      el.appendChild(img);
    } else {
      el.textContent = sticker;
    }

    this.actor.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  // 表情反馈：贴纸 + 动作 + 粒子 + （可选）一句台词 → 外部气泡/语音
  // 集成真人语音：播 MP3 时气泡文字使用 manifest 中该条 text
  playEmotion(name, opts = {}) {
    const key = (name || '').toLowerCase();
    const entry = EMOTIONS[key] || EMOTIONS[pick(EMOTION_KEYS)];
    if (!entry) return;

    // 贴纸：传入 key 以加载对应表情脸图 PNG
    this._showSticker(entry.sticker, entry.stickerClass, key);

    const action = pick(entry.actions || ACTIONS);
    this.playAction(action);

    if (entry.effect && entry.effect.emoji) {
      this.spawnEffect(entry.effect.emoji, entry.effect.count || 6);
    }

    const emitLine = opts.emitLine !== false;
    if (emitLine) {
      // 尝试播放真人 MP3（通过 cbs.onEmotionVoice 回调）
      const voiceText = this.cbs.onEmotionVoice?.(key);
      if (voiceText) {
        // MP3 播放成功，气泡用 manifest 中的 text，不再触发 TTS
        this.cbs.onAutoTalk?.(voiceText, key || action, { silentVoice: true });
      } else {
        // 无 MP3 或 voiceOutput 关闭 → 使用原有 lines 回退（允许 TTS）
        const line = pick(entry.lines || []);
        if (line) this.cbs.onAutoTalk?.(line, key || action);
      }
    }
  }

  playReaction(mood, opts = {}) {
    const key = (mood || '').toLowerCase();
    const withLine = !!opts.withLine;

    // mood → 动作 + emoji + 一句短台词（用于点击反馈）
    const map = {
      happy: {
        actions: ['bounce', 'celebrate'],
        emoji: '❤️', count: 6,
        lines: ['被你点到啦！', '好耶！再来一次~', '今天心情超好！'],
      },
      shy: {
        actions: ['tilt', 'squash'],
        emoji: '😳', count: 5,
        lines: ['别、别一直点我啦…', '有点害羞。', '你离我太近啦~'],
      },
      surprise: {
        actions: ['jump', 'zoompunch'],
        emoji: '❗', count: 6,
        lines: ['呀！吓我一跳！', '诶？怎么啦？', '发生什么事了？'],
      },
      love: {
        actions: ['heartbeat', 'pulse'],
        emoji: '❤️', count: 9,
        lines: ['心跳有点快…', '你也在想我吗？', '嗯…好喜欢这种感觉。'],
      },
      dance: {
        actions: ['sway', 'swing', 'wave'],
        emoji: '🎵', count: 7,
        lines: ['来点节奏~', '一起摇摆！', '跟上我的拍子~'],
      },
      angry: {
        actions: ['shiver', 'jitter', 'shake'],
        emoji: '💢', count: 5,
        lines: ['哼…我可生气了！', '不许欺负我。', '我、我才没有在生气！'],
      },

      // 兼容 dialogue.js 里的 react 名
      smile: { actions: ['pulse', 'nod'], emoji: '🙂', count: 4, lines: ['嗯嗯~', '我在呢。', '看着你就很开心。'] },
      gentle: { actions: ['float', 'tilt'], emoji: '🌸', count: 5, lines: ['慢慢来，我陪着你。', '别急，呼吸一下。', '我在你身边。'] },
      wave: { actions: ['wave', 'bounce'], emoji: '👋', count: 5, lines: ['嗨！', '我来啦~', '在这在这！'] },
      blinkx: { actions: ['nod', 'pulse'], emoji: '😉', count: 4, lines: ['眨眨眼~', '嘘——', '悄悄告诉你哦。'] },
    };

    const entry = map[key] || {
      actions: ACTIONS,
      emoji: '✨',
      count: 5,
      lines: ['嗯？', '我在~', '再点一下试试？'],
    };

    const action = pick(entry.actions);
    this.playAction(action);
    if (entry.emoji) this.spawnEffect(entry.emoji, entry.count);

    if (withLine) {
      const line = pick(entry.lines);
      this.cbs.onAutoTalk?.(line, key || action);
    }
  }

  playTalk() {
    // 气泡出现时的轻微点头（如果正在播动作，就不打断）
    if (this._actClass) return;
    this.playAction('nod');
  }

  _currentViewName() {
    let best = STOPS[0];
    let dist = Infinity;
    STOPS.forEach(s => {
      const d = Math.abs(this.yawDisp - s.a);
      if (d < dist) { dist = d; best = s; }
    });
    return best.v || 'front';
  }

  async _loadRig(look, view) {
    const key = `${look}/${view}`;
    if (this._rigCache.has(key)) return this._rigCache.get(key);
    const base = `assets/rig/${look}/${view}`;
    const res = await fetch(`${base}/rig.json?v=${V}`);
    if (!res.ok) throw new Error(`rig json ${res.status}`);
    const rig = await res.json();
    const parts = Object.entries(rig.parts || {})
      .map(([name, meta]) => ({ name, ...meta }))
      .sort((a, b) => (a.z_order || 0) - (b.z_order || 0));
    if (!parts.length) throw new Error('rig has no parts');
    const data = { base, rig, parts };
    this._rigCache.set(key, data);
    return data;
  }

  _hideRig() {
    if (this._rigTimer) clearTimeout(this._rigTimer);
    this._rigTimer = 0;
    if (this._rigLayer) this._rigLayer.remove();
    this._rigLayer = null;
    this._rigActionClass = null;
    if (this.actor) this.actor.classList.remove('s2-rig-active');
  }

  _setRigPartTransformOrigin(img, rig, part) {
    const pivotName = part.pivot;
    const pivot = rig.joints?.[pivotName];
    if (!pivot) return;
    img.style.transformOrigin = `${(pivot.x * 100).toFixed(2)}% ${(pivot.y * 100).toFixed(2)}%`;
  }

  async _ensureRigLayer() {
    const look = this.look || 'base';
    const view = this._currentViewName();
    const data = await this._loadRig(look, view);
    const layer = document.createElement('div');
    layer.className = 's2-rig-layer';
    layer.dataset.rigType = data.rig.rig_type || 'limited';

    await Promise.all(data.parts.map(part => new Promise((resolve, reject) => {
      const img = document.createElement('img');
      img.className = `s2-rig-part part-${part.name}`;
      img.src = `${data.base}/part_${part.name}.png?v=${V}`;
      img.alt = part.name;
      img.draggable = false;
      img.style.zIndex = String(part.z_order || 0);
      this._setRigPartTransformOrigin(img, data.rig, part);
      img.onload = resolve;
      img.onerror = () => reject(new Error(`part load failed: ${part.name}`));
      layer.appendChild(img);
    })));

    this._hideRig();
    this._rigLayer = layer;
    this.actor.insertBefore(layer, this.fxLayer || null);
    this.actor.classList.add('s2-rig-active');
    return data;
  }

  async playRigAction(name, opts = {}) {
    if (!this.actor) return;
    const act = RIG_ACTIONS.includes((name || '').toLowerCase()) ? name.toLowerCase() : pick(RIG_ACTIONS);
    const line = opts.line || RIG_LINES[act] || '我动起来啦～';

    try {
      const data = await this._ensureRigLayer();
      // 当前 rig 资源的 part_*.png 是整图透明画布。
      // 如果对单个 part 图层旋转，整张透明画布会绕 pivot 转动，身体会被撕裂成碎片。
      // 因此线上热修使用 safe rig：保留分层贴图叠放，但动作只施加在整体 rig 容器上。
      const safeCls = `rig-safe-${act} rig-action rig-safe`;
      this._rigActionClass = safeCls;
      this._rigLayer.className = `s2-rig-layer ${safeCls}`;
      this._rigLayer.dataset.rigType = data.rig.rig_type || 'limited';
      this.cbs.onAutoTalk?.(line, act, { skipSceneReaction: true });
      this.spawnEffect(data.rig.rig_type === 'full' ? '✨' : '💫', data.rig.rig_type === 'full' ? 6 : 4);
      this._rigTimer = setTimeout(() => this._hideRig(), 1450);
    } catch (err) {
      console.warn('[rig] fallback to sprite action', err);
      this._hideRig();
      this.playAction(act === 'dance' ? 'sway' : act);
      this.cbs.onAutoTalk?.(line, act, { skipSceneReaction: true });
    }
  }

  /* ---------- 外部接口（与旧 Scene3D 兼容） ---------- */
  applyTheme(theme) {
    this.theme = theme;
    this.cfg.theme = theme;
    document.body.dataset.sceneTheme = theme;
    const url = SCENES[theme] || SCENES.stage;
    if (this.bg) this.bg.style.backgroundImage = `url("${url}")`;
    this.cbs.onChange?.();
  }

  // 切换造型：整套六视角素材热替换，保持当前旋转角/缩放/视差状态不变
  applyLook(look) {
    this._hideRig();
    this.look = look || 'base';
    this.cfg.look = this.look;
    VIEW_NAMES.forEach(n => { if (this.imgs[n]) this.imgs[n].src = CHAR(n, this.look); });
    this.playAction('bounce');
    this.spawnEffect('✨', 5);
    this.cbs.onChange?.();
  }

  applyLight(mode) {
    this.light = mode;
    this.cfg.light = mode;
    this._applyGrade();
  }

  setDayNight(v) {
    this.daynight = v;
    this.cfg.daynight = v;
    this._applyGrade();
  }

  _applyGrade() {
    // 昼夜 + 冷暖统一作用于背景与人物，保持写实调性
    const t = clamp(this.daynight, 0, 100) / 100; // 0 夜 → 1 昼
    const bright = lerp(0.72, 1.06, t);
    const warm = this.light === 'cool'
      ? 'saturate(1.05) hue-rotate(-6deg)'
      : 'saturate(1.08) sepia(0.06)';

    if (this.bg) this.bg.style.filter = `brightness(${bright.toFixed(3)}) ${warm}`;
    if (this.charWrap) {
      this.charWrap.style.filter = `brightness(${lerp(0.82, 1.04, t).toFixed(3)}) ${this.light === 'cool' ? 'saturate(1.02)' : 'saturate(1.04)'}`;
    }
    if (this.vig) this.vig.style.opacity = String(lerp(0.55, 0.22, t));
  }

  setWalkEnabled(on) {
    this.walkEnabled = !!on;
    this.cfg.walkEnabled = this.walkEnabled;
  }

  zoomBy(dz) {
    this.zoomTarget = clamp(this.zoomTarget - dz * 0.12, 0.72, 1.95);
  }

  redrawCharacter() {
    this.applyTheme(this.cfg.theme || this.theme);
    this.applyLight(this.cfg.light || this.light);
    this.setDayNight(typeof this.cfg.daynight === 'number' ? this.cfg.daynight : this.daynight);
    this.walkEnabled = this.cfg.walkEnabled !== false;
    const look = this.cfg.look || 'base';
    this._hideRig();
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
    for (let k = 0; k < STOPS.length - 1; k++) {
      if (y >= STOPS[k].a && y <= STOPS[k + 1].a) { i = k; break; }
    }
    const a0 = STOPS[i];
    const a1 = STOPS[i + 1];
    const t = (y - a0.a) / (a1.a - a0.a || 1);

    VIEW_NAMES.forEach(n => { this.imgs[n].style.opacity = '0'; });
    // 相邻两视角叠加；两端都是 back 时自动叠满
    this.imgs[a0.v].style.opacity = String(clamp(1 - t, 0, 1) + (a0.v === a1.v ? clamp(t, 0, 1) : 0));
    this.imgs[a1.v].style.opacity = String(a0.v === a1.v ? 0 : clamp(t, 0, 1));
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const tt = (now - this.t0) / 1000;

    // 平滑逼近
    this.yawDisp = lerp(this.yawDisp, this.yaw, 0.18);
    this.zoom = lerp(this.zoom, this.zoomTarget, 0.12);
    this.parXd = lerp(this.parXd, this.parX, 0.06);
    this.parYd = lerp(this.parYd, this.parY, 0.06);

    // 可选轻微游走（只影响 .s2-char，idle/动作交给 .s2-actor）
    const walk = this.walkEnabled ? Math.sin(tt * 0.5) * 10 : 0;

    // 背景视差（幅度大）与人物视差（幅度小）→ 纵深
    if (this.bg) {
      this.bg.style.transform = `scale(1.08) translate(${(-this.parXd * 1.6).toFixed(2)}%, ${(-this.parYd * 1.0).toFixed(2)}%)`;
    }
    if (this.charWrap) {
      const s = this.zoom.toFixed(4);
      const tx = (this.parXd * 0.8 + walk / innerWidth * 100).toFixed(2);
      this.charWrap.style.transform = `translateX(-50%) translate(${tx}%, ${(this.parYd * 0.4).toFixed(2)}%) scale(${s})`;
    }

    this._crossfade();
    this.cbs.onFrame?.();
  }
}
