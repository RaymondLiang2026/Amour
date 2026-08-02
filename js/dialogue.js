// dialogue.js — 预设对话库 / 部位反馈 / 好感度解锁（无需真实 AI 接口）
// 所有回复支持 {call} 占位符替换为“对用户的称呼”，{name} 替换为 AI 名字。

// 点击不同部位的反馈：动作(react) + 文字
export const PART_REACTIONS = {
  hair: [
    { react:'shy',   text:'诶…头发会乱掉的啦，{call}。' },
    { react:'happy', text:'今天的发型…还好看吗？' },
  ],
  face: [
    { react:'shy',   text:'这么近距离看着我，会害羞的。' },
    { react:'smile', text:'{call}的手，暖暖的。' },
  ],
  eyes: [
    { react:'blinkx',text:'眼睛里…只映着{call}一个人哦。' },
    { react:'shy',   text:'别一直盯着看嘛。' },
  ],
  mouth: [
    { react:'happy', text:'想听我唱歌吗？点右边的🎵。' },
    { react:'smile', text:'嘘——，秘密要小声说。' },
  ],
  neck: [
    { react:'shy',   text:'那里…有点痒。' },
  ],
  body: [
    { react:'wave',  text:'今天也要一起加油呀，{call}！' },
    { react:'happy', text:'新衣服合身吗？我转个圈给你看。' },
  ],
};

// 关键词触发（简单意图匹配）
const KEYWORD_RULES = [
  { keys:['你好','嗨','hi','hello','在吗'], react:'wave',  replies:['{call}好呀，我是{name}，一直在这里等你。','嗨，{call}！今天过得怎么样？'] },
  { keys:['名字','叫什么','是谁'],          react:'smile', replies:['我叫{name}，是{call}专属的舞台伙伴。'] },
  { keys:['喜欢','爱你','想你'],            react:'shy',   replies:['唔…突然这样说，我会当真的哦。','和{call}在一起的每一刻，我都很喜欢。'] },
  { keys:['唱歌','歌','音乐','合奏'],       react:'happy', replies:['想合奏吗？点右侧的🎵，我来哼旋律，{call}来打节拍！'] },
  { keys:['累','难过','伤心','emo','压力'], react:'gentle',replies:['辛苦了，{call}。先深呼吸一下，我陪着你。','再难的夜也会过去的，我在这儿。'] },
  { keys:['漂亮','好看','可爱','美'],        react:'shy',   replies:['谢…谢谢{call}，被夸到有点脸红。'] },
  { keys:['换','衣服','发型','造型'],        react:'happy', replies:['想给我换个造型吗？点左边的👗试试看！'] },
  { keys:['天气','下雨','晴'],              react:'smile', replies:['不管外面怎样，这个舞台永远为{call}亮着暖光。'] },
  { keys:['晚安','睡','困'],                react:'gentle',replies:['晚安，{call}。把灯调暗一点，做个好梦。'] },
  { keys:['早','早安','起床'],              react:'wave',  replies:['早安，{call}！新的一天，舞台就绪。'] },
  { keys:['吃','饭','饿','外卖'],           react:'happy', replies:['记得好好吃饭哦，{call}不许饿肚子。'] },
  { keys:['谢谢','感谢'],                   react:'smile', replies:['不用谢，能帮到{call}我很开心。'] },
];

// 兜底回复池
const FALLBACK = [
  { react:'smile',  text:'嗯嗯，我在听，{call}继续说。' },
  { react:'happy',  text:'和{call}聊天，时间过得好快。' },
  { react:'gentle', text:'这个话题…我记住啦。' },
  { react:'wave',   text:'原来如此！{call}懂得真多。' },
  { react:'shy',    text:'虽然不太明白，但只要是{call}说的我都喜欢听。' },
];

// 好感度里程碑
export const MILESTONES = [
  { at:20,  text:'和{call}越来越熟啦，感觉舞台都更亮了。' },
  { at:50,  text:'好感过半！解锁了新的悄悄话哦，多点点我吧。' },
  { at:80,  text:'快到 100 了…有件礼物想送给{call}。' },
  { at:100, text:'好感度满啦！解锁隐藏正装造型✨ 去👗看看吧。' },
];

// 满级后解锁的额外对白
const UNLOCKED_LINES = [
  { react:'shy', text:'其实…一直想告诉{call}，谢谢你没有离开。' },
  { react:'smile', text:'如果这是一出戏，我希望{call}是我永远的观众。' },
];

function fill(str, cfg){
  return str.replace(/\{call\}/g, cfg.callName||'主人').replace(/\{name\}/g, cfg.aiName||'Yui');
}
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

export function replyFor(text, cfg){
  const t = (text||'').toLowerCase();
  for(const rule of KEYWORD_RULES){
    if(rule.keys.some(k=>t.includes(k.toLowerCase()))){
      return { react:rule.react, text:fill(pick(rule.replies), cfg) };
    }
  }
  if(cfg.unlocked && Math.random()<0.35){
    const u=pick(UNLOCKED_LINES); return { react:u.react, text:fill(u.text,cfg) };
  }
  const f=pick(FALLBACK); return { react:f.react, text:fill(f.text,cfg) };
}

export function reactForPart(part, cfg){
  const list = PART_REACTIONS[part] || PART_REACTIONS.body;
  const r = pick(list);
  return { react:r.react, text:fill(r.text, cfg) };
}

export function milestoneText(at, cfg){
  const m = MILESTONES.find(m=>m.at===at);
  return m ? fill(m.text, cfg) : null;
}
