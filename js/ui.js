// ui.js — DOM 控制：定制面板、缩略图、气泡、好感度、称呼标签
import { drawCharacter } from './character.js';
import { reactForPart, replyFor, milestoneText } from './dialogue.js';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

// 将角色按 contain 方式绘制到目标 canvas
const _off=document.createElement('canvas'); _off.width=640; _off.height=1024;
const _offctx=_off.getContext('2d');
export function renderCharTo(canvas, cfg, {focusHead=false}={}){
  drawCharacter(_offctx, cfg, {breath:0.6});
  const ctx=canvas.getContext('2d'); const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  if(focusHead){ // 只取上半身（头+肩）
    const sw=560, sh=560, sx=40, sy=120;
    const scale=Math.min(W/sw,H/sh); const dw=sw*scale, dh=sh*scale;
    ctx.drawImage(_off, sx,sy,sw,sh, (W-dw)/2,(H-dh)/2, dw,dh);
  } else {
    const scale=Math.min(W/640,H/1024); const dw=640*scale, dh=1024*scale;
    ctx.drawImage(_off, 0,0,640,1024, (W-dw)/2, (H-dh)/2, dw,dh);
  }
}

/* ---------- 构建外观面板（写实六视角造型：换发型 / 发色 / 服装） ---------- */
// 说明：写实预渲染无法做「任意维度自由组合」（组合爆炸），故每个选项 = 一套完整六视角造型，
// 以其余两项默认值（齐肩·黑·日常）为基线；base 即当前默认套（assets/realistic/character/*）。
const LOOK_V='r2d5-20260803f';
const CHAR_LOOKS={
  hair:[
    {id:'base',          name:'齐肩', e:'💇‍♀️'},
    {id:'hair_short',    name:'短发', e:'✂️'},
    {id:'hair_ponytail', name:'马尾', e:'🎀'},
    {id:'hair_longcurly',name:'长卷', e:'🌀'},
  ],
  color:[
    {id:'base',         name:'黑', sw:'#2D2926'},
    {id:'color_brown',  name:'棕', sw:'#6b4a2b'},
    {id:'color_blonde', name:'金', sw:'#d9b45b'},
    {id:'color_pink',   name:'粉', sw:'#e08bb0'},
  ],
  // 服装 = 忠实还原原始 23 素材里的 15 款（assets/generated/outfit_*.png）
  outfit:[
    {id:'base',           name:'日常', e:'👚'},
    {id:'outfit_basic',   name:'背心', e:'🎽'},
    {id:'outfit_casual',  name:'卫衣', e:'🧥'},
    {id:'outfit_school',  name:'校园', e:'🎒'},
    {id:'outfit_urban',   name:'都市', e:'🏙️'},
    {id:'outfit_boxing',  name:'拳击', e:'🥊'},
    {id:'outfit_street1', name:'吊带', e:'👚'},
    {id:'outfit_street2', name:'小黑裙', e:'🖤'},
    {id:'outfit_street3', name:'阔腿裤', e:'👖'},
    {id:'outfit_street4', name:'蕾丝', e:'🤍'},
    {id:'outfit_street5', name:'运动', e:'🏃‍♀️'},
    {id:'outfit_street6', name:'露肩', e:'💗'},
    {id:'outfit_street7', name:'碎花', e:'🌸'},
    {id:'outfit_street8', name:'皮衣', e:'🧥'},
    {id:'outfit_street9', name:'长裙', e:'✨'},
    {id:'outfit_street10',name:'旗袍', e:'🏮'},
  ],
};
const lookThumb=id=> id==='base'
  ? `assets/realistic/character/preview/front.jpg?v=${LOOK_V}`
  : `assets/realistic/character/looks/${id}/preview.jpg?v=${LOOK_V}`;

export function buildAppearancePanel(app){
  const {cfg}=app;
  if(!cfg.look) cfg.look='base';
  const groups={hair:$('#hair-grid'), color:$('#hair-swatches'), outfit:$('#outfit-grid')};
  const render=()=>{
    Object.entries(CHAR_LOOKS).forEach(([g,items])=>{
      const wrap=groups[g]; if(!wrap) return; wrap.innerHTML='';
      const owns=items.some(x=>x.id===cfg.look);   // 当前造型是否属于本组
      items.forEach(it=>{
        const on = owns ? (cfg.look===it.id) : (it.id==='base');
        const btn=document.createElement('button'); btn.className='thumb'+(on?' selected':'');
        const badge = g==='color'
          ? `<span class="thumb-emoji" style="background:${it.sw};width:16px;height:16px;border-radius:50%;display:inline-block;border:1px solid rgba(0,0,0,.15)"></span>`
          : `<span class="thumb-emoji">${it.e}</span>`;
        btn.innerHTML=`<img src="${lookThumb(it.id)}" alt="${it.name}" class="thumb-img" loading="lazy">${badge}<span class="thumb-label">${it.name}</span>`;
        btn.onclick=()=>{ cfg.look=it.id; app.scene.applyLook(it.id); markApplied(app,`造型已切换：${it.name}`); app.save(); render(); };
        wrap.appendChild(btn);
      });
    });
  };
  render();
}

function refreshSelected(wrap, active){ $$('.thumb',wrap).forEach(t=>t.classList.remove('selected')); active.classList.add('selected'); }
function markApplied(app, text){ $('#mood-text').textContent=text; $('#mood-emoji').textContent='✨'; if(app.scene) app.scene.playReaction('happy'); }

/* ---------- 场景面板 ---------- */
const THEMES=[
  {id:'stage',  name:'舞台',   e:'🎭', thumb:'assets/realistic/scene/preview/stage.jpg?v=r2d5-20260803f'},
  {id:'cafe',   name:'咖啡馆', e:'☕', thumb:'assets/realistic/scene/preview/cafe.jpg?v=r2d5-20260803f'},
  {id:'bedroom',name:'卧室',   e:'🛏️', thumb:'assets/realistic/scene/preview/bedroom.jpg?v=r2d5-20260803f'},
];
export function buildScenePanel(app){
  const {cfg}=app; const tg=$('#theme-grid'); tg.innerHTML='';
  THEMES.forEach(t=>{
    const btn=document.createElement('button'); btn.className='thumb'+(cfg.theme===t.id?' selected':'');
    btn.innerHTML=`<img src="${t.thumb}" alt="${t.name}" class="thumb-img"><span class="thumb-emoji">${t.e}</span><span class="thumb-label">${t.name}</span>`;
    btn.onclick=()=>{ cfg.theme=t.id; app.scene.applyTheme(t.id); refreshSelected(tg,btn); setDayLabel(cfg.daynight); markApplied(app,`场景已切换为${t.name}`); app.save(); };
    tg.appendChild(btn);
  });
  $$('.light-btn').forEach(b=>{ b.classList.toggle('active', b.dataset.light===cfg.light); b.onclick=()=>{ cfg.light=b.dataset.light; app.scene.applyLight(b.dataset.light); $$('.light-btn').forEach(x=>x.classList.toggle('active',x===b)); markApplied(app, b.dataset.light==='cool'?'冷光已开启':'暖光已开启'); app.save(); }; });
  const dn=$('#daynight'); dn.value=cfg.daynight; setDayLabel(cfg.daynight);
  dn.oninput=(e)=>{ const v=+e.target.value; cfg.daynight=v; app.scene.setDayNight(v); setDayLabel(v); markApplied(app,'昼夜氛围已更新'); };
  dn.onchange=()=>app.save();
  // 走动开关
  const wk=$('#set-walk'); if(wk){ wk.checked=(cfg.walkEnabled!==false); wk.onchange=()=>{ cfg.walkEnabled=wk.checked; app.scene.setWalkEnabled(wk.checked); app.save(); }; }
}
function setDayLabel(v){ $('#daynight-val').textContent = v<25?'夜晚':v<45?'黄昏':v<70?'正午':'白昼'; }

/* ---------- 道具面板 ---------- */
export function buildPropsPanel(app){
  const pg=$('#prop-grid'); if(pg) pg.innerHTML='<div class="panel-tip">当前版本已禁用低模道具，避免与主场景缩略图风格冲突。</div>';
  const clear=$('#clear-props'); if(clear){ clear.style.display='none'; }
  app.scene.clearProps();
}

/* ---------- 气泡 & 称呼标签 ---------- */
let bubbleTimer=null;
export function showBubble(app, text, react){
  const layer=$('#bubble-layer');
  $$('.bubble',layer).forEach(b=>b.remove());
  const b=document.createElement('div'); b.className='bubble'; b.textContent=text; layer.appendChild(b);
  app._bubbleEl=b;
  app.scene.playTalk(); if(react) app.scene.playReaction(react);
  positionBubble(app);
  clearTimeout(bubbleTimer);
  const dur=Math.max(2600, text.length*160);
  bubbleTimer=setTimeout(()=>{ b.classList.add('fade'); setTimeout(()=>b.remove(),500); app._bubbleEl=null; }, dur);
}
export function ensureNameLabel(){
  let el=$('#name-label'); if(!el){ el=document.createElement('div'); el.id='name-label'; el.style.cssText='position:absolute;transform:translate(-50%,-100%);font-size:13px;font-weight:700;color:#fff3d6;text-shadow:0 2px 8px rgba(0,0,0,.7);padding:2px 10px;border-radius:999px;background:rgba(30,20,12,.4);border:1px solid rgba(255,224,180,.25);white-space:nowrap;pointer-events:none'; $('#bubble-layer').appendChild(el); }
  return el;
}
export function updateOverlays(app){
  if(!app.scene) return;
  const s=app.scene.headScreen();
  const nl=ensureNameLabel(); nl.textContent=app.cfg.aiName;
  nl.style.left=s.x+'px'; nl.style.top=(s.y-6)+'px'; nl.style.display=s.visible?'block':'none';
  if(app._bubbleEl) positionBubble(app);
}
function positionBubble(app){
  if(!app._bubbleEl) return; const s=app.scene.headScreen();
  app._bubbleEl.style.left=Math.min(Math.max(s.x+90,150),innerWidth-150)+'px';
  app._bubbleEl.style.top=Math.max(s.y+40,90)+'px';
}

/* ---------- 好感度 ---------- */
export function updateAffinity(app, tip){
  const {cfg}=app; const pct=Math.min(100,cfg.affinity);
  $('#affinity-num').textContent=pct; $('#affinity-fill').style.width=pct+'%';
  if(tip) $('#affinity-tip').textContent=tip;
}
export function awardAffinity(app, n, _silent){
  const {cfg}=app; const before=cfg.affinity; if(before>=100){ return; }
  cfg.affinity=Math.min(100, before+n);
  updateAffinity(app);
  // 里程碑
  for(const at of [20,50,80,100]){ if(before<at && cfg.affinity>=at){ const t=milestoneText(at,cfg); if(t){ setTimeout(()=>app.bubble(t,'happy'),400);} if(at===100){ cfg.unlocked=true; } } }
  app.save();
}

export { reactForPart, replyFor };

/* ---------- 设置面板（语音） ---------- */
export function buildSettingsPanel(app){
  const {cfg}=app;
  const srOK=app.voice&&app.voice.srSupported, ttsOK=app.voice&&app.voice.ttsSupported;
  $('#voice-support').textContent = `语音输入：${srOK?'可用':'不支持'} · 语音朗读：${ttsOK?'可用':'不支持'}（推荐 Chrome / Edge，需 HTTPS 并授权麦克风）`;
  const vo=$('#set-voiceout'); vo.checked=cfg.voiceOutput;
  vo.onchange=()=>{ cfg.voiceOutput=vo.checked; app.save(); if(vo.checked) app.voice.speak('语音朗读已开启'); else app.voice.stopSpeak(); };
  $$('.voice-btn').forEach(b=>{ b.classList.toggle('active',b.dataset.voice===cfg.voiceGender);
    b.onclick=()=>{ cfg.voiceGender=b.dataset.voice; $$('.voice-btn').forEach(x=>x.classList.toggle('active',x===b)); app.save(); app.voice.speak('你好呀，这是我现在的声音'); }; });
  const rate=$('#set-rate'); rate.value=Math.round((cfg.speechRate||1)*100); $('#rate-val').textContent=(cfg.speechRate||1).toFixed(1)+'×';
  rate.oninput=()=>{ cfg.speechRate=(+rate.value)/100; $('#rate-val').textContent=cfg.speechRate.toFixed(1)+'×'; };
  rate.onchange=()=>{ app.save(); app.voice.speak('语速调整好啦'); };
  const ww=$('#set-wakeword'); ww.value=cfg.wakeWord||cfg.aiName; ww.placeholder=cfg.aiName;
  ww.onchange=()=>{ cfg.wakeWord=(ww.value.trim()||cfg.aiName); app.save(); if(cfg.wakeEnabled) app.voice.refreshWake(); };
  const we=$('#set-wake'); we.checked=cfg.wakeEnabled;
  we.onchange=()=>{ cfg.wakeEnabled=we.checked; app.save(); app.voice.refreshWake();
    if(we.checked) app.bubble(`唤醒监听已开启，喊一声「${cfg.wakeWord||cfg.aiName}」就能叫我~`,'happy'); };
  $('#btn-reset').onclick=()=>{ if(confirm('确定重置存档并重新创建角色吗？')){ localStorage.removeItem('stage_muse_save_v1'); location.reload(); } };
}
