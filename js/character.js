// character.js — 程序化「写实3D动漫融合」角色渲染（纯 Canvas 矢量，无外部图片）
// 参考蓝本：温婉知性栗棕长发女生（图1） + 冷淡都市短发变体（图2）
// 画风：赛璐璐/半写实光影，大而通透的眼睛，立体但简化的五官。

/* ---------- 颜色工具 ---------- */
export function hexToRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};}
function rgbStr(r,g,b,a=1){return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;}
// 解析任意颜色（#hex 或 rgb/rgba(...)）为 {r,g,b,a}
function parseColor(c){
  if(typeof c!=='string') return {r:0,g:0,b:0,a:1};
  if(c[0]==='#'){ const o=hexToRgb(c); return {r:o.r,g:o.g,b:o.b,a:1}; }
  const m=c.match(/rgba?\(([^)]+)\)/i);
  if(m){ const p=m[1].split(',').map(s=>parseFloat(s)); return {r:p[0]||0,g:p[1]||0,b:p[2]||0,a:p[3]===undefined?1:p[3]}; }
  return {r:0,g:0,b:0,a:1};
}
export function shade(c,amt){const{r,g,b,a}=parseColor(c);const f=amt<0?0:255,p=Math.abs(amt);return rgbStr(r+(f-r)*p,g+(f-g)*p,b+(f-b)*p,a);}
export function mix(c1,c2,t){const a=parseColor(c1),b=parseColor(c2);return rgbStr(a.r+(b.r-a.r)*t,a.g+(b.g-a.g)*t,a.b+(b.b-a.b)*t);}
function withA(c,al){const{r,g,b}=parseColor(c);return rgbStr(r,g,b,al);}

// 柔和椭圆渐变斑（用于阴影/高光/腮红的柔和过渡）
function softBlob(ctx,x,y,rx,ry,color,alpha,rot){
  rot=rot||0; if(rx<=0||ry<=0) return;
  ctx.save();
  ctx.translate(x,y); ctx.rotate(rot); ctx.scale(rx/ry,1);
  const g=ctx.createRadialGradient(0,0,0,0,0,ry);
  g.addColorStop(0, withA(color,alpha)); g.addColorStop(1, withA(color,0));
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,ry,0,7); ctx.fill();
  ctx.restore();
}

/* 确定性伪随机（避免帧间闪烁） */
function frac(x){ return Math.abs((Math.sin(x)*43758.5453)%1); }

/* 采样控制点为折线（复刻 strand 的中点二次平滑） */
function samplePath(pts, seg){
  seg=seg||14;
  const out=[];
  const q=(p0,p1,p2,t)=>{const u=1-t;return[u*u*p0[0]+2*u*t*p1[0]+t*t*p2[0], u*u*p0[1]+2*u*t*p1[1]+t*t*p2[1]];};
  if(pts.length<2) return pts.slice();
  if(pts.length===2){ for(let s=0;s<=seg;s++){const t=s/seg;out.push([pts[0][0]+(pts[1][0]-pts[0][0])*t, pts[0][1]+(pts[1][1]-pts[0][1])*t]);} return out; }
  let start=pts[0];
  for(let i=1;i<pts.length-1;i++){
    const ctrl=pts[i];
    const end=[(pts[i][0]+pts[i+1][0])/2,(pts[i][1]+pts[i+1][1])/2];
    for(let s=0;s<seg;s++) out.push(q(start,ctrl,end,s/seg));
    start=end;
  }
  const ctrl=pts[pts.length-1];
  for(let s=0;s<=seg;s++) out.push(q(start,ctrl,ctrl,s/seg));
  return out;
}

/* 锥形发丝：沿路径由 w0 渐细到 w1（尖端），营造真实发梢 */
function taperStrand(ctx, pts, w0, w1, color, alpha){
  const sp=samplePath(pts, 14);
  if(sp.length<2) return;
  ctx.strokeStyle=withA(color,alpha); ctx.lineCap='round'; ctx.lineJoin='round';
  for(let i=0;i<sp.length-1;i++){
    const t=i/(sp.length-1);
    ctx.lineWidth=Math.max(0.4, w0+(w1-w0)*t);
    ctx.beginPath(); ctx.moveTo(sp[i][0],sp[i][1]); ctx.lineTo(sp[i+1][0],sp[i+1][1]); ctx.stroke();
  }
}

/* ---------- 预设库 ---------- */
export const HAIR_STYLES = [
  {id:'long_wavy', name:'栗棕长卷'},
  {id:'bob',       name:'齐肩短发'},
  {id:'ponytail',  name:'高马尾'},
  {id:'short',     name:'利落短发'},
];
export const OUTFITS = [
  {id:'base',    name:'基础',   color:'#FDFDFD', image:'assets/character/builtin/bi_01_base.png'},
  {id:'academy', name:'学院风', color:'#3b5a8c', image:'assets/character/builtin/bi_06_academy.png'},
  {id:'coat',    name:'都市风衣',color:'#707070', image:'assets/character/builtin/bi_07_urban.png'},
];
export const ACCESSORIES = [
  {id:'glasses', name:'眼镜', icon:'👓'},
  {id:'hairpin', name:'发饰', icon:'🌸'},
  {id:'tie',     name:'领带', icon:'👔'},
];
export const HAIR_SWATCHES = ['#2D2926','#6b4a2f','#3a2418','#12100f','#c9a25e','#8a4b3a','#b56b8f','#5566a0'];
export const EYE_SWATCHES  = ['#3E2723','#5a3a24','#7a4a2a','#3a6b5a','#2f5c8a','#6a3a6a','#8a6a2a','#455063'];

const SKIN = {base:'#f6ddc7', shadow:'#e7b79a', deep:'#d99a7e', blush:'#f0a68f', hi:'#fff4e9'};

// 女性专用肤色/质感（写实动漫，暖黄白皙）
const FSKIN = {
  base:'#F5E1D2',   // 白皙暖黄
  mid:'#EBC9B2',    // 中间调
  shadow:'#DDA88C', // 体积阴影
  deep:'#C98A6E',   // 深阴影（鼻侧/下巴下）
  blush:'#E9967A',  // 蜜桃粉腮红
  hi:'#FFF7EF',     // 高光
  pearl:'#FFFDFB',  // 珍珠白鼻梁高光
};
// 女性头发默认（可被 cfg.hairColor 覆盖）
const FHAIR = { base:'#2D2926', hi:'#A67C52', shadow:'#1A1816' };
// 女性五官颜色
const FEYE = { center:'#3E2723', edge:'#634735' };
const FLIP = '#C58B85';
const FBROW = '#4B3D33';

// 女性面部几何（统一坐标，供各绘制函数与配饰共享）
const FG = {
  cx:320,
  faceTop:210, chin:512,
  cheekW:140, cheekY:340,
  jawW:88,
  eyeY:386, eyeDX:80, eyeW:58, eyeH:32,
  browY:330,
  noseTop:372, noseTip:438,
  mouthY:470,
  neckTop:498, shoulderY:582,
};

/* ---------- 主入口 ---------- */
// ctx 假定为 640x1024 画布。cfg 见 store 默认。anim:{blink,breath,sway,mouth,react}
export function drawCharacter(ctx, cfg, anim){
  const W=640,H=1024;
  ctx.clearRect(0,0,W,H);
  const female = cfg.gender!=='male';
  const a = Object.assign({blink:0,breath:0,sway:0,mouth:0,react:null}, anim||{});

  ctx.save();
  // 呼吸：整体轻微上浮 + 肩部缩放
  const bob = Math.sin(a.breath)*4;
  ctx.translate(0, bob);

  if(female){
    // ---- 女性：高精度写实动漫渲染管线 ----
    drawBackHairF(ctx, cfg, a);
    drawBodyF(ctx, cfg, a);
    drawNeckF(ctx, cfg, a);
    drawHeadF(ctx, cfg, a);     // 肤底→阴影→高光→腮红→眉→眼→鼻→唇
    drawFrontHairF(ctx, cfg, a);
    drawAccessoriesF(ctx, cfg, a);
    drawRimLightF(ctx, cfg, a); // 夕阳橙色边缘光
  } else {
    drawBackHair(ctx, cfg, a, female);
    drawBody(ctx, cfg, a, female);
    drawNeck(ctx, female);
    drawHead(ctx, cfg, a, female);
    drawFrontHair(ctx, cfg, a, female);
    drawAccessories(ctx, cfg, a, female);
  }

  ctx.restore();
}

/* derive female hair palette from cfg.hairColor (custom colors still work) */
function femaleHair(cfg){
  const c = cfg.hairColor;
  if(!c || c.toLowerCase()==='#2d2926'){
    return {base:FHAIR.base, hi:FHAIR.hi, shadow:FHAIR.shadow};
  }
  // 由自定义颜色派生：更暗发根、暖色高光、深阴影
  return { base:c, hi:mix(shade(c,0.42),'#A67C52',0.5), shadow:shade(c,-0.45) };
}
function femaleEye(cfg){
  const c = cfg.eyeColor;
  if(!c || c.toLowerCase()==='#3e2723') return {center:FEYE.center, edge:FEYE.edge};
  return { center:shade(c,-0.18), edge:mix(c,'#634735',0.35) };
}

/* ---------- 头部与脸 ---------- */
function facePath(ctx, female){
  // 鹅蛋脸：额头略宽，下颌收拢，圆润下巴
  const cx=320, top=190, chin=482;
  const wTop = female?150:158;   // 颧骨宽
  const wJaw = female?96:118;    // 下颌宽
  ctx.beginPath();
  ctx.moveTo(cx-wTop, 300);
  // 额头
  ctx.bezierCurveTo(cx-wTop, 300-70, cx-70, top, cx, top);
  ctx.bezierCurveTo(cx+70, top, cx+wTop, 300-70, cx+wTop, 300);
  // 颧骨 -> 下颌
  ctx.bezierCurveTo(cx+wTop, 372, cx+wJaw+14, 420, cx+wJaw, 442);
  // 下巴
  ctx.bezierCurveTo(cx+wJaw-6, 470, cx+40, chin, cx, chin);
  ctx.bezierCurveTo(cx-40, chin, cx-wJaw+6, 470, cx-wJaw, 442);
  ctx.bezierCurveTo(cx-wJaw-14, 420, cx-wTop, 372, cx-wTop, 300);
  ctx.closePath();
}

function drawHead(ctx, cfg, a, female){
  const cx=320;
  // 基础肤色
  ctx.save();
  facePath(ctx, female);
  const g=ctx.createLinearGradient(cx-140,190,cx+150,482);
  g.addColorStop(0, SKIN.hi); g.addColorStop(.35, SKIN.base); g.addColorStop(1, SKIN.shadow);
  ctx.fillStyle=g; ctx.fill();
  ctx.clip();

  // 侧面立体阴影（光源左上 → 右下渐暗，克制）
  const sh=ctx.createLinearGradient(cx-10,300,cx+150,460);
  sh.addColorStop(0,'rgba(0,0,0,0)'); sh.addColorStop(.55,'rgba(0,0,0,0)'); sh.addColorStop(1, withA(SKIN.deep,.3));
  ctx.fillStyle=sh; ctx.fillRect(cx-160,180,340,320);
  // 额头受光
  const fh=ctx.createRadialGradient(cx-20,250,10,cx-20,250,150);
  fh.addColorStop(0, withA(SKIN.hi,.7)); fh.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=fh; ctx.fillRect(cx-160,180,340,220);
  // 下颌收拢阴影（置于下颌两侧，避免像黑眼圈）
  ctx.fillStyle=withA(SKIN.deep,.2);
  ctx.beginPath(); ctx.ellipse(cx-124,428,20,42,-0.25,0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx+124,428,20,42,0.25,0,7); ctx.fill();
  // 鼻底/人中下方微阴影
  ctx.fillStyle=withA(SKIN.shadow,.4);
  ctx.beginPath(); ctx.ellipse(cx,432,26,11,0,0,7); ctx.fill();
  // 腮红
  const blush=female?.32:.16;
  for(const s of [-1,1]){
    const bg=ctx.createRadialGradient(cx+s*80,406,4,cx+s*80,406,40);
    bg.addColorStop(0, withA(SKIN.blush,blush)); bg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=bg; ctx.fillRect(cx+s*72-50,350,100,100);
  }
  ctx.restore();

  // 脸部轮廓描线（柔和）
  ctx.save(); facePath(ctx,female);
  ctx.lineWidth=2.2; ctx.strokeStyle=withA('#b07a5c',.55); ctx.stroke();
  ctx.restore();

  // 耳朵
  drawEars(ctx, female);
  // 五官
  drawBrows(ctx, cfg, female);
  drawEyes(ctx, cfg, a, female);
  drawNose(ctx, female);
  drawMouth(ctx, a, female);
}

function drawEars(ctx, female){
  const cx=320;
  for(const s of[-1,1]){
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx+s*150,372,20,34,s*0.15,0,7);
    ctx.fillStyle=SKIN.base; ctx.fill();
    ctx.fillStyle=withA(SKIN.deep,.4);
    ctx.beginPath(); ctx.ellipse(cx+s*152,376,9,18,s*0.15,0,7); ctx.fill();
    ctx.restore();
  }
}

function drawBrows(ctx, cfg, female){
  const cx=320, y=312;
  const col = mix(cfg.hairColor||'#6b4a2f','#4a3528',.3);
  ctx.strokeStyle=col; ctx.lineCap='round'; ctx.lineJoin='round';
  for(const s of[-1,1]){
    // 眉头（内、细） → 眉峰（略高） → 眉尾（收细，柔和下垂）
    ctx.save();
    ctx.lineWidth=female?5:6.5;
    ctx.beginPath();
    ctx.moveTo(cx+s*38, y+8);
    ctx.quadraticCurveTo(cx+s*70, y-6, cx+s*100, y+2);
    ctx.stroke();
    // 眉尾细梢
    ctx.lineWidth=female?2.5:3.5;
    ctx.beginPath();
    ctx.moveTo(cx+s*100, y+2);
    ctx.quadraticCurveTo(cx+s*112, y+5, cx+s*120, y+10);
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------- 眼睛（核心质感） ---------- */
function drawEyes(ctx, cfg, a, female){
  const cx=320, ey=372;
  const dx = female?70:66;       // 双眼间距的一半
  const ew = female?52:46;       // 眼宽
  const eh = female?36:29;       // 眼高
  const eye = cfg.eyeColor||'#5a3a24';
  const open = 1 - a.blink;

  for(const s of[-1,1]){
    const gx=cx+s*dx;
    ctx.save();
    // 眼形路径（外眼角略上扬）
    const path=()=>{
      ctx.beginPath();
      ctx.moveTo(gx-ew*s, ey+2);
      ctx.bezierCurveTo(gx-ew*.4*s, ey-eh*open, gx+ew*.4*s, ey-eh*open*.9, gx+ew*s, ey-eh*.28*open);
      ctx.bezierCurveTo(gx+ew*.5*s, ey+eh*open*.9, gx-ew*.4*s, ey+eh*open*.95, gx-ew*s, ey+2);
      ctx.closePath();
    };
    // 眼白
    path();
    const sg=ctx.createLinearGradient(0,ey-eh,0,ey+eh);
    sg.addColorStop(0,'#efe6df'); sg.addColorStop(1,'#ffffff');
    ctx.fillStyle=sg; ctx.fill();
    // 眼白上方投影
    ctx.save(); path(); ctx.clip();
    ctx.fillStyle='rgba(120,90,80,.22)';
    ctx.fillRect(gx-ew,ey-eh, ew*2, eh*open*0.9);
    ctx.restore();

    if(open>0.15){
      // 虹膜
      const ir=eh*0.98;
      const iy=ey-1;
      ctx.save(); path(); ctx.clip();
      // 虹膜渐变（上暗下亮，通透感）
      const ig=ctx.createRadialGradient(gx, iy+ir*.3, ir*.15, gx, iy, ir);
      ig.addColorStop(0, shade(eye,-0.05));
      ig.addColorStop(.45, eye);
      ig.addColorStop(.8, shade(eye,0.28));
      ig.addColorStop(1, shade(eye,-0.35));
      ctx.beginPath(); ctx.arc(gx,iy,ir,0,7); ctx.fillStyle=ig; ctx.fill();
      // 虹膜底部辉光
      const bl=ctx.createRadialGradient(gx,iy+ir*.55,2,gx,iy+ir*.55,ir*.7);
      bl.addColorStop(0, withA(shade(eye,.5),.9)); bl.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=bl; ctx.beginPath(); ctx.arc(gx,iy,ir,0,7); ctx.fill();
      // 放射纹理
      ctx.strokeStyle=withA(shade(eye,-.3),.5); ctx.lineWidth=1.4;
      for(let i=0;i<12;i++){const ang=i/12*Math.PI*2;ctx.beginPath();ctx.moveTo(gx+Math.cos(ang)*ir*.28,iy+Math.sin(ang)*ir*.28);ctx.lineTo(gx+Math.cos(ang)*ir*.85,iy+Math.sin(ang)*ir*.85);ctx.stroke();}
      // 瞳孔
      ctx.fillStyle='#241812'; ctx.beginPath(); ctx.arc(gx,iy,ir*.42,0,7); ctx.fill();
      // 高光（大 + 小）
      ctx.fillStyle='rgba(255,255,255,.95)';
      ctx.beginPath(); ctx.ellipse(gx-ir*.32, iy-ir*.4, ir*.26, ir*.32, -0.4,0,7); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.arc(gx+ir*.34, iy+ir*.34, ir*.14,0,7); ctx.fill();
      ctx.restore();
    }

    // 上眼线（睫毛，外角加粗）
    path();
    ctx.lineWidth=0; 
    ctx.beginPath();
    ctx.moveTo(gx-ew*s, ey+2);
    ctx.bezierCurveTo(gx-ew*.4*s, ey-eh*open, gx+ew*.4*s, ey-eh*open*.9, gx+ew*s, ey-eh*.28*open);
    ctx.lineWidth=5.2; ctx.lineCap='round'; ctx.strokeStyle='#3a2622'; ctx.stroke();
    // 外眼角睫毛
    ctx.lineWidth=3; 
    ctx.beginPath();
    ctx.moveTo(gx+ew*s, ey-eh*.28*open);
    ctx.quadraticCurveTo(gx+ew*1.18*s, ey-eh*.55*open, gx+ew*1.32*s, ey-eh*.42*open);
    ctx.stroke();
    // 双眼皮线
    ctx.lineWidth=1.6; ctx.strokeStyle=withA('#c98f74',.7);
    ctx.beginPath();
    ctx.moveTo(gx-ew*.7*s, ey-eh*.2);
    ctx.bezierCurveTo(gx-ew*.3*s, ey-eh*open-6, gx+ew*.35*s, ey-eh*open*.9-5, gx+ew*.82*s, ey-eh*.35*open);
    ctx.stroke();
    // 下睫线（浅）
    ctx.lineWidth=1.4; ctx.strokeStyle=withA('#a5745c',.5);
    ctx.beginPath();
    ctx.moveTo(gx-ew*.75*s, ey+4);
    ctx.quadraticCurveTo(gx, ey+eh*open*.72, gx+ew*.7*s, ey+2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawNose(ctx, female){
  const cx=320;
  // 鼻梁高光
  ctx.strokeStyle=withA(SKIN.hi,.5); ctx.lineWidth=female?3:4; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx-2,388); ctx.lineTo(cx-4,410); ctx.stroke();
  // 鼻头/鼻翼阴影
  ctx.strokeStyle=withA(SKIN.deep,.45); ctx.lineWidth=2.6;
  ctx.beginPath(); ctx.moveTo(cx+5,406); ctx.quadraticCurveTo(cx+11,418, cx+2,424); ctx.stroke();
  ctx.fillStyle=withA(SKIN.deep,.32);
  ctx.beginPath(); ctx.arc(cx+8,420,3,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx-8,420,2.6,0,7); ctx.fill();
}

function drawMouth(ctx, a, female){
  const cx=320, y=452;
  const open = a.mouth*16;
  const w = female?26:30;
  // 唇色
  const lip = female?'#d98a7e':'#c98274';
  // 上唇线
  ctx.strokeStyle=withA('#b06858',.8); ctx.lineWidth=2.4; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(cx-w, y+4);
  ctx.quadraticCurveTo(cx-w*.45, y+2, cx, y);
  ctx.quadraticCurveTo(cx+w*.45, y+2, cx+w, y+4);
  ctx.stroke();
  // 嘴角轻微上扬（柔和微笑）
  ctx.lineWidth=1.6;
  for(const s of[-1,1]){ ctx.beginPath(); ctx.moveTo(cx+s*w, y+4); ctx.quadraticCurveTo(cx+s*(w+4), y+1, cx+s*(w+7), y-2); ctx.stroke(); }
  if(open>1){
    // 张口
    ctx.fillStyle='#8a4a44';
    ctx.beginPath(); ctx.moveTo(cx-w*.7,y+1); ctx.quadraticCurveTo(cx,y+open, cx+w*.7,y+1); ctx.quadraticCurveTo(cx,y+open*.4,cx-w*.7,y+1); ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.moveTo(cx-w*.6,y+1); ctx.quadraticCurveTo(cx,y+4,cx+w*.6,y+1); ctx.quadraticCurveTo(cx,y-1,cx-w*.6,y+1); ctx.fill();
  }
  // 下唇（高光）
  const lg=ctx.createLinearGradient(0,y+2,0,y+13);
  lg.addColorStop(0, withA(lip,.75)); lg.addColorStop(1, withA(lip,.35));
  ctx.fillStyle=lg;
  ctx.beginPath(); ctx.moveTo(cx-w*.8,y+2+open*.2); ctx.quadraticCurveTo(cx,y+12+open, cx+w*.8,y+2+open*.2); ctx.quadraticCurveTo(cx,y+7+open*.3,cx-w*.8,y+2+open*.2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.ellipse(cx-4,y+7,6,2.2,0,0,7); ctx.fill();
}

/* ---------- 颈 / 身体 ---------- */
function drawNeck(ctx, female){
  const cx=320;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx-34,470); ctx.lineTo(cx-40,560); ctx.lineTo(cx+40,560); ctx.lineTo(cx+34,470);
  ctx.closePath();
  ctx.fillStyle=SKIN.base; ctx.fill();
  // 颈部阴影
  ctx.fillStyle=withA(SKIN.deep,.5);
  ctx.beginPath(); ctx.moveTo(cx-40,478); ctx.quadraticCurveTo(cx,514,cx+40,478); ctx.lineTo(cx+40,470); ctx.lineTo(cx-40,470); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBody(ctx, cfg, a, female){
  const cx=320;
  const outfit = cfg.outfit||'casual';
  const col = cfg.outfitColor || (OUTFITS.find(o=>o.id===outfit)||{}).color || '#f3ece1';
  const breathW = 1 + Math.sin(a.breath)*0.012;
  ctx.save();
  ctx.translate(cx,0); ctx.scale(breathW,1); ctx.translate(-cx,0);

  // 肩/躯干剪影
  const shoulderY=560, shoulderW=female?196:224, bottom=1024;
  ctx.beginPath();
  ctx.moveTo(cx-shoulderW, bottom);
  ctx.bezierCurveTo(cx-shoulderW, 640, cx-shoulderW*.9, shoulderY+8, cx-64, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY-6, cx+64, shoulderY);
  ctx.bezierCurveTo(cx+shoulderW*.9, shoulderY+8, cx+shoulderW, 640, cx+shoulderW, bottom);
  ctx.closePath();
  const bg=ctx.createLinearGradient(cx-shoulderW,shoulderY,cx+shoulderW,bottom);
  bg.addColorStop(0, shade(col,.12)); bg.addColorStop(.5, col); bg.addColorStop(1, shade(col,-0.22));
  ctx.fillStyle=bg; ctx.fill();

  // 布料阴影
  ctx.save(); 
  ctx.beginPath();
  ctx.moveTo(cx-shoulderW, bottom);
  ctx.bezierCurveTo(cx-shoulderW, 640, cx-shoulderW*.9, shoulderY+8, cx-64, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY-6, cx+64, shoulderY);
  ctx.bezierCurveTo(cx+shoulderW*.9, shoulderY+8, cx+shoulderW, 640, cx+shoulderW, bottom);
  ctx.closePath(); ctx.clip();
  // 中缝阴影
  ctx.fillStyle='rgba(0,0,0,.12)';
  ctx.fillRect(cx-14,shoulderY,28,bottom);
  // 侧面暗部
  const sd=ctx.createLinearGradient(cx+40,0,cx+shoulderW,0);
  sd.addColorStop(0,'rgba(0,0,0,0)'); sd.addColorStop(1,'rgba(0,0,0,.28)');
  ctx.fillStyle=sd; ctx.fillRect(cx+40,shoulderY,shoulderW,bottom);
  // 领口/服装细节
  drawOutfitDetail(ctx, outfit, col, female, shoulderY);
  ctx.restore();
  ctx.restore();
}

function drawOutfitDetail(ctx, outfit, col, female, sy){
  const cx=320;
  const dark=shade(col,-0.32), light=shade(col,.22);
  if(outfit==='academy'){
    // 学院风：翻领 + 领结/领带 + 双排扣
    ctx.fillStyle=light;
    ctx.beginPath(); ctx.moveTo(cx,sy+8); ctx.lineTo(cx-70,sy+30); ctx.lineTo(cx-40,sy+120); ctx.lineTo(cx,sy+60); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx,sy+8); ctx.lineTo(cx+70,sy+30); ctx.lineTo(cx+40,sy+120); ctx.lineTo(cx,sy+60); ctx.closePath(); ctx.fill();
    // 衬衫内衬
    ctx.fillStyle='#f4efe6';
    ctx.beginPath(); ctx.moveTo(cx-34,sy+18);ctx.lineTo(cx,sy+64);ctx.lineTo(cx+34,sy+18);ctx.lineTo(cx+14,sy+150);ctx.lineTo(cx-14,sy+150);ctx.closePath();ctx.fill();
    // 纽扣
    ctx.fillStyle=dark;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(cx,sy+120+i*60,5,0,7);ctx.fill();}
  } else if(outfit==='formal'){
    // 正装：西装翻领 + 衬衫
    ctx.fillStyle='#f2eee7';
    ctx.beginPath(); ctx.moveTo(cx-30,sy+16); ctx.lineTo(cx,sy+70); ctx.lineTo(cx+30,sy+16); ctx.lineTo(cx+18,sy+220);ctx.lineTo(cx-18,sy+220);ctx.closePath(); ctx.fill();
    ctx.fillStyle=dark;
    ctx.beginPath(); ctx.moveTo(cx-64,sy+22);ctx.lineTo(cx-20,sy+40);ctx.lineTo(cx-46,sy+150);ctx.lineTo(cx-70,sy+120);ctx.closePath();ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx+64,sy+22);ctx.lineTo(cx+20,sy+40);ctx.lineTo(cx+46,sy+150);ctx.lineTo(cx+70,sy+120);ctx.closePath();ctx.fill();
  } else if(outfit==='coat'){
    // 都市风衣：翻领 + 前襟开合 + 腰带
    ctx.fillStyle=shade(col,-0.14);
    ctx.beginPath(); ctx.moveTo(cx-58,sy+20);ctx.lineTo(cx-18,sy+52);ctx.lineTo(cx-30,sy+300);ctx.lineTo(cx-90,sy+300);ctx.lineTo(cx-96,sy+120);ctx.closePath();ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx+58,sy+20);ctx.lineTo(cx+18,sy+52);ctx.lineTo(cx+30,sy+300);ctx.lineTo(cx+90,sy+300);ctx.lineTo(cx+96,sy+120);ctx.closePath();ctx.fill();
    // 黑色内搭
    ctx.fillStyle='#2b2b30';
    ctx.beginPath(); ctx.moveTo(cx-24,sy+40);ctx.lineTo(cx,sy+70);ctx.lineTo(cx+24,sy+40);ctx.lineTo(cx+16,sy+300);ctx.lineTo(cx-16,sy+300);ctx.closePath();ctx.fill();
    // 腰带
    ctx.fillStyle=shade(col,-0.4); ctx.fillRect(cx-96,sy+230,192,26);
  } else {
    // 休闲：简约圆领 + 柔和褶皱
    ctx.fillStyle=shade(col,-0.12);
    ctx.beginPath(); ctx.moveTo(cx-46,sy+8); ctx.quadraticCurveTo(cx,sy+58,cx+46,sy+8); ctx.lineTo(cx+40,sy+22);ctx.quadraticCurveTo(cx,sy+66,cx-40,sy+22);ctx.closePath(); ctx.fill();
    ctx.strokeStyle=shade(col,-0.2); ctx.lineWidth=3;
    for(const x of[-60,0,70]){ctx.beginPath();ctx.moveTo(cx+x,sy+120);ctx.quadraticCurveTo(cx+x+10,sy+220,cx+x,sy+320);ctx.stroke();}
  }
}

/* ---------- 头发 ---------- */
function drawBackHair(ctx, cfg, a, female){
  const cx=320, sway=Math.sin(a.sway)*10;
  const style=cfg.hairStyle||'long_wavy';
  const col=cfg.hairColor||'#6b4a2f';
  const g=ctx.createLinearGradient(0,180,0,900);
  g.addColorStop(0, shade(col,.14)); g.addColorStop(.4, col); g.addColorStop(1, shade(col,-0.3));
  ctx.fillStyle=g;

  if(style==='short'){
    ctx.beginPath(); ctx.moveTo(cx-158,300);
    ctx.bezierCurveTo(cx-176,190,cx-90,120,cx,120);
    ctx.bezierCurveTo(cx+90,120,cx+176,190,cx+158,300);
    ctx.bezierCurveTo(cx+150,360,cx+150,380,cx+140,400);
    ctx.lineTo(cx+120,360); ctx.lineTo(cx-120,360); ctx.lineTo(cx-140,400);
    ctx.bezierCurveTo(cx-150,380,cx-150,360,cx-158,300); ctx.closePath(); ctx.fill();
    return;
  }
  if(style==='bob'){
    // 齐肩内扣
    ctx.beginPath(); ctx.moveTo(cx-168,300);
    ctx.bezierCurveTo(cx-186,180,cx-96,116,cx,116);
    ctx.bezierCurveTo(cx+96,116,cx+186,180,cx+168,300);
    ctx.bezierCurveTo(cx+178,430,cx+150,560,cx+120+sway,610);
    ctx.bezierCurveTo(cx+90,600,cx+60,596,cx,596);
    ctx.bezierCurveTo(cx-60,596,cx-90,600,cx-120-sway,610);
    ctx.bezierCurveTo(cx-150,560,cx-178,430,cx-168,300); ctx.closePath(); ctx.fill();
    return;
  }
  if(style==='ponytail'){
    // 后脑 + 侧马尾
    ctx.beginPath(); ctx.moveTo(cx-158,300);
    ctx.bezierCurveTo(cx-176,180,cx-90,116,cx,116);
    ctx.bezierCurveTo(cx+90,116,cx+176,180,cx+158,300);
    ctx.lineTo(cx+150,420); ctx.lineTo(cx-150,420); ctx.closePath(); ctx.fill();
    // 马尾（右侧垂落）
    ctx.beginPath(); ctx.moveTo(cx+120,210);
    ctx.bezierCurveTo(cx+230,260,cx+250+sway,460,cx+210+sway,700);
    ctx.bezierCurveTo(cx+200+sway,760,cx+170,760,cx+150,700);
    ctx.bezierCurveTo(cx+150,500,cx+120,340,cx+90,240); ctx.closePath(); ctx.fill();
    return;
  }
  // long_wavy 默认：飘逸长卷发
  ctx.beginPath(); ctx.moveTo(cx-176,300);
  ctx.bezierCurveTo(cx-198,170,cx-100,110,cx,110);
  ctx.bezierCurveTo(cx+100,110,cx+198,170,cx+176,300);
  ctx.bezierCurveTo(cx+210,460,cx+196+sway,640,cx+168+sway,820);
  ctx.bezierCurveTo(cx+150+sway,900,cx+120,905,cx+100,860);
  ctx.bezierCurveTo(cx+120,700,cx+96,520,cx,500);
  ctx.bezierCurveTo(cx-96,520,cx-120,700,cx-100-sway,860);
  ctx.bezierCurveTo(cx-120-sway,905,cx-150-sway,900,cx-168-sway,820);
  ctx.bezierCurveTo(cx-196,640,cx-210,460,cx-176,300); ctx.closePath(); ctx.fill();
  // 发丝分束高光
  ctx.strokeStyle=withA(shade(col,.4),.5); ctx.lineWidth=4;
  for(const s of[-1,1]){ctx.beginPath();ctx.moveTo(cx+s*90,320);ctx.bezierCurveTo(cx+s*150,480,cx+s*140+sway*s,660,cx+s*120+sway*s,800);ctx.stroke();}
}

function drawFrontHair(ctx, cfg, a, female){
  const cx=320, sway=Math.sin(a.sway)*4;
  const style=cfg.hairStyle||'long_wavy';
  const col=cfg.hairColor||'#6b4a2f';
  const g=ctx.createLinearGradient(0,150,0,420);
  g.addColorStop(0, shade(col,.2)); g.addColorStop(1, shade(col,-0.12));
  ctx.fillStyle=g;

  // 顶盖（覆盖发际线）
  ctx.beginPath();
  ctx.moveTo(cx-160,308);
  ctx.bezierCurveTo(cx-180,180,cx-96,124,cx,124);
  ctx.bezierCurveTo(cx+96,124,cx+180,180,cx+160,308);
  ctx.bezierCurveTo(cx+150,250,cx+120,214,cx+70,208);
  // 刘海底缘（侧分）
  if(style==='short'){
    ctx.bezierCurveTo(cx+60,250,cx+30,270,cx+6,260);
    ctx.bezierCurveTo(cx-20,300,cx-70,300,cx-96,262);
    ctx.bezierCurveTo(cx-120,224,cx-150,250,cx-160,308);
  } else {
    // 侧分斜刘海（左多右少）
    ctx.bezierCurveTo(cx+70,300,cx+30,320,cx-4,300);
    ctx.bezierCurveTo(cx-40,340,cx-96,338,cx-124,286);
    ctx.bezierCurveTo(cx-140,244,cx-152,252,cx-160,308);
  }
  ctx.closePath(); ctx.fill();

  // 侧分缝高光
  ctx.strokeStyle=withA(shade(col,.5),.6); ctx.lineWidth=5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx+30,150); ctx.bezierCurveTo(cx+20,200,cx-6,220,cx-20,250); ctx.stroke();
  // 顶部整体光泽带（光泽感强）
  ctx.save();
  ctx.beginPath(); ctx.moveTo(cx-160,308); ctx.bezierCurveTo(cx-180,180,cx-96,124,cx,124); ctx.bezierCurveTo(cx+96,124,cx+180,180,cx+160,308); ctx.lineTo(cx+160,150);ctx.lineTo(cx-160,150);ctx.closePath(); ctx.clip();
  const gl=ctx.createLinearGradient(0,180,0,250);
  gl.addColorStop(0,'rgba(0,0,0,0)'); gl.addColorStop(.5, withA(shade(col,.55),.55)); gl.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gl; ctx.fillRect(cx-160,170,320,90);
  ctx.restore();

  // 面颊侧发（面部框住感）
  ctx.fillStyle=g;
  const sideLen = style==='short'?300:(style==='bob'?560:640);
  for(const s of[-1,1]){
    ctx.beginPath();
    ctx.moveTo(cx+s*150,300);
    ctx.bezierCurveTo(cx+s*168,360,cx+s*150,420,cx+s*138,460);
    ctx.bezierCurveTo(cx+s*150+ (s>0?sway:-sway), sideLen*.7, cx+s*130, sideLen*.9, cx+s*112, sideLen);
    ctx.bezierCurveTo(cx+s*104, sideLen-30, cx+s*112, 440, cx+s*118,420);
    ctx.bezierCurveTo(cx+s*128,380,cx+s*130,340,cx+s*120,300);
    ctx.closePath(); ctx.fill();
  }
  // 几缕碎发
  ctx.strokeStyle=withA(shade(col,-.1),.9); ctx.lineWidth=6; ctx.lineCap='round';
  for(const s of[-1,1]){ctx.beginPath();ctx.moveTo(cx+s*40,180);ctx.quadraticCurveTo(cx+s*70,250,cx+s*52,300);ctx.stroke();}
}

/* ---------- 配饰 ---------- */
function drawAccessories(ctx, cfg, a, female){
  const cx=320, ey=372;
  const acc=cfg.accessories||{};
  if(acc.glasses){
    ctx.strokeStyle='rgba(40,30,26,.85)'; ctx.lineWidth=4;
    const dx=female?70:66, ew=female?52:46, eh=female?36:29;
    for(const s of[-1,1]){ctx.beginPath();ctx.roundRect?ctx.roundRect(cx+s*dx-ew-4,ey-eh-4,(ew+4)*2*0.5+ew*0.5,(eh+8)*1.4,14):ctx.rect(cx+s*dx-ew-4,ey-eh-6,ew*1.9,eh*2.2);ctx.stroke();}
    ctx.beginPath(); ctx.moveTo(cx-16,ey-6); ctx.lineTo(cx+16,ey-6); ctx.stroke();
    // 镜片反光
    ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=3;
    for(const s of[-1,1]){ctx.beginPath();ctx.moveTo(cx+s*dx-ew*0.6,ey-eh*0.5);ctx.lineTo(cx+s*dx-ew*0.1,ey+eh*0.3);ctx.stroke();}
  }
  if(acc.hairpin){
    // 左侧花朵发饰
    const px=cx-118, py=250;
    for(let i=0;i<5;i++){const ang=i/5*Math.PI*2;ctx.fillStyle=female?'#e58aa2':'#7fa9d8';ctx.beginPath();ctx.ellipse(px+Math.cos(ang)*14,py+Math.sin(ang)*14,10,15,ang,0,7);ctx.fill();}
    ctx.fillStyle='#ffd98a'; ctx.beginPath(); ctx.arc(px,py,8,0,7); ctx.fill();
  }
  if(acc.tie){
    const sy=560;
    ctx.fillStyle='#8a2a35';
    ctx.beginPath(); ctx.moveTo(cx-14,sy+30);ctx.lineTo(cx+14,sy+30);ctx.lineTo(cx+8,sy+46);ctx.lineTo(cx-8,sy+46);ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx-10,sy+48);ctx.lineTo(cx+10,sy+48);ctx.lineTo(cx+20,sy+150);ctx.lineTo(cx,sy+176);ctx.lineTo(cx-20,sy+150);ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.15)';ctx.lineWidth=3;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(cx-16+i*8,sy+60);ctx.lineTo(cx-24+i*8,sy+120);ctx.stroke();}
  }
}

/* ================================================================
   女性专用高精度渲染管线（写实动漫）
   ================================================================ */

/* 鹅蛋脸路径 */
function facePathF(ctx){
  const cx=FG.cx, top=FG.faceTop, chin=FG.chin, cw=FG.cheekW, cy=FG.cheekY, jw=FG.jawW;
  ctx.beginPath();
  ctx.moveTo(cx-cw, cy);
  ctx.bezierCurveTo(cx-cw, top+30, cx-80, top, cx, top);
  ctx.bezierCurveTo(cx+80, top, cx+cw, top+30, cx+cw, cy);
  ctx.bezierCurveTo(cx+cw-2, cy+58, cx+jw+34, cy+98, cx+jw, cy+130);
  ctx.bezierCurveTo(cx+jw-8, chin-38, cx+38, chin, cx, chin);
  ctx.bezierCurveTo(cx-38, chin, cx-jw+8, chin-38, cx-jw, cy+130);
  ctx.bezierCurveTo(cx-jw-34, cy+98, cx-cw+2, cy+58, cx-cw, cy);
  ctx.closePath();
}

function drawEarsF(ctx){
  const cx=FG.cx, y=FG.cheekY+38;
  for(const s of[-1,1]){
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx+s*(FG.cheekW-6), y, 17, 29, s*0.16, 0,7);
    ctx.fillStyle=FSKIN.base; ctx.fill();
    ctx.fillStyle=withA(FSKIN.deep,.38);
    ctx.beginPath(); ctx.ellipse(cx+s*(FG.cheekW-4), y+2, 7, 14, s*0.16,0,7); ctx.fill();
    ctx.restore();
  }
}

function drawHeadF(ctx, cfg, a){
  const cx=FG.cx;
  drawEarsF(ctx);

  // ---- 1. 肤色基底 ----
  ctx.save();
  facePathF(ctx);
  const g=ctx.createLinearGradient(cx-120,FG.faceTop, cx+140, FG.chin);
  g.addColorStop(0, FSKIN.hi);
  g.addColorStop(.42, FSKIN.base);
  g.addColorStop(1, FSKIN.mid);
  ctx.fillStyle=g; ctx.fill();
  ctx.clip(); // 后续脸部内容裁剪在脸内

  // ---- 2. 形体阴影（光源左上，右下渐暗，塑造球形体积） ----
  // 主形体渐变阴影：右侧 + 下颌逐渐加深
  const form=ctx.createLinearGradient(cx-70,FG.faceTop, cx+150, FG.chin+16);
  form.addColorStop(0,'rgba(0,0,0,0)');
  form.addColorStop(.44,'rgba(0,0,0,0)');
  form.addColorStop(.76, withA(FSKIN.shadow,.30));
  form.addColorStop(1, withA(FSKIN.deep,.44));
  ctx.fillStyle=form; ctx.fillRect(cx-160,FG.faceTop-10, 340, 440);
  // 底部（下颌→下巴）向上收的暗，托起体积
  const low=ctx.createLinearGradient(0,FG.chin-90,0,FG.chin+8);
  low.addColorStop(0,'rgba(0,0,0,0)'); low.addColorStop(1, withA(FSKIN.deep,.34));
  ctx.fillStyle=low; ctx.fillRect(cx-150,FG.chin-90,300,110);
  // 右脸颊 → 下颌线 AO
  softBlob(ctx, cx+98, FG.cheekY+58, 44, 66, FSKIN.shadow, .32, -0.28);
  softBlob(ctx, cx+72, FG.chin-64, 46, 42, FSKIN.deep, .28, 0.2);
  softBlob(ctx, cx-80, FG.chin-52, 42, 34, FSKIN.shadow, .2, -0.2); // 左下颌轻 AO
  // 发际线/刘海投影（额头顶部压暗）
  softBlob(ctx, cx-6, FG.faceTop+20, 146, 38, FSKIN.deep, .34);
  softBlob(ctx, cx+46, FG.faceTop+30, 96, 26, FSKIN.deep, .24);
  // 眼窝（塑造上睑凹陷）
  for(const s of[-1,1]) softBlob(ctx, cx+s*FG.eyeDX, FG.eyeY-20, 48, 22, FSKIN.shadow, .24);
  for(const s of[-1,1]) softBlob(ctx, cx+s*(FG.eyeDX+34), FG.eyeY-4, 24, 30, FSKIN.shadow, .16, s*0.32); // 太阳穴凹
  // 鼻侧长条阴影（右深左浅，勾勒鼻梁）
  softBlob(ctx, cx-12, FG.noseTop+26, 8, 42, FSKIN.shadow, .22, 0.06);
  softBlob(ctx, cx+13, FG.noseTop+28, 10, 46, FSKIN.deep, .32, -0.05);
  // 鼻底
  softBlob(ctx, cx, FG.noseTip+7, 24, 10, FSKIN.deep, .3);
  // 人中（唇上纵沟）
  softBlob(ctx, cx, (FG.noseTip+FG.mouthY)/2, 4.5, 13, FSKIN.shadow, .24);
  // 下唇下方凹陷
  softBlob(ctx, cx, FG.mouthY+22, 28, 10, FSKIN.shadow, .32);
  // 下巴下方 AO
  softBlob(ctx, cx, FG.chin-6, 42, 15, FSKIN.deep, .3);
  // 颧骨下方凹陷（右强左弱）
  softBlob(ctx, cx+60, FG.cheekY+84, 44, 22, FSKIN.shadow, .22, -0.16);
  softBlob(ctx, cx-64, FG.cheekY+86, 40, 20, FSKIN.shadow, .12, 0.16);

  // ---- 3. 高光层（受光左上，提亮体积转折） ----
  softBlob(ctx, cx-26, FG.faceTop+62, 68, 52, FSKIN.hi, .5);   // 额头 T 区（偏左）
  softBlob(ctx, cx-4, (FG.noseTop+FG.noseTip)/2, 5, 36, FSKIN.pearl, .5); // 鼻梁珍珠白（窄）
  softBlob(ctx, cx-74, FG.cheekY+46, 34, 24, FSKIN.hi, .36);  // 左颧骨强受光
  softBlob(ctx, cx+72, FG.cheekY+48, 26, 18, FSKIN.hi, .2);   // 右颧骨弱
  softBlob(ctx, cx-6, FG.chin-22, 26, 16, FSKIN.hi, .3);      // 下巴
  softBlob(ctx, cx-40, FG.eyeY+2, 22, 12, FSKIN.pearl, .2);   // 左上睑受光微提

  // ---- 4. 腮红（苹果肌，蜜桃粉） ----
  for(const s of[-1,1]){
    softBlob(ctx, cx+s*72, FG.cheekY+66, 42, 30, FSKIN.blush, .32);
    softBlob(ctx, cx+s*72, FG.cheekY+62, 20, 14, '#F2B0A0', .26); // 内芯偏亮
  }
  ctx.restore();

  // 脸部柔和轮廓
  ctx.save(); facePathF(ctx);
  ctx.lineWidth=2; ctx.strokeStyle=withA('#C98A6E',.4); ctx.stroke();
  ctx.restore();

  // ---- 5. 五官（顺序：眉→眼→鼻→唇） ----
  drawBrowsF(ctx, cfg);
  drawEyesF(ctx, cfg, a);
  drawNoseF(ctx, cfg);
  drawMouthF(ctx, cfg, a);
}

/* 流星眉：眉头柔实、眉峰起、眉尾收细上挑，清晰有形 */
function drawBrowsF(ctx, cfg){
  const cx=FG.cx, y=FG.browY, dx=FG.eyeDX;
  const col=FBROW;
  for(const s of[-1,1]){
    const hx=cx+s*(dx-34);   // 眉头（内、低）
    const px=cx+s*(dx+6);    // 眉峰（略偏外）
    const tx=cx+s*(dx+44);   // 眉尾（外、略高、收细）
    ctx.save();
    // 实心眉体（清晰弧形，眉头圆、眉尾尖）
    ctx.beginPath();
    ctx.moveTo(hx-s*2, y+8);
    ctx.quadraticCurveTo(cx+s*(dx-14), y-1, px, y-3.5);   // 上缘：眉头→眉峰
    ctx.quadraticCurveTo(cx+s*(dx+26), y-4, tx, y-1.5);   // 上缘：眉峰→眉尾
    ctx.quadraticCurveTo(cx+s*(dx+22), y+2.5, px, y+3);   // 下缘：眉尾→眉峰
    ctx.quadraticCurveTo(cx+s*(dx-16), y+5.5, hx-s*2, y+8);// 下缘：眉峰→眉头
    ctx.closePath();
    const bg=ctx.createLinearGradient(hx,y,tx,y);
    // 眉头稍淡、眉体实、眉尾略深收尖（两侧一致的实感）
    bg.addColorStop(0, withA(col,.72));
    bg.addColorStop(.45, withA(shade(col,-0.08),.95));
    bg.addColorStop(1, withA(shade(col,-0.18),.8));
    ctx.fillStyle=bg; ctx.fill();
    // 同色顺向毛流（低对比，只做质感不做线条感）
    ctx.lineCap='round';
    for(let k=0;k<14;k++){
      const t=0.08+0.86*k/13;
      const bx=hx+(tx-hx)*t;
      const arch=Math.sin(t*Math.PI)*3.5;
      const by=y+4.5 - arch - t*3.5;
      ctx.strokeStyle=withA(shade(col,-0.22),.5);
      ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.moveTo(bx, by+2);
      ctx.quadraticCurveTo(bx+s*5, by-0.3, bx+s*8, by-1.6-t*1.5);
      ctx.stroke();
    }
    // 眉下缘细高光（体积）
    ctx.strokeStyle=withA(FSKIN.hi,.3); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(hx, y+7.5); ctx.quadraticCurveTo(px, y+4, tx, y+1); ctx.stroke();
    ctx.restore();
  }
}

/* 眼睛：扇形双眼皮 + 上扬外眼角 + 通透虹膜 + 双高光 */
function drawEyesF(ctx, cfg, a){
  const cx=FG.cx, ey=FG.eyeY, dx=FG.eyeDX, ew=FG.eyeW, eh=FG.eyeH;
  const eyeCol=femaleEye(cfg);
  const open=1-(a.blink||0);
  for(const s of[-1,1]){
    const gx=cx+s*dx;
    ctx.save();
    const eyePath=()=>{
      ctx.beginPath();
      ctx.moveTo(gx-ew*s, ey+4);                                   // 内眼角
      ctx.bezierCurveTo(gx-ew*.45*s, ey-eh*open, gx+ew*.45*s, ey-eh*open, gx+ew*s, ey-eh*.30*open); // 上睑→外角上扬
      ctx.bezierCurveTo(gx+ew*.5*s, ey+eh*.66*open, gx-ew*.45*s, ey+eh*.72*open, gx-ew*s, ey+4);     // 下睑
      ctx.closePath();
    };
    // 眼白
    eyePath();
    const sg=ctx.createLinearGradient(0,ey-eh,0,ey+eh);
    sg.addColorStop(0,'#e8ddd5'); sg.addColorStop(.5,'#fbf5f0'); sg.addColorStop(1,'#ffffff');
    ctx.fillStyle=sg; ctx.fill();
    // 眼白上缘投影
    ctx.save(); eyePath(); ctx.clip();
    softBlob(ctx, gx, ey-eh*open+2, ew*0.95, eh*0.7, '#6a4a3c', .3);
    ctx.restore();

    if(open>0.14){
      const ir=eh*1.04;
      const iy=ey-1;
      const ix=gx - s*ew*0.05;
      ctx.save(); eyePath(); ctx.clip();
      // 虹膜径向渐变
      const ig=ctx.createRadialGradient(ix, iy-ir*.12, ir*.1, ix, iy, ir);
      ig.addColorStop(0, eyeCol.center);
      ig.addColorStop(.5, mix(eyeCol.center, eyeCol.edge,.55));
      ig.addColorStop(.85, eyeCol.edge);
      ig.addColorStop(1, shade(eyeCol.edge,-0.32));
      ctx.beginPath(); ctx.arc(ix,iy,ir,0,7); ctx.fillStyle=ig; ctx.fill();
      // 虹膜放射纹
      ctx.strokeStyle=withA(shade(eyeCol.center,0.4),.35); ctx.lineWidth=1;
      for(let i=0;i<22;i++){const ang=i/22*Math.PI*2;ctx.beginPath();ctx.moveTo(ix+Math.cos(ang)*ir*.32,iy+Math.sin(ang)*ir*.32);ctx.lineTo(ix+Math.cos(ang)*ir*.92,iy+Math.sin(ang)*ir*.92);ctx.stroke();}
      // 虹膜下缘通透辉光
      softBlob(ctx, ix, iy+ir*0.5, ir*0.72, ir*0.5, mix(eyeCol.edge,'#d0a468',.6), .5);
      // 轮部环
      ctx.lineWidth=2; ctx.strokeStyle=withA(shade(eyeCol.edge,-0.45),.55);
      ctx.beginPath(); ctx.arc(ix,iy,ir*0.97,0,7); ctx.stroke();
      // 瞳孔
      ctx.fillStyle='#180f0c'; ctx.beginPath(); ctx.arc(ix,iy,ir*0.44,0,7); ctx.fill();
      // 上睑投影（跨虹膜上缘，塑造眼球球形）
      softBlob(ctx, ix, iy-ir*0.72, ir*1.05, ir*0.6, '#241009', .4);
      softBlob(ctx, ix, iy-ir*0.5, ir*0.9, ir*0.34, '#3a1c10', .28);
      // 大柔光（10 点方向，左上）
      softBlob(ctx, ix-ir*0.3, iy-ir*0.34, ir*0.55, ir*0.55, '#ffffff', .5);
      // 硬高光主点（10 点）
      ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.ellipse(ix-ir*0.32, iy-ir*0.4, ir*0.22, ir*0.27, -0.4,0,7); ctx.fill();
      // 次高光（4 点，右下）
      ctx.fillStyle='rgba(255,255,255,.72)'; ctx.beginPath(); ctx.arc(ix+ir*0.36, iy+ir*0.36, ir*0.1,0,7); ctx.fill();
      ctx.restore();
    }

    // ---- 睫毛/眼线 ----
    ctx.lineCap='round'; ctx.lineJoin='round';
    // 上眼线（外角加粗）
    ctx.strokeStyle='#2a1b17';
    ctx.lineWidth=4.6;
    ctx.beginPath();
    ctx.moveTo(gx-ew*s, ey+4);
    ctx.bezierCurveTo(gx-ew*.45*s, ey-eh*open, gx+ew*.45*s, ey-eh*open, gx+ew*s, ey-eh*.30*open);
    ctx.stroke();
    // 外眼角上扬睫毛（成束，弯曲收尖）
    for(let k=0;k<4;k++){
      const t=k/3;
      const bx=gx+ew*(0.78+0.14*t)*s, by=ey-eh*(0.3+0.06*t)*open;
      taperStrand(ctx,[[bx,by],[gx+ew*(1.02+0.16*t)*s, ey-eh*(0.6+0.14*t)*open],[gx+ew*(1.16+0.2*t)*s, ey-eh*(0.46+0.16*t)*open]], 3-t*0.6, 0.3, '#2a1b17', .95);
    }
    // 上睫成束（3 束，每束数根，弯曲收尖）
    for(let b=0;b<3;b++){
      const bt=0.24+0.5*b/2;
      const bx=gx+ew*(bt*2-1)*s;
      const by=ey-eh*open*(1-Math.abs(bt*2-1)*0.5);
      const curl=6+4*bt;
      for(let j=-1;j<=1;j++){
        taperStrand(ctx,[[bx+j*2.4*s,by],[bx+s*(2+j)+j, by-curl*0.6],[bx+s*(5+bt*4)+j*2, by-curl]], 1.8, 0.2, '#2a1b17', .9);
      }
    }
    // 双眼皮线（扇形）
    ctx.lineWidth=1.5; ctx.strokeStyle=withA('#bb8b71',.7);
    ctx.beginPath();
    ctx.moveTo(gx-ew*.5*s, ey-eh*.22);
    ctx.bezierCurveTo(gx-ew*.3*s, ey-eh*open-7, gx+ew*.4*s, ey-eh*open-6, gx+ew*.92*s, ey-eh*.52*open);
    ctx.stroke();
    // 下睫线（淡）+ 稀疏下睫
    ctx.lineWidth=1.3; ctx.strokeStyle=withA('#8a5c48',.45);
    ctx.beginPath();
    ctx.moveTo(gx-ew*.68*s, ey+6);
    ctx.quadraticCurveTo(gx, ey+eh*.72*open, gx+ew*.68*s, ey+4);
    ctx.stroke();
    ctx.lineWidth=1; ctx.strokeStyle=withA('#5a3a2e',.5);
    for(let k=0;k<3;k++){ const t=k/2; const bx=gx+ew*(0.15+0.5*t)*s, by=ey+eh*(0.56+0.05*t)*open; ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+s*1.5, by+5); ctx.stroke(); }
    // 卧蚕高光
    softBlob(ctx, gx, ey+eh*0.52, ew*0.5, 3.2, '#fff6ee', .3);
    ctx.restore();
  }
}

/* 鼻：高鼻梁缓坡 + 长细高光 + 鼻头圆点 + 鼻翼/鼻孔阴影 */
function drawNoseF(ctx, cfg){
  const cx=FG.cx, topY=FG.noseTop, tipY=FG.noseTip;
  ctx.save();
  // 鼻侧背光软阴影（右侧较深）
  softBlob(ctx, cx+11, (topY+tipY)/2+6, 7, 30, FSKIN.deep, .24, -0.05);
  softBlob(ctx, cx-9, (topY+tipY)/2+8, 5, 24, FSKIN.shadow, .14, 0.05);
  // 鼻梁窄高光（软边衰减）
  softBlob(ctx, cx-3, (topY+tipY)/2, 4, (tipY-topY)/2, FSKIN.pearl, .55);
  softBlob(ctx, cx-3, topY+12, 3, 12, '#ffffff', .38); // 山根提亮
  // 鼻头圆高光 + 硬点
  softBlob(ctx, cx-3, tipY-3, 6.5, 5.5, FSKIN.pearl, .7);
  ctx.fillStyle='rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(cx-4, tipY-4, 2.6, 2, -0.3,0,7); ctx.fill();
  // 鼻底阴影
  softBlob(ctx, cx, tipY+7, 15, 6, FSKIN.deep, .3);
  // 鼻翼软阴影（两侧，右重左轻）
  softBlob(ctx, cx+10, tipY+2, 6, 6, FSKIN.deep, .3);
  softBlob(ctx, cx-10, tipY+2, 5, 5, FSKIN.deep, .2);
  // 鼻孔暗示（很淡）
  ctx.fillStyle=withA('#7a5240',.32);
  ctx.beginPath(); ctx.ellipse(cx-5, tipY+5, 2.3, 1.5, 0.28,0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx+5, tipY+5, 2.6, 1.7, -0.28,0,7); ctx.fill();
  // 右鼻翼弧线（勾勒结构）
  ctx.strokeStyle=withA(FSKIN.deep,.4); ctx.lineWidth=1.8; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx+8, tipY-11); ctx.quadraticCurveTo(cx+13, tipY+1, cx+3, tipY+6); ctx.stroke();
  ctx.restore();
}

/* 唇：M 形薄上唇（清晰唇珠）+ 饱满下唇 + 湿润光泽 */
function drawMouthF(ctx, cfg, a){
  const cx=FG.cx, y=FG.mouthY;
  const open=(a.mouth||0)*13;
  const w=30;
  const lip=FLIP;
  ctx.save();
  // 下唇
  ctx.beginPath();
  ctx.moveTo(cx-w*0.86, y+1);
  ctx.quadraticCurveTo(cx-w*0.4, y+16+open, cx, y+16+open);
  ctx.quadraticCurveTo(cx+w*0.4, y+16+open, cx+w*0.86, y+1);
  ctx.quadraticCurveTo(cx+w*0.4, y+6, cx, y+6);
  ctx.quadraticCurveTo(cx-w*0.4, y+6, cx-w*0.86, y+1);
  ctx.closePath();
  const lg=ctx.createLinearGradient(0,y,0,y+18+open);
  lg.addColorStop(0, shade(lip,-0.16)); lg.addColorStop(.5, lip); lg.addColorStop(1, shade(lip,0.2));
  ctx.fillStyle=lg; ctx.fill();
  // 下唇底缘暗（体积转折）
  softBlob(ctx, cx, y+15+open, 22, 5, shade(lip,-0.32), .4);
  // 上唇（M 形薄唇）
  ctx.beginPath();
  ctx.moveTo(cx-w*0.92, y);
  ctx.quadraticCurveTo(cx-w*0.52, y-6.5, cx-w*0.16, y-2.5);  // 左唇峰
  ctx.quadraticCurveTo(cx, y+2, cx+w*0.16, y-2.5);           // 唇珠凹
  ctx.quadraticCurveTo(cx+w*0.52, y-6.5, cx+w*0.92, y);      // 右唇峰
  ctx.quadraticCurveTo(cx+w*0.45, y+5.5, cx, y+5.5);
  ctx.quadraticCurveTo(cx-w*0.45, y+5.5, cx-w*0.92, y);
  ctx.closePath();
  const ug=ctx.createLinearGradient(0,y-6,0,y+6);
  ug.addColorStop(0, shade(lip,-0.3)); ug.addColorStop(1, shade(lip,-0.12));
  ctx.fillStyle=ug; ctx.fill();
  // 张口内部
  if(open>2){
    ctx.fillStyle='#7a3b38';
    ctx.beginPath(); ctx.moveTo(cx-w*0.6,y+4); ctx.quadraticCurveTo(cx,y+open,cx+w*0.6,y+4); ctx.quadraticCurveTo(cx,y+5,cx-w*0.6,y+4); ctx.fill();
  }
  // 上唇下缘内阴影（贴合唇缝上方）
  softBlob(ctx, cx, y+4.5, 20, 2.6, shade(lip,-0.42), .42);
  // 唇缝线（中央深、两端收细）
  ctx.strokeStyle=withA(shade(lip,-0.5),.82); ctx.lineWidth=2; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx-w*0.9,y+2.5); ctx.quadraticCurveTo(cx,y+6.5,cx+w*0.9,y+2.5); ctx.stroke();
  // 嘴角小暗点（commissure）
  for(const s of[-1,1]){ ctx.fillStyle=withA(shade(lip,-0.5),.5); ctx.beginPath(); ctx.arc(cx+s*w*0.88,y+1.6,1.7,0,7); ctx.fill(); }
  // 下唇湿润：柔 sheen band + 硬 specular 点
  softBlob(ctx, cx-2, y+11+open*0.4, 15, 3.6, '#ffffff', .3);   // 长柔光带
  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.beginPath(); ctx.ellipse(cx-6, y+10+open*0.4, 3.2, 1.8, -0.2,0,7); ctx.fill(); // 锐利高光点
  ctx.fillStyle='rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(cx+9, y+12+open*0.4, 1.5,0,7); ctx.fill();
  // 上唇珠微光 + 上缘唇线提亮
  softBlob(ctx, cx, y-1.5, 4.5, 1.6, '#ffffff', .32);
  ctx.strokeStyle='rgba(255,240,235,.4)'; ctx.lineWidth=1; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx-w*0.5,y-4); ctx.quadraticCurveTo(cx-w*0.16,y-1.5,cx,y+0.5); ctx.stroke();
  ctx.restore();
}

/* 颈 */
function drawNeckF(ctx, cfg, a){
  const cx=FG.cx, top=FG.neckTop, bot=FG.shoulderY+8;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx-30, top);
  ctx.bezierCurveTo(cx-34, top+40, cx-40, bot-24, cx-44, bot);
  ctx.lineTo(cx+44, bot);
  ctx.bezierCurveTo(cx+40, bot-24, cx+34, top+40, cx+30, top);
  ctx.closePath();
  const g=ctx.createLinearGradient(cx-40,top,cx+40,bot);
  g.addColorStop(0, FSKIN.mid); g.addColorStop(.5, FSKIN.base); g.addColorStop(1, FSKIN.mid);
  ctx.fillStyle=g; ctx.fill();
  // 下颌投影（脸/发投在颈上）
  softBlob(ctx, cx-4, top+8, 50, 22, FSKIN.deep, .46);
  softBlob(ctx, cx, top+4, 40, 13, FSKIN.deep, .34);
  softBlob(ctx, cx+30, top+16, 26, 18, FSKIN.deep, .3); // 右侧发丝投影更深
  // 颈部侧面体积暗
  softBlob(ctx, cx+34, top+56, 16, 46, FSKIN.shadow, .26);
  // 锁骨微光
  softBlob(ctx, cx, bot-8, 60, 8, FSKIN.hi, .25);
  // 衣领投影到颈根（颈—衣交界 AO）
  softBlob(ctx, cx, bot, 54, 14, FSKIN.deep, .34);
  ctx.restore();
}

/* 身体 + 服装 */
function drawBodyF(ctx, cfg, a){
  const cx=FG.cx;
  const outfit=cfg.outfit||'casual';
  const col=cfg.outfitColor || (OUTFITS.find(o=>o.id===outfit)||{}).color || '#FDFDFD';
  const sy=FG.shoulderY, bottom=1024, sw=205;
  const breathW=1+Math.sin(a.breath)*0.012;
  ctx.save();
  ctx.translate(cx,0); ctx.scale(breathW,1); ctx.translate(-cx,0);
  const bodyPath=()=>{
    ctx.beginPath();
    ctx.moveTo(cx-sw, bottom);
    ctx.bezierCurveTo(cx-sw, 700, cx-sw*0.9, sy+20, cx-72, sy+6);
    ctx.quadraticCurveTo(cx, sy-12, cx+72, sy+6);
    ctx.bezierCurveTo(cx+sw*0.9, sy+20, cx+sw, 700, cx+sw, bottom);
    ctx.closePath();
  };
  bodyPath();
  const bg=ctx.createLinearGradient(cx-sw,sy,cx+sw,bottom);
  bg.addColorStop(0, shade(col,.1)); bg.addColorStop(.5, col); bg.addColorStop(1, shade(col,-0.2));
  ctx.fillStyle=bg; ctx.fill();
  ctx.save(); bodyPath(); ctx.clip();
  drawOutfitF(ctx, outfit, col, sy, bottom);
  ctx.restore();
  // 躯干底部透明淡出（避免硬切）
  const fade=ctx.createLinearGradient(0,868,0,1024);
  fade.addColorStop(0,'rgba(0,0,0,0)'); fade.addColorStop(.72,'rgba(0,0,0,.55)'); fade.addColorStop(1,'rgba(0,0,0,1)');
  ctx.save(); ctx.globalCompositeOperation='destination-out'; ctx.fillStyle=fade; ctx.fillRect(cx-sw-30,868,sw*2+60,160); ctx.restore();
  ctx.restore();
}

function drawOutfitF(ctx, outfit, col, sy, bottom){
  const cx=FG.cx;
  const dark=shade(col,-0.28), light=shade(col,0.16);
  if(outfit==='casual'){
    // 亚麻棉背心/吊带
    // 领口以下露肤（U 领）：先画肤色 U 区
    ctx.fillStyle=FSKIN.base;
    ctx.beginPath(); ctx.moveTo(cx-64, sy-4); ctx.quadraticCurveTo(cx, sy+78, cx+64, sy-4); ctx.lineTo(cx+64,sy-40);ctx.lineTo(cx-64,sy-40);ctx.closePath(); ctx.fill();
    // 锁骨/胸口阴影
    softBlob(ctx, cx, sy+40, 46, 20, FSKIN.shadow, .28);
    // 吊带
    ctx.fillStyle=shade(col,-0.05);
    for(const s of[-1,1]){ ctx.save(); ctx.translate(cx+s*66, sy+8); ctx.rotate(s*0.12); ctx.fillRect(-9,-14,18,54); ctx.restore(); }
    // 领口边缘
    ctx.strokeStyle=dark; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(cx-66, sy+28); ctx.quadraticCurveTo(cx, sy+92, cx+66, sy+28); ctx.stroke();
    // 亚麻褶皱
    ctx.strokeStyle=withA(dark,.5); ctx.lineWidth=2.4;
    for(const x of[-130,-70,10,90,150]){ ctx.beginPath(); ctx.moveTo(cx+x, sy+130); ctx.quadraticCurveTo(cx+x+8, sy+430, cx+x, bottom); ctx.stroke(); }
    // 侧面暗部
    const sd=ctx.createLinearGradient(cx+50,0,cx+205,0);
    sd.addColorStop(0,'rgba(0,0,0,0)'); sd.addColorStop(1,'rgba(0,0,0,.16)');
    ctx.fillStyle=sd; ctx.fillRect(cx+50,sy,205,bottom);
  } else if(outfit==='coat'){
    // 灰色 oversized 风衣 + 黑色立领内搭 + 大翻领 + 肩章
    const lap=shade(col,0.09);
    // 黑色内搭（宽胸襟）
    ctx.fillStyle='#18181c';
    ctx.beginPath(); ctx.moveTo(cx-66,sy+12); ctx.lineTo(cx,sy+40); ctx.lineTo(cx+66,sy+12); ctx.lineTo(cx+58,bottom); ctx.lineTo(cx-58,bottom); ctx.closePath(); ctx.fill();
    // 黑色立领（环绕颈部的高领）
    ctx.fillStyle='#0e0e11';
    ctx.beginPath(); ctx.moveTo(cx-48,sy+4); ctx.quadraticCurveTo(cx,sy+26,cx+48,sy+4); ctx.lineTo(cx+42,sy-24); ctx.quadraticCurveTo(cx,sy-2,cx-42,sy-24); ctx.closePath(); ctx.fill();
    // 大翻领（左右，灰色略亮，向外翻折）
    ctx.fillStyle=lap;
    ctx.beginPath(); ctx.moveTo(cx-66,sy+8); ctx.lineTo(cx-8,sy+56); ctx.lineTo(cx-26,sy+150); ctx.lineTo(cx-84,sy+178); ctx.lineTo(cx-158,sy+96); ctx.lineTo(cx-152,sy+26); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx+66,sy+8); ctx.lineTo(cx+8,sy+56); ctx.lineTo(cx+26,sy+150); ctx.lineTo(cx+84,sy+178); ctx.lineTo(cx+158,sy+96); ctx.lineTo(cx+152,sy+26); ctx.closePath(); ctx.fill();
    // 翻领折边阴影 + 高光
    ctx.strokeStyle=dark; ctx.lineWidth=2.6; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(cx-8,sy+56); ctx.lineTo(cx-26,sy+150); ctx.lineTo(cx-84,sy+178); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+8,sy+56); ctx.lineTo(cx+26,sy+150); ctx.lineTo(cx+84,sy+178); ctx.stroke();
    ctx.strokeStyle=light; ctx.lineWidth=2.4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(cx-66,sy+8); ctx.lineTo(cx-8,sy+56); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+66,sy+8); ctx.lineTo(cx+8,sy+56); ctx.stroke();
    // 肩章 epaulettes（肩头横向）
    for(const s of[-1,1]){ ctx.save(); ctx.translate(cx+s*128, sy+30); ctx.rotate(s*0.34);
      ctx.fillStyle=dark; ctx.fillRect(-36,-11,72,22);
      ctx.fillStyle=shade(col,-0.5); ctx.fillRect(-36,-11,13,22);
      ctx.fillStyle=light; ctx.fillRect(-36,-11,72,3);
      ctx.restore(); }
    // 侧暗 + 布料褶皱
    const sd=ctx.createLinearGradient(cx+70,0,cx+205,0);
    sd.addColorStop(0,'rgba(0,0,0,0)'); sd.addColorStop(1,'rgba(0,0,0,.24)');
    ctx.fillStyle=sd; ctx.fillRect(cx+70,sy,205,bottom);
    ctx.strokeStyle=withA(dark,.4); ctx.lineWidth=2.4;
    for(const x of[-118,124]){ ctx.beginPath(); ctx.moveTo(cx+x, sy+220); ctx.quadraticCurveTo(cx+x+10, sy+520, cx+x, bottom); ctx.stroke(); }
  } else {
    // academy / formal 复用原逻辑
    drawOutfitDetail(ctx, outfit, col, true, sy);
  }
}

/* 头发笔触：一根发丝 */
function strand(ctx, pts, w, color, alpha){
  if(pts.length<2) return;
  ctx.strokeStyle=withA(color,alpha); ctx.lineWidth=w; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length-1;i++){
    const xc=(pts[i][0]+pts[i+1][0])/2, yc=(pts[i][1]+pts[i+1][1])/2;
    ctx.quadraticCurveTo(pts[i][0],pts[i][1],xc,yc);
  }
  const last=pts[pts.length-1];
  ctx.quadraticCurveTo(last[0],last[1],last[0],last[1]);
  ctx.stroke();
}

function femaleHairLen(style){
  return style==='short'?496 : style==='ponytail'?700 : style==='long_wavy'?840 : 636; // bob=Lob 默认
}

/* 后发（脑后基底发团） */
function backHairPath(ctx, cx, sway, endY){
  ctx.beginPath();
  ctx.moveTo(cx-166, 340);
  ctx.bezierCurveTo(cx-186, 172, cx-96, 112, cx, 112);
  ctx.bezierCurveTo(cx+96,112, cx+186,172, cx+166,340);
  ctx.bezierCurveTo(cx+186, 448, cx+168, endY-70, cx+126+sway, endY-20);
  ctx.bezierCurveTo(cx+110, endY+14, cx+74, endY+6, cx+40, endY-16);
  ctx.bezierCurveTo(cx+16, endY-4, cx-16, endY-4, cx-40, endY-16);
  ctx.bezierCurveTo(cx-74, endY+6, cx-110, endY+14, cx-126-sway, endY-20);
  ctx.bezierCurveTo(cx-168, endY-70, cx-186, 448, cx-166, 340);
  ctx.closePath();
}
function drawBackHairF(ctx, cfg, a){
  const cx=FG.cx, sway=Math.sin(a.sway)*8;
  const hair=femaleHair(cfg);
  const style=cfg.hairStyle||'bob';
  const endY=femaleHairLen(style);
  const g=ctx.createLinearGradient(0,150,0,endY+60);
  g.addColorStop(0, hair.shadow); g.addColorStop(.4, hair.base); g.addColorStop(1, shade(hair.base,-0.12));
  ctx.fillStyle=g;
  backHairPath(ctx, cx, sway, endY); ctx.fill();

  // 剪裁到后发轮廓内绘制体积发丝
  ctx.save();
  backHairPath(ctx, cx, sway, endY); ctx.clip();
  // 内扣暗部
  softBlob(ctx, cx, endY-16, 120, 40, hair.shadow, .55);
  softBlob(ctx, cx, 300, 150, 90, hair.shadow, .28); // 脑后深度
  // 暗层发丝
  for(let i=0;i<26;i++){
    const r=frac(i*2.3+9), side=i%2?1:-1;
    const rx=cx+side*(30+r*140), ry=180+frac(i*4.1)*120;
    const eY=endY-20-r*70;
    taperStrand(ctx,[[rx,ry],[cx+side*(150+r*36),(ry+eY)/2],[cx+side*90+sway*side,eY]], 3.4,0.5,
      r>0.72?hair.hi:(r<0.3?hair.shadow:hair.base), .26+r*0.32);
  }
  // 分束高光带（成束，右侧强）
  for(const s of[-1,1]){
    for(let k=0;k<4;k++){
      const off=(k-1.5)*6;
      taperStrand(ctx, [[cx+s*(92+off),330],[cx+s*(150+off),470],[cx+s*(138+off)+sway*s,endY-120],[cx+s*(108+off)+sway*s,endY-40]],
        2.4,0.4, hair.hi, (s>0?.34:.2)-Math.abs(off)*0.012);
    }
  }
  ctx.restore();
}

/* 前发：侧分 7:3 + 长侧扫刘海 + 面颊侧发 + 多股发丝 */
function fringePath(ctx, cx, partX){
  // 顶盖 + 侧扫刘海帘（右低左高，分缝偏左）
  ctx.moveTo(cx-172, 386);
  ctx.bezierCurveTo(cx-190,166, cx-96,106, cx,106);
  ctx.bezierCurveTo(cx+96,106, cx+190,166, cx+172,386);
  ctx.bezierCurveTo(cx+150,348, cx+118,350, cx+90,344);
  ctx.bezierCurveTo(cx+44,336, cx+2,324, cx-42,312);
  ctx.bezierCurveTo(cx-86,304, cx-122,306, cx-150,300);
  ctx.bezierCurveTo(cx-166,296, cx-170,304, cx-172,386);
  ctx.closePath();
}
function cheekLockPath(ctx, cx, s, endY, sway){
  const outer=s>0?168:150;
  ctx.moveTo(cx+s*(outer+4), 300);
  ctx.bezierCurveTo(cx+s*(outer+18), 404, cx+s*158, 476, cx+s*148, 524);
  ctx.bezierCurveTo(cx+s*154+(s>0?sway:-sway), endY-70, cx+s*126, endY-18, cx+s*102, endY-6);
  ctx.bezierCurveTo(cx+s*90, endY-30, cx+s*106, 476, cx+s*118, 434);
  ctx.bezierCurveTo(cx+s*130, 392, cx+s*134, 344, cx+s*112, 300);
  ctx.closePath();
}
function frontHairShapes(ctx, cfg, a, partX, endY, sway){
  const cx=FG.cx;
  // 汇总所有前发子路径到当前 path（仅供裁剪使用）
  fringePath(ctx, cx, partX);
  cheekLockPath(ctx, cx, -1, endY, sway);
  cheekLockPath(ctx, cx, 1, endY, sway);
}

function drawFrontHairF(ctx, cfg, a){
  const cx=FG.cx, sway=Math.sin(a.sway)*5;
  const hair=femaleHair(cfg);
  const style=cfg.hairStyle||'bob';
  const endY=femaleHairLen(style);
  const partX=cx-22; // 7:3 侧分（缝偏左）
  const cap=ctx.createLinearGradient(0,110,0,endY);
  cap.addColorStop(0, shade(hair.base,0.14)); cap.addColorStop(.42, hair.base); cap.addColorStop(1, shade(hair.base,-0.06));

  // ---- 填充前发主体（各片单独填充，避免奇偶/缠绕产生缝隙或空洞） ----
  ctx.fillStyle=cap;
  ctx.beginPath(); cheekLockPath(ctx, cx, -1, endY, sway); ctx.fill();
  ctx.beginPath(); cheekLockPath(ctx, cx, 1, endY, sway); ctx.fill();
  ctx.beginPath(); fringePath(ctx, cx, partX); ctx.fill();

  // ---- 以前发+顶盖为剪裁区域，绘制光泽/发丝（防止溢出到脸/背景） ----
  ctx.save();
  ctx.beginPath();
  frontHairShapes(ctx, cfg, a, partX, endY, sway);
  ctx.clip('evenodd');

  // 顶部光泽带（弧形，随头骨曲率）
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx-166,300); ctx.quadraticCurveTo(cx-150,214, cx,206);
  ctx.quadraticCurveTo(cx+150,214, cx+166,300);
  ctx.quadraticCurveTo(cx+150,262, cx,258);
  ctx.quadraticCurveTo(cx-150,262, cx-166,300); ctx.closePath();
  ctx.clip();
  const gl=ctx.createLinearGradient(0,206,0,300);
  gl.addColorStop(0,'rgba(0,0,0,0)'); gl.addColorStop(.5, withA(hair.hi,.55)); gl.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gl; ctx.fillRect(cx-170,206,340,100);
  ctx.restore();
  // 右侧刘海二级光泽
  softBlob(ctx, cx+96, 300, 40, 120, hair.hi, .18, -0.2);

  // ==== 发束 clump 系统（三角状聚拢，暗底→中间→高光/尖端） ====
  const bob = style==='short'?0.8 : style==='bob'?1 : 1.5;
  const NC=8;
  for(let ci=0; ci<NC; ci++){
    const t=ci/(NC-1);                       // 0..1 左→右
    const rootX=cx+(t-0.5)*300;
    const rootY=118+Math.abs(t-0.44)*70;     // 分缝(偏左)处最高
    const dir=(rootX<partX)?-1:1;
    const rr=frac(ci*4.7+3.1);
    const clumpLen=(200+rr*150)*bob;
    const tipX=rootX+dir*(46+rr*46)+sway*dir;
    const tipY=Math.min(endY-6, rootY+clumpLen);
    const midX=(rootX+tipX)/2+dir*24;
    const midY=(rootY+tipY)/2;
    const n=6+Math.floor(frac(ci*3.3)*4);
    // 暗底铺垫（宽）
    taperStrand(ctx,[[rootX,rootY],[midX,midY],[tipX,tipY]], 12, 0.8, hair.shadow, .34);
    // clump 内多股
    for(let k=0;k<n;k++){
      const kt=(k/(n-1))-0.5;                // -0.5..0.5
      const sRootX=rootX+kt*30;
      const sMidX=midX+kt*22;
      const sTipX=tipX+kt*10;
      const isCore=Math.abs(kt)<0.18;
      const col=isCore? hair.hi : (frac(ci*7+k*1.7)<0.34? hair.shadow : hair.base);
      const a=isCore? .6 : (.42+frac(ci+k)*0.3);
      taperStrand(ctx,[[sRootX,rootY+Math.abs(kt)*16],[sMidX,midY],[sTipX,tipY]], 3.4-Math.abs(kt)*3, 0.25, col, a);
    }
    // clump 间暗缝
    const gapX=rootX+150/NC;
    taperStrand(ctx,[[gapX,rootY+8],[gapX+dir*18,midY],[gapX+dir*4,tipY-20]], 2.2, 0.4, hair.shadow, .4);
  }
  // Pass C：硬高光成束（沿弧形光泽线，clump 尖）
  for(let c=0;c<5;c++){
    const t=c/4;
    const cxs=cx+(t-0.5)*250+sway;
    const arcY=250 - Math.cos((t-0.5)*Math.PI)*30; // 弧形
    for(let k=0;k<5;k++){
      const off=(k-2)*4;
      taperStrand(ctx,[[cxs+off,arcY-64],[cxs+off*1.3,arcY],[cxs+off*1.8,arcY+110]], 2, 0.25, hair.hi, .5-Math.abs(off)*0.04);
    }
  }
  // 分缝高光
  ctx.strokeStyle=withA(hair.hi,.6); ctx.lineWidth=3.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(partX+6,132); ctx.bezierCurveTo(partX,180, partX-8,214, partX-16,252); ctx.stroke();

  // ---- 刘海内缘羽化：沿发帘下缘的短发丝尖（仍在裁剪区内） ----
  for(let i=0;i<16;i++){
    const t=i/15;
    const bx=cx-160+t*320;
    // 沿 fringePath 下缘估算基线 y（中间高、两侧低的发帘）
    const baseY = 292 + Math.sin(t*Math.PI)*60 - Math.abs(t-0.5)*36;
    const r=frac(i*7.3+2.1);
    const dir=(bx<partX)?-1:1;
    const col=r>0.7?hair.hi:(r<0.32?hair.shadow:hair.base);
    taperStrand(ctx,[[bx,baseY-80],[bx+dir*6,baseY-28],[bx+dir*(9+r*13)+sway*dir,baseY+r*16]], 2.2, 0.15, col, .42+r*0.25);
  }
  ctx.restore();

  // ---- 刘海在额头/太阳穴的接触投影（AO，落在皮肤上） ----
  ctx.save();
  const csh=ctx.createLinearGradient(0,296,0,360);
  csh.addColorStop(0, withA('#9c6a4e',.34)); csh.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=csh;
  ctx.beginPath();
  ctx.moveTo(cx-150,300);
  ctx.bezierCurveTo(cx-90,360, cx+40,368, cx+150,300);
  ctx.lineTo(cx+150,300); ctx.bezierCurveTo(cx+40,344, cx-90,344, cx-150,300);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // ---- 面前少量碎发（越过脸颊，柔化边缘） ----
  ctx.save();
  taperStrand(ctx, [[cx+150,300],[cx+156,400],[cx+140,470],[cx+132,512]], 3, 0.4, hair.base, .55);   // 右鬓
  taperStrand(ctx, [[cx-146,320],[cx-152,410],[cx-138,500],[cx-130,548]], 2.8, 0.4, hair.base, .5);  // 左鬓
  taperStrand(ctx, [[cx+44,150],[cx+68,238],[cx+52,318]], 2, 0.2, hair.shadow, .4);
  taperStrand(ctx, [[cx-34,150],[cx-54,232],[cx-42,300]], 1.8, 0.2, hair.shadow, .38);
  ctx.restore();
}

/* 配饰（女性坐标） */
function drawAccessoriesF(ctx, cfg, a){
  const cx=FG.cx, ey=FG.eyeY;
  const acc=cfg.accessories||{};
  if(acc.glasses){
    const dx=FG.eyeDX, ew=FG.eyeW, eh=FG.eyeH;
    ctx.strokeStyle='rgba(40,30,26,.85)'; ctx.lineWidth=4;
    for(const s of[-1,1]){ ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(cx+s*dx-ew-2, ey-eh-6, (ew+2)*1.7, eh*2.1, 14); else ctx.rect(cx+s*dx-ew-2, ey-eh-6, ew*1.7, eh*2.1); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx-18,ey-8); ctx.lineTo(cx+18,ey-8); ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.3)'; ctx.lineWidth=3;
    for(const s of[-1,1]){ ctx.beginPath(); ctx.moveTo(cx+s*dx-ew*0.5,ey-eh*0.4); ctx.lineTo(cx+s*dx-ew*0.05,ey+eh*0.4); ctx.stroke(); }
  }
  if(acc.hairpin){
    const px=cx-120, py=244;
    for(let i=0;i<5;i++){const ang=i/5*Math.PI*2;ctx.fillStyle='#e58aa2';ctx.beginPath();ctx.ellipse(px+Math.cos(ang)*13,py+Math.sin(ang)*13,9,14,ang,0,7);ctx.fill();}
    ctx.fillStyle='#ffd98a'; ctx.beginPath(); ctx.arc(px,py,7,0,7); ctx.fill();
  }
  if(acc.tie){
    const sy=FG.shoulderY;
    ctx.fillStyle='#8a2a35';
    ctx.beginPath(); ctx.moveTo(cx-12,sy+30);ctx.lineTo(cx+12,sy+30);ctx.lineTo(cx+7,sy+44);ctx.lineTo(cx-7,sy+44);ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx-9,sy+46);ctx.lineTo(cx+9,sy+46);ctx.lineTo(cx+18,sy+150);ctx.lineTo(cx,sy+176);ctx.lineTo(cx-18,sy+150);ctx.closePath(); ctx.fill();
  }
}

/* 夕阳橙色边缘光（Fresnel），沿头发/肩部外缘 */
function drawRimLightF(ctx, cfg, a){
  const cx=FG.cx, sway=Math.sin(a.sway)*8;
  const style=cfg.hairStyle||'bob';
  const endY=femaleHairLen(style);
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  ctx.lineCap='round';
  // 右侧头发外缘（强）
  ctx.strokeStyle=withA('#FFA500',.38); ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(cx+40,120); ctx.bezierCurveTo(cx+150,168,cx+186,290,cx+166,344); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+166,344); ctx.bezierCurveTo(cx+186,448,cx+168,endY-70,cx+126+sway,endY-20); ctx.stroke();
  // 左侧头发外缘（弱）
  ctx.strokeStyle=withA('#FFB733',.22); ctx.lineWidth=3.5;
  ctx.beginPath(); ctx.moveTo(cx-166,344); ctx.bezierCurveTo(cx-186,448,cx-168,endY-70,cx-126-sway,endY-20); ctx.stroke();
  // 头顶暖辉
  softBlob(ctx, cx+70, 150, 90, 40, '#FFA500', .12);
  // 肩部边缘
  ctx.strokeStyle=withA('#FFA500',.3); ctx.lineWidth=5;
  ctx.beginPath(); ctx.moveTo(cx+205,1024); ctx.bezierCurveTo(cx+205,700,cx+188,600,cx+80,588); ctx.stroke();
  ctx.strokeStyle=withA('#FFB733',.18); ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(cx-205,1024); ctx.bezierCurveTo(cx-205,700,cx-188,600,cx-80,588); ctx.stroke();
  ctx.restore();
}

/* ---------- 部位命中（归一化 uv → 部位） ---------- */
// uv: {u:0..1 (左→右), v:0..1 (上→下)} 对应 640x1024
export function hitPart(u,v){
  const x=u*640, y=v*1024;
  if(y<300) return 'hair';
  if(y>=300 && y<500){
    if(y>340 && y<410 && Math.abs(x-320)<130) return 'eyes';
    if(y>420 && y<475 && Math.abs(x-320)<80) return 'mouth';
    return 'face';
  }
  if(y>=500 && y<600) return 'neck';
  return 'body';
}
