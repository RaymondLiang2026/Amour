// ui.js — DOM 控制：定制面板、缩略图、气泡、好感度、称呼标签
import { drawCharacter, HAIR_STYLES, OUTFITS, ACCESSORIES, HAIR_SWATCHES, EYE_SWATCHES } from './character.js';
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

/* ---------- 构建外观面板 ---------- */
export function buildAppearancePanel(app){
  const {cfg}=app;
  // 发型（使用锁脸缩略图，脸部与参考图一致）
  const hg=$('#hair-grid'); hg.innerHTML='';
  HAIR_STYLES.forEach(h=>{
    const btn=document.createElement('button'); btn.className='thumb'+(cfg.hairStyle===h.id?' selected':'');
    if(h.thumb){
      const img=document.createElement('img'); img.src=h.thumb; img.alt=h.name; img.className='thumb-img'; btn.appendChild(img);
    } else {
      const cv=document.createElement('canvas'); cv.width=130; cv.height=150; btn.appendChild(cv);
      renderCharTo(cv, {...cfg, hairStyle:h.id}, {focusHead:true});
    }
    const lb=document.createElement('span'); lb.className='thumb-label'; lb.textContent=h.name; btn.appendChild(lb);
    btn.onclick=()=>{ cfg.hairStyle=h.id; cfg.assetKind='hair'; cfg.assetImage=h.image; refreshSelected(hg,btn); app.updateChar(); markApplied(app,'发型已更新'); };
    hg.appendChild(btn);
  });
  // 发色
  buildSwatches($('#hair-swatches'), HAIR_SWATCHES, cfg.hairColor, (c, item)=>{ cfg.hairColor=c; cfg.hairColorId=item?.id || ''; cfg.assetKind='hairColor'; cfg.assetImage=item?.image || ''; $('#hair-color').value=c; app.updateChar(); refreshHairThumbs(app); markApplied(app,'发色已更新'); });
  $('#hair-color').value=cfg.hairColor; $('#hair-color').oninput=(e)=>{ cfg.hairColor=e.target.value; app.updateChar(); refreshHairThumbs(app); };
  // 服装
  refreshOutfitThumbs(app);
  $('#outfit-color').value=cfg.outfitColor; $('#outfit-color').oninput=(e)=>{ cfg.outfitColor=e.target.value; app.updateChar(); refreshOutfitThumbs(app); };
  // 眼睛
  buildSwatches($('#eye-swatches'), EYE_SWATCHES, cfg.eyeColor, (c)=>{ cfg.eyeColor=c; $('#eye-color').value=c; app.updateChar(); markApplied(app,'眼睛颜色已更新'); });
  $('#eye-color').value=cfg.eyeColor; $('#eye-color').oninput=(e)=>{ cfg.eyeColor=e.target.value; app.updateChar(); };
  // 配饰
  const ag=$('#accessory-grid'); ag.innerHTML='';
  ACCESSORIES.forEach(a=>{
    const chip=document.createElement('button'); chip.className='chip'+(cfg.accessories[a.id]?' selected':'');
    chip.innerHTML=`${a.icon} ${a.name}`;
    chip.onclick=()=>{ cfg.accessories[a.id]=!cfg.accessories[a.id]; chip.classList.toggle('selected'); app.updateChar(); markApplied(app,'配饰已更新'); };
    ag.appendChild(chip);
  });
}
function refreshHairThumbs(app){ const hg=$('#hair-grid'); if(!hg) return; $$('.thumb',hg).forEach((btn,i)=>{ const cv=$('canvas',btn); if(cv) renderCharTo(cv,{...app.cfg,hairStyle:HAIR_STYLES[i].id},{focusHead:true}); }); }
function refreshOutfitThumbs(app){
  const {cfg}=app; const og=$('#outfit-grid'); og.innerHTML='';
  OUTFITS.forEach(o=>{
    const btn=document.createElement('button'); btn.className='thumb'+(cfg.outfit===o.id?' selected':'');
    if(o.image){
      const img=document.createElement('img'); img.src=o.image; img.alt=o.name; img.className='thumb-img'; btn.appendChild(img);
    } else {
      const cv=document.createElement('canvas'); cv.width=130; cv.height=150; btn.appendChild(cv);
      renderCharTo(cv, {...cfg, outfit:o.id, outfitColor:o.color}, {focusHead:false});
    }
    const lb=document.createElement('span'); lb.className='thumb-label'; lb.textContent=o.name; btn.appendChild(lb);
    btn.onclick=()=>{ cfg.outfit=o.id; cfg.outfitColor=o.color; cfg.assetKind='outfit'; cfg.assetImage=o.stage; $('#outfit-color').value=o.color; app.updateChar(); refreshOutfitThumbs(app); markApplied(app,'服装已更新'); };
    og.appendChild(btn);
  });
}
function buildSwatches(wrap, colors, active, onPick){ wrap.innerHTML=''; colors.forEach(item=>{ const c=typeof item==='string'?item:item.color; const s=document.createElement('button'); s.type='button'; s.className='swatch'+(c.toLowerCase()===String(active).toLowerCase()?' selected':''); s.style.background=c; if(item.thumb){ s.style.backgroundImage=`url("${item.thumb}")`; s.style.backgroundSize='cover'; s.style.backgroundPosition='center'; s.title=item.name; } s.onclick=()=>{ $$('.swatch',wrap).forEach(x=>x.classList.remove('selected')); s.classList.add('selected'); onPick(c,item); }; wrap.appendChild(s); }); }
function refreshSelected(wrap, active){ $$('.thumb',wrap).forEach(t=>t.classList.remove('selected')); active.classList.add('selected'); }
function markApplied(app, text){ $('#mood-text').textContent=text; $('#mood-emoji').textContent='✨'; if(app.scene) app.scene.playReaction('happy'); }

/* ---------- 场景面板 ---------- */
const THEMES=[
  {id:'stage',  name:'舞台',   e:'🎭', thumb:'assets/character/thumbs/scene_stage.png'},
  {id:'cafe',   name:'咖啡馆', e:'☕', thumb:'assets/character/thumbs/scene_cafe.png'},
  {id:'bedroom',name:'卧室',   e:'🛏️', thumb:'assets/character/thumbs/scene_bedroom.png'},
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
  for(const at of [20,50,80,100]){ if(before<at && cfg.affinity>=at){ const t=milestoneText(at,cfg); if(t){ setTimeout(()=>app.bubble(t,'happy'),400);} if(at===100){ cfg.unlocked=true; refreshOutfitThumbs(app); } } }
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
