// 引擎无关的地图生成：输出二维瓦片数组，不依赖 Phaser。
// Phaser 层（WorldScene）拿这些数组去建 Tilemap；迁移 Godot 时同一套数据可喂给 TileMap 节点。

/** 瓦片类型 = 在 tileset 图中的帧索引（BootScene.makeTilesetTexture 按同样顺序绘制） */
export const TILE = {
  GRASS: 0,
  PATH: 1,
  WATER: 2,
  SAND: 3,
  FOREST: 4, // 森林地面（深色草）
  FLOWER: 5,
  TREE: 6, // 障碍
  ROCK: 7, // 障碍
} as const;

/** 障碍层空格子 */
export const EMPTY = -1;

export interface GeneratedWorld {
  /** 单位：瓦片 */
  width: number;
  height: number;
  /** 地面层：每格一个 TILE 值（GRASS/PATH/WATER/...） */
  ground: number[][];
  /** 障碍层：EMPTY 或 TREE/ROCK */
  obstacles: number[][];
  /** 猫的出生点（像素坐标） */
  spawn: { x: number; y: number };
}

/**
 * 第二关森林地图：地面全是森林、密布树木的小地图（面积约为主地图的 1/5）。
 * 外圈树墙、内部高密度散树、中央留一块出生空地保证起步可走。
 */
export function generateForest(
  cols: number,
  rows: number,
  tileSize: number,
  seed = 8
): GeneratedWorld {
  const rand = mulberry32(seed);
  const ground = make2D(cols, rows, TILE.FOREST); // 地面全森林
  const obstacles = make2D(cols, rows, EMPTY);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const border = x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2;
      if (border) obstacles[y][x] = TILE.TREE; // 外圈树墙
      else if (rand() < 0.24) obstacles[y][x] = rand() < 0.85 ? TILE.TREE : TILE.ROCK; // 密布树/少量石
    }
  }

  // 中央出生空地（清掉障碍）
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const cr = 3;
  for (let y = cy - cr; y <= cy + cr; y++) {
    for (let x = cx - cr; x <= cx + cr; x++) {
      if (Math.hypot(x - cx, y - cy) <= cr) obstacles[y][x] = EMPTY;
    }
  }

  return {
    width: cols,
    height: rows,
    ground,
    obstacles,
    spawn: { x: (cx + 0.5) * tileSize, y: (cy + 0.5) * tileSize },
  };
}

/** 确定性随机数（mulberry32），同一 seed 每次地图一致 */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make2D(cols: number, rows: number, value: number): number[][] {
  const a: number[][] = [];
  for (let y = 0; y < rows; y++) a.push(new Array<number>(cols).fill(value));
  return a;
}

/**
 * 生成一张有"区域 + 道路"结构的地图：
 * 中央村庄空地，右上湖泊（含沙滩），左下森林，左中花田，道路网络相连，外圈森林作墙。
 */
export function generateWorld(
  cols: number,
  rows: number,
  tileSize: number,
  seed = 7
): GeneratedWorld {
  const rand = mulberry32(seed);
  const ground = make2D(cols, rows, TILE.GRASS);
  const obstacles = make2D(cols, rows, EMPTY);

  // 1) 外圈两格森林墙
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2) {
        ground[y][x] = TILE.FOREST;
        obstacles[y][x] = TILE.TREE;
      }
    }
  }

  // 2) 右上湖泊（椭圆）+ 沙滩环
  const lake = { cx: Math.floor(cols * 0.72), cy: Math.floor(rows * 0.26), rx: 8, ry: 6 };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const nx = (x - lake.cx) / lake.rx;
      const ny = (y - lake.cy) / lake.ry;
      const d = nx * nx + ny * ny;
      if (d <= 1) {
        ground[y][x] = TILE.WATER;
        obstacles[y][x] = EMPTY;
      } else if (d <= 1.7 && ground[y][x] === TILE.GRASS) {
        ground[y][x] = TILE.SAND;
      }
    }
  }

  // 3) 左下森林区（地面变深 + 散布树）
  const fx0 = 4;
  const fy0 = rows - 20;
  const fx1 = 18;
  const fy1 = rows - 4;
  for (let y = fy0; y < fy1; y++) {
    for (let x = fx0; x < fx1; x++) {
      if (ground[y][x] === TILE.GRASS) {
        ground[y][x] = TILE.FOREST;
        if (rand() < 0.35) obstacles[y][x] = TILE.TREE;
      }
    }
  }

  // 4) 左中花田
  const mx = Math.floor(cols * 0.28);
  const my = Math.floor(rows * 0.42);
  const mr = 7;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (ground[y][x] === TILE.GRASS && Math.hypot(x - mx, y - my) < mr && rand() < 0.3) {
        ground[y][x] = TILE.FLOWER;
      }
    }
  }

  // 5) 中央村庄空地（清掉障碍，森林地面还原成草）
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const cr = 5;
  for (let y = cy - cr; y <= cy + cr; y++) {
    for (let x = cx - cr; x <= cx + cr; x++) {
      if (Math.hypot(x - cx, y - cy) <= cr) {
        if (ground[y][x] === TILE.FOREST) ground[y][x] = TILE.GRASS;
        obstacles[y][x] = EMPTY;
      }
    }
  }

  // 6) 道路：村庄 → 森林入口 / 湖岸 / 花田（L 形，宽 2，遇水则停）
  const paintPath = (x: number, y: number): void => {
    if (x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2) return;
    if (ground[y][x] === TILE.WATER) return;
    ground[y][x] = TILE.PATH;
    obstacles[y][x] = EMPTY;
  };
  const carve = (ax: number, ay: number, bx: number, by: number): void => {
    const step = (from: number, to: number) => (from < to ? 1 : from > to ? -1 : 0);
    let x = ax;
    let y = ay;
    while (x !== bx) {
      paintPath(x, y);
      paintPath(x, y + 1);
      x += step(x, bx);
    }
    while (y !== by) {
      paintPath(x, y);
      paintPath(x + 1, y);
      y += step(y, by);
    }
  };
  carve(cx, cy, fx0 + 7, fy0 + 2); // 去森林
  carve(cx, cy, lake.cx - 2, lake.cy + lake.ry + 2); // 去湖岸
  carve(cx, cy, mx, my); // 去花田

  // 7) 草地上零星石头障碍（避开村庄）
  for (let y = 2; y < rows - 2; y++) {
    for (let x = 2; x < cols - 2; x++) {
      if (
        ground[y][x] === TILE.GRASS &&
        obstacles[y][x] === EMPTY &&
        Math.hypot(x - cx, y - cy) > cr + 2 &&
        rand() < 0.02
      ) {
        obstacles[y][x] = TILE.ROCK;
      }
    }
  }

  // 8) 确保出生点周围干净可走
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      obstacles[y][x] = EMPTY;
      if (ground[y][x] === TILE.WATER) ground[y][x] = TILE.GRASS;
    }
  }

  return {
    width: cols,
    height: rows,
    ground,
    obstacles,
    spawn: { x: (cx + 0.5) * tileSize, y: (cy + 0.5) * tileSize },
  };
}
