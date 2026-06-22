// 全局游戏常量。数值集中放这里，方便调参，也方便迁移 Godot 时一一对照。
export const GAME_CONFIG = {
  width: 960,
  height: 540,
  backgroundColor: "#3a5a40",
} as const;

export const WORLD = {
  // 地图尺寸（像素）。原型先用一块比屏幕大很多的区域，体现"开放地图"。
  width: 3200,
  height: 3200,
  tileSize: 64,
} as const;

// 地图随机种子。固定后每次刷新地图一致；换数字即可生成不同地图。
export const WORLD_SEED = 7;
