# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

《猫的世界》(Cat World) —— 塞尔达式俯视角开放世界游戏,玩家控制猫咪奔跑、
探险、打斗、做任务。当前为 **Web 原型阶段**(Phaser 3 + TypeScript),
验证玩法后将**迁移到 Godot 4**。

## 常用命令

| 命令 | 作用 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器(http://localhost:5173,带热更新) |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run typecheck` | 仅运行 `tsc --noEmit` 类型检查 |
| `npm run preview` | 本地预览构建产物 |

暂无测试框架与 lint 工具(原型阶段)。`tsconfig` 开启了 `strict`、
`noUnusedLocals`、`noUnusedParameters`,改动后跑 `npm run typecheck` 保证不破坏类型。

## 架构与关键约定

**分层原则(为 Godot 迁移做准备):核心玩法逻辑与 Phaser 渲染分离。**

- `src/core/` —— **引擎无关**的纯 TypeScript:数值、规则、状态机。
  不允许 `import phaser`。这一层是迁移 Godot 时要原样翻成 GDScript 的部分。
  例:`CatStats.ts`(属性 + 体力 `tickStamina`)、`Combat.ts`(攻击数值定义 +
  三连击状态机 `ComboController`,返回 `AttackSpec` 给上层执行)、
  `worldgen.ts`(用种子确定性生成地图,输出地面/障碍二维数组 + 出生点)。
- `src/entities/` —— Phaser 实体:持有 sprite 与物理体,读写 `core/` 的状态,
  处理渲染与朝向。`Cat.ts` 把移动委托 `CatStats`、连招委托 `Combat`(并提供 `heal`/`die`);
  `Enemy.ts` 是会追猫的史莱姆(追击 AI、击退、血条、死亡),按 `SlimeKind`
  (`purple`/`green`/`red`/`king`)分品种,血量/接触伤害/体型依次递增,大王(king)放大 1.9 倍;
  `Fish.ts` 是湖里的回血道具(原地摆尾游动,被吃则上浮淡出)。
- `src/scenes/` —— Phaser 场景。`BootScene` 是资源加载管线(preload 加载真实素材,
  create 生成程序化贴图 + 注册动画),`WorldScene` 是主世界(Tilemap、相机、战斗、HUD)。
- `src/art/pixelart.ts` —— 程序化像素画:用"调色板 + 字符网格"画图并切成多帧 spritesheet。
- `src/assets/manifest.ts` —— 贴图帧尺寸 + 动画清单(单一事实来源)。
- `src/config.ts` —— 全局常量(屏幕尺寸、世界尺寸、tile 大小),集中调参。
- `src/main.ts` —— Phaser 入口,组装配置并注册场景。

**数据流**:`WorldScene.update()` 读输入 → 算归一化方向 → 调 `Cat.update()`
→ `Cat` 调 `tickStamina()` 算出当前速度 → 设置物理速度。新玩法尽量遵循
"场景收集输入 → 实体协调 → core 算规则"这条链路。

**战斗的命中判定**采用即时圆形重叠检测(非物理碰撞体):`Cat` 攻击返回 `AttackSpec`,
`WorldScene.spawnHit/updateHit` 用它在猫前方(爪击)或猫身(冲刺跟随)生成一个圆形判定,
每帧检查与敌人的距离,每个敌人每次攻击只命中一次(`hitSet` 去重)。**已无半圆挥击特效**
(原 `Cat.playSlash` 已删,命中判定与表现解耦,判定不依赖任何特效)。

攻击输入分两类:
- **爪击三连**:左键 `pointerdown` / 手柄 X `down` 事件边沿触发 → `queuedAttack`,update 消费;
  连招节奏由 `ComboController` 的硬直/接招窗口控制。**第1下左爪(cat-attack)、第2下右爪(cat-attack2)、
  第3下改为短距飞扑**(`CLAW_COMBO[2].kind="dash"`,`dashSpeed` 同右键但 `dashMs` 仅 1/4 → 位移约
  右键飞扑的 1/4;`AttackSpec.dashMs` 让"位移时长"与"命中时长 activeMs"解耦)。伤害:7 / 10 / 24
  (鼓励打完整连招)。第3下击退 `knockback=240`,配 `stunMs=1000` 的 **1 秒硬僵直**(恰好等于
  `core/Combat.ts` 的 `HARD_STUN_MS` 阈值,可打断恐龙喷火/前摇;调数值时第三击必须 ≥ 该阈值)。
  僵直敌人不动、不造成接触伤害(见下),让猫收招后能贴着敌人安全输出。
  `Cat.tryClaw` 按 `spec.comboIndex` 选左/右爪动画,遇 `kind==="dash"` 走 `startDash`。
- **飞扑(冲刺重击)**:改为**愤怒条**驱动。怒气 `CatStats.rage/maxRage`(默认 0/100):右键/手柄 Y **按住**→
  `Cat.beginCharge`(原地不动、可瞄准,update 里按 `RAGE_FULL_CHARGE_MS`=2.5 秒从 0 充满的速率涨怒气),
  **打中敌人**也涨怒气(`WorldScene.updateHit` 里 `cat.addRage(命中伤害)`)。**松开**→ `Cat.releaseCharge`:
  **怒气满**才发动飞扑、清空怒气并返回 `AttackSpec`;没满则取消、**怒气保留**。`WorldScene` 用 `pointerup`/
  手柄 `up` 触发松开,并在 update 里用 `isDashHeld()` 兜底(背包/对话打开时不补发,打开瞬间已
  `Cat.cancelCharge` 取消蓄力,防误触打出飞扑)。**怒气已满时按下右键/Y 直接瞬发**
  (`Cat.tryInstantDash`,无需蓄力圈)。飞扑伤害 34(对得起 2.5 秒蓄力),`stunMs=2500` 2.5 秒硬僵直,
  `dashMs` 显式 220(与三连第三击的 `dashMs:55` 对称,不靠 `??` 兜底)。HUD 第三条(橙,满了变绿)显示怒气。

**攻击时停止移动**:爪击硬直窗口(`now < attackAnimUntil`)内 `Cat.update` 把速度清零、锁定朝向、
只恢复体力(飞扑 dash 不算,它靠位移命中)。为此 `WorldScene.update` 把 `queuedAttack` 的消费
**移到 `cat.update()` 之前**,保证攻击当帧就能停下走/跑。

## 生命系统(回血 / 死亡 / 吃鱼)

- **回血靠吃鱼**:`WorldScene.spawnFish` 在**靠岸**(四邻有可走地块)的水瓦片上放最多 6 条鱼,
  保证猫能从岸边够到(水不可进入)。`findEatTarget` = 捕获半径 `FISH_CAPTURE_RANGE`(52px)内、
  **且猫头朝向它**(facing 与"猫→鱼"方向点积 ≥ `FISH_FACING_DOT`=0.5,约 60°)的最近一条;
  可吃时在鱼身画脉冲高亮环。按 **E / 手柄 A** 触发 `tryEatFish` → `Cat.heal(FISH_HEAL=25)` + 冒 `+25` 飘字。
  吃鱼时小恐龙宠物会开心一跳(`Pet.happy()`)。
- **森林回血靠浆果丛**:`ForestScene` 出生点附近 3 丛(`entities/BerryBush.ts`),靠近按 E 摘 +15 血,
  摘完变灰 45 秒后长回(有绿环提示 + 重生弹跳)。
- **死亡 → 重来**:`Cat.tryTakeDamage` 已把血夹到 ≥0;`WorldScene.update` 末尾检测 `health<=0`
  调 `gameOver`:置 `dead`(update 提前 return 冻结世界)、`physics.pause()`、`Cat.die()`(变灰停动画)、
  铺半透明遮罩 + "猫咪倒下了…" 对话框,监听 `keydown-R` / `pointerdown` 一次 → `scene.restart()`(create 全量重置)。
  **孩子向:死亡调 `runState.softReset()` 不清空任何战利品**(背包/宠物/孵化/皮肤/计数全保留),惩罚仅为回出生点重来。

**敌人/小鱼再生**:`collectSpawnTiles` 一次性缓存"敌人可生成瓦片(可走、离出生点 >320)"和
"靠岸水瓦片"。每色史莱姆(`SLIME_MAX` 紫4/绿3/红2/王1)和小鱼(`FISH_MAX`=6)各登记一个
`SpawnGroup`。`updateRespawn`:某群体被打/吃到 **<=1** 时进入 `regen`,之后每隔
`RESPAWN_INTERVAL_MS`(6 秒)补 1 个(补充用 `spawnEnemyOfKind(avoidCat=true)` 躲开猫,别刷脸上),
补满 `max` 后停 `regen`。大王 `max=1`,被清掉后也按此补回 1 只。

**僵直(stun)**:`AttackSpec.stunMs` 经 `ActiveHit` 传到 `Enemy.takeDamage(...,stunMs=220)`,设 `stunUntil`。
`Enemy.isStunned(now)` 为真时:`update` 不追猫,且 `WorldScene` 的接触伤害检测**跳过该敌人**(僵直敌人不掉猫血)。
长僵直(>= `HARD_STUN_MS`,见 `core/Combat.ts`)额外泛蓝(`hardStunUntil` + 蓝 tint,到点在 update 清掉)。
恐龙同理:只有硬僵直能打断喷火**和前摇**(前摇被打断会清掉泛红预警);普通爪击在喷火/前摇期间只掉血。
恐龙开火前会先拉近到火舌射程内(`FLAME_COMMIT_DIST` = 火舌长 + 24),不会再"空喷"。

## 本轮新增(2026-10-04):bug 修复 + 玩法补完 + 打击感

**修的真 bug**:
- 金钥匙锁死:金史莱姆随机选点 12 次全失败时不再置 `goldSpawned`,下次杀恐龙(补充的也算)重试,奖励链不断。
- 恐龙"空喷":开火前先拉近到 `FLAME_COMMIT_DIST`(火舌长+24)内再进前摇;前摇可被硬僵直打断(清泛红)。
- 战斗中按 E 不再能逃出橘猫战(仅 play/won 阶段可回主世界)。
- 开背包瞬间 `Cat.cancelCharge()` 取消蓄力(怒气保留),且背包/对话打开时蓄力兜底不补发 → 背包开着打不出飞扑。
- 绿史莱姆 70→69,三连(7+10+24)+飞扑(34)一套带走,数值对齐"整套带走"设计。
- 第三击数值定案为代码的 1000/240(文档已同步),并收成 `core/Combat.ts` 的 `HARD_STUN_MS` 具名常量,Enemy/Dino 共用。
- 金爪清零时 `Inventory.remove()` 自动卸下,不再静默自动重装备。
- 橘猫改物理体 + 速度移动(96px/秒,delta 步进):不再穿墙、不随帧率变;战斗击退改 delta 积分。

**补的玩法断点**:
- **宝箱 + 黑猫皮肤**:主世界出生点附近有宝箱,金钥匙开它 → 解锁黑猫皮肤(同版式真实素材 `public/assets/cat-black.png`,
  `manifest` 里 `catb-` 前缀全套动画),自动换上;B 背包可换回白猫。金钥匙说明已更新,不再是"暂未开放"。
- **橘猫胜利结算**:打赢后 3 句收尾对话 → 回满血 + 生命上限 +20 → 20 秒后刷回新松鼠。`loseBattle` 踢回主世界不变。
- **森林回血**:3 丛浆果丛(E 摘 +15,45 秒长回)。
- **松鼠计数成就**:`runState.squirrelsCaught`,第 1/3/5 只抓到时庆祝;打赢橘猫后松鼠可重复抓。
- **死亡惩罚**:`runState.softReset()` 保留一切战利品,只回出生点。
- **任务指引**:主世界/森林 HUD 第二行一句话目标(`getQuestText()`),随进度推进。
- **宠物**:吃鱼/摘果时开心一跳 + 冒 ❤;跟随中每 ~9 秒自动冒一次 ❤。
- 长按 `2` 传送森林改为仅 `DEV` 模式可用(调试后门不进正式玩法)。

**打击感 + 音效**:
- 命中顿帧 50ms(`hitStop`:暂停整个场景,原生 setTimeout 恢复)+ 飞扑命中震屏 + 猫受击红闪(120ms)。
- `src/audio/sfx.ts`:Web Audio 全合成音效(挥/命中/飞扑/吃/拾取/钥匙/门/胜/败/点击/孵化/受伤/浆果),零素材;
  `main.ts` 在首次用户手势时 `initSfx()`(浏览器自动播放策略),M 键静音(两场景都有提示)。

## 地图(Tilemap)

`core/worldgen.ts` 用种子(`config.ts` 的 `WORLD_SEED`)确定性生成两张二维数组:
`ground`(草/路/水/沙/森林/花)和 `obstacles`(树/石头)。`WorldScene.buildTilemap()`
据此建两张 Phaser 图层:地面层(水设碰撞)+ 障碍层(全碰撞),猫和敌人都与两层 collide。
瓦片索引(`TILE` 常量)= `BootScene.makeTilesetTexture` 里横向绘制的帧顺序,**两边必须一致**。
改地图布局改 `worldgen.ts`;换地图换 `WORLD_SEED`。

## 美术与动画管线

**猫**用真实 CC0 素材:`public/assets/cat.png`(白猫,64×64,14 列 × 72 行;源文件含
其它配色/aseprite/调色板在 `src/assets/cat/`)。`manifest.ts` 里 `cat` 的 `SheetSpec.file`
指向它,`BootScene.preload` 用 `load.spritesheet` 加载。**帧索引 = 行×14 + 列**,各动画用到的帧
(已用脚本逐帧确认 + 核对朝向,见 `manifest.ts` 顶部常量)。猫是**四方向**(下/上/左/右),
**用素材里各方向的专属帧、不翻转**(素材左/右朝向不统一,翻转会反——别再用 flipX)。
`Cat.facingDir()` 按朝向向量选 `cat-{idle|walk|run|attack}-{down|up|left|right}`;待机=该方向走路首帧,
爪击暂用待机帧(挥击特效表现攻击)。右键冲刺(`jumpAnimUntil`)播 `cat-jump-{up|left|right}`,
**朝下无飞扑图**故沿用 `cat-attack-down`。奔跑用体力(`CatStats.tickStamina`)带**迟滞**:耗尽后
需回血到 35%(`exhausted`)才能再跑,避免 0 体力处每帧在 run/walk 间横跳导致动画闪烁。
`src/assets/cat/` 里还有 paw-swipe/sleep 等动画可后续接入(如把 paw-swipe 接到爪击)。

**瓦片/敌人/小鱼/特效**仍由 `art/pixelart.ts` 用字符网格程序化生成为 spritesheet,动画同样在
`manifest.ts` 的 `ANIMS` 定义、由 `BootScene` 注册。`generatePixelArt` 会跳过已从 `file` 加载的 key。
**史莱姆**用同一套字符网格(`SLIME0/1`)配 `SLIME_PALETTES`(紫/绿/红/蓝王)换色 → 每色一张独立纹理
(`buildSlimes` 逐 key 跳过已存在的),`Enemy` 的 `SLIME_DEFS` 按品种选纹理+数值。**小鱼**(`buildFish`)
是橙色 2 帧摆尾。

**接入真实素材**:在 `manifest.ts` 给对应 `SheetSpec` 填 `file`(图片 URL)和正确的
`frameWidth/Height`,`BootScene.preload` 会自动改走 `this.load.spritesheet` 加载,
`generatePixelArt` 会跳过已加载的 key。实体/动画/命中数值都不用改,只要帧索引含义一致。
注意:`tiles` 的帧顺序必须与 `core/worldgen.ts` 的 `TILE` 常量一致。

## 里程碑存档

`public/snapshots/` 存放各开发节点的**独立冻结副本**,不依赖当前 `src/`、不受后续改动影响。
入口 `public/snapshots/home.html`(里程碑主页)。已有:`v1.html`(初版原型,单文件)、
`v2.html` + `v2/assets/`(程序化四方向猫,构建产物)、`v3.html` + `v3/assets/`(首次接入真实白猫,
**故意定格了"跑到体力耗尽时奔跑动画 run/walk 每帧横跳→闪烁"的 bug**:把 `core/CatStats.ts`
回退成无 `exhausted` 迟滞的版本即复现)。
**重要:入口 HTML 必须用非 `index.html` 的文件名**(如 `vN.html`、`home.html`)。Vite 开发服务器会把
`index.html` 和裸目录路径(`/snapshots/`、`/snapshots/v2/`)劫持成主应用(显示最新游戏),
只有独立文件名(`v1.html`)才会被当静态文件正常返回。
两种格式:
- **简单节点 → 单文件 HTML**:内联当时游戏代码 + 本地 `lib/phaser-3.90.min.js`(见 `v1.html`)。
- **复杂节点 → vite 构建快照**:把整个 `src` 复制到临时目录,回退少数已改动的文件到当时版本,
  再构建成静态副本。复现 v2 的命令(关键:`--base=./` 相对路径;在 Git Bash 里前缀
  `MSYS_NO_PATHCONV=1`,否则 `/xxx` 会被转成 Windows 路径导致 bundle 404):
  ```
  cp -r src .v2tmp/src && cp index.html vite.config.ts tsconfig.json package.json .v2tmp/
  # 在 .v2tmp 里把回退到当时版本的文件覆盖好（v2 改了 CatStats/manifest/Cat 三个）
  cd .vNtmp && MSYS_NO_PATHCONV=1 node ../node_modules/vite/bin/vite.js build \
    --base=./ --outDir=../public/snapshots/vN --emptyOutDir
  # 删掉 vN/assets/*.map 和 .vNtmp；把 vN/index.html 改名/复制成 snapshots/vN.html，
  # 并把它的 <script src> 改成 ./vN/assets/xxx.js（带存档水印 div）；最后在 home.html 加一条
  ```
  **两条离线(file://双击)必坑,务必照做**:
  1. **入口脚本用 `<script defer src="./vN/assets/xxx.js">`,不要 vite 默认的 `type="module"`**。
     产物是单 chunk IIFE(无 import/export),而 `type="module"` 在 `file://` 下会被 CORS 拦截→白屏;
     `defer` 既避开 module 又保证在 `#game` 解析后执行。可在临时 `vite.config.ts` 里加
     `build.rollupOptions.output.inlineDynamicImports:true`(+`sourcemap:false`)确保单 chunk。
  2. **运行时按字符串 URL 加载的外部图片(如 `manifest.ts` 的 `cat` `file:"/assets/cat.png"`)必须内联成
     base64 `data:` URI**——不能只把 png 拷进快照目录用相对路径,因为**浏览器禁止 `file://` 页面 fetch 本地图片**,
     双击打开时会加载失败→`generatePixelArt` 回退成程序化贴图(V3 就因此一度显示成橘猫)。做法:构建前用 node 把
     `public/assets/cat.png` 读成 base64,替换临时 `manifest.ts` 里 cat 的 `file` 值为 `data:image/png;base64,...`;
     并在临时 `vite.config.ts` 设 `assetsInlineLimit:0`。`data:` URI 不走网络、不污染 WebGL 纹理,`file://` 可用。
     验证:抓产物里最长的 `data:image/png;base64,` 串解码,尺寸应为 896×4608(真白猫表)。
用户说"冻一份"时:按上面流程复刻当前可玩状态为新的 `vN`,并在 index 里加一条。

## 调试技巧

- `src/main.ts` 里把 `arcade.debug` 改为 `true`,可显示所有碰撞体边框。
- `src/main.ts` 仅开发模式(`import.meta.env.DEV`)把 `Phaser.Game` 挂到 `window.game`,
  方便控制台/自动化读写场景状态(如 `window.game.scene.getScene("World")`)。生产构建会被摇树去掉。
