// scene3d.js — Amour 多视角伪3D 立绘渲染层
// 用 5 张视角（-90/-45/0/+45/+90）+ 眨眼版 + 抠图 alpha，鼠标 X 触发视角 crossfade，
// 呼吸/头部跟随微视差/定时眨眼/rim light。兼容原 Scene3D 外部接口。
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
// 环形角度归一化到 [-180, 180]
const normAngle = (a) => { a = ((a + 180) % 360 + 360) % 360 - 180; return a; };
// 颜色线性插值：返回新 THREE.Color
const lerpColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

// —— 360° 全圆周视角 stops（环形；back 与 back2 复用同一张背面贴图，覆盖 -180/+180 边界）——
const VIEW_DEFS = [
  { name: 'back',  angle: -180, url: 'assets/character/facecut/back.png' },
  { name: 'l135',  angle: -135, url: 'assets/character/facecut/l135.png' },
  { name: 'l90',   angle:  -90, url: 'assets/character/facecut/l90.png' },
  { name: 'l45',   angle:  -45, url: 'assets/character/facecut/l45.png' },
  { name: 'front', angle:    0, url: 'assets/character/facecut/front.png' },
  { name: 'r45',   angle:  +45, url: 'assets/character/facecut/r45.png' },
  { name: 'r90',   angle:  +90, url: 'assets/character/facecut/r90.png' },
  { name: 'r135',  angle: +135, url: 'assets/character/facecut/r135.png' },
  { name: 'back2', angle: +180, url: 'assets/character/facecut/back.png' },  // 复用 back
];
const BLINK_URL = 'assets/character/facecut/blink.png';
const SCENE_BACKGROUNDS = {
  stage: 'assets/bg/generated/stage_living.png',
  cafe: 'assets/bg/generated/cafe.png',
  bedroom: 'assets/bg/generated/bedroom.png',
};
const OUTFIT_STAGE_TEXTURES = {
  base: 'assets/character/stage_variants/outfit_base.png',
  academy: 'assets/character/stage_variants/outfit_academy.png',
  coat: 'assets/character/stage_variants/outfit_coat.png',
  hoodie: 'assets/character/stage_variants/outfit_hoodie.png',
};
const HAIR_STAGE_TEXTURES = {
  long_wavy: 'assets/character/stage_variants/hair_long_wavy.png',
  bob: 'assets/character/stage_variants/hair_bob.png',
  ponytail: 'assets/character/stage_variants/hair_ponytail.png',
  short: 'assets/character/stage_variants/hair_short.png',
};

// —— 程序化背景光晕 —— //
function makeGlowTexture(inner = 'rgba(255,255,255,.55)', mid = 'rgba(255,240,220,.28)') {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(.35, mid); g.addColorStop(1, 'rgba(255,240,220,0)');
  x.fillStyle = g; x.beginPath(); x.arc(128, 128, 128, 0, 7); x.fill();
  return new THREE.CanvasTexture(c);
}

// —— rim light 硬边发光贴图（角色轮廓外强化） —— //
function makeRimTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 384;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 192, 40, 128, 192, 190);
  g.addColorStop(0, 'rgba(255,236,205,0.9)');
  g.addColorStop(0.35, 'rgba(255,220,180,0.45)');
  g.addColorStop(0.7, 'rgba(180,210,255,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 384);
  return new THREE.CanvasTexture(c);
}

export class Scene3D {
  constructor(container, cfg, callbacks = {}) {
    this.container = container; this.cfg = cfg; this.cb = callbacks;
    this.props = []; this.dragProp = null;
    this.mouse = { x: 0, y: 0 };
    this.aim = { x: 0, y: 0 };
    this.talkT = 0; this.reaction = null; this.reactionT = 0;
    this.modelReady = false;
    this.currentViewAngle = 0; // 平滑角度（环形 [-180,180]）
    this.blinkTimer = 2.6 + Math.random() * 2.4; this.blinkPhase = 0; // s / 0..1
    this.talkPulse = 0;
    this.useGLBCharacter = false;
    this.characterVisual = null;
    this.characterAnchorY = -2.75;
    this.characterHeight = 5.4;
    this.characterHeadLocal = new THREE.Vector3(0, 2.3, 0);
    this.characterClickTarget = null;
    // —— 用户交互角度（拖拽/触控主导视角；hover 仅提供 ±20° 微视差）——
    this.userYaw = 0;            // 用户拖拽累计偏航角（环形）
    this.userPitch = 0;          // 用户拖拽俯仰角（clamp ±30）
    this.dragging = false;       // 是否正在拖拽视角
    this.dragStart = null;       // { x, y, yaw, pitch }
    this._pointers = new Map();  // pointerId → {x,y}，用于双指捏合
    this._pinchStartDist = 0;    // 捏合初始双指距离
    // —— 场景内走动 —— //
    this.walkPhase = Math.random() * Math.PI * 2; // 走动相位
    this.walkT = 0;              // 走动周期计数
    this.walkEnabled = (cfg.walkEnabled !== false); // 默认开启
    this.walkDir = 1;            // 边界反向
    this.prevWalkX = 0;          // 上一帧 x（估算走动速度）
    // —— 角色 Plane 贴地：集中管理 characterY 基准偏移 ——
    // Plane 中心在 group 内 y=-0.15，planeH=5.4；characterY 基准取 -0.05，
    // 则脚部 ≈ -0.05 - 0.15 - 2.7 = -2.9，贴合地板顶面（地板中心 y=-3、顶面 y=-2.8）。
    this.characterY = -0.05;
    // —— 3D 场景纵深：主题灯光 / 自发光材质引用（供昼夜插值） ——
    this.themeLights = [];      // [{light, night, day}]
    this.themeEmissives = [];   // [{mat|sprite, night, day}]
    this._initRenderer(); this._initScene(); this._initEnvAndLights();
    this._initCharacter();
    this._grabBgLayers();
    this.applyLight(cfg.light); this.setDayNight(cfg.daynight); this.applyTheme(cfg.theme);
    (cfg.props || []).forEach(p => this.addProp(p.type, p, true));
    this._bindEvents(); this.clock = new THREE.Clock(); requestAnimationFrame(() => this._loop());
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    // —— 多层 fog 简化景深（DoF 回退方案，避免引入 postprocessing 依赖） ——
    // 角色 Plane 用 ShaderMaterial（不受 fog 影响）→ 主体清晰；地板/墙面/背景板受 fog 逐渐隐入 → 纵深感。
    this.scene.fog = new THREE.Fog(0x1a1420, 6, 28);
    // 正交式取景：透视相机，人物 Plane 位于 z=0；fov 收窄到 38 突出景深
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 80);
    this.camTarget = new THREE.Vector3(0, 0, 0);
    this.camBase = new THREE.Vector3(0, 0, 10.0);   // 拉远看到更多场景纵深
    this.camTargetZ = this.camBase.z;   // 镜头缩放目标 z（zoomBy 控制）
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camTarget);
    // —— 3D 场景环境容器（地板/墙/道具结构等，按主题重建） ——
    this.envGroup = new THREE.Group();
    this.scene.add(this.envGroup);
    this.propsGroup = new THREE.Group();
    this.propsGroup.position.y = -2.8;   // 道具坐落于地板顶面
    this.scene.add(this.propsGroup);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
  }

  _initEnvAndLights() {
    // 环境轻光（Plane 用 Basic 材质，光对贴图不生效，仅供道具用）
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a8496, 0.65); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff1df, 1.8); this.key.position.set(-2.4, 2.6, 3.4); this.scene.add(this.key);
    this.fill = new THREE.DirectionalLight(0xbcd4ff, 0.5); this.fill.position.set(2.8, 1.6, 2.2); this.scene.add(this.fill);

    // rim light 硬光晕（Plane 后方，2 层）
    const rimMat = new THREE.SpriteMaterial({ map: makeRimTexture(), color: 0xffe9cf, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending });
    this.rim = new THREE.Sprite(rimMat); this.rim.position.set(0, -0.15, -0.9); this.rim.scale.set(4.8, 6.8, 1); this.rim.visible = false; this.scene.add(this.rim);

    // 柔光晕
    const glowMat = new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffe9cf, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glow = new THREE.Sprite(glowMat); this.glow.position.set(0, -0.05, -0.55); this.glow.scale.set(4.4, 5.6, 1); this.glow.visible = false; this.scene.add(this.glow);
  }

  _initCharacter() {
    this.character = new THREE.Group(); this.scene.add(this.character);
    this.character.rotation.order = 'YXZ';
    this.textureLoader = new THREE.TextureLoader();
    this.textures = {};
    this.variantTextures = {};
    this._initPlaneCharacter();
  }

  _initPlaneCharacter() {
    // 两层 Plane 做 crossfade，各自 8 张贴图切换
    const loader = this.textureLoader;
    const promises = VIEW_DEFS.map(v => new Promise(res => {
      loader.load(v.url, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        tex.minFilter = THREE.LinearMipMapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        this.textures[v.name] = tex;
        res();
      }, undefined, () => { console.warn('view load fail', v.name); res(); });
    }));
    promises.push(new Promise(res => loader.load(BLINK_URL, tex => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.textures.blink = tex; res();
    }, undefined, () => res())));

    Promise.all(promises).then(() => this._buildPlanes());
  }

  _buildPlanes() {
    // 按 front 贴图长宽比设定 Plane 尺寸
    const front = this.textures.front || Object.values(this.textures)[0];
    if (!front || !front.image) { console.warn('no front tex'); return; }
    const w = front.image.width, h = front.image.height;
    const planeH = 5.4;                     // 视口空间高 (全身立绘)
    const planeW = planeH * (w / h);
    const geo = new THREE.PlaneGeometry(planeW, planeH);
    this._planeSize = { w: planeW, h: planeH };

    // 主 Plane：ShaderMaterial 做双视角像素级混合
    const shaderMat = new THREE.ShaderMaterial({
      uniforms: {
        uTexA: { value: this.textures.front },
        uTexB: { value: this.textures.r45 || this.textures.front },
        uMix:  { value: 0.0 },
        uSat:  { value: 1.08 },  // 轻微提高饱和度
        uCon:  { value: 1.04 },  // 轻微提高对比
        uWarm: { value: 0.03 },  // 皮肤暖色叠加
        uRim:  { value: 0.35 },  // 边缘发光强度
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uTexA;
        uniform sampler2D uTexB;
        uniform float uMix;
        uniform float uSat;
        uniform float uCon;
        uniform float uWarm;
        uniform float uRim;
        vec3 satCon(vec3 c, float s, float k) {
          float g = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(g), c, s);
          c = (c - 0.5) * k + 0.5;
          return c;
        }
        void main() {
          vec4 a = texture2D(uTexA, vUv);
          vec4 b = texture2D(uTexB, vUv);
          vec4 c = mix(a, b, uMix);
          if (c.a < 0.02) discard;
          vec3 rgb = satCon(c.rgb, uSat, uCon);
          // 暖色略偏
          rgb += vec3(uWarm, uWarm * 0.35, -uWarm * 0.15);
          // Rim light: alpha 边缘增强 (alpha 在 0.1..0.6 时 * 亮度)
          float edge = smoothstep(0.05, 0.35, c.a) * (1.0 - smoothstep(0.5, 0.85, c.a));
          rgb += vec3(1.0, 0.92, 0.78) * edge * uRim;
          gl_FragColor = vec4(rgb, c.a);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.mainMat = shaderMat;

    // 眨眼 Plane 独立：仅覆盖正面视角
    const matBlink = new THREE.MeshBasicMaterial({ map: this.textures.blink || this.textures.front, transparent: true, alphaTest: 0.02, depthWrite: false, opacity: 0 });
    const outfitMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.03, depthWrite: false, opacity: 0.58 });
    const hairMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.03, depthWrite: false, opacity: 0.55 });

    this.planeMain = new THREE.Mesh(geo, shaderMat);
    this.planeOutfit = new THREE.Mesh(geo, outfitMat);
    this.planeHair = new THREE.Mesh(geo, hairMat);
    this.planeBlink = new THREE.Mesh(geo, matBlink);
    this.planeMain.position.set(0, -0.15, 0);
    this.planeOutfit.position.set(0, -0.15, 0.006);
    this.planeHair.position.set(0, -0.15, 0.008);
    this.planeBlink.position.set(0, -0.15, 0.012);
    this.character.add(this.planeMain); this.character.add(this.planeOutfit); this.character.add(this.planeHair); this.character.add(this.planeBlink);
    this.characterVisual = this.planeMain;
    this.characterClickTarget = this.planeMain;
    this._syncVariantPlanes();

    this.modelReady = true;
    document.getElementById('loading')?.classList.add('hidden');
  }

  _grabBgLayers() {
    this.bgWarm = document.getElementById('bg-warm');
    this.bgNight = document.getElementById('bg-night');
    this.bgGlow = document.getElementById('bg-glow');
    // —— 第五轮：3D 场景成为唯一背景，隐藏原 2D 背景照片层（DOM 保留，避免破坏其他代码） ——
    if (this.bgWarm) { this.bgWarm.style.opacity = '0'; this.bgWarm.style.display = 'none'; }
    if (this.bgNight) { this.bgNight.style.opacity = '0'; this.bgNight.style.display = 'none'; }
  }

  /* ---------- 外部接口 ---------- */
  applyTheme(theme) {
    this.cfg.theme = theme;
    document.body.dataset.sceneTheme = theme;
    const bg = SCENE_BACKGROUNDS[theme] || SCENE_BACKGROUNDS.stage;
    document.documentElement.style.setProperty('--scene-bg-image', `url("${bg}")`);
    // 同源视觉模式：背景由高质量图片承载，避免简陋几何体与缩略图不一致
    this.envGroup.clear();
    this.themeLights = [];
    this.themeEmissives = [];
    // 主题决定默认昼夜基调，随后 setDayNight 应用到 3D 灯光
    if (theme === 'bedroom') this.setDayNight(Math.min(this.cfg.daynight, 24));
    else if (theme === 'cafe') this.setDayNight(Math.max(this.cfg.daynight, 60));
    else this.setDayNight(this.cfg.daynight);
  }
  applyLight(mode) {
    this.cfg.light = mode;
    if (mode === 'cool') {
      this.key.color.set(0xdbe7ff); this.fill.color.set(0xaec4ff);
      if (this.rim) this.rim.material.color.set(0xcfe0ff);
      if (this.glow) this.glow.material.color.set(0xcfe0ff);
    } else {
      this.key.color.set(0xfff1df); this.fill.color.set(0xbcd4ff);
      if (this.rim) this.rim.material.color.set(0xffe9cf);
      if (this.glow) this.glow.material.color.set(0xffe9cf);
    }
  }
  setDayNight(v) {
    this.cfg.daynight = v; const t = clamp(v / 100, 0, 1);   // t=0 夜晚 → t=1 白天
    // —— 全局环境光 / 主光：夜暗昼亮 ——
    this.hemi.color.copy(lerpColor(0x1a2040, 0xdcedff, t));      // sky
    this.hemi.groundColor.copy(lerpColor(0x0a0812, 0x8a7f66, t)); // ground
    this.hemi.intensity = lerp(0.55, 0.95, t);
    this.key.intensity = lerp(0.7, 2.0, t);
    // —— fog 颜色 + 渲染背景色随昼夜过渡（无缝景深底色） ——
    const fogCol = lerpColor(0x0a0812, 0xc8d4e0, t);
    if (this.scene.fog) this.scene.fog.color.copy(fogCol);
    this.renderer.setClearColor(fogCol, 0);
    // —— 主题灯光（舞台/吊灯 spotlight）强度插值 ——
    this.themeLights.forEach(o => { o.light.intensity = lerp(o.night, o.day, t); });
    // —— 自发光材质（窗户/灯罩/glow）：夜高昼低 ——
    this.themeEmissives.forEach(o => {
      const val = lerp(o.night, o.day, t);
      if (o.mat) o.mat.emissiveIntensity = val;
      if (o.sprite) o.sprite.material.opacity = val;
    });
    // 角色 rim / glow：夜晚更强
    if (this.rim) this.rim.material.opacity = 0.08 + (1 - t) * 0.08;
    if (this.glow) this.glow.material.opacity = 0.12 + (1 - t) * 0.08;
    this.renderer.toneMappingExposure = 0.92 + t * 0.28;
  }
  _getVariantTexture(key, url) {
    if (!url || !this.textureLoader) return null;
    if (this.variantTextures[key]) return this.variantTextures[key];
    const tex = this.textureLoader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; });
    tex.colorSpace = THREE.SRGBColorSpace;
    this.variantTextures[key] = tex;
    return tex;
  }
  _syncVariantPlane(plane, key, url, visible = true, color = 0xffffff) {
    if (!plane) return;
    const tex = this._getVariantTexture(key, url);
    if (!tex) { plane.visible = false; return; }
    plane.material.map = tex;
    plane.material.color.set(color);
    plane.material.needsUpdate = true;
    plane.visible = visible;
  }
  _syncVariantPlanes() {
    const outfit = this.cfg.outfit || 'base';
    const hair = this.cfg.hairStyle || 'bob';
    this._syncVariantPlane(this.planeOutfit, `outfit:${outfit}`, OUTFIT_STAGE_TEXTURES[outfit] || OUTFIT_STAGE_TEXTURES.base, outfit !== 'base', this.cfg.outfitColor || 0xffffff);
    this._syncVariantPlane(this.planeHair, `hair:${hair}`, HAIR_STAGE_TEXTURES[hair] || HAIR_STAGE_TEXTURES.bob, true, this.cfg.hairColor || 0xffffff);
  }
  redrawCharacter() {
    this.applyLight(this.cfg.light);
    if (this.characterVisual && this.characterVisual !== this.planeMain) return;
    this._syncVariantPlanes();
    if (this.mainMat?.uniforms) {
      const outfitBoost = this.cfg.outfit === 'coat' ? 0.1 : this.cfg.outfit === 'academy' ? 0.05 : this.cfg.outfit === 'hoodie' ? -0.02 : 0;
      const accessoryBoost = this.cfg.accessories?.glasses ? 0.03 : 0;
      this.mainMat.uniforms.uSat.value = 1.08 + outfitBoost;
      this.mainMat.uniforms.uCon.value = 1.04 + accessoryBoost;
      this.mainMat.uniforms.uWarm.value = this.cfg.light === 'cool' ? 0.0 : 0.03;
      this.mainMat.uniforms.uRim.value = 0.35 + (this.cfg.accessories?.hairpin ? 0.08 : 0);
    }
  }
  playReaction(type) { this.reaction = type; this.reactionT = 1.2; }
  playTalk() { this.talkT = 1.4; }
  // 镜头缩放：dz<0 拉近、dz>0 拉远；z 限制在 [4.5, 11.5]，_loop 中平滑 lerp
  zoomBy(dz) { this.camTargetZ = clamp(this.camTargetZ + dz, 4.5, 11.5); }
  setWalkEnabled(on) { this.walkEnabled = !!on; if (this.cfg) this.cfg.walkEnabled = this.walkEnabled; }

  addProp(type, data = null, silent = false) {
    const g = buildProp(type); if (!g) return;
    g.position.set(data ? data.x : Math.random() * 1.6 - 0.8, 0, data ? data.z : 0.6 + Math.random() * 1.2);
    g.rotation.y = data ? (data.rot || 0) : Math.random() * 0.6 - 0.3;
    g.userData = { isProp: true, type }; g.traverse(o => { if (o.isMesh) { o.userData.isProp = true; o.userData.root = g; } });
    this.propsGroup.add(g); this.props.push(g); if (!silent) this._saveProps();
  }
  clearProps() { [...this.props].forEach(p => this.propsGroup.remove(p)); this.props = []; this._saveProps(); }
  _saveProps() { this.cfg.props = this.props.map(p => ({ type: p.userData.type, x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), rot: +p.rotation.y.toFixed(2) })); this.cb.onChange && this.cb.onChange(); }

  _bindEvents() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';  // 禁用浏览器默认滚动/缩放手势，交给我们处理
    const norm = e => { const r = el.getBoundingClientRect(); this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1; this.pointer.set(this.mouse.x, this.mouse.y); };

    // —— pointerdown：命中道具→道具拖拽；否则进入视角拖拽（并记录 tap 用于角色点击）——
    const onDragStart = e => {
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // 双指：记录初始捏合距离，进入缩放模式（不做单指旋转）
      if (this._pointers.size === 2) {
        const p = [...this._pointers.values()];
        this._pinchStartDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        this.dragging = false;
        return;
      }
      norm(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      // 命中道具 → 原道具拖拽逻辑
      const ph = this.raycaster.intersectObjects(this.propsGroup.children, true);
      if (ph.length) { this.dragProp = ph[0].object.userData.root; el.setPointerCapture?.(e.pointerId); return; }
      // 记录角色点击部位（轻点触发 onCharacterClick，拖动则视为转视角）
      this._downPart = null;
      const characterTarget = this.characterClickTarget || this.planeMain;
      if (characterTarget) {
        const ch = this.raycaster.intersectObject(characterTarget, true);
        if (ch.length) {
          const y = ch[0].point.y;
          this._downPart = (y > 1.3) ? 'face' : (y > 0.0 ? 'neck' : 'body');
        }
      }
      // 进入视角拖拽
      this.dragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY, yaw: this.userYaw, pitch: this.userPitch };
      this._downClient = { x: e.clientX, y: e.clientY, moved: 0 };
      el.setPointerCapture?.(e.pointerId);
    };

    // —— pointermove：双指捏合 / 道具拖拽 / 视角拖拽 / hover 微视差 ——
    const onDragMove = e => {
      if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // 双指捏合缩放
      if (this._pointers.size === 2 && this._pinchStartDist > 0) {
        const p = [...this._pointers.values()];
        const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const delta = (dist - this._pinchStartDist) / this._pinchStartDist; // 张开>0 拉近
        this.zoomBy(-delta * 4);
        this._pinchStartDist = dist;
        e.preventDefault && e.preventDefault();
        return;
      }
      // 道具拖拽
      if (this.dragProp) {
        norm(e);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const p = new THREE.Vector3(); const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 2.8);
        if (this.raycaster.ray.intersectPlane(plane, p)) { this.dragProp.position.x = clamp(p.x, -3, 3); this.dragProp.position.z = clamp(p.z, -1, 3); }
        e.preventDefault && e.preventDefault();
        return;
      }
      // 视角拖拽（userYaw 主导偏航；userPitch 俯仰）
      if (this.dragging && this.dragStart) {
        const dx = e.clientX - this.dragStart.x, dy = e.clientY - this.dragStart.y;
        this.userYaw = normAngle(this.dragStart.yaw + dx * 0.6);        // 每像素 0.6° 灵敏度
        this.userPitch = clamp(this.dragStart.pitch - dy * 0.35, -30, 30);
        if (this._downClient) this._downClient.moved = Math.max(this._downClient.moved, Math.hypot(dx, dy));
        e.preventDefault && e.preventDefault();
        return;
      }
      // hover 微视差（仅在未拖拽时更新 aim）
      norm(e);
    };

    // —— pointerup / pointercancel：结束拖拽；轻点触发角色点击 ——
    const onDragEnd = e => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchStartDist = 0;
      if (this.dragProp) { this._saveProps(); this.dragProp = null; }
      else if (this.dragging && this._downClient && this._downClient.moved < 6 && this._downPart) {
        this.cb.onCharacterClick && this.cb.onCharacterClick(this._downPart);
      }
      this.dragging = false; this._downPart = null; this._downClient = null;
      el.releasePointerCapture?.(e.pointerId);
    };

    el.addEventListener('pointerdown', onDragStart);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
    // 滚轮缩放
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoomBy(Math.sign(e.deltaY) * 0.6); }, { passive: false });
    window.addEventListener('resize', () => this._resize());
  }
  _resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); }

  headScreen() {
    const p = (this.characterVisual && this.characterVisual !== this.planeMain)
      ? this.character.localToWorld(this.characterHeadLocal.clone())
      : new THREE.Vector3(0, 2.5, 0.01);
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, visible: v.z < 1 };
  }

  // —— 环形视角选择：angle 归一化到 [-180,180] → 相邻两个 view 的 crossfade —— //
  _pickViews(angleDeg) {
    const stops = VIEW_DEFS.map(v => v.angle);
    const a = normAngle(angleDeg);
    for (let k = 0; k < stops.length - 1; k++) {
      if (a >= stops[k] && a <= stops[k + 1]) {
        const A = VIEW_DEFS[k], B = VIEW_DEFS[k + 1];
        const t = (B.angle === A.angle) ? 0 : (a - A.angle) / (B.angle - A.angle);
        return { a: A, b: B, t };
      }
    }
    return { a: VIEW_DEFS[0], b: VIEW_DEFS[0], t: 0 };
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05), t = this.clock.elapsedTime;

    this.aim.x = lerp(this.aim.x, this.mouse.x, 0.22);
    this.aim.y = lerp(this.aim.y, this.mouse.y, 0.22);

    if (this.modelReady) {
      // —— 场景内走动：正弦主频 + 低频扰动 = 自然游走 —— //
      if (this.walkEnabled) {
        this.walkPhase += dt * 0.35 * this.walkDir;   // 走动频率约 0.35 rad/s
        this.walkT += dt;
        const walkX = Math.sin(this.walkPhase) * 1.4 + Math.sin(this.walkPhase * 0.31) * 0.3;
        if (Math.abs(walkX) > 2.5) this.walkDir *= -1;  // 边界反向
        const dxdt = (walkX - this.prevWalkX) / Math.max(dt, 1e-3);
        this.prevWalkX = walkX;
        // 走动方向决定看向：向右走(dxdt>0.02)看右、向左走(dxdt<-0.02)看左
        let walkLook = 0;
        if (dxdt > 0.02) walkLook = clamp(dxdt * 8, 0, 24);
        else if (dxdt < -0.02) walkLook = clamp(dxdt * 8, -24, 0);
        this._walkLook = lerp(this._walkLook || 0, walkLook, 0.12);
        // 脚步颠簸：频率 = 走动主频 × 4，振幅 0.015
        this._stepBob = Math.sin(this.walkPhase * 4) * 0.015 * Math.min(1, Math.abs(dxdt) * 2);
        this._walkX = walkX;
      } else {
        this._walkX = lerp(this._walkX || 0, 0, 0.05);
        this._walkLook = lerp(this._walkLook || 0, 0, 0.12);
        this._stepBob = 0;
      }

      // 呼吸: Y 位移 + 缩放（叠加走动脚步颠簸）
      const breath = Math.sin(t * Math.PI * 2 / 4);
      const sway = Math.sin(t * 0.5);
      this.character.position.y = this.characterY + breath * 0.018 + (this._stepBob || 0);
      this.character.scale.y = 1 + breath * 0.005;
      this.character.scale.x = 1 - breath * 0.002;
      // 头部/身体轻旋转：拖拽俯仰 userPitch 主导（低头/抬头）+ 鼠标 Y 微视差
      this.character.rotation.x = -clamp(this.userPitch, -30, 30) * Math.PI / 180 - this.aim.y * 0.05 + sway * 0.008;
      // 水平位移：鼠标视差 + 场景内走动（叠加，不覆盖）
      this.character.position.x = this.aim.x * 0.05 + (this._walkX || 0);

      const isGLB = !!(this.characterVisual && this.characterVisual !== this.planeMain);
      if (isGLB) {
        const targetAngle = this.userYaw + this.aim.x * 12 + (this._walkLook || 0);
        const shortestDelta = normAngle(targetAngle - this.currentViewAngle);
        this.currentViewAngle = normAngle(this.currentViewAngle + shortestDelta * 0.22);
        this.character.rotation.y = THREE.MathUtils.degToRad(this.currentViewAngle);
      } else {
        // 目标视角角度: 拖拽 userYaw 主导 + hover 微视差 ±20° + 走动看向（叠加）
        const targetAngle = this.userYaw + this.aim.x * 20 + (this._walkLook || 0);
        // 环形 lerp：沿最短路径插值，跨越 ±180 边界不抖动
        const shortestDelta = normAngle(targetAngle - this.currentViewAngle);
        this.currentViewAngle = normAngle(this.currentViewAngle + shortestDelta * 0.35);
        const { a, b, t: mix } = this._pickViews(this.currentViewAngle);

        // 更新 ShaderMaterial 双纹理与 mix
        const u = this.mainMat.uniforms;
        if (u.uTexA.value !== this.textures[a.name]) u.uTexA.value = this.textures[a.name];
        if (u.uTexB.value !== this.textures[b.name]) u.uTexB.value = this.textures[b.name];
        // 关键: 用陡峭 smoothstep(0.4, 0.6) 让中间双图混合极窄, 端点快速锁死
        const m = clamp((mix - 0.4) / 0.2, 0, 1);
        u.uMix.value = m * m * (3 - 2 * m);

        // Plane 微倾斜制造立体感 (Y 轴旋转 - 与视角切换协同)
        this.character.rotation.y = -this.aim.x * 0.04;

        // 眨眼: 定时触发，眨眼期间 planeBlink 在正面附近 fade 到覆盖 planeA
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
          this.blinkPhase += dt * 12; // 一次眨眼 ~π/12 秒 ≈ 0.26s
          const b01 = Math.max(0, Math.sin(Math.min(this.blinkPhase, Math.PI))); // 0..1..0
          // 仅在接近正面 |angle|<25° 生效
          const gate = clamp(1 - Math.abs(this.currentViewAngle) / 25, 0, 1);
          this.planeBlink.material.opacity = b01 * gate;
          if (this.blinkPhase >= Math.PI) { this.blinkPhase = 0; this.blinkTimer = 2.6 + Math.random() * 2.4; this.planeBlink.material.opacity = 0; }
        }
      }

      // 说话口型 pulse (脉动缩放, 代替 blendshape)
      if (this.talkT > 0) {
        this.talkT -= dt;
        this.talkPulse = Math.abs(Math.sin(t * 22)) * 0.4;
      } else this.talkPulse = 0;
      // 反应
      if (this.reactionT > 0) {
        this.reactionT -= dt;
        if (this.reaction === 'happy' || this.reaction === 'wave') this.character.position.y += Math.abs(Math.sin(this.reactionT * 9)) * 0.03;
        if (this.reaction === 'shy') this.character.rotation.z = Math.sin(t * 5) * 0.03;
        if (this.reactionT <= 0) { this.reaction = null; this.character.rotation.z = 0; }
      }
      // talk pulse 微微下巴颤动 = plane 上方稍微上抬
      this.character.position.y += this.talkPulse * 0.005;
    }

    // 相机透视（鼠标视差）+ 镜头缩放平滑过渡
    this.camera.position.x = this.aim.x * 0.10 + Math.sin(t * 0.3) * 0.008;
    this.camera.position.y = -this.aim.y * 0.08;
    // z 由 camTargetZ 主导（zoomBy 控制），lerp 0.08 ≈ 1s 平滑到位
    this.camera.position.z = lerp(this.camera.position.z, this.camTargetZ, 0.08);
    this.camera.lookAt(this.camTarget);

    // 背景视差 + 光晕呼吸
    if (this.bgWarm) { const px = -this.aim.x * 14, py = this.aim.y * 10; const tr = `scale(1.12) translate(${px}px,${py}px)`; this.bgWarm.style.transform = tr; if (this.bgNight) this.bgNight.style.transform = tr; }
    if (this.glow?.visible) { this.glow.material.rotation += dt * 0.02; }
    if (this.rim?.visible) { this.rim.material.opacity = 0.08 + Math.sin(t * 1.2) * 0.02; }

    this.renderer.render(this.scene, this.camera); this.cb.onFrame && this.cb.onFrame();
  }
}

/* ---------- 3D 场景主题（地板 + 墙 + 结构 + 灯光，构成真实纵深空间） ---------- */
// 返回一个 Group，group.userData = { lights:[{light,night,day}], emissives:[{mat|sprite,night,day}] }
// 供 setDayNight 按昼夜插值。所有几何体低多边形（12-24 分段）+ 柔和暖色材质。
/* ---------- 道具（原样保留） ---------- */
function buildProp(type) {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x9b7657, roughness: 0.72 }), dark = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.76 });
  if (type === 'stool') { const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 24), wood); seat.position.y = 0.68; g.add(seat); for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.68, 10), dark); l.position.set(x, 0.34, z); g.add(l); } }
  else if (type === 'plant') { const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.38, 18), new THREE.MeshStandardMaterial({ color: 0xc28262, roughness: 0.8 })); pot.position.y = 0.19; g.add(pot); const leaf = new THREE.MeshStandardMaterial({ color: 0x4d9b63, roughness: 0.65 }); for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.68, 8), leaf); l.position.set(Math.cos(i) * 0.12, 0.68, Math.sin(i) * 0.12); l.rotation.set(0.25 * Math.cos(i), i, 0.25 * Math.sin(i)); g.add(l); } }
  else if (type === 'lamp') { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.65, 10), dark); pole.position.y = 0.82; g.add(pole); const shade = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.42, 22, 1, true), new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffcc88, emissiveIntensity: 0.45, side: THREE.DoubleSide })); shade.position.y = 1.72; g.add(shade); const bulb = new THREE.PointLight(0xffd19a, 1.8, 4); bulb.position.y = 1.62; g.add(bulb); }
  else if (type === 'rug') { const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.025, 36), new THREE.MeshStandardMaterial({ color: 0xd3b59b, roughness: 0.95 })); rug.position.y = 0.015; g.add(rug); }
  else if (type === 'table') { const top = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 28), wood); top.position.y = 0.72; g.add(top); const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.72, 12), dark); stem.position.y = 0.36; g.add(stem); }
  else if (type === 'books') { for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: [0x8b4b4b, 0x4b638b, 0x4f8b62, 0xd0a05d][i], roughness: 0.65 })); b.position.set(0, 0.04 + i * 0.085, 0); b.rotation.y = Math.random() * 0.2; g.add(b); } }
  else if (type === 'teacup') { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.16, 18), new THREE.MeshStandardMaterial({ color: 0xf8f1e7, roughness: 0.42 })); cup.position.y = 0.48; g.add(cup); const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 10), dark); stand.position.y = 0.21; g.add(stand); }
  else if (type === 'frame') { const fr = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.94, 0.06), wood); fr.position.y = 1.05; g.add(fr); }
  else return null;
  return g;
}
