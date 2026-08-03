// voice.js — 浏览器原生语音交互（Web Speech API），不依赖任何外部服务
// 语音输入 SpeechRecognition + 语音输出 SpeechSynthesis + 唤醒词
// 音色目标：真人感 · 活泼运动少女音（优选微软/谷歌中文女声，rate/pitch 上扬）
// v2: 真人语音包（assets/voice/yui/）优先播放，无对应 MP3 时回退 Web Speech TTS

const VOICE_PACK_V = 'r2d5-20260803j';
const VOICE_BASE = 'assets/voice/yui/';

export class Voice {
  constructor(app) {
    this.app = app;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.SR = SR; this.srSupported = !!SR;
    this.synth = window.speechSynthesis || null;
    this.ttsSupported = !!this.synth;
    this.voices = [];
    this.mode = 'off';           // off | wake | listen
    this.running = false;        // 识别器是否运行中
    this.armedUntil = 0;         // 听到唤醒词后进入 listen 的时间窗
    this.onState = null;         // 状态回调（更新 UI）
    this._pickedVoice = null;    // 缓存已选中的女声
    // 首次 speak 前必须等 voiceschanged（部分浏览器初始 voice list 为空）
    this._voicesReady = new Promise((resolve) => { this._resolveVoices = resolve; });
    if (this.ttsSupported) {
      this._loadVoices();
      this.synth.onvoiceschanged = () => this._loadVoices();
      // 兜底：1.2s 后即使没有 voiceschanged 也放行（避免永久 pending）
      setTimeout(() => this._resolveVoices && this._resolveVoices(), 1200);
    } else { this._resolveVoices && this._resolveVoices(); }
    if (this.srSupported) { this._initRec(); }

    // === 真人语音包 ===
    this._mp3Map = null;       // emotion→[{file,text}] 映射
    this._mp3Greet = null;     // greet→[{file,text}]
    this._warmList = [];       // warm→[{file,text}] 成熟贴心陪伴语音
    this._mp3Ready = false;
    this._currentAudio = null; // 正在播放的 HTMLAudioElement（并发控制）
    this._loadManifest();
  }

  /* ---------- 真人语音包加载 ---------- */
  _loadManifest() {
    const url = `${VOICE_BASE}manifest.json?v=${VOICE_PACK_V}`;
    fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => {
        this._mp3Map = {};
        if (data.emotions) {
          Object.keys(data.emotions).forEach(key => {
            this._mp3Map[key] = data.emotions[key];
          });
        }
        this._mp3Greet = Array.isArray(data.greet) ? data.greet : [];
        this._warmList = Array.isArray(data.warm) ? data.warm : [];
        this._mp3Ready = true;
      })
      .catch(() => { this._mp3Ready = false; });
  }

  /* ---------- MP3 播放核心 ---------- */
  // 返回 {playing:true, text} 或 {playing:false} （无对应资源时）
  _playMp3(emotionKey) {
    if (!this._mp3Ready || !this._mp3Map) return { playing: false };
    const clips = this._mp3Map[emotionKey];
    if (!clips || !clips.length) return { playing: false };
    const clip = clips[Math.floor(Math.random() * clips.length)];
    this._doPlayMp3(clip.file);
    return { playing: true, text: clip.text || '' };
  }

  _playMp3Greet() {
    if (!this._mp3Ready || !this._mp3Greet || !this._mp3Greet.length) return { playing: false };
    const clip = this._mp3Greet[Math.floor(Math.random() * this._mp3Greet.length)];
    this._doPlayMp3(clip.file);
    return { playing: true, text: clip.text || '' };
  }

  _playMp3Warm() {
    if (!this._mp3Ready || !this._warmList || !this._warmList.length) return { playing: false };
    const clip = this._warmList[Math.floor(Math.random() * this._warmList.length)];
    this._doPlayMp3(clip.file);
    return { playing: true, text: clip.text || '' };
  }

  isOutputActive() {
    return !!this._currentAudio || !!(this.synth && this.synth.speaking);
  }

  _canStartNewVoice() {
    return !this.isOutputActive();
  }

  _doPlayMp3(file) {
    // 并发控制：停掉正在播的
    this._stopMp3();
    const audio = new Audio(`${VOICE_BASE}${file}?v=${VOICE_PACK_V}`);
    audio.volume = 1.0;
    this._currentAudio = audio;
    audio.play().catch(() => {});
    audio.onended = () => { if (this._currentAudio === audio) this._currentAudio = null; };
    audio.onerror = () => { if (this._currentAudio === audio) this._currentAudio = null; };
  }

  _stopMp3() {
    if (this._currentAudio) {
      try { this._currentAudio.pause(); this._currentAudio.currentTime = 0; } catch {}
      this._currentAudio = null;
    }
  }

  /* ---------- 对外接口：情绪语音（MP3 优先，回退 TTS） ---------- */
  // 由 playEmotion 调用，返回该条语音对应的文本（用于气泡同步）
  speakEmotion(emotionKey) {
    if (!this.app.cfg.voiceOutput) return '';
    // 停掉已有语音（MP3/TTS）
    this._stopMp3();
    this.stopSpeak();
    const res = this._playMp3(emotionKey);
    if (res.playing) return res.text;
    // 无对应 MP3 → 回退 Web Speech TTS（不返回覆盖文本）
    return '';
  }

  // greet 专用：约 35% 使用 warm，形成更成熟贴心的问候
  speakGreet() {
    if (!this.app.cfg.voiceOutput || !this._canStartNewVoice()) return '';
    this._stopMp3();
    this.stopSpeak();
    const preferWarm = Math.random() < 0.35;
    const first = preferWarm ? this._playMp3Warm() : this._playMp3Greet();
    if (first.playing) return first.text;
    const fallback = preferWarm ? this._playMp3Greet() : this._playMp3Warm();
    if (fallback.playing) return fallback.text;
    return '';
  }

  // warm 专用：缺失/加载失败静默跳过；默认不打断正在播放的语音，避免叠音和刷屏
  speakWarm() {
    if (!this.app.cfg.voiceOutput || !this._canStartNewVoice()) return '';
    this._stopMp3();
    this.stopSpeak();
    const res = this._playMp3Warm();
    if (res.playing) return res.text;
    return '';
  }

  _loadVoices() {
    this.voices = this.synth.getVoices() || [];
    if (this.voices.length) {
      this._pickedVoice = this._pickVoice();
      if (this._resolveVoices) { this._resolveVoices(); this._resolveVoices = null; }
    }
  }

  /* ---------- 语音输出 ---------- */
  // 优选中文女声（lang 以 zh 开头优先；其次名称含 female/女/Xiaoxiao/Yun 等）
  _pickVoice() {
    const list = this.voices;
    if (!list.length) return null;

    const zh = list.filter(v => /^zh/i.test(v.lang) || /\b(zh|cmn|chinese)\b/i.test(v.lang + ''));
    const pool = zh.length ? zh : list;

    const preferred = [
      /xiaoxiao/i,
      /xiaoyi/i,
      /yaoyao/i,
      /yunxi/i,
      /yun/i,
      /云希/,
      /晓晓/,
      /小晓/,
      /female|女/i,
      /google\s*普通话/i,
      /chinese\s*female/i,
    ];
    for (const re of preferred) {
      const hit = pool.find(v => re.test(v.name));
      if (hit) return hit;
    }

    const femKey = /female|women|woman|女|婷|美|Mei|Ting|Xiao|Yao|Hui|Xiaoxiao|Yun/i;
    return pool.find(v => femKey.test(v.name)) || pool[0];
  }

  // 语气处理：随机前置俏皮语气词 + 每句 pitch/rate 轻微随机，让声音更活泼
  _prosody(text) {
    let t = (text || '').replace(/[✨🎵🎭💗🔒👗🌸☕🛏️🪴]/g, '').replace(/\s+/g, ' ').trim();
    if (!t) return { text: '', pitch: 1.1, rate: 1.05 };

    const prefixes = ['嗯~', '嘿嘿，', '呀！', '哼哼~', '诶？', '喂喂，', '叮咚~', '好耶！'];
    if (Math.random() < 0.42 && !/^(嗯|嘿嘿|呀|哼哼|诶|喂喂|叮咚|好耶)/.test(t)) {
      t = prefixes[Math.floor(Math.random() * prefixes.length)] + t;
    }

    // 句末若无标点，补一个上扬"～"
    if (t && !/[～~。.!！?？,，、;；:：]$/.test(t)) t += '～';

    const rand = (a, b) => a + (b - a) * Math.random();
    let pitch = rand(1.05, 1.25);
    if (/！|!/.test(t)) pitch += 0.04;
    pitch = Math.max(0.5, Math.min(2, pitch));

    const baseRate = (typeof this.app?.cfg?.speechRate === 'number') ? this.app.cfg.speechRate : 1.08;
    const rate = Math.max(0.6, Math.min(2, baseRate * rand(1.0, 1.15)));

    return { text: t, pitch, rate };
  }

  speak(text) {
    if (!this.ttsSupported || !this.app.cfg.voiceOutput || !text) return;
    // 停掉正在播的 MP3（避免 TTS 和 MP3 叠音）
    this._stopMp3();
    // 首次调用等待 voices 就绪，再朗读
    this._voicesReady.then(() => this._doSpeak(text));
  }
  _doSpeak(text) {
    if (!this.ttsSupported || !this.app.cfg.voiceOutput || !text) return;
    try {
      this.synth.cancel();
      const { text: say, pitch, rate } = this._prosody(text);
      if (!say) return;
      const u = new SpeechSynthesisUtterance(say);
      const v = this._pickedVoice || this._pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'zh-CN';
      // 活泼感：每句随机化 pitch/rate（并叠加用户的语速设置）
      u.rate = rate;
      u.pitch = pitch;
      u.volume = 1.0;
      // 朗读期间暂停识别，避免自我回声
      const wasWake = this.mode === 'wake';
      this._stop();
      u.onend = () => { if (wasWake && this.app.cfg.wakeEnabled) this.startWake(); };
      this.synth.speak(u);
    } catch {}
  }
  stopSpeak() { try { this.synth && this.synth.cancel(); } catch {} }

  // 停止所有语音输出（MP3 + TTS）
  stopAllAudio() {
    this._stopMp3();
    this.stopSpeak();
  }

  /* ---------- 语音识别 ---------- */
  _initRec() {
    const r = new this.SR();
    r.lang = 'zh-CN'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      let finalTxt = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) finalTxt += e.results[i][0].transcript; }
      if (finalTxt) this._onFinal(finalTxt.trim());
    };
    r.onend = () => { this.running = false; // Chrome 会自动结束，需要时重启
      if (this.mode === 'wake' && this.app.cfg.wakeEnabled) { setTimeout(() => this.startWake(), 300); }
      else if (this.mode === 'listen') { /* 单次结束 */ this.mode = this.app.cfg.wakeEnabled ? 'wake' : 'off'; if (this.mode === 'wake') this.startWake(); this._state(); }
      else this._state();
    };
    r.onerror = (e) => { this.running = false;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.mode = 'off'; this.app.bubble('麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。', 'gentle'); }
      this._state();
    };
    this.rec = r;
  }
  _safeStart() {
    if (this.running || !this.rec) return;
    try { this.rec.start(); this.running = true; } catch { /* already started */ }
  }
  _stop() { if (this.rec && this.running) { try { this.rec.stop(); } catch {} } this.running = false; }

  _onFinal(text) {
    const wake = (this.app.cfg.wakeWord || '').trim().toLowerCase();
    const low = text.toLowerCase();
    if (this.mode === 'wake') {
      if (wake && low.includes(wake)) {
        const cmd = text.replace(new RegExp(this.app.cfg.wakeWord, 'ig'), '').replace(/^[，,。.!！?？\s]+/, '').trim();
        if (cmd) { this.app.handleUserText(cmd, true); }
        else { this.mode = 'listen'; this.armedUntil = Date.now() + 7000; this.app.bubble('我在，请说~', 'smile'); this._state(); }
      }
      return; // 唤醒模式下未命中唤醒词则忽略
    }
    if (this.mode === 'listen') {
      if (text) { this.app.handleUserText(text, true); }
    }
  }

  /* ---------- 对外控制 ---------- */
  // 手动点按麦克风：开始一次聆听（或停止）
  toggleListen() {
    if (!this.srSupported) { this.app.bubble('当前浏览器不支持语音输入，建议使用 Chrome / Edge。', 'gentle'); return; }
    if (this.mode === 'listen') { this.mode = this.app.cfg.wakeEnabled ? 'wake' : 'off'; this._stop(); if (this.mode === 'wake') this.startWake(); this._state(); return; }
    this.stopAllAudio();
    this.mode = 'listen'; this._stop();
    setTimeout(() => { this._safeStart(); this._state(); }, 120);
  }
  startWake() {
    if (!this.srSupported || !this.app.cfg.wakeEnabled) { return; }
    if (this.mode === 'listen') return;
    this.mode = 'wake';
    setTimeout(() => this._safeStart(), 120);
    this._state();
  }
  stopAll() { this.mode = 'off'; this._stop(); this.stopAllAudio(); this._state(); }

  refreshWake() { // 设置变更后调用
    if (this.app.cfg.wakeEnabled) this.startWake(); else if (this.mode === 'wake') { this.mode = 'off'; this._stop(); }
    this._state();
  }
  _state() { this.onState && this.onState({ mode: this.mode, listening: this.mode === 'listen', wake: this.mode === 'wake' }); }
}
