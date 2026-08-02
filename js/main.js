// main.js — 启动与编排
import { Scene3D } from './scene3d.js';
import * as Store from './store.js';
import * as UI from './ui.js';
import { RhythmGame } from './rhythm.js';
import { Voice } from './voice.js';

const $=(s)=>document.querySelector(s);
const $$=(s)=>[...document.querySelectorAll(s)];

class App{
  constructor(){ this.cfg=null; this.scene=null; this._bubbleEl=null; }

  save(){ Store.save(this.cfg); }
  updateChar(){ if(this.scene){ this.scene.cfg=this.cfg; this.scene.redrawCharacter(); } this.save(); }
  bubble(text, react){ UI.showBubble(this, text, react); if(this.voice) this.voice.speak(text); }

  // 用户输入（文字或语音）统一入口
  handleUserText(text, fromVoice){
    if(!text) return;
    const r=UI.replyFor(text, this.cfg);
    this.bubble(r.text, r.react);
    UI.awardAffinity(this, 1);
    $('#mood-text').textContent = fromVoice?'正在听你说':'和你互动中'; $('#mood-emoji').textContent='💗';
  }

  boot(){
    const saved=Store.load();
    const params=new URLSearchParams(location.search);
    if(saved){ this.cfg=saved; this.enterStage(); }
    else if(params.has('autostage')){ this.cfg=Store.defaultConfig(params.get('autostage')==='male'?'male':'female'); this.cfg.createdAt=Date.now(); this.enterStage(); }
    else { this.showCreation(); }
    $('#loading').classList.add('hidden');
  }

  /* ---- 创建流程 ---- */
  showCreation(){
    const cr=$('#creation'); cr.classList.remove('hidden');
    UI.drawCreationPreviews((g)=>Store.defaultConfig(g));
    let picked=null;
    const nameI=$('#input-name'), callI=$('#input-callname'), startB=$('#btn-start');
    $$('.gender-card').forEach(card=>{
      card.onclick=()=>{
        picked=card.dataset.gender;
        $$('.gender-card').forEach(c=>c.classList.remove('selected')); card.classList.add('selected');
        const d=Store.defaultConfig(picked);
        nameI.placeholder=d.aiName; callI.placeholder=d.callName;
        startB.disabled=false; $('.hint').textContent='起个名字，或直接进入';
      };
    });
    startB.onclick=()=>{
      if(!picked) return;
      const cfg=Store.defaultConfig(picked);
      cfg.aiName=(nameI.value.trim())||cfg.aiName;
      cfg.callName=(callI.value.trim())||cfg.callName;
      cfg.createdAt=Date.now();
      this.cfg=cfg; this.save();
      cr.classList.add('hidden');
      this.enterStage();
      setTimeout(()=>this.bubble(`我是 ${cfg.aiName}，从今往后由我陪着${cfg.callName}。`,'wave'),700);
    };
  }

  /* ---- 进入主场景 ---- */
  enterStage(){
    $('#hud').classList.remove('hidden');
    this.scene=new Scene3D($('#stage-root'), this.cfg, {
      onCharacterClick:(part)=>this.onPartClick(part),
      onChange:()=>this.save(),
      onFrame:()=>UI.updateOverlays(this),
    });
    UI.ensureNameLabel();
    UI.buildAppearancePanel(this);
    UI.buildScenePanel(this);
    UI.buildPropsPanel(this);
    // 语音交互
    this.voice=new Voice(this);
    this.voice.onState=(s)=>{ const m=$('#mic-btn'); if(!m) return; m.classList.toggle('listening',s.listening); m.classList.toggle('wake',s.wake); };
    UI.buildSettingsPanel(this);
    if(this.cfg.wakeEnabled) this.voice.startWake();
    UI.updateAffinity(this, this.cfg.affinity>=100?'好感已满 · 感谢陪伴✨':'点击 TA 或聊天可提升好感');
    this.bindHud();
    this.setupRhythm();
  }

  onPartClick(part){
    const r=UI.reactForPart(part, this.cfg);
    this.bubble(r.text, r.react);
    UI.awardAffinity(this, 1);
    $('#mood-text').textContent='和你互动中'; $('#mood-emoji').textContent='💗';
  }

  bindHud(){
    // 工具条 → 面板
    $$('.tool-btn').forEach(b=>{
      if(b.id==='btn-rhythm') return;
      b.onclick=()=>{
        const p=b.dataset.panel; const panel=$('#panel-'+p);
        const opening=panel.classList.contains('hidden');
        $$('.side-panel').forEach(x=>x.classList.add('hidden'));
        $$('.tool-btn').forEach(x=>x.classList.remove('active'));
        if(opening){ panel.classList.remove('hidden'); b.classList.add('active'); }
      };
    });
    $$('.panel-close').forEach(c=>c.onclick=()=>{ const t=c.dataset.close; $('#panel-'+t)?.classList.add('hidden'); $('#rhythm')?.classList.add('hidden'); $$('.tool-btn').forEach(x=>x.classList.remove('active')); if(this.rhythm) this.rhythm.stop(); });
    // 对话
    const send=()=>{ const v=$('#chat-input').value.trim(); if(!v) return; $('#chat-input').value=''; this.handleUserText(v, false); };
    $('#chat-send').onclick=send;
    $('#chat-input').addEventListener('keydown',(e)=>{ if(e.key==='Enter') send(); });
    // 语音输入
    $('#mic-btn').onclick=()=>{ this.voice.toggleListen(); };
  }

  setupRhythm(){
    this.rhythm=new RhythmGame({stage:$('#rhythm-stage'),score:$('#rhythm-score'),combo:$('#rhythm-combo'),grade:$('#rhythm-grade')},{
      onFinish:(res)=>{ UI.awardAffinity(this,res.affinity); setTimeout(()=>this.bubble(`合奏得分 ${res.score}！和${this.cfg.callName}真默契~`,'happy'),300); }
    });
    $('#btn-rhythm').onclick=()=>{ $$('.side-panel').forEach(x=>x.classList.add('hidden')); $('#rhythm').classList.remove('hidden'); };
    $('#rhythm-start').onclick=()=>{ this.rhythm.start(); this.scene.playReaction('happy'); };
  }
}

window.addEventListener('DOMContentLoaded',()=>{ const app=new App(); window.__app=app; app.boot(); });
