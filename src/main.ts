import Phaser from "phaser";
import { GAME_CONFIG } from "./config";
import { BootScene } from "./scenes/BootScene";
import { WorldScene } from "./scenes/WorldScene";
import { ForestScene } from "./scenes/ForestScene";
import { initSfx } from "./audio/sfx";

// Phaser 游戏入口：组装配置、注册场景、启动。
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  backgroundColor: GAME_CONFIG.backgroundColor,
  pixelArt: true,
  input: {
    gamepad: true, // 启用手柄插件，WorldScene 读取左摇杆 + 扳机
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false, // 改成 true 可看到碰撞体边框，调试时很有用
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, WorldScene, ForestScene],
};

const game = new Phaser.Game(config);

// 音效初始化：浏览器要求用户手势后才能创建 AudioContext，
// 首次点击/按键时初始化（各场景按 M 开关静音）。
window.addEventListener("pointerdown", initSfx, { once: true });
window.addEventListener("keydown", initSfx, { once: true });

// 仅开发模式：把游戏实例挂到 window，方便控制台/自动化调试（生产构建会被摇树去掉）。
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
