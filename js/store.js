// store.js — localStorage 存档
const KEY = 'stage_muse_save_v1';

export function defaultConfig(){
  return {
    aiName: 'Yui',
    callName: '主人',
    hairStyle: 'bob',
    hairColor: '#2D2926',
    eyeColor: '#3E2723',
    outfit: 'base',
    outfitColor: '#FDFDFD',
    accessories: { glasses:false, hairpin:true, tie:false },
    // 场景
    theme: 'stage',
    light: 'warm',
    daynight: 62,
    props: [],           // [{type, x, z, rot}]
    // 进度
    affinity: 0,
    unlocked: false,
    createdAt: 0,
    // 语音交互
    voiceOutput: true,
    voiceGender: 'female',
    speechRate: 1.0,
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
  safe.outfit = safe.outfit === 'casual' || safe.outfit === 'academy' ? 'base' : (safe.outfit || 'base');
  safe.outfitColor = safe.outfitColor || '#FDFDFD';
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
