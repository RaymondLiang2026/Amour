// main.js — 启动与编排
import { Scene3D } from './stage2d.js?v=r2d5-20260803g';
import * as Store from './store.js';
import * as UI from './ui.js';
import { RhythmGame } from './rhythm.js';
import { Voice } from './voice.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

class App {
  constructor() { this.cfg = null; this.scene = null; this._bubbleEl = null; }

  save() { Store.save(this.cfg); }
  updateChar() { if (this.scene) { this.scene.cfg = this.cfg; this.scene.redrawCharacter(); } this.save(); }

  bubble(text, react, opts = {}) {
    UI.showBubble(this, text, react, { skipSceneReaction: !!opts.skipSceneReaction });
    if (this.voice && !opts.silentVoice) this.voice.speak(text);
  }

  // 用户输入（文字或语音）统一入口
  handleUserText(text, fromVoice) {
    if (!text) return;
    // —— 镜头缩放指令解析（对话框指令）——
    const t = text.trim();
    const zoomIn = /^(拉近|靠近|近一点|近一些|zoom in)/i.test(t);
    const zoomOut = /^(拉远|退后|远一点|远一些|zoom out)/i.test(t);
    if (zoomIn && this.scene) { this.scene.zoomBy(-0.9); this.bubble('好，我靠近一点～', 'happy'); return; }
    if (zoomOut && this.scene) { this.scene.zoomBy(0.9); this.bubble('好，我退后一点～', 'happy'); return; }

    const r = UI.replyFor(text, this.cfg);
    this.bubble(r.text, r.react);
    UI.awardAffinity(this, 1);
    $('#mood-text').textContent = fromVoice ? '正在听你说' : '和你互动中';
    $('#mood-emoji').textContent = '💗';
  }

  boot() {
    const saved = Store.load();
    const params = new URLSearchParams(location.search);
    if (saved) { this.cfg = saved; this.enterStage(); }
    else if (params.has('autostage')) {
      this.cfg = Store.defaultConfig();
      this.cfg.createdAt = Date.now();
      const th = params.get('theme');
      if (['stage', 'cafe', 'bedroom'].includes(th)) this.cfg.theme = th;
      const dn = params.get('daynight');
      if (dn !== null && !isNaN(+dn)) this.cfg.daynight = +dn;
      this.enterStage();
    } else { this.showCreation(); }
    $('#loading').classList.add('hidden');
  }

  /* ---- 创建流程 ---- */
  showCreation() {
    const cr = $('#creation');
    cr.classList.remove('hidden');
    const nameI = $('#input-name');
    const callI = $('#input-callname');
    const startB = $('#btn-start');
    const base = Store.defaultConfig();
    nameI.placeholder = base.aiName;
    callI.placeholder = base.callName;
    startB.disabled = false;
    startB.onclick = () => {
      const cfg = Store.defaultConfig();
      cfg.aiName = (nameI.value.trim()) || cfg.aiName;
      cfg.callName = (callI.value.trim()) || cfg.callName;
      cfg.wakeWord = cfg.aiName;
      cfg.createdAt = Date.now();
      this.cfg = cfg;
      this.save();
      cr.classList.add('hidden');
      this.enterStage();
      setTimeout(() => this.bubble(`我是 ${cfg.aiName}，从今往后由我陪着${cfg.callName}。`, 'wave'), 700);
    };
  }

  /* ---- 进入主场景 ---- */
  enterStage() {
    $('#hud').classList.remove('hidden');

    this.scene = new Scene3D($('#stage-root'), this.cfg, {
      onCharacterClick: (part, meta) => this.onPartClick(part, meta),
      onAutoTalk: (text, mood) => this.bubble(text, mood, { skipSceneReaction: true }),
      onChange: () => this.save(),
      onFrame: () => UI.updateOverlays(this),
    });

    UI.ensureNameLabel();
    UI.buildAppearancePanel(this);
    UI.buildScenePanel(this);
    UI.buildPropsPanel(this);
    UI.buildEmotionBar(this);

    // 语音交互
    this.voice = new Voice(this);
    this.voice.onState = (s) => {
      const m = $('#mic-btn');
      if (!m) return;
      m.classList.toggle('listening', s.listening);
      m.classList.toggle('wake', s.wake);
    };
    UI.buildSettingsPanel(this);
    if (this.cfg.wakeEnabled) this.voice.startWake();

    UI.updateAffinity(this, this.cfg.affinity >= 100 ? '好感已满 · 感谢陪伴✨' : '点击 TA 或聊天可提升好感');
    this.bindHud();
    this.setupRhythm();
  }

  onPartClick(part, meta) {
    // 舞台层点击反馈（已由 Scene3D 触发动作/emoji/短台词气泡），这里只做好感/状态更新
    if (meta && meta.silentBubble) {
      UI.awardAffinity(this, 1);
      const em = meta.emotion ? UI.emotionMeta(meta.emotion) : null;
      $('#mood-text').textContent = em ? ('表情：' + em.title) : '被你点到啦';
      $('#mood-emoji').textContent = em ? em.emoji : '✨';
      return;
    }

    const r = UI.reactForPart(part, this.cfg);
    this.bubble(r.text, r.react);
    UI.awardAffinity(this, 1);
    $('#mood-text').textContent = '和你互动中';
    $('#mood-emoji').textContent = '💗';
  }

  bindHud() {
    // 工具条 → 面板
    $$('.tool-btn').forEach(b => {
      if (b.id === 'btn-rhythm') return;
      b.onclick = () => {
        const p = b.dataset.panel;
        const panel = $('#panel-' + p);
        const opening = panel.classList.contains('hidden');
        $$('.side-panel').forEach(x => x.classList.add('hidden'));
        $$('.tool-btn').forEach(x => x.classList.remove('active'));
        if (opening) { panel.classList.remove('hidden'); b.classList.add('active'); }
      };
    });

    $$('.panel-close').forEach(c => c.onclick = () => {
      const t = c.dataset.close;
      $('#panel-' + t)?.classList.add('hidden');
      $('#rhythm')?.classList.add('hidden');
      $$('.tool-btn').forEach(x => x.classList.remove('active'));
      if (this.rhythm) this.rhythm.stop();
    });

    // 对话
    const send = () => {
      const v = $('#chat-input').value.trim();
      if (!v) return;
      $('#chat-input').value = '';
      this.handleUserText(v, false);
    };
    $('#chat-send').onclick = send;
    $('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

    // 语音输入
    $('#mic-btn').onclick = () => { this.voice.toggleListen(); };
  }

  setupRhythm() {
    this.rhythm = new RhythmGame({ stage: $('#rhythm-stage'), score: $('#rhythm-score'), combo: $('#rhythm-combo'), grade: $('#rhythm-grade') }, {
      onFinish: (res) => {
        UI.awardAffinity(this, res.affinity);
        setTimeout(() => this.bubble(`合奏得分 ${res.score}！和${this.cfg.callName}真默契~`, 'happy'), 300);
      }
    });

    $('#btn-rhythm').onclick = () => { $$('.side-panel').forEach(x => x.classList.add('hidden')); $('#rhythm').classList.remove('hidden'); };
    $('#rhythm-start').onclick = () => { this.rhythm.start(); this.scene.playReaction('happy', { withLine: false }); };
  }
}

window.addEventListener('DOMContentLoaded', () => { const app = new App(); window.__app = app; app.boot(); });
