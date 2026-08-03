# Amour 写实 2.5D 重构方案（根治版）

目标：人物支持 180° 旋转、场景有 3D 纵深、整体写实（非卡通/动漫），并且架构上做到“单一真相源”，杜绝“改一处崩一处”。

## 一、根因结论

当前 `scene3d.js` 同时承担 背景 / 人物 / 低模道具 / 抠白底 / 旋转 / 缩放 / 昼夜 / 灯光，多来源争夺同一屏控制权，是反复崩坏的根源。截图问题（白睡袍、米黄背景、棕色大卡片）分别对应：人物图来源串线、背景层被旧渐变接管、历史低模 props 存档复活。

## 二、架构收口（单一真相源）

废弃 Three.js 主舞台混合渲染，改为纯 DOM/CSS 2.5D 合成器，拆成 5 个单职责模块：

| 文件 | 职责 | 说明 |
|------|------|------|
| `js/stage/state.js` | 唯一状态源 | `{theme, lookId, hairColorId, outfitId, yaw, zoom}`，读写集中 |
| `js/stage/theme-scene.js` | 场景背景 + 景深视差 | theme -> 写实背景图；指针移动做前/中/后景视差 |
| `js/stage/character-views.js` | 人物多视角资源映射 | lookId -> `{front,l45,l90,r45,r90,back}` 六视角图 |
| `js/stage/character-controller.js` | 旋转/缩放交互 | yaw∈[-90,90] 映射最近视角 + crossfade；zoom 控 scale |
| `js/stage/stage-compositor.js` | 合成到 `#stage-root` | 背景层 + 人物层，唯一渲染出口 |

旧文件处理：`scene3d.js`/`scene3d_glb.js` 退出主链路（保留文件但不再被 `main.js` 引入）；低模 props 体系整体下线；历史存档 `props` 迁移清空。

## 三、文件级实施清单

### 新增
- `js/stage/state.js`
- `js/stage/theme-scene.js`
- `js/stage/character-views.js`
- `js/stage/character-controller.js`
- `js/stage/stage-compositor.js`
- `css/stage-2d5.css`（背景层、人物层、视差、旋转/缩放、暗角）

### 修改
- `index.html`：引入 `stage-2d5.css`，`main.js` 指向新合成器，缓存参数升级到 `?v=r2d5-20260803`
- `js/main.js`：用 `stage-compositor` 替换 `Scene3D`；`updateChar()` 改为写 `state` + 触发 compositor 重绘
- `js/ui.js`：外观/场景/发色面板改为只写 `state`，不再直接操作渲染；道具面板保持下线提示
- `js/store.js`：状态字段收敛为单一真相源结构；`props` 恒为空；旧字段做兼容迁移

### 退出主链路（不删文件，仅不引用）
- `js/scene3d.js`、`js/scene3d_glb.js`

## 四、素材清单（写实、身份一致）

用 `image-generate`（写实照片风，禁止卡通/动漫），以同一人物身份贯穿。

### A. 人物六视角集（身份锁定，默认造型 look_signature）
1. `front`（正面 0°）——先生成，作为身份基准
2. `l45`（左 45°）
3. `l90`（左 90°，正侧）
4. `r45`（右 45°）
5. `r90`（右 90°，正侧）
6. `back`（背面 180°）

风格：写实人像摄影棚质感，全身，纯浅灰摄影背景便于抠图，竖版 3:4。其余 5 视角用 `image_edit.py` 以 front 为参考图，保证同一人、同一发型、同一服装、同一光照。

### B. 写实场景背景（横版 16:9，真实透视纵深）
1. `stage`：写实小型现代演出/舞台空间，灯架+木地板反光+幕布层次
2. `cafe`：写实暖调咖啡馆室内，桌椅透视+吊灯+吧台景深+玻璃反射
3. `bedroom`：写实现代卧室，床+床头柜+窗帘+墙面体积光

存放：`assets/realistic/character/*.png`、`assets/realistic/scene/*.png`，各自带 `preview` 缩略图（缩略图与主场景同源，直接由大图缩放）。

## 五、交互规格

- 旋转：拖拽横向 → yaw∈[-90,90]（共 180°）；就近取六视角之一并对相邻视角 crossfade；脸不漂移（离散视角切换，不做单图强行扭转）。
- 缩放：滚轮/双指 → zoom 控制人物层与背景层统一 scale；范围体感明显。
- 景深：指针移动时前景/人物/背景按不同幅度平移，产生 3D 纵深；背景本身为真实透视照片。

## 六、阶段与范围（诚实边界）

- Phase 1（本次落地）：写实背景 + 默认造型六视角 180° 旋转 + 缩放 + 景深；发色/服装作为“衣橱预览”展示对应写实全身图（正面），切换时回正面。这样彻底避免“换装/换色 × 旋转”组合爆炸导致的再次串线。
- Phase 2（后续可选）：为更多造型补齐六视角，实现任意造型下的 180° 旋转。

## 七、验证

`standard-lint` + `node --check` + `git diff --check`；线上按“3 场景 × 发色四档 × 旋转/缩放”逐项回归。
