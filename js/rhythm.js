// rhythm.js — 节奏点击小游戏：TA 哼旋律，节拍圈收缩到核心时点击得分
export class RhythmGame{
  constructor(dom, cb={}){
    this.stage=dom.stage; this.scoreEl=dom.score; this.comboEl=dom.combo; this.gradeEl=dom.grade;
    this.cb=cb; this.running=false;
    // 5 个高亮锚点（相对舞台百分比）——象征角色不同部位
    this.anchors=[{x:50,y:22,e:'🎤'},{x:24,y:50,e:'✋'},{x:76,y:50,e:'🤚'},{x:38,y:78,e:'👟'},{x:62,y:78,e:'👟'}];
  }
  start(){
    if(this.running) return;
    this.running=true; this.score=0; this.combo=0; this.maxCombo=0; this.hits=0; this.total=0;
    this.stage.innerHTML=''; this._update('—');
    this.audio=null; try{ this.actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ this.actx=null; }
    // 生成节拍序列（16 拍，BPM≈100）
    const beat=600; this.notes=[];
    for(let i=0;i<16;i++){ this.notes.push({ t: 900 + i*beat + (i%4===0?0:(Math.random()*80-40)), a: this.anchors[Math.floor(Math.random()*this.anchors.length)], done:false, node:null }); }
    this.travel=900; this.startTime=performance.now();
    this._tick();
  }
  stop(){ this.running=false; cancelAnimationFrame(this._raf); }
  _hz(f,dur=0.28){ if(!this.actx) return; const o=this.actx.createOscillator(),g=this.actx.createGain(); o.type='sine'; o.frequency.value=f; o.connect(g); g.connect(this.actx.destination); const n=this.actx.currentTime; g.gain.setValueAtTime(0.0001,n); g.gain.exponentialRampToValueAtTime(0.25,n+0.02); g.gain.exponentialRampToValueAtTime(0.0001,n+dur); o.start(n); o.stop(n+dur); }
  _spawn(note){
    const el=document.createElement('div'); el.className='beat-node';
    el.style.left=note.a.x+'%'; el.style.top=note.a.y+'%';
    el.innerHTML=`<div class="beat-ring"></div><div class="beat-core"></div><span style="position:absolute;font-size:20px">${note.a.e}</span>`;
    const ring=el.querySelector('.beat-ring');
    el.addEventListener('mousedown',(e)=>{ e.stopPropagation(); this._judge(note,el); });
    el.addEventListener('touchstart',(e)=>{ e.stopPropagation(); e.preventDefault(); this._judge(note,el); },{passive:false});
    note.node=el; note.ring=ring; this.stage.appendChild(el);
    // 哼唱音
    const scale=[392,440,494,523,587,659]; this._hz(scale[Math.floor(Math.random()*scale.length)],0.22);
  }
  _judge(note,el){
    if(note.done) return; note.done=true;
    const now=performance.now()-this.startTime; const diff=Math.abs(now-note.t);
    let grade,pts;
    if(diff<110){ grade='Perfect'; pts=100; } else if(diff<230){ grade='Good'; pts=60; } else { grade='OK'; pts=30; }
    this.hits++; this.combo++; this.maxCombo=Math.max(this.maxCombo,this.combo);
    this.score+=pts + this.combo*4;
    this._floatHit(el, grade, grade==='Perfect'?'#ffe08a':'#9fe0c0');
    el.classList.add('beat-pop'); this._hz(660,0.14);
    this._update(grade);
    setTimeout(()=>el.remove(),300);
  }
  _miss(note){ if(note.done) return; note.done=true; this.combo=0; this._update('Miss');
    if(note.node){ this._floatHit(note.node,'Miss','#e88'); note.node.remove(); } }
  _floatHit(el,txt,color){ const f=document.createElement('div'); f.className='rhythm-hit'; f.textContent=txt; f.style.color=color; f.style.left=el.style.left; f.style.top=el.style.top; this.stage.appendChild(f); setTimeout(()=>f.remove(),700); }
  _update(grade){ this.scoreEl.textContent=this.score||0; this.comboEl.textContent=this.combo||0; if(grade) this.gradeEl.textContent=grade; }
  _tick(){
    if(!this.running) return;
    const now=performance.now()-this.startTime;
    for(const n of this.notes){
      if(!n.node && now>=n.t-this.travel){ this._spawn(n); }
      if(n.node && !n.done){ const p=Math.max(0,(n.t-now)/this.travel); const s=0.5+p*1.6; n.ring.style.transform=`scale(${s})`; n.ring.style.opacity=Math.min(1,1.2-p*0.4);
        if(now>n.t+240){ this._miss(n); } }
    }
    if(now> this.notes[this.notes.length-1].t + 800){ return this._finish(); }
    this._raf=requestAnimationFrame(()=>this._tick());
  }
  _finish(){
    this.running=false;
    this.total=this.notes.length; const acc=Math.round(this.hits/this.total*100);
    let title = acc>=95?'完美合奏 ✨':acc>=75?'默契十足 🎶':acc>=50?'渐入佳境':'继续练习~';
    this.gradeEl.textContent=title;
    this.stage.innerHTML=`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
      <div style="font-size:26px;font-weight:800;color:#f2c98b">${title}</div>
      <div style="color:#e9d3b6">得分 ${this.score} · 命中 ${this.hits}/${this.total} · 最高连击 ${this.maxCombo}</div>
      <div style="color:#e9d3b6;font-size:13px">好感度 +${Math.min(15,Math.round(acc/8))}</div></div>`;
    this.cb.onFinish && this.cb.onFinish({score:this.score, acc, combo:this.maxCombo, affinity:Math.min(15,Math.round(acc/8))});
  }
}
