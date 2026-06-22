// 资源与动画清单：所有贴图帧、动画定义集中在此。
//
// 当前贴图由 art/pixelart.ts 程序化生成（cat / cat-ginger 用真实素材，填了 file）。
// 接入真实美术时：给对应 SheetSpec 填 `file`（图片 URL）+ 正确的 frameWidth/Height，
// BootScene.preload() 会自动改走 this.load.spritesheet 加载；未填 file 的继续用程序化贴图。
// 动画定义与命中数值无关，换图后只要帧索引含义一致即可沿用。

export interface SheetSpec {
  key: string;
  frameWidth: number;
  frameHeight: number;
  /** 填了就从该文件加载，否则用 art/pixelart.ts 程序化生成 */
  file?: string;
}

export interface AnimSpec {
  key: string;
  texture: string;
  frames: number[];
  frameRate: number;
  /** -1 循环，0 播放一次 */
  repeat: number;
}

export const SHEETS: SheetSpec[] = [
  // 真实素材（CC0 白猫，64×64，14 列 × 72 行）。帧索引 = 行*14 + 列。
  { key: "cat", frameWidth: 64, frameHeight: 64, file: "/assets/cat.png" },
  // 橘猫（第二关 NPC/敌人，CC0 橘猫表，与白猫同布局）
  { key: "cat-ginger", frameWidth: 64, frameHeight: 64, file: "/assets/cat-ginger.png" },
  { key: "squirrel", frameWidth: 48, frameHeight: 48 }, // 森林松鼠（程序化）
  { key: "slime", frameWidth: 48, frameHeight: 48 },
  // 史莱姆配色变体（程序化，同帧布局换色，见 art/pixelart.ts 的 SLIME_PALETTES）
  { key: "slime-green", frameWidth: 48, frameHeight: 48 },
  { key: "slime-red", frameWidth: 48, frameHeight: 48 },
  { key: "slime-king", frameWidth: 48, frameHeight: 48 },
  { key: "slime-gold", frameWidth: 48, frameHeight: 48 }, // 金色稀有史莱姆
  { key: "fish", frameWidth: 48, frameHeight: 48 },
  { key: "dino", frameWidth: 48, frameHeight: 48 }, // 绿色恐龙
  { key: "dino-fire", frameWidth: 48, frameHeight: 48 }, // 喷火特效
  { key: "tiles", frameWidth: 64, frameHeight: 64 },
];

// 白猫表实际用到的帧（帧索引 = 行×14 + 列，已用脚本逐帧确认、并核对每行朝向）。
// 完整的“动作→行→帧号”索引见 src/assets/cat/CAT-SHEET-INDEX.md（固定参照表）。
// 四方向各用专属帧、不再翻转：左右取素材里朝向正确的那一行。
/** 闭区间 [a,b] 的连续帧号数组 */
const fr = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const WALK_DOWN = [28, 29, 30, 31, 32, 33]; // 第2行
const WALK_UP = [42, 43, 44, 45, 46, 47]; // 第3行
const WALK_LEFT = [56, 57, 58, 59, 60, 61]; // 第4行：朝左
const WALK_RIGHT = [70, 71, 72, 73, 74, 75]; // 第5行：朝右
const RUN_DOWN = [112, 113, 114, 115]; // 第8行
const RUN_UP = [126, 127, 128, 129]; // 第9行
const RUN_RIGHT = [140, 141, 142, 143, 144]; // 第10行：朝右
const RUN_LEFT = [154, 155, 156, 157, 158]; // 第11行：朝左
const JUMP_UP = [868, 869, 870]; // 第62行：向后/上飞扑
const JUMP_LEFT = [882, 883, 884, 885, 886]; // 第63行：朝左飞扑
const JUMP_RIGHT = [896, 897, 898, 899, 900]; // 第64行：朝右飞扑
// 吃东西（吃鱼时播放，四方向；朝向已逐帧核对）
const EAT_DOWN = fr(784, 793); // 行56 Eat food (stand, front)
const EAT_UP = fr(798, 805); // 行57 Eat food (stand, back)
const EAT_LEFT = fr(812, 821); // 行58 Eat food (stand, left)
const EAT_RIGHT = fr(826, 835); // 行59 Eat food (stand, right)
// 蓄力（按住右键/Y 攒怒气时循环播放，四方向）
const CHARGE_DOWN = fr(910, 913); // 行65 On hind legs（后腿站立）
const CHARGE_UP = fr(532, 536); // 行38 Paw swipe (sit, back)
const CHARGE_LEFT = fr(546, 556); // 行39 Left paw swipe (sit, left)
const CHARGE_RIGHT = fr(588, 598); // 行42 Right paw swipe (sit, right)

// 爪击 = 站立挥爪（paw swipe stand）。连招第1下用左爪(ATTACK)、第2下用右爪(ATTACK2)。
// 背面(up)只有一行，左右爪共用。行号经 white-cat-with-text 标签确认，帧索引 = 行×14 + 非空列。
const ATTACK_DOWN = [420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430]; // 行30 Left paw swipe (front)
const ATTACK_UP = [434, 435, 436, 437, 438]; // 行31 Paw swipe (back)
const ATTACK_LEFT = [448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458]; // 行32 Left paw swipe (left)
const ATTACK_RIGHT = [476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486]; // 行34 Left paw swipe (right)
// 右爪变体（第2下）
const ATTACK2_DOWN = [406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416]; // 行29 Right paw swipe (front)
const ATTACK2_UP = ATTACK_UP; // 背面仅一行，沿用
const ATTACK2_LEFT = [462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472]; // 行33 Right paw swipe (left)
const ATTACK2_RIGHT = [490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500]; // 行35 Right paw swipe (right)

/** 生成某方向的 idle/walk/run + 两段挥爪(左爪/右爪)动画 */
function dirAnims(dir: string, walk: number[], run: number[], attack: number[], attack2: number[]): AnimSpec[] {
  return [
    { key: `cat-idle-${dir}`, texture: "cat", frames: [walk[0]], frameRate: 2, repeat: -1 },
    { key: `cat-walk-${dir}`, texture: "cat", frames: walk, frameRate: 9, repeat: -1 },
    { key: `cat-run-${dir}`, texture: "cat", frames: run, frameRate: 12, repeat: -1 },
    { key: `cat-attack-${dir}`, texture: "cat", frames: attack, frameRate: 30, repeat: 0 },
    { key: `cat-attack2-${dir}`, texture: "cat", frames: attack2, frameRate: 30, repeat: 0 },
  ];
}

/** 橘猫 NPC/敌人：idle/walk/attack 四方向，帧复用白猫表（战斗时会爪击/飞扑） */
function gingerAnims(dir: string, walk: number[], attack: number[]): AnimSpec[] {
  return [
    { key: `cat-ginger-idle-${dir}`, texture: "cat-ginger", frames: [walk[0]], frameRate: 2, repeat: -1 },
    { key: `cat-ginger-walk-${dir}`, texture: "cat-ginger", frames: walk, frameRate: 9, repeat: -1 },
    { key: `cat-ginger-attack-${dir}`, texture: "cat-ginger", frames: attack, frameRate: 24, repeat: 0 },
  ];
}

export const ANIMS: AnimSpec[] = [
  ...dirAnims("down", WALK_DOWN, RUN_DOWN, ATTACK_DOWN, ATTACK2_DOWN),
  ...dirAnims("up", WALK_UP, RUN_UP, ATTACK_UP, ATTACK2_UP),
  ...dirAnims("left", WALK_LEFT, RUN_LEFT, ATTACK_LEFT, ATTACK2_LEFT),
  ...dirAnims("right", WALK_RIGHT, RUN_RIGHT, ATTACK_RIGHT, ATTACK2_RIGHT),
  // 右键冲刺飞扑（朝下无图，由 Cat 沿用 cat-attack-down）
  { key: "cat-jump-up", texture: "cat", frames: JUMP_UP, frameRate: 12, repeat: 0 },
  { key: "cat-jump-left", texture: "cat", frames: JUMP_LEFT, frameRate: 14, repeat: 0 },
  { key: "cat-jump-right", texture: "cat", frames: JUMP_RIGHT, frameRate: 14, repeat: 0 },
  // 吃鱼动画（四方向，播一次）
  { key: "cat-eat-down", texture: "cat", frames: EAT_DOWN, frameRate: 12, repeat: 0 },
  { key: "cat-eat-up", texture: "cat", frames: EAT_UP, frameRate: 12, repeat: 0 },
  { key: "cat-eat-left", texture: "cat", frames: EAT_LEFT, frameRate: 12, repeat: 0 },
  { key: "cat-eat-right", texture: "cat", frames: EAT_RIGHT, frameRate: 12, repeat: 0 },
  // 蓄力动画（四方向，循环；按住右键/Y 时播放）
  { key: "cat-charge-down", texture: "cat", frames: CHARGE_DOWN, frameRate: 8, repeat: -1 },
  { key: "cat-charge-up", texture: "cat", frames: CHARGE_UP, frameRate: 8, repeat: -1 },
  { key: "cat-charge-left", texture: "cat", frames: CHARGE_LEFT, frameRate: 10, repeat: -1 },
  { key: "cat-charge-right", texture: "cat", frames: CHARGE_RIGHT, frameRate: 10, repeat: -1 },
  // 敌人史莱姆（紫/绿/红/大型紫王/金，帧布局相同只换纹理）
  { key: "slime-idle", texture: "slime", frames: [0, 1], frameRate: 3, repeat: -1 },
  { key: "slime-green-idle", texture: "slime-green", frames: [0, 1], frameRate: 3, repeat: -1 },
  { key: "slime-red-idle", texture: "slime-red", frames: [0, 1], frameRate: 4, repeat: -1 },
  { key: "slime-king-idle", texture: "slime-king", frames: [0, 1], frameRate: 2, repeat: -1 },
  { key: "slime-gold-idle", texture: "slime-gold", frames: [0, 1], frameRate: 6, repeat: -1 },
  // 小鱼摆尾
  { key: "fish-swim", texture: "fish", frames: [0, 1], frameRate: 4, repeat: -1 },
  // 恐龙待机 + 喷火特效
  { key: "dino-idle", texture: "dino", frames: [0, 1], frameRate: 4, repeat: -1 },
  { key: "dino-fire", texture: "dino-fire", frames: [0, 1], frameRate: 12, repeat: -1 },
  // 森林松鼠待机
  { key: "squirrel-idle", texture: "squirrel", frames: [0, 1], frameRate: 3, repeat: -1 },
  // 橘猫 NPC/敌人（第二关）idle/walk/attack 四方向
  ...gingerAnims("down", WALK_DOWN, ATTACK_DOWN),
  ...gingerAnims("up", WALK_UP, ATTACK_UP),
  ...gingerAnims("left", WALK_LEFT, ATTACK_LEFT),
  ...gingerAnims("right", WALK_RIGHT, ATTACK_RIGHT),
];
