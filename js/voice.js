// voice.js — 浏览器原生语音交互（Web Speech API），不依赖任何外部服务
// 语音输入 SpeechRecognition + 语音输出 SpeechSynthesis + 唤醒词
export class Voice{
  constructor(app){
    this.app=app;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.SR=SR; this.srSupported=!!SR;
    this.synth = window.speechSynthesis || null;
    this.ttsSupported=!!this.synth;
    this.voices=[];
    this.mode='off';           // off | wake | listen
    this.running=false;        // 识别器是否运行中
    this.armedUntil=0;         // 听到唤醒词后进入 listen 的时间窗
    this.onState=null;         // 状态回调（更新 UI）
    if(this.ttsSupported){ this._loadVoices(); this.synth.onvoiceschanged=()=>this._loadVoices(); }
    if(this.srSupported){ this._initRec(); }
  }

  _loadVoices(){ this.voices=this.synth.getVoices()||[]; }

  /* ---------- 语音输出 ---------- */
  _pickVoice(gender){
    const zh=this.voices.filter(v=>/zh|cmn|chinese/i.test(v.lang+v.name));
    const pool = zh.length?zh:this.voices;
    if(!pool.length) return null;
    const femKey=/female|women|woman|婷|美|Mei|Ting|Xiaoxiao|Yaoyao|Huihui|Google 普通话/i;
    const maleKey=/male|man|云|Kangkang|Yunyang|Yunxi|Yunjian/i;
    let cand;
    if(gender==='female') cand=pool.find(v=>femKey.test(v.name));
    else cand=pool.find(v=>maleKey.test(v.name));
    return cand || pool[0];
  }
  speak(text){
    if(!this.ttsSupported || !this.app.cfg.voiceOutput || !text) return;
    try{
      this.synth.cancel();
      const u=new SpeechSynthesisUtterance(text.replace(/[✨🎵🎭💗🔒👗🌸☕🛏️🪴]/g,''));
      const g=this.app.cfg.voiceGender||'female';
      const v=this._pickVoice(g); if(v){ u.voice=v; u.lang=v.lang; } else u.lang='zh-CN';
      u.rate=this.app.cfg.speechRate||1.0;
      u.pitch = g==='female' ? 1.2 : 0.7;   // 无独立男/女声时以音高区分
      // 朗读期间暂停识别，避免自我回声
      const wasWake=this.mode==='wake';
      this._stop();
      u.onend=()=>{ if(wasWake && this.app.cfg.wakeEnabled) this.startWake(); };
      this.synth.speak(u);
    }catch(e){}
  }
  stopSpeak(){ try{ this.synth&&this.synth.cancel(); }catch(e){} }

  /* ---------- 语音识别 ---------- */
  _initRec(){
    const r=new this.SR();
    r.lang='zh-CN'; r.interimResults=true; r.continuous=true; r.maxAlternatives=1;
    r.onresult=(e)=>{
      let finalTxt='';
      for(let i=e.resultIndex;i<e.results.length;i++){ if(e.results[i].isFinal) finalTxt+=e.results[i][0].transcript; }
      if(finalTxt) this._onFinal(finalTxt.trim());
    };
    r.onend=()=>{ this.running=false; // Chrome 会自动结束，需要时重启
      if(this.mode==='wake' && this.app.cfg.wakeEnabled){ setTimeout(()=>this.startWake(),300); }
      else if(this.mode==='listen'){ /* 单次结束 */ this.mode = this.app.cfg.wakeEnabled?'wake':'off'; if(this.mode==='wake') this.startWake(); this._state(); }
      else this._state();
    };
    r.onerror=(e)=>{ this.running=false;
      if(e.error==='not-allowed'||e.error==='service-not-allowed'){ this.mode='off'; this.app.bubble('麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。','gentle'); }
      this._state();
    };
    this.rec=r;
  }
  _safeStart(){
    if(this.running || !this.rec) return;
    try{ this.rec.start(); this.running=true; }catch(e){ /* already started */ }
  }
  _stop(){ if(this.rec && this.running){ try{ this.rec.stop(); }catch(e){} } this.running=false; }

  _onFinal(text){
    const wake=(this.app.cfg.wakeWord||'').trim().toLowerCase();
    const low=text.toLowerCase();
    if(this.mode==='wake'){
      if(wake && low.includes(wake)){
        const cmd=text.replace(new RegExp(this.app.cfg.wakeWord,'ig'),'').replace(/^[，,。.!！?？\s]+/,'').trim();
        if(cmd){ this.app.handleUserText(cmd, true); }
        else { this.mode='listen'; this.armedUntil=Date.now()+7000; this.app.bubble('我在，请说~','smile'); this._state(); }
      }
      return; // 唤醒模式下未命中唤醒词则忽略
    }
    if(this.mode==='listen'){
      if(text){ this.app.handleUserText(text, true); }
    }
  }

  /* ---------- 对外控制 ---------- */
  // 手动点按麦克风：开始一次聆听（或停止）
  toggleListen(){
    if(!this.srSupported){ this.app.bubble('当前浏览器不支持语音输入，建议使用 Chrome / Edge。','gentle'); return; }
    if(this.mode==='listen'){ this.mode= this.app.cfg.wakeEnabled?'wake':'off'; this._stop(); if(this.mode==='wake') this.startWake(); this._state(); return; }
    this.stopSpeak();
    this.mode='listen'; this._stop();
    setTimeout(()=>{ this._safeStart(); this._state(); },120);
  }
  startWake(){
    if(!this.srSupported || !this.app.cfg.wakeEnabled){ return; }
    if(this.mode==='listen') return;
    this.mode='wake';
    setTimeout(()=>this._safeStart(),120);
    this._state();
  }
  stopAll(){ this.mode='off'; this._stop(); this.stopSpeak(); this._state(); }

  refreshWake(){ // 设置变更后调用
    if(this.app.cfg.wakeEnabled) this.startWake(); else if(this.mode==='wake'){ this.mode='off'; this._stop(); }
    this._state();
  }
  _state(){ this.onState && this.onState({mode:this.mode, listening:this.mode==='listen', wake:this.mode==='wake'}); }
}
