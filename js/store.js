// store.js — localStorage 存档
const KEY = 'stage_muse_save_v1';

export function defaultConfig(){
  return {
    aiName: 'Yui',
    callName: '主人',
    hairStyle: 'shoulder',
    hairColor: '#2D2926',
    hairColorId: 'black',
    eyeColor: '#3E2723',
    outfit: 'basic',
    outfitColor: '#FDFDFD',
    assetKind: 'outfit',
    assetImage: 'assets/generated/outfit_basic.png?v=assets20260803b',
    accessories: { glasses:false, hairpin:true, tie:false },
    // 场景
    theme: 'stage',
    light: 'warm',
    daynight: 62,
    walkEnabled: true,   // 角色场景内走动
    props: [],           // [{type, x, z, rot}]
    // 进度
    affinity: 0,
    unlocked: false,
    createdAt: 0,
    // 语音交互
    voiceOutput: true,
    voiceGender: 'female',
    speechRate: 1.1,
    wakeWord: 'Yui',
    wakeEnabled: false,
  };
}

function normalizeSave(data){
  const base = defaultConfig();
  const safe = Object.assign(base, data || {});
  const legacyName = ['R','e','n'].join('');
  safe.aiName = safe.aiName === legacyName ? 'Yui' : (safe.aiName || 'Yui');
  safe.voiceGender = 'female';
  safe.wakeWord = !safe.wakeWord || safe.wakeWord === legacyName ? safe.aiName : safe.wakeWord;
  const validOutfits = ['basic','school','urban','casual','boxing','street1','street2','street3','street4','street5','street6','street7','street8','street9','street10'];
  safe.outfit = validOutfits.includes(safe.outfit) ? safe.outfit : 'basic';
  const validHair = ['longcurly','shoulder','ponytail','short'];
  safe.hairStyle = validHair.includes(safe.hairStyle) ? safe.hairStyle : 'shoulder';
  safe.outfitColor = safe.outfitColor || '#FDFDFD';
  safe.props = [];
  if (!safe.assetImage || !String(safe.assetImage).includes('assets/generated/')) {
    safe.assetKind = 'outfit';
    safe.assetImage = 'assets/generated/outfit_basic.png?v=assets20260803b';
  }
  safe.accessories = Object.assign({ glasses:false, hairpin:true, tie:false }, safe.accessories || {});
  return safe;
}

export function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || !data.createdAt) return null;
    return normalizeSave(data);
  }catch{ return null; }
}

export function save(cfg){
  try{ localStorage.setItem(KEY, JSON.stringify(normalizeSave(cfg))); }catch{}
}

export function reset(){
  try{ localStorage.removeItem(KEY); }catch{}
}
