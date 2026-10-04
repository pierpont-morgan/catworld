import Phaser from "phaser";

// 程序化像素画：用"调色板 + 字符网格"在代码里画像素图，并切成多帧 spritesheet。
// 这是临时美术，接入真实素材时由 BootScene 改走 this.load 即可（见 assets/manifest.ts）。
//
// 字符网格约定：每个字符 = 一个像素，空格/'.' = 透明；其余字符到颜色的映射由 palette 决定。

type Palette = Record<string, number>;

/** 把字符网格画到 graphics 上，原点 (ox,0)，每像素 px×px */
function paintGrid(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  px: number,
  rows: string[],
  pal: Palette
): void {
  for (let y = 0; y < rows.length; y++) {
    const line = rows[y];
    for (let x = 0; x < line.length; x++) {
      const color = pal[line[x]];
      if (color === undefined) continue; // 透明
      g.fillStyle(color, 1);
      g.fillRect(ox + x * px, y * px, px, px);
    }
  }
}

/** 生成纹理后，把横向排列的帧登记为帧 0..count-1，供动画引用 */
function sliceSheet(
  scene: Phaser.Scene,
  key: string,
  frameW: number,
  frameH: number,
  count: number
): void {
  const tex = scene.textures.get(key);
  for (let i = 0; i < count; i++) tex.add(i, 0, i * frameW, 0, frameW, frameH);
}

// ---------------- 地面瓦片（16×16 网格，px=4 → 64px 瓦片）----------------

const TILE_PX = 4;
const TILE_N = 16;
const TILE_SIZE = TILE_PX * TILE_N; // 64

/** 在第 idx 个瓦片格内填整块底色 */
function fillTile(g: Phaser.GameObjects.Graphics, idx: number, color: number): void {
  g.fillStyle(color, 1);
  g.fillRect(idx * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
}

/** 在第 idx 个瓦片格内点一个像素 */
function pset(g: Phaser.GameObjects.Graphics, idx: number, x: number, y: number, color: number): void {
  g.fillStyle(color, 1);
  g.fillRect(idx * TILE_SIZE + x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
}

/** 确定性散点：在瓦片内按伪随机位置撒若干像素 */
function scatter(
  g: Phaser.GameObjects.Graphics,
  idx: number,
  color: number,
  count: number,
  salt: number
): void {
  for (let k = 0; k < count; k++) {
    const x = (k * 7 + salt * 3 + 2) % TILE_N;
    const y = (k * 11 + salt * 5 + 1) % TILE_N;
    pset(g, idx, x, y, color);
  }
}

const TREE_GRID = [
  "................",
  "......CCCC......",
  "....CCHHHHCC....",
  "...CHHHHHHHHC...",
  "..CHHHHWWHHHHC..",
  "..CHHWWHHWWHHC..",
  "..CHHHHHHHHHHC..",
  "..CHHHHHHHHHHC..",
  "...CHHHHHHHHC...",
  "....CCHHHHCC....",
  "......CTTC......",
  ".....CTTTTC.....",
  ".....CTTTTC.....",
  "....CCT..TCC....",
  "................",
  "................",
];
const TREE_PAL: Palette = {
  C: 0x244a22, // 轮廓/暗部
  H: 0x3f7a3a, // 树冠主色
  W: 0x5aa84f, // 高光
  T: 0x6b4a2f, // 树干
};

const ROCK_GRID = [
  "................",
  "................",
  "................",
  "................",
  ".....KKKK.......",
  "...KKSSSSKK.....",
  "..KSSSWWSSSK....",
  "..KSSSSSSSSK....",
  ".KSSSSSSSSSSK...",
  ".KSSSSSSSSSSK...",
  ".KKSSSSSSSSKK...",
  "..KKKKKKKKKK....",
  "................",
  "................",
  "................",
  "................",
];
const ROCK_PAL: Palette = {
  K: 0x45454e, // 轮廓/暗部
  S: 0x8a8a92, // 石面
  W: 0xb4b4bc, // 高光
};

/** 生成 8 帧地面 tileset：grass/path/water/sand/forest/flower/tree/rock */
function buildTiles(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // 0 grass
  fillTile(g, 0, 0x5a9e4d);
  scatter(g, 0, 0x4d8c41, 16, 1);
  scatter(g, 0, 0x6cb35b, 8, 4);
  // 1 path（泥土）
  fillTile(g, 1, 0xb38a55);
  scatter(g, 1, 0xa07c48, 14, 2);
  scatter(g, 1, 0xc49a64, 7, 5);
  // 2 water
  fillTile(g, 2, 0x3b6ea5);
  for (const wy of [3, 8, 12]) {
    for (let x = 1; x < 15; x += 2) pset(g, 2, (x + wy) % 15, wy, 0x5189c4);
  }
  // 3 sand
  fillTile(g, 3, 0xd9c48a);
  scatter(g, 3, 0xcab677, 10, 3);
  // 4 forest（深草）
  fillTile(g, 4, 0x3a6a3a);
  scatter(g, 4, 0x316032, 14, 2);
  scatter(g, 4, 0x498049, 7, 6);
  // 5 flower（草 + 小花簇）
  fillTile(g, 5, 0x5a9e4d);
  scatter(g, 5, 0x4d8c41, 10, 1);
  const petals = [0xff6b6b, 0xffd166, 0xf4f1de, 0xef7fbf];
  const spots = [
    [3, 4],
    [11, 3],
    [6, 10],
    [12, 11],
  ];
  spots.forEach(([sx, sy], i) => {
    const c = petals[i % petals.length];
    pset(g, 5, sx, sy, c);
    pset(g, 5, sx + 1, sy, c);
    pset(g, 5, sx, sy + 1, c);
    pset(g, 5, sx + 1, sy + 1, c);
    pset(g, 5, sx, sy, 0xffffff);
  });
  // 6 tree / 7 rock（透明底）
  paintGrid(g, 6 * TILE_SIZE, TILE_PX, TREE_GRID, TREE_PAL);
  paintGrid(g, 7 * TILE_SIZE, TILE_PX, ROCK_GRID, ROCK_PAL);

  g.generateTexture("tiles", 8 * TILE_SIZE, TILE_SIZE);
  g.destroy();
  sliceSheet(scene, "tiles", TILE_SIZE, TILE_SIZE, 8);
}

// ---------------- 猫咪（16×16 网格，px=3 → 48px，面朝右）----------------

const CAT_PX = 3;
const CAT_FRAME = CAT_PX * TILE_N; // 48
const CAT_PAL: Palette = {
  O: 0x3a2a18, // 轮廓
  B: 0xe8a33d, // 身体
  D: 0xc9842a, // 暗部
  L: 0xf7cd86, // 肚子高光
  E: 0x2a2a2a, // 眼
  P: 0xe48a8a, // 鼻/耳粉
};

// ===== 侧面（面朝右，朝左用 flipX）=====
const SIDE_IDLE = [
  "................",
  "...........O.O..",
  "..O.......OBOBO.",
  ".OBO.....OBPBPO.",
  ".OBBO...OBBBBBBO",
  "..OBBO..OBBBEBBO",
  "..OBBBOOBBBBBBPO",
  "..OBBBBBBBBBBBBO",
  "..OBBBBBBBBBBBBO",
  "..OBLLLLLLLLLBBO",
  "..OBBBBBBBBBBBBO",
  "..OBOBO.OBOBO...",
  "..OB.BO.OB.BO...",
  "..OO.OO.OO.OO...",
  "................",
  "................",
];
const SIDE_WALK0 = [
  "................",
  "...........O.O..",
  "..O.......OBOBO.",
  ".OBO.....OBPBPO.",
  ".OBBO...OBBBBBBO",
  "..OBBO..OBBBEBBO",
  "..OBBBOOBBBBBBPO",
  "..OBBBBBBBBBBBBO",
  "..OBBBBBBBBBBBBO",
  "..OBLLLLLLLLLBBO",
  "..OBBBBBBBBBBBBO",
  ".OBO.....OBO.OBO",
  ".OO......OO...OO",
  "................",
  "................",
  "................",
];
const SIDE_WALK1 = [
  "................",
  "...........O.O..",
  "..O.......OBOBO.",
  ".OBO.....OBPBPO.",
  ".OBBO...OBBBBBBO",
  "..OBBO..OBBBEBBO",
  "..OBBBOOBBBBBBPO",
  "..OBBBBBBBBBBBBO",
  "..OBBBBBBBBBBBBO",
  "..OBLLLLLLLLLBBO",
  "..OBBBBBBBBBBBBO",
  "...OBO.OBO.....O",
  "...OO..OO.....OO",
  "................",
  "................",
  "................",
];
const SIDE_ATTACK = [
  "................",
  "...........O.O..",
  "..........OBOBO.",
  ".........OBPBPO.",
  "..O.....OBBBBBBO",
  ".OBO....OBBBEBBO",
  ".OBBOOOOBBBBBBPO",
  "..OBBBBBBBBBBBBO",
  "..OBBBBBBBBBBBBO",
  "..OBLLLLLLLLBBDO",
  "..OBBBBBBBBBBDDO",
  "..OBOBO.OBO..DDD",
  "..OO.OO.OO...DDD",
  "..............DD",
  "................",
  "................",
];

// ===== 朝下（正面）=====
const DOWN_IDLE = [
  "................",
  "...O......O.....",
  "..OBO....OBO....",
  "..OBBOOOOOBBO...",
  ".OBBBBBBBBBBBBO.",
  ".OBEEBBBBBBEEBO.",
  ".OBBBBBPPBBBBBO.",
  ".OBBBBBBBBBBBBO.",
  "..OBLLLLLLLLBO..",
  "..OBBBBBBBBBBO..",
  "..OBBBBBBBBBBO..",
  "..OBBO..OBBO....",
  "..OOO...OOO.....",
  "................",
  "................",
  "................",
];
const DOWN_WALK0 = [
  "................",
  "...O......O.....",
  "..OBO....OBO....",
  "..OBBOOOOOBBO...",
  ".OBBBBBBBBBBBBO.",
  ".OBEEBBBBBBEEBO.",
  ".OBBBBBPPBBBBBO.",
  ".OBBBBBBBBBBBBO.",
  "..OBLLLLLLLLBO..",
  "..OBBBBBBBBBBO..",
  "..OBBBBBBBBBBO..",
  ".OBBO......OBBO.",
  ".OOO........OOO.",
  "................",
  "................",
  "................",
];
const DOWN_WALK1 = DOWN_IDLE;
const DOWN_ATTACK = [
  "................",
  "...O......O.....",
  "..OBO....OBO....",
  "..OBBOOOOOBBO...",
  ".OBBBBBBBBBBBBO.",
  ".OBEEBBBBBBEEBO.",
  ".OBBBBBPPBBBBBO.",
  ".OBBBBBBBBBBBBO.",
  "..OBLLLLLLLLBO..",
  "..OBBBBBBBBBBO..",
  "..OBO....OBO....",
  ".OBDDO..OBDDO...",
  ".ODD......DDO...",
  "..D........D....",
  "................",
  "................",
];

// ===== 朝上（背面，无脸）=====
const UP_IDLE = [
  "................",
  "...O......O.....",
  "..OBO....OBO....",
  "..OBBOOOOOBBO...",
  ".OBBBBBBBBBBBBO.",
  ".OBBBBBBBBBBBBO.",
  ".OBBDDDDDDDDBBO.",
  ".OBBBBBBBBBBBBO.",
  "..OBBBBBBBBBBO..",
  "..OBBBBBBBBBBO..",
  "..OBBBBBBBBBBO..",
  "..OBBO..OBBO....",
  "..OOO...OOO.....",
  "................",
  "................",
  "................",
];
const UP_WALK0 = [
  "................",
  "...O......O.....",
  "..OBO....OBO....",
  "..OBBOOOOOBBO...",
  ".OBBBBBBBBBBBBO.",
  ".OBBBBBBBBBBBBO.",
  ".OBBDDDDDDDDBBO.",
  ".OBBBBBBBBBBBBO.",
  "..OBBBBBBBBBBO..",
  "..OBBBBBBBBBBO..",
  "..OBBBBBBBBBBO..",
  ".OBBO......OBBO.",
  ".OOO........OOO.",
  "................",
  "................",
  "................",
];
const UP_WALK1 = UP_IDLE;
const UP_ATTACK = UP_IDLE;

function buildCat(scene: Phaser.Scene): void {
  // 帧顺序须与 assets/manifest.ts 的动画索引一致
  const frames = [
    SIDE_IDLE, SIDE_WALK0, SIDE_WALK1, SIDE_ATTACK, // 0-3
    DOWN_IDLE, DOWN_WALK0, DOWN_WALK1, DOWN_ATTACK, // 4-7
    UP_IDLE, UP_WALK0, UP_WALK1, UP_ATTACK,         // 8-11
  ];
  const g = scene.add.graphics();
  frames.forEach((grid, i) => paintGrid(g, i * CAT_FRAME, CAT_PX, grid, CAT_PAL));
  g.generateTexture("cat", frames.length * CAT_FRAME, CAT_FRAME);
  g.destroy();
  sliceSheet(scene, "cat", CAT_FRAME, CAT_FRAME, frames.length);
}

// ---------------- 史莱姆（16×16 网格，px=3 → 48px，2 帧弹跳）----------------

const SLIME_PX = 3;
const SLIME_FRAME = SLIME_PX * TILE_N; // 48
// 史莱姆调色板：同一套字符网格(SLIME0/SLIME1)换色得到不同品种。
// 键名 = 纹理 key（manifest 的 slime-*-idle 动画引用它），Enemy 按品种选纹理 + 血量。
const SLIME_PALETTES: Record<string, Palette> = {
  // 紫（最弱，原版默认）
  slime: { O: 0x4a2d80, S: 0x9a6cdf, H: 0xb392ea, W: 0xffffff, E: 0x222222 },
  // 绿（中）
  "slime-green": { O: 0x2d6b2d, S: 0x5fcf5f, H: 0x9ff09f, W: 0xffffff, E: 0x222222 },
  // 红（强）
  "slime-red": { O: 0x7a2424, S: 0xe05a5a, H: 0xf4a0a0, W: 0xffffff, E: 0x222222 },
  // 紫（大王，与紫色小史莱姆同色系、靠放大区分 → 大型紫史莱姆；死亡分裂成 4 只紫色小史莱姆）
  "slime-king": { O: 0x3a2266, S: 0x9a6cdf, H: 0xb392ea, W: 0xffffff, E: 0x111111 },
  // 金（稀有，不攻击、血厚、移速快，击败掉金钥匙）
  "slime-gold": { O: 0x8a6d12, S: 0xffd23f, H: 0xffe98a, W: 0xffffff, E: 0x4a3a00 },
};
const SLIME0 = [
  "................",
  "................",
  ".....OOOO.......",
  "...OOSSSSOO.....",
  "..OSSHHHHSSO....",
  ".OSSSSSSSSSSO...",
  ".OSWESSSSWESO...",
  ".OSWESSSSWESO...",
  ".OSSSSSSSSSSO...",
  ".OSSSSSSSSSSO...",
  ".OSSSSSSSSSSO...",
  "..OSSSSSSSSO....",
  "..OOOOOOOOOO....",
  "................",
  "................",
  "................",
];
const SLIME1 = [
  "................",
  "................",
  "................",
  "................",
  "....OOOOOO......",
  "..OOSSSSSSOO....",
  ".OSSHHHHHHSSO...",
  ".OSWESSSSWESO...",
  ".OSWESSSSWESO...",
  ".OSSSSSSSSSSO...",
  "OSSSSSSSSSSSSO..",
  "OSSSSSSSSSSSSO..",
  "OOOOOOOOOOOOOO..",
  "................",
  "................",
  "................",
];

/** 为每个调色板生成一张独立史莱姆纹理（紫/绿/红/蓝王），帧索引含义一致 */
function buildSlimes(scene: Phaser.Scene): void {
  const frames = [SLIME0, SLIME1];
  for (const [key, pal] of Object.entries(SLIME_PALETTES)) {
    if (scene.textures.exists(key)) continue;
    const g = scene.add.graphics();
    frames.forEach((grid, i) => paintGrid(g, i * SLIME_FRAME, SLIME_PX, grid, pal));
    g.generateTexture(key, frames.length * SLIME_FRAME, SLIME_FRAME);
    g.destroy();
    sliceSheet(scene, key, SLIME_FRAME, SLIME_FRAME, frames.length);
  }
}

// ---------------- 小鱼（16×16 网格，px=3 → 48px，2 帧摆尾，面朝右）----------------

const FISH_PX = 3;
const FISH_FRAME = FISH_PX * TILE_N; // 48
const FISH_PAL: Palette = {
  O: 0xb35a1a, // 轮廓
  F: 0xff9f43, // 身体橙
  L: 0xffce93, // 高光
  T: 0xf0792a, // 尾鳍
  W: 0xffffff, // 眼白
  E: 0x222222, // 瞳
};
const FISH0 = [
  "................",
  "................",
  "................",
  "................",
  ".......OOOO.....",
  ".....OOFFFFOO.T.",
  "....OFLLFFFFOTTO",
  "...OFWEFFFFFFOTO",
  "....OFLFFFFFOTTO",
  ".....OOFFFFOO.T.",
  ".......OOOO.....",
  "................",
  "................",
  "................",
  "................",
  "................",
];
const FISH1 = [
  "................",
  "................",
  "................",
  "................",
  ".......OOOO...T.",
  ".....OOFFFFOOTTO",
  "....OFLLFFFFOTTO",
  "...OFWEFFFFFFOO.",
  "....OFLFFFFFOTTO",
  ".....OOFFFFOOTTO",
  ".......OOOO...T.",
  "................",
  "................",
  "................",
  "................",
  "................",
];

function buildFish(scene: Phaser.Scene): void {
  const frames = [FISH0, FISH1];
  const g = scene.add.graphics();
  frames.forEach((grid, i) => paintGrid(g, i * FISH_FRAME, FISH_PX, grid, FISH_PAL));
  g.generateTexture("fish", frames.length * FISH_FRAME, FISH_FRAME);
  g.destroy();
  sliceSheet(scene, "fish", FISH_FRAME, FISH_FRAME, frames.length);
}

// ---------------- 恐龙（绿色，48px，2 帧待机，默认朝右；面向猫时由实体 flipX）----------------

const DINO_PX = 3;
const DINO_FRAME = DINO_PX * TILE_N; // 48
const DINO_PAL: Palette = {
  B: 0x1b5e20, // 深绿轮廓
  D: 0x2e7d32, // 身体绿
  L: 0x66bb6a, // 高光绿
  W: 0xffffff, // 眼白
  E: 0x111111, // 瞳
  M: 0xc62828, // 嘴/红
  T: 0xfff3e0, // 牙
};
// 朝右：尾巴在左、头在右
const DINO0 = [
  "................",
  ".............BB.",
  "...........BBDDB",
  "..........BDLDDB",
  "..BB......BDWEDB",
  ".BDDB....BDDDDDB",
  ".BDDBBBBBBDDDMMB",
  ".BDLDDDDDDDDTTB.",
  "..BDDDDDDDDDDB..",
  "..BDDDDDDDDDDB..",
  "..BDDDBDDBDDDB..",
  "..BDDB.BDDB.B...",
  "..BBB..BDDB.....",
  ".......BBB......",
  "................",
  "................",
];
const DINO1 = [
  "................",
  "..............B.",
  ".............BDB",
  "...........BBDDB",
  "..BBB.....BDWEDB",
  ".BDDDB...BDDDDDB",
  ".BDDBBBBBBDDDMMB",
  ".BDLDDDDDDDDTTB.",
  "..BDDDDDDDDDDB..",
  "..BDDDDDDDDDDB..",
  "..BDDBDDDBDDB...",
  "...BDB.BDDB.B...",
  "...BB..BDDB.....",
  ".......BBB......",
  "................",
  "................",
];

function buildDino(scene: Phaser.Scene): void {
  if (scene.textures.exists("dino")) return;
  const frames = [DINO0, DINO1];
  const g = scene.add.graphics();
  frames.forEach((grid, i) => paintGrid(g, i * DINO_FRAME, DINO_PX, grid, DINO_PAL));
  g.generateTexture("dino", frames.length * DINO_FRAME, DINO_FRAME);
  g.destroy();
  sliceSheet(scene, "dino", DINO_FRAME, DINO_FRAME, frames.length);
}

// ---------------- 火焰喷吐（48px，朝右的火舌，2 帧抖动；恐龙喷火 / 由实体 flipX 朝左）----------------

const FIRE_PAL: Palette = {
  R: 0xe03b1a, // 外焰红
  A: 0xff8c1a, // 中焰橙
  F: 0xffd23f, // 内焰黄
  Y: 0xfff6b0, // 焰心亮黄
};
const FIRE0 = [
  "................",
  "................",
  "......R.........",
  "....R.RAR.....R.",
  "..RARAAAAR..RARR",
  ".RAAFFFAAAARAAAR",
  "RAAFFYYFFFAAAFAR",
  "RAFFYYYYFFFFFFAR",
  "RAAFFYYFFFAAAFAR",
  ".RAAFFFAAAARAAAR",
  "..RARAAAAR..RARR",
  "....R.RAR.....R.",
  "......R.........",
  "................",
  "................",
  "................",
];
const FIRE1 = [
  "................",
  "................",
  "....R...........",
  "..R.RAR.....RR..",
  ".RARAAAAR..RAAR.",
  "RAAFFFAAAARAAAAR",
  "RAFFYYFFFAAAFFAR",
  "RAFYYYYFFFFFYFAR",
  "RAFFYYFFFAAAFFAR",
  "RAAFFFAAAARAAAAR",
  ".RARAAAAR..RAAR.",
  "..R.RAR.....RR..",
  "....R...........",
  "................",
  "................",
  "................",
];

function buildFire(scene: Phaser.Scene): void {
  if (scene.textures.exists("dino-fire")) return;
  const frames = [FIRE0, FIRE1];
  const g = scene.add.graphics();
  frames.forEach((grid, i) => paintGrid(g, i * DINO_FRAME, DINO_PX, grid, FIRE_PAL));
  g.generateTexture("dino-fire", frames.length * DINO_FRAME, DINO_FRAME);
  g.destroy();
  sliceSheet(scene, "dino-fire", DINO_FRAME, DINO_FRAME, frames.length);
}

// ---------------- 道具图标（48px 单帧：恐龙蛋 / 金色爪子 / 金钥匙）----------------

const ITEM_PX = 3;
const ITEM_FRAME = ITEM_PX * TILE_N; // 48
const EGG_PAL: Palette = { O: 0x6d5b2a, S: 0xefe3b0, H: 0xfff8df, D: 0xc7b878, E: 0x8f7d3a };
const EGG_GRID = [
  "................",
  "................",
  ".......OO.......",
  "......OSSHO.....",
  ".....OSSSHHO....",
  "....OSSDSSHHO...",
  "....OSSSSSSHO...",
  "...OSDSSSSDSHO..",
  "...OSSSSSSSSHO..",
  "...OSSDSSSSSHO..",
  "...OSSSSSDSSHO..",
  "....OSSSSSSHO...",
  "....OSSDSSHO....",
  ".....OOSSOO....",
  ".......OO.......",
  "................",
];
const CLAW_PAL: Palette = { O: 0x8a6d12, G: 0xffd23f, H: 0xfff0a8, S: 0xc79a1c };
const CLAW_GRID = [
  "................",
  ".O....O....O....",
  ".OG...OG...OG...",
  ".OG...OG...OG...",
  ".OGH..OGH..OGH..",
  ".OGH..OGH..OGH..",
  ".OGH.OGH..OGH...",
  "..OGHOGH.OGH....",
  "..OGGGGGGGGH....",
  "...OGGGGGGH.....",
  "...OGSSSSGH.....",
  "....OGGGGH......",
  "....OGSSGH......",
  ".....OGGH.......",
  ".....OOH........",
  "................",
];
const KEY_PAL: Palette = { O: 0x8a6d12, G: 0xffd23f, H: 0xfff0a8 };
const KEY_GRID = [
  "................",
  "....OOO.........",
  "...OGGGO........",
  "..OGHHGO........",
  "..OGHHGO........",
  "..OGGGGO........",
  "...OGGO.........",
  "....OGO.........",
  "....OGO.........",
  "....OGO.........",
  "....OGGO........",
  "....OGHGO.......",
  "....OGGO........",
  "....OGHGO.......",
  "....OGGGO.......",
  ".....OOO........",
];

function buildItems(scene: Phaser.Scene): void {
  const defs: [string, string[], Palette][] = [
    ["item-egg", EGG_GRID, EGG_PAL],
    ["item-claw", CLAW_GRID, CLAW_PAL],
    ["item-key", KEY_GRID, KEY_PAL],
  ];
  for (const [key, grid, pal] of defs) {
    if (scene.textures.exists(key)) continue;
    const g = scene.add.graphics();
    paintGrid(g, 0, ITEM_PX, grid, pal);
    g.generateTexture(key, ITEM_FRAME, ITEM_FRAME);
    g.destroy();
  }
}

// ---------------- 传送门（64px 木拱门，金把手）----------------

const DOOR_PAL: Palette = { O: 0x4a3119, W: 0x9c6b3a, H: 0x6f4a26, K: 0xffd23f, S: 0x120a04 };
const DOOR_GRID = [
  "................",
  "....OOOOOO......",
  "...OWWWWWWO.....",
  "..OWWWWWWWWO....",
  "..OWHHHHHHWO....",
  "..OWH....HWO....",
  "..OWH....HWO....",
  "..OWH...KHWO....",
  "..OWH....HWO....",
  "..OWH....HWO....",
  "..OWH....HWO....",
  "..OWHHHHHHWO....",
  "..OWWWWWWWWO....",
  "..OOOOOOOOOO....",
  "..SSSSSSSSSS....",
  "................",
];

function buildDoor(scene: Phaser.Scene): void {
  if (scene.textures.exists("door")) return;
  const g = scene.add.graphics();
  paintGrid(g, 0, 4, DOOR_GRID, DOOR_PAL);
  g.generateTexture("door", 64, 64);
  g.destroy();
}

// ---------------- 宝箱（64px，金钥匙开它换黑猫皮肤）----------------

const CHEST_PAL: Palette = {
  O: 0x3a2410, // 轮廓
  W: 0x8a5a28, // 木板
  L: 0xa86e34, // 木板亮
  G: 0xffd23f, // 金边/锁
  D: 0x5a3a18, // 暗部
};
const CHEST_GRID = [
  "................",
  ".....OOOOOO.....",
  "...OOWWWWWWO....",
  "..OWWWWWWWWWWO..",
  "..OWWLLWWWWWO...",
  "..OWWWWWWWWO....",
  "...OOOOOOOOO....",
  "...OWWWWWWWWO...",
  "...OWWDGGDWWWO..",
  "...OWWDGGDWWWO..",
  "...OWWWGGGWWWO..",
  "...OWWWWWWWWO...",
  "...OWWDWWWDWO...",
  "...OWWWWWWWWO...",
  "....OOOOOOOO....",
  "................",
];

function buildChest(scene: Phaser.Scene): void {
  if (scene.textures.exists("chest")) return;
  const g = scene.add.graphics();
  paintGrid(g, 0, 4, CHEST_GRID, CHEST_PAL);
  g.generateTexture("chest", 64, 64);
  g.destroy();
}

// ---------------- 浆果丛（48px，森林回血点；没果子时场景里 tint 变灰）----------------

const BUSH_PAL: Palette = {
  O: 0x1d4a1d, // 轮廓
  G: 0x2e7d32, // 叶
  L: 0x4caf50, // 叶亮
  R: 0xe0455a, // 浆果
};
const BUSH_GRID = [
  "................",
  ".....OOOOOO.....",
  "...OOGGGGGGOO...",
  "..OGGLGGGGLGGO..",
  ".OGGGLRGGRGLGGO.",
  ".OGGLRRRRRGLGGO.",
  "OGGGLRRRRRGLGGGO",
  "OGGGLGRRRGLGGGGO",
  "OGGGGLRRGLLGGGGO",
  ".OGGGGLLGLGGGGO.",
  ".OGGGGGGGGGGGGO.",
  "..OGGGGGGGGGGO..",
  "...OOGGGGGGOO...",
  ".....OOOOOO.....",
  ".......OO.......",
  "................",
];

function buildBush(scene: Phaser.Scene): void {
  if (scene.textures.exists("bush")) return;
  const g = scene.add.graphics();
  paintGrid(g, 0, 3, BUSH_GRID, BUSH_PAL);
  g.generateTexture("bush", 48, 48);
  g.destroy();
}

// ---------------- 森林松鼠（48px，棕色大尾巴坐姿，2 帧轻摆）----------------

const SQ_PX = 3;
const SQ_FRAME = SQ_PX * TILE_N; // 48
const SQ_PAL: Palette = {
  O: 0x4a3015, // 轮廓
  T: 0xa86e34, // 尾巴
  B: 0x8a5a28, // 身体
  N: 0xe2caa0, // 肚子浅
  A: 0xb5824a, // 耳/亮
  W: 0xffffff, // 眼白
  E: 0x111111, // 瞳
};
const SQ0 = [
  "................",
  "...OOO..........",
  "..OTTTO.........",
  "..OTTTTO........",
  ".OTTTTTO........",
  ".OTTTTTO...OAO..",
  ".OTTTTO...OBBBO.",
  "..OTTO...OBWEBO.",
  "..OTTO..OBBBBBO.",
  "...OO..OBBBBBBO.",
  "......OBBNNNBBO.",
  "......OBBNNNBBO.",
  ".......OBBBBBO..",
  ".......OBO.OBO..",
  "........O...O...",
  "................",
];
const SQ1 = [
  "................",
  "..OOO...........",
  ".OTTTO..........",
  ".OTTTTO.........",
  ".OTTTTO.........",
  ".OTTTTO....OAO..",
  ".OTTTTO...OBBBO.",
  "..OTTO...OBWEBO.",
  "..OTO...OBBBBBO.",
  "..OO...OBBBBBBO.",
  "......OBBNNNBBO.",
  "......OBBNNNBBO.",
  ".......OBBBBBO..",
  ".......OBOOBO...",
  "........OOO.....",
  "................",
];

function buildSquirrel(scene: Phaser.Scene): void {
  if (scene.textures.exists("squirrel")) return;
  const frames = [SQ0, SQ1];
  const g = scene.add.graphics();
  frames.forEach((grid, i) => paintGrid(g, i * SQ_FRAME, SQ_PX, grid, SQ_PAL));
  g.generateTexture("squirrel", frames.length * SQ_FRAME, SQ_FRAME);
  g.destroy();
  sliceSheet(scene, "squirrel", SQ_FRAME, SQ_FRAME, frames.length);
}

// ---------------- 爪痕特效（细线三爪，白色便于 tint 成银/金）----------------

function buildClawFx(scene: Phaser.Scene): void {
  if (scene.textures.exists("claw-fx")) return;
  const g = scene.add.graphics();
  g.lineStyle(1.4, 0xffffff, 1);
  // 三道朝右(+x)的细弯爪痕：同心圆弧 → 自带弧度，不是直线。绕中心旋转后即朝任意方向
  const cx = 6;
  const cy = 20;
  const A = Phaser.Math.DegToRad(40);
  for (const r of [10, 14, 18]) {
    g.beginPath();
    g.arc(cx, cy, r, -A, A, false);
    g.strokePath();
  }
  g.generateTexture("claw-fx", 40, 40);
  g.destroy();
}

/** 生成全部程序化贴图。已从真实素材加载的 key 会跳过，不覆盖。 */
export function generatePixelArt(scene: Phaser.Scene): void {
  if (!scene.textures.exists("tiles")) buildTiles(scene);
  if (!scene.textures.exists("cat")) buildCat(scene);
  buildSlimes(scene); // 内部逐 key 跳过已存在的（含金史莱姆 slime-gold）
  if (!scene.textures.exists("fish")) buildFish(scene);
  buildDino(scene); // 恐龙
  buildFire(scene); // 喷火特效
  buildItems(scene); // 道具图标（蛋/爪/钥匙）
  buildClawFx(scene); // 爪痕特效（银/金）
  buildSquirrel(scene); // 森林松鼠
  buildDoor(scene); // 传送门
  buildChest(scene); // 宝箱（金钥匙奖励）
  buildBush(scene); // 浆果丛（森林回血）
}

/** 帧尺寸常量，供实体设置物理体时参考 */
export const FRAME = {
  cat: CAT_FRAME,
  slime: SLIME_FRAME,
  fish: FISH_FRAME,
  tile: TILE_SIZE,
} as const;
