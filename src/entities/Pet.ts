import Phaser from "phaser";

/**
 * 孵化出的小恐龙宠物：跟随猫移动（带延迟/最小跟随距离），不参与战斗。
 * 复用 dino 贴图缩小显示。只会有一只（孵化器产出）。
 */
const FOLLOW_DIST = 46; // 跟到这个距离就停，避免叠在猫身上
const SPEED = 0.12; // 位置插值系数

export class Pet {
  readonly sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.sprite(x, y, "dino").setScale(0.55).setDepth(9);
    this.sprite.play("dino-idle");
  }

  update(catX: number, catY: number): void {
    const dx = catX - this.sprite.x;
    const dy = catY - this.sprite.y;
    const d = Math.hypot(dx, dy);
    if (d > FOLLOW_DIST) {
      // 朝猫插值靠近，留出 FOLLOW_DIST 的尾随间距
      const tx = catX - (dx / d) * FOLLOW_DIST;
      const ty = catY - (dy / d) * FOLLOW_DIST;
      this.sprite.x += (tx - this.sprite.x) * SPEED;
      this.sprite.y += (ty - this.sprite.y) * SPEED;
      this.sprite.setFlipX(dx < 0); // 朝向移动方向
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
