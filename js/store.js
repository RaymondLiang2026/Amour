// store.js — localStorage 存档
const KEY = 'stage_muse_save_v1';

export function defaultConfig(gender='female'){
  const female = gender!=='male';
  return {
    gender,
    aiName: female ? 'Yui' : 'Ren',
    callName: '主人',
    hairStyle: female ? 'bob' : 'short',
    hairColor: female ? '#2D2926' : '#2f241c',
    eyeColor:  female ? '#3E2723' : '#455063',
    outfit:    female ? 'base' : 'academy',
    outfitColor: female ? '#FDFDFD' : '#3b5a8c',
    accessories: { glasses:false, hairpin:female, tie:false },
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
    voiceGender: female ? 'female' : 'male',
    speechRate: 1.0,
    wakeWord: female ? 'Yui' : 'Ren',
    wakeEnabled: false,
  };
}

export function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || !data.createdAt) return null;
    return Object.assign(defaultConfig(data.gender), data, data.outfit==='casual'?{outfit:'base'}:{});
  }catch{ return null; }
}

export function save(cfg){
  try{ localStorage.setItem(KEY, JSON.stringify(cfg)); }catch{}
}

export function reset(){
  try{ localStorage.removeItem(KEY); }catch{}
}
