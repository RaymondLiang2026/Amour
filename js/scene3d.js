// scene3d.js — Amour 多视角伪3D 立绘渲染层
// 用 5 张视角（-90/-45/0/+45/+90）+ 眨眼版 + 抠图 alpha，鼠标 X 触发视角 crossfade，
// 呼吸/头部跟随微视差/定时眨眼/rim light。兼容原 Scene3D 外部接口。
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const VIEW_DEFS = [
  { name: 'l90',   angle: -90, url: 'assets/character/facecut/l90.png' },
  { name: 'l45',   angle: -45, url: 'assets/character/facecut/l45.png' },
  { name: 'front', angle:   0, url: 'assets/character/facecut/front.png' },
  { name: 'r45',   angle: +45, url: 'assets/character/facecut/r45.png' },
  { name: 'r90',   angle: +90, url: 'assets/character/facecut/r90.png' },
];
const BLINK_URL = 'assets/character/facecut/blink.png';

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
    this.currentViewAngle = 0; // 平滑角度
    this.blinkTimer = 2.8; this.blinkPhase = 0; // s / 0..1
    this.talkPulse = 0;
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
    // 正交式取景：透视相机，人物 Plane 位于 z=0
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 60);
    this.camTarget = new THREE.Vector3(0, 0, 0);
    this.camBase = new THREE.Vector3(0, 0, 4.2);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camTarget);
    this.propsGroup = new THREE.Group();
    this.propsGroup.position.y = -2.4;
    this.scene.add(this.propsGroup);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
  }

  _initEnvAndLights() {
    // 环境轻光（Plane 用 Basic 材质，光对贴图不生效，仅供道具用）
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a8496, 0.65); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff1df, 1.8); this.key.position.set(-2.4, 2.6, 3.4); this.scene.add(this.key);
    this.fill = new THREE.DirectionalLight(0xbcd4ff, 0.5); this.fill.position.set(2.8, 1.6, 2.2); this.scene.add(this.fill);

    // rim light 硬光晕（Plane 后方，2 层）
    const rimMat = new THREE.SpriteMaterial({ map: makeRimTexture(), color: 0xffe9cf, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.rim = new THREE.Sprite(rimMat); this.rim.position.set(0, -0.05, -0.9); this.rim.scale.set(4.6, 5.6, 1); this.scene.add(this.rim);

    // 柔光晕
    const glowMat = new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffe9cf, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glow = new THREE.Sprite(glowMat); this.glow.position.set(0, 0.05, -0.55); this.glow.scale.set(4.0, 4.6, 1); this.scene.add(this.glow);
  }

  _initCharacter() {
    this.character = new THREE.Group(); this.scene.add(this.character);
    // 两层 Plane 做 crossfade，各自 8 张贴图切换
    const loader = new THREE.TextureLoader();
    this.textures = {};
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
    const planeH = 3.6;                     // 视口空间高
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

    this.planeMain = new THREE.Mesh(geo, shaderMat);
    this.planeBlink = new THREE.Mesh(geo, matBlink);
    this.planeMain.position.set(0, -0.05, 0);
    this.planeBlink.position.set(0, -0.05, 0.004);
    this.character.add(this.planeMain); this.character.add(this.planeBlink);

    this.modelReady = true;
    document.getElementById('loading')?.classList.add('hidden');
  }

  _grabBgLayers() {
    this.bgWarm = document.getElementById('bg-warm');
    this.bgNight = document.getElementById('bg-night');
    this.bgGlow = document.getElementById('bg-glow');
  }

  /* ---------- 外部接口 ---------- */
  applyTheme(theme) {
    this.cfg.theme = theme;
    if (theme === 'bedroom') this.setDayNight(Math.min(this.cfg.daynight, 24));
    else if (theme === 'cafe') this.setDayNight(Math.max(this.cfg.daynight, 60));
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
    this.cfg.daynight = v; const t = clamp(v / 100, 0, 1);
    if (this.bgWarm && this.bgNight) { this.bgWarm.style.opacity = t.toFixed(3); this.bgNight.style.opacity = (1 - t).toFixed(3); }
    this.hemi.intensity = 0.5 + t * 0.35;
    this.key.intensity = 1.3 + t * 0.9;
    if (this.rim) this.rim.material.opacity = 0.45 + (1 - t) * 0.35;
    if (this.glow) this.glow.material.opacity = 0.4 + (1 - t) * 0.35;
    this.renderer.toneMappingExposure = 0.92 + t * 0.28;
  }
  redrawCharacter() { this.applyLight(this.cfg.light); }
  playReaction(type) { this.reaction = type; this.reactionT = 1.2; }
  playTalk() { this.talkT = 1.4; }

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
    const norm = e => { const r = el.getBoundingClientRect(); this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1; this.pointer.set(this.mouse.x, this.mouse.y); };
    const onDown = e => {
      const ce = e.touches ? e.touches[0] : e; norm(ce);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const ph = this.raycaster.intersectObjects(this.propsGroup.children, true);
      if (ph.length) { this.dragProp = ph[0].object.userData.root; return; }
      // 命中角色 Plane
      if (this.planeMain) {
        const ch = this.raycaster.intersectObject(this.planeMain, true);
        if (ch.length) {
          const hit = ch[0]; const y = hit.point.y;
          const part = (y > 0.6) ? 'face' : (y > 0.0 ? 'neck' : 'body');
          this.cb.onCharacterClick && this.cb.onCharacterClick(part);
        }
      }
    };
    const onMove = e => {
      const ce = e.touches ? e.touches[0] : e; norm(ce);
      if (this.dragProp) {
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const p = new THREE.Vector3(); const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 2.4);
        if (this.raycaster.ray.intersectPlane(plane, p)) { this.dragProp.position.x = clamp(p.x, -3, 3); this.dragProp.position.z = clamp(p.z, -1, 3); }
        e.preventDefault && e.preventDefault();
      }
    };
    const onUp = () => { if (this.dragProp) { this._saveProps(); this.dragProp = null; } };
    el.addEventListener('mousedown', onDown); window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    el.addEventListener('touchstart', onDown, { passive: false }); el.addEventListener('touchmove', onMove, { passive: false }); window.addEventListener('touchend', onUp);
    window.addEventListener('resize', () => this._resize());
  }
  _resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); }

  headScreen() {
    // 头部在 Plane 上部 ~y=1.4 处（planeH=3.6, headY≈+1.35）
    const p = new THREE.Vector3(0, 1.35, 0.01);
    const v = p.clone().project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, visible: v.z < 1 };
  }

  // —— 视角选择：angle ∈ [-90, 90] → 相邻两个 view 的 crossfade —— //
  _pickViews(angleDeg) {
    const stops = VIEW_DEFS.map(v => v.angle);
    // 找到 angleDeg 所在区间
    let i = 0;
    for (let k = 0; k < stops.length - 1; k++) {
      if (angleDeg >= stops[k] && angleDeg <= stops[k + 1]) { i = k; break; }
      if (angleDeg < stops[0]) { i = 0; break; }
      if (angleDeg > stops[stops.length - 1]) { i = stops.length - 2; break; }
    }
    const a = VIEW_DEFS[i], b = VIEW_DEFS[i + 1] || VIEW_DEFS[i];
    const t = (b.angle === a.angle) ? 0 : clamp((angleDeg - a.angle) / (b.angle - a.angle), 0, 1);
    return { a, b, t };
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05), t = this.clock.elapsedTime;

    this.aim.x = lerp(this.aim.x, this.mouse.x, 0.18);
    this.aim.y = lerp(this.aim.y, this.mouse.y, 0.18);

    if (this.modelReady) {
      // 目标视角角度: 鼠标最边缘 → 90°(与 stops 端点对齐, 无 mix 残留)
      const targetAngle = this.aim.x * 90;
      this.currentViewAngle = lerp(this.currentViewAngle, targetAngle, 0.30);
      const { a, b, t: mix } = this._pickViews(this.currentViewAngle);

      // 更新 ShaderMaterial 双纹理与 mix
      const u = this.mainMat.uniforms;
      if (u.uTexA.value !== this.textures[a.name]) u.uTexA.value = this.textures[a.name];
      if (u.uTexB.value !== this.textures[b.name]) u.uTexB.value = this.textures[b.name];
      // 关键: 用陡峭 smoothstep(0.4, 0.6) 让中间双图混合极窄, 端点快速锁死
      const m = clamp((mix - 0.4) / 0.2, 0, 1);
      u.uMix.value = m * m * (3 - 2 * m);

      // 呼吸: Y 位移 + 缩放
      const breath = Math.sin(t * Math.PI * 2 / 4);
      const sway = Math.sin(t * 0.5);
      this.character.position.y = -0.02 + breath * 0.018;
      this.character.scale.y = 1 + breath * 0.005;
      this.character.scale.x = 1 - breath * 0.002;
      // 头部/身体轻旋转 (跟随鼠标 Y)
      this.character.rotation.x = -this.aim.y * 0.05 + sway * 0.008;
      // 水平微视差：Plane 组随 aim.x 位移 (视角切换外的额外视差)
      this.character.position.x = this.aim.x * 0.05;
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

    // 相机透视（鼠标视差）
    this.camera.position.x = this.aim.x * 0.10 + Math.sin(t * 0.3) * 0.008;
    this.camera.position.y = -this.aim.y * 0.08;
    this.camera.lookAt(this.camTarget);

    // 背景视差 + 光晕呼吸
    if (this.bgWarm) { const px = -this.aim.x * 14, py = this.aim.y * 10; const tr = `scale(1.12) translate(${px}px,${py}px)`; this.bgWarm.style.transform = tr; if (this.bgNight) this.bgNight.style.transform = tr; }
    if (this.glow) { this.glow.material.rotation += dt * 0.02; }
    if (this.rim) { this.rim.material.opacity = 0.48 + Math.sin(t * 1.2) * 0.05; }

    this.renderer.render(this.scene, this.camera); this.cb.onFrame && this.cb.onFrame();
  }
}

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
