import Phaser from "phaser";
import { ANIMS, SHEETS } from "../assets/manifest";
import { generatePixelArt } from "../art/pixelart";

/**
 * 启动场景 = 资源加载管线。
 * preload: 加载清单里填了 file 的真实素材（spritesheet）。
 * create: 其余贴图用 art/pixelart.ts 程序化生成，再按清单注册动画，最后进入主世界。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    for (const s of SHEETS) {
      if (s.file) {
        this.load.spritesheet(s.key, s.file, {
          frameWidth: s.frameWidth,
          frameHeight: s.frameHeight,
        });
      }
    }
  }

  create(): void {
    generatePixelArt(this); // 生成未提供真实素材的程序化贴图

    for (const a of ANIMS) {
      if (this.anims.exists(a.key)) continue;
      this.anims.create({
        key: a.key,
        frames: a.frames.map((f) => ({ key: a.texture, frame: f })),
        frameRate: a.frameRate,
        repeat: a.repeat,
      });
    }

    this.scene.start("World");
  }
}
