import Phaser from "phaser";

/**
 * 孵化出的小恐龙宠物：跟随猫移动（带延迟/最小跟随距离），不参与战斗。
 * 复用 dino 贴图缩小显示。只会有一只（孵化器产出）。
 */
const FOLLOW_DIST = 46; // 跟到这个距离就停，避免叠在猫身上
const SPEED = 0.12; // 位置插值系数

export class Pet {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly scene: Phaser.Scene;
  /** 上次自动冒爱心的时间戳（跟随中每隔约 9 秒冒一次） */
  private lastHeart = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
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
      // 跟随中每隔约 9 秒自动冒一次爱心
      const now = this.scene.time.now;
      if (now - this.lastHeart > 9000) {
        this.lastHeart = now;
        this.spawnHeart();
      }
    }
  }

  /** 小恐龙开心一跳（上跳 14px 回落，200ms）+ 头顶冒一个爱心 */
  happy(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 14,
      duration: 100,
      yoyo: true,
      onComplete: () => this.spawnHeart(),
    });
  }

  /** 头顶冒一个"❤"文字，上浮淡出（800ms 后销毁） */
  private spawnHeart(): void {
    const t = this.scene.add
      .text(this.sprite.x, this.sprite.y - 24, "❤", { fontSize: "18px", color: "#ff6b81" })
      .setOrigin(0.5)
      .setDepth(50);
    this.scene.tweens.add({
      targets: t,
      y: t.y - 26,
      alpha: 0,
      duration: 800,
      onComplete: () => t.destroy(),
    });
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
