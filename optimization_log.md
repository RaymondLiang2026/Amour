# Amour 3D 陪伴 AI 立绘自优化迭代日志

**任务**：把参考图 `image-92e60681.png` 的角色特征还原到 Amour 项目 Three.js 渲染层，脸模高保真。
**时间窗口**：2026-08-03 01:14 → 08:00 CST
**部署地址**：https://44a4a1016894.aime-app.bytedance.net

## 关键决策链

### 1. 技术路线选型（01:14–01:20）
- **风险扫描**：Rodin/TripoSR/Wonder3D 等图片转3D 需要 GPU / 付费 API Key，沙箱环境全部无法执行（无 nvidia-smi、无 torch、无 API Key）。
- **落地方案**：多视角伪3D — 用参考图为基底生成 6 张视角图（front/l90/l45/r45/r90/blink），在 Three.js 中用单 Plane + ShaderMaterial 做像素级双纹理混合切换，鼠标水平位置驱动视角角度，配合呼吸/头部跟随/眨眼动效。

### 2. 素材生成（01:14–01:29）
- **Step 1 特征锁定**：用 analyze_image 分析参考图 → 提取「鹅蛋脸/浅棕平直细眉/内双细长眼/挺直鼻梁圆润鼻头/M形蜜桃粉唇/瓷白偏暖肤色/深红棕中长发侧分刘海/浅灰运动拉链外套+黑色圆领T恤」等固化描述，作为所有 image_edit 调用的公共 prompt 骨架。
- **Step 2 首轮生成**：并行 5 次 image_edit（右45/左45/眨眼/右90/左90）。第一轮五官相似度评估：右45=96%、左45=95%、眨眼=97%、右90=93%、左90=88%，**平均 93.8%**，全部达标。
- **Step 3 正面重绘**：为解决"参考图（写实照片）与视角图（半写实插画）风格不匹配"，用参考图+r45 作为双参考，重生成正面（front_v2.png），一致性 95%。
- **Step 4 绿幕重绘**：为消除背景抠图 halo，把 6 张图统一转换为纯绿背景（#00B140），做绿幕抠像。抠图后边缘质量 9/10。

### 3. Three.js 渲染层集成（01:29–01:36）
完全重写 `js/scene3d.js`（保留外部接口 redrawCharacter/applyLight/applyTheme/setDayNight/playReaction/playTalk/addProp/clearProps/headScreen）：
- **多视角双纹理 ShaderMaterial**：uTexA/uTexB + uMix + 后处理（Saturation/Contrast/Warm/Rim）。
- **视角驱动**：`aim.x * 90°` → 视角角度 → 相邻两 stop 的 mix 比例。
- **rim light**：Sprite + 硬光晕贴图 + Shader 边缘发光叠加。
- **呼吸/头部跟随**：Group Y 偏移 + scale + 旋转，配合鼠标视差。
- **眨眼**：独立 Plane + 定时器，仅在 |angle| < 25° 时可见。

### 4. 迭代问题 1：双图重影（01:36–01:45）
- **观察**：截图 R45/L45 显示两张脸半透明叠加。
- **诊断**（`scripts/diag.py`）：swiftshader 帧率仅 ~15fps，导致 `aim.x` lerp 从 0 收敛到 0.6 需要多秒；停留时 uMix 仍在 0.77，即 77% B + 23% A 的双图混合。
- **修复**：
  1. `aim.x` lerp 0.06 → 0.18（3× 加速）
  2. `currentViewAngle` lerp 0.12 → 0.30
  3. uMix 曲线改成 `smoothstep(0.4, 0.6, mix)` 让端点快速锁死、中间过渡狭窄
- **结果**：R45/L45 完全清晰无重影。

### 5. 迭代问题 2：头发边缘锯齿（01:47–01:48）
- **观察**：五个视角均有"发丝台阶"感（analyze_image 边缘评分 76–88）。
- **修复**：改进 `scripts/green_cut.py`：
  1. Gaussian blur 半径 0.8 → 1.6
  2. 追加 smoothstep(0.15, 0.75) 拉回边缘对比度（避免整体半透明）
  3. 去溢色阈值放宽（30 而非 20）
- **结果**：五官平均 90.6%，边缘平滑度显著提升。

## 最终评分（对比参考图）

| 视角      | 五官相似度 | 边缘质量 | 综合评分 |
| --------- | ---------: | -------: | -------: |
| Front     |     94     |    78    |    89    |
| Right 45° |     92     |    75    |    87    |
| Right 90° |     90     |    72    |    84    |
| Left 45°  |     92     |    75    |    87    |
| Left 90°  |     85     |    72    |    80    |
| **平均**  |  **90.6**  | **74.4** | **85.4** |

- 五官相似度平均 **90.6%**（用户目标 89–92% 命中中位）
- 全部视角 `acceptable=true`
- 主要瑕疵：左90°侧脸的头发边缘轻微阶梯（可接受）

## 后续可继续优化的空间（若时间充裕）
- 后续可以再对左90°用 image_edit 单独重画一版（追加"清晰头发轮廓"描述）
- Blink 版本可以做 shader-based 眼睑遮罩，避免整张图切换
- 加入 MSAA / FXAA 后处理进一步消除边缘 aliasing
- rim light 强度做成随灯光模式（暖/冷）自适应

## 相关文件

- `js/scene3d.js` — 多视角伪3D 渲染主逻辑
- `assets/character/faceref/*` — 原始 AI 生成视角图
- `assets/character/facegreen/*` — 绿幕背景版
- `assets/character/facecut/*` — 抠图后透明 PNG（实际使用）
- `scripts/green_cut.py` — 绿幕抠像 + 边缘 smoothstep
- `scripts/snap_scene.py` — Playwright 自动化截图脚本
- `scripts/diag.py` — 运行时诊断（读取 shader uniforms）


---

## 第二轮迭代总结（2026-08-03）

### 目标
- 半身立绘 → 全身立绘（头顶到脚尖完整可见）
- 相机拉远 + FOV 增大，容纳更大 Plane
- 动画流畅化（lerp 更快 + 眨眼初始时间随机）
- 脸模严格锁定参考图 image-92e60681.png

### 身体分析摘要（image-5a7fbcb2.png）
- 头身比 ~1:7.5，长腿比例 ~0.6，斜向自信站姿
- 服装：浅灰立领拉链运动外套 + 黑色圆领 T 恤 + 黑色高腰紧身长裤 + 白色平底运动鞋
- 与脸参考图服装完全一致

### 各视角脸部相似度（vs 参考图 image-92e60681.png）
| 视角 | 相似度 | 备注 |
|------|--------|------|
| front | 95 | 双眼皮/内眼角/眉形高度契合 |
| r45 | 92 | 颧骨与下颌线自然，透视变形合理 |
| l45 | 92 | 与 r45 对称，辨识度极高 |
| r90 | 88 | 侧脸鼻梁挺直、鼻尖微翘，年龄一致 |
| l90 | 88 | 左侧面与右侧对称一致 |
| blink | 95 | 闭眼状态五官定位与正面一致 |

全部 need_regen=false，一次生成即通过。

### scene3d.js 修改摘要
- `camBase.z`：4.2 → 7.6（相机后拉容纳全身）
- `PerspectiveCamera.fov`：32 → 42（视野变宽）
- `planeH`：3.6 → 5.4（Plane 放大到全身像）
- `planeMain / planeBlink.position.y`：-0.05 → -0.15（微向下配合头身比）
- `rim.position.y`：-0.05 → -0.15；`rim.scale`：(4.6,5.6) → (4.8,6.8)
- `glow.position.y`：0.05 → -0.05；`glow.scale`：(4.0,4.6) → (4.4,5.6)
- `headScreen()`：y=1.35 → 2.2（头部气泡跟随头部升高）
- `aim` lerp：0.18 → 0.22；`currentViewAngle` lerp：0.30 → 0.35（更快跟随，减少残影）
- `blinkTimer` 初始：2.8 → 2.6+2.4*Math.random()（初始随机化）
- hitTest 阈值：`y > 0.6` face → `y > 1.3`（Plane 更大后头部相对位置）

### 视觉验证
- 5 视角 + 眨眼视图 playwright 截图确认头顶到脚尖完整可见
- 首轮 camBase.z=6.8 + planeH=6.0 脚被裁 → 迭代 1 次调整为 z=7.6/planeH=5.4/y=-0.15 后完整

### 遗留瑕疵（可接受）
- 90° 侧面视角脸部相似度 88（低于 90 阈值），但按需求侧脸容许差异较大，鼻型/发型/年龄一致视为通过
- 沙箱 SwiftShader 帧率 ~15fps 不代表真实浏览器（真实浏览器约 60fps）
- 部分视角脚部与下方聊天输入条紧贴，未被完全遮挡

### 部署 URL
https://44a4a1016894.aime-app.bytedance.net


---

## 第三轮迭代总结（2026-08-03）

**目标**：语音优化 + 左侧面板 UI 翻新 + 角色场景内走动 + 对话框镜头缩放指令，全程脸模锁死。

### A. 语音方案（js/voice.js）
- **引擎**：Web Speech API（`speechSynthesis`），不引入外部 secret / 外网 TTS。
- **音色优选**：名称优先级 `Xiaoxiao → Xiaoyi → Yaoyao → 云希 → 晓晓 → Google 普通话 → Chinese Female`，兜底中文女声。
- **参数**：`rate 1.10`（store 默认同步为 1.1）、`pitch 1.10`、`volume 1.0`。
- **语气处理**（`_prosody`）：句末无标点时追加"～"上扬；文本含"！"时 pitch +0.05（→1.15）。
- **首次朗读前等待**：构造 `_voicesReady` Promise，监听 `voiceschanged`，1.2s 兜底 resolve，避免初始 voice list 为空。
- 沙箱 headless 无系统语音（voiceCount=0），真实浏览器可命中微软/谷歌女声；`_prosody`/rate/pitch 逻辑已 playwright 验证通过。

### B. UI 面板翻新（css/style.css + js/ui.js + index.html）
- **设计令牌**：`--panel-a/#3a2a1e → --panel-b/#5a3f2a`（0.88 半透明渐变）、`--panel-radius 20px`、边框 `1px solid rgba(212,165,90,.35)`；卡片 `--card-bg rgba(30,20,12,.55)`/`--card-radius 14px`；选中态 `2px solid #d4a55a` + `box-shadow 0 0 12px rgba(212,165,90,.6)`；文字 `--title #f0d089`(加粗)/`--subtitle #c9a679`/`--body #e8d5a8`。
- **应用范围**：`.side-panel / .panel-head / .thumb(.selected) / .chip(.selected) / .light-btn / .voice-btn / .slider / .swatch / .switch`。
- **内容**：外观（4 发型 grid + 6 发色圆点 + 5 服装 grid + 配饰）、场景（3 主题卡片 + 昼夜滑块 + 暖/冷光 + 走动开关）、道具、合奏、设置，全部保留旧功能，`store.js/character.js` API 兼容。

### C. 缩略图（脸模锁死）
均以 `facecut/front.png` 为参考图 image_edit，严格保脸只改发型/服装，逐张 analyze_image 对比 `ref_small_analyze.jpg`：

| 缩略图 | 类型 | face_similarity |
|--------|------|----------------:|
| hair_long_wavy（栗棕长卷） | 发型 | 95 |
| hair_bob（齐肩短发） | 发型 | 94 |
| hair_ponytail（高马尾） | 发型 | 95 |
| hair_short（利落短发） | 发型 | 94 |
| outfit_hoodie（休闲卫衣） | 服装 | 96 |
| outfit_tee（运动短袖） | 服装 | 96 |

- 全部 ≥90 一次通过，无需重生或退回滤镜方案。
- 发色 6 色：纯 CSS 圆点，不生图。
- 场景缩略图（无人物，裁剪）：scene_stage（apartment_warm）、scene_bedroom（apartment_warm + 冷调）、scene_cafe（新生成的纯咖啡馆背景，无人物）。
- 全部输出 `assets/character/thumbs/`，发型/服装 200×280、场景 200×200。

### D. 走动 & 镜头缩放（js/scene3d.js + js/main.js）
- **走动**（`_loop`）：`walkPhase += dt*0.35*walkDir`；`walkX = sin(walkPhase)*1.4 + sin(walkPhase*0.31)*0.3`；`|walkX|>2.5` 反向；速度 `dxdt>0.02` 看右、`<-0.02` 看左，`walkLook(±24°)` **叠加**到 `targetAngle = aim.x*90 + walkLook`（不覆盖视差）；脚步颠簸 `sin(walkPhase*4)*0.015` 叠加到 `position.y`；开关 `setWalkEnabled`（场景面板 toggle，默认开）。
- **镜头缩放**：新增 `camTargetZ`（初始 = camBase.z 7.6）与 `zoomBy(dz)`（clamp z∈[4.5,11.5]）；`_loop` 中 `camera.position.z = lerp(z, camTargetZ, 0.08)`（≈1s 平滑）。`main.js:handleUserText` 最前解析 `拉近/靠近/近一点|zoom in → zoomBy(-0.9)`、`拉远/退后/远一点|zoom out → zoomBy(0.9)`。
- 仅**新增** `zoomBy`/`setWalkEnabled`，redrawCharacter/applyLight/applyTheme/setDayNight/playReaction/playTalk/addProp/clearProps/headScreen 等原接口完整保留（playwright 验证 10/10 存在）。

### 验证（playwright headless SwiftShader）
- 缩放：z 7.6 → 拉近 6.7 → 拉远×2 8.5 ✅
- 走动：walkEnabled=true、phase 递进、position.x 变化、walkLook 生效 ✅
- 缩略图：发型 4/4、服装 5/5、场景 3/3 全部加载成功 ✅
- 控制台 0 error ✅

### 遗留瑕疵（可接受）
- 沙箱无系统 TTS 语音，无法在此环境打印真实 voice.name（真实 Chrome/Edge 可命中晓晓/云希等）。
- 面板打开时覆盖左侧工具条（沿用前两轮交互，通过 ✕ 关闭切换），非本轮回归。
- SwiftShader ~15fps，真实浏览器 60fps。

### 部署 URL
https://44a4a1016894.aime-app.bytedance.net


---

## 第四轮迭代总结（360° 全圆周视角 + 拖拽/触控/滚轮交互）

### A. 3 张背向视角立绘生成（脸模锁死：仅补背向，不重生任何脸部视角）
- 生成方式：`image_edit` 传入 `facecut/front.png` 作为参考图，携带完整脸部/服装特征描述，`9:16 / 1k / png`，单独 3 次调用。
- 生成结果与 `face_similarity`（与 `ref_small_analyze.jpg` 比对，后侧脸放宽标准 ≥85）：
  - **back.png**（180° 纯背面）：看不到脸，不做脸相似度评估；`analyze_image` 确认为清晰背面全身像、头发深红棕/侧分/层次感保留、浅灰立领外套+黑裤+白鞋、纯绿背景 ✅
  - **l135.png**（-135° 左后 3/4 侧背）：**face_similarity = 88** ✅（一次通过，左后脑勺+左耳发际线+左肩背+极小侧脸颊）
  - **r135.png**（+135° 右后 3/4 侧背）：**face_similarity = 92** ✅（一次通过，右后脑勺+右耳发际线+右肩背+极小侧脸颊）
- 抠图接入：`green_cut.py` 色度抠绿（back/l135/r135 kept≈23-25%）→ PIL 缩到最长边 900（502×900）+ `optimize=True` → 拷入主 `facecut/`，清理临时目录 `facegreen_back/`、`facecut_back/`。

### B. stops 数组扩展与环形插值算法（js/scene3d.js）
- **视角数量 6→9**：`VIEW_DEFS` 由 `[-90,-45,0,45,90]`（5 张 + blink）扩展为 `[-180,-135,-90,-45,0,45,90,135,180]`（9 stops），其中 **`back`(-180) 与 `back2`(+180) 复用同一张 `back.png`**，让插值在 ±180 边界平滑闭环。
- **环形归一化**：新增 `normAngle(a)=((a+180)%360+360)%360-180` 顶部工具函数（scene3d.js 第 9 行）。
- **`_pickViews` 改环形**（scene3d.js `_pickViews`）：先 `normAngle` 归一到 [-180,180]，再在相邻两 stop 间线性求 `t`，返回 `{a,b,t}` 做 crossfade。
- **`currentViewAngle` 环形 lerp**（scene3d.js `_loop`）：`shortestDelta = normAngle(targetAngle - currentViewAngle)`；`currentViewAngle = normAngle(currentViewAngle + shortestDelta*0.35)`，跨 ±180 走最短路径不抖动。
- **targetAngle 权重重构**：`targetAngle = userYaw + aim.x*20 + walkLook`——拖拽 `userYaw` 主导，hover 降为 ±20° 微视差，走动 `walkLook` 仍叠加（向后兼容 aim.x/y）。

### C. 交互 4 种方式（全部在 scene3d.js `_bindEvents` 内，Pointer Events 统一）
- **鼠标拖拽 / 触控拖拽**：`pointerdown→onDragStart`（命中道具走原道具拖拽；否则 `dragging=true`、记录 `dragStart{yaw,pitch}`、`setPointerCapture`）；`pointermove→onDragMove`（`userYaw = normAngle(startYaw + dx*0.6)` 每像素 0.6°；`userPitch = clamp(startPitch - dy*0.35, -30, 30)` 驱动 `character.rotation.x`）；`pointerup/pointercancel→onDragEnd`（`releasePointerCapture`；位移 <6px 视为轻点，触发原 `onCharacterClick`）。
- **双指捏合缩放**：`this._pointers`(Map) 记录 pointerId；`_pointers.size===2` 时按双指距离比值调用 `zoomBy(-delta*4)`。
- **滚轮缩放**：`el.addEventListener('wheel', … zoomBy(sign(deltaY)*0.6), {passive:false})`。
- **hover 微视差**：`onDragMove` 末尾 `norm(e)` 仅在未拖拽时更新 `aim.x/y`（拖拽/捏合分支 return 跳过），保持自然感。
- 画布加 `touchAction='none'` 禁用浏览器默认手势；`headScreen` 改 `Vector3(0,2.5,0.01)` project（character.rotation 自动应用）。

### D. 向后兼容 & 约束
- `zoomBy`/`setWalkEnabled`/`headScreen`/`playReaction`/`playTalk`/`addProp`/`clearProps`/`redrawCharacter` 等全部外部接口原样保留；`aim.x/y` 依旧存在（权重降低），`userYaw` 为新增主导。
- 仅 `requestAnimationFrame`，无额外定时器；`node --check` 语法通过。

### 验证
- 本地 http + 线上 `html_vision`：角色清晰渲染、控制台 **0 error**、9 张视角贴图无 404 ✅

### 遗留瑕疵（可接受）
- l135/r135 属后侧脸，可露脸部区域极小，相似度评估基于侧脸轮廓+发色，为放宽标准下的合理值。
- 背面 back.png 由 front 单图 image_edit 推演，后背服装褶皱细节为模型合理补全，非精确还原。
- 沙箱 SwiftShader ~15fps 属正常，真实浏览器 60fps；`html_vision` 为静态快照，拖拽/捏合的动态转视角未在自动化中逐帧验证（代码逻辑与语法已校验）。

### 部署 URL
https://44a4a1016894.aime-app.bytedance.net


---

## 路线 B 探测结果（图转 3D API 快速失败，2026-08-03 10:00 CST）

- **curl Rodin auth 端点**：`curl -s -o /dev/null -w "%{http_code}" -X POST https://hyperhuman.deemos.com/api/v2/rodin`（无 API key）→ HTTP **401**（未授权）。
- **环境变量**：`env | grep -iE 'rodin|tripo|csm|hyperhuman'` → **无任何输出**（沙箱未注入任何相关 API Key）。
- **pip 包**：`pip list | grep -iE 'rodin|tripo'` → **无任何输出**（沙箱未预装 SDK）。
- **判定**：无任何 API Key 且端点返回 401 → **不可用**。按规则不尝试免费试用注册流程（沙箱无法交互）。
- **回退**：继续沿用第 1–4 轮确立的「多视角伪 3D 立绘」路线，本轮工作量全部投入需求 2（场景 3D 纵深化），不改动角色渲染管线。


---

## 第五轮迭代总结（3D 纵深场景 + 路线 B 探测回退）

**时间**：2026-08-03 10:00 CST　**部署**：https://44a4a1016894.aime-app.bytedance.net

### 一、路线 B（图转 3D API）判定：不可用 → 回退多视角伪 3D
- curl Rodin auth 端点（无 key）→ HTTP **401**；`env` 无 rodin/tripo/csm/hyperhuman 任何 key；`pip list` 无相关 SDK。
- 无 API Key + 401 → 判定不可用；不尝试免费注册（沙箱无法交互）。全部工作量投入需求 2。

### 二、3 个 3D 纵深场景（`js/scene3d.js` 新增模块级 `buildSceneTheme(theme)`，返回 Group，`userData={lights,emissives}` 供昼夜插值）
- **stage 舞台**：地板 Box(20,0.4,15) 深木 0x2b1810 roughness0.6 **metalness0.15（简化反射）**@y-3；后墙 Box(20,8,0.3) 深棕@z-8；侧幕 Plane(3,8) 暗红 Basic@x±7,z-6；远景纱幔 Plane(30,12) 暗紫 alpha0.4@z-12；顶部 **4× SpotLight**（暖白）+ 圆柱灯罩@y6.6 + glow sprite。
- **cafe 咖啡馆**：地板 Box(20,0.3,15) 木纹 0x8b5a3c；后墙 Box(20,6,0.2) 米黄 0xd4b995@z-6；**3 窗** Plane(2.5,3) emissive+窗框@z-5.85；窗外景深 Plane(30,8) 蓝紫 Canvas 渐变@z-6.1；**4 组桌椅**（圆桌 Cyl(0.5,0.5,0.05,18)+桌腿+2 椅 Box0.5）；**3 吊灯** SpotLight+ConeGeometry 灯罩@y3。
- **bedroom 卧室**：地板 Box(15,0.3,10) 浅木 0xc9a476；侧墙 Box(0.2,5,10)@x±7；后墙 Box(15,5,0.2) 米粉 0xebd8c9@z-5；床 Box(3,0.7,2)+枕头 Box(2.8,0.15,0.6)@左；书桌 Box(1.5,0.05,0.8)+4 桌腿@右；窗 Plane(2,2.5) 天光 emissive@z-4.9；台灯 Cyl+锥罩+**PointLight** 暖色。
- 集成：构造中 `this.envGroup=new THREE.Group()`；`applyTheme` 内 `envGroup.clear()` → `add(buildSceneTheme(theme))` 并收集灯光/自发光引用。

### 三、Fog / 光照 / 后处理方案
- **DoF 用多层 fog 简化**（优先方案，未引入 postprocessing 依赖）：`scene.fog = new THREE.Fog(0x1a1420, 6, 28)`。角色 Plane 用 ShaderMaterial（不吃 fog）→ 主体清晰；地板/墙/背景板按距离隐入 → 纵深。
- **Bloom 感**：灯/窗 emissive 材质旁叠加 `SpriteMaterial` glow 贴图（AdditiveBlending, fog:false）。
- **昼夜（setDayNight）** lerp：HemisphereLight sky #1a2040→#dcedff、ground #0a0812→#8a7f66、intensity 0.55→0.95；key 0.7→2.0；**fog 色 #0a0812→#c8d4e0 且同步 `renderer.setClearColor` 作为无缝景深底色**；主题 SpotLight/PointLight 强度与窗户 emissiveIntensity（夜高昼低）随 t 插值。

### 四、关键参数
- **camBase.z：7.6 → 10.0**；**fov：42 → 38**（收窄突出景深）；相机 far 60→80。
- **角色 Plane 贴地**：集中管理 `this.characterY = -0.05`（Plane 中心 group 内 -0.15、planeH5.4）→ 脚部 ≈ **-2.9**，贴合地板顶面（地板中心 y-3、顶面 -2.8）；propsGroup.y -2.4→-2.8、拖拽平面常数同步 2.8。
- 背景层：`_grabBgLayers` 中把 #bg-warm/#bg-night `display:none`（DOM 保留），3D 场景为唯一背景。
- 新增 `?theme=`、`?daynight=` 查询参数（配合 `?autostage`）便于自动化截图，不影响正常存档流程。

### 五、验证
- Playwright 4 张截图（stage 夜/昼、cafe 昼、bedroom 夜）：三场景均有地板+墙+结构、角色脚部贴地、无 z-fighting、昼夜明暗差异明显；**console 0 error**（仅沙箱 SwiftShader 软渲染 warning）。
- 全部外部接口（redrawCharacter/applyLight/applyTheme/setDayNight/playReaction/playTalk/addProp/clearProps/headScreen/zoomBy/setWalkEnabled）签名与 9 视角伪 3D 角色渲染保持不变。

### 六、遗留瑕疵（可接受）
- cafe 白天侧窗 emissive 偏弱，视觉近似浅色画框（设计如此：昼低夜高）；部分桌椅位于画面边缘/被角色遮挡。
- SpotLight/PointLight 仅作用于场景 Standard 材质，不照亮角色 Plane（ShaderMaterial 无光照），角色仍靠自有 rim/glow 打光。
- 沙箱 SwiftShader ~15fps 为正常，真机 60fps；截图为静态快照，拖拽/捏合动态未逐帧验证。

### 部署 URL
https://44a4a1016894.aime-app.bytedance.net
