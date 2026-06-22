import Phaser from "phaser";

/**
 * 湖里的小鱼（Phaser 层）。是猫的回血道具：靠近 + 猫头对准 + 按 E 即可吃掉回血。
 * 非物理实体——只在原地附近轻微游动摆尾，吃掉时上浮淡出。命中/朝向判定全在 WorldScene。
 */
export class Fish {
  readonly sprite: Phaser.GameObjects.Sprite;
  private eaten = false;
  private readonly baseX: number;
  private readonly baseY: number;
  private readonly phase: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.baseX = x;
    this.baseY = y;
    this.phase = Math.random() * Math.PI * 2;
    this.sprite = scene.add.sprite(x, y, "fish").setDepth(5);
    this.sprite.play("fish-swim");
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }
  get isEaten(): boolean {
    return this.eaten;
  }

  /** 在水面原地小幅游动 + 按游动方向翻转朝向 */
  update(now: number): void {
    if (this.eaten) return;
    const sway = Math.sin(now / 600 + this.phase);
    this.sprite.x = this.baseX + sway * 7;
    this.sprite.y = this.baseY + Math.cos(now / 900 + this.phase) * 4;
    this.sprite.setFlipX(sway < 0);
  }

  /** 被吃：上浮淡出后销毁 */
  eat(scene: Phaser.Scene): void {
    if (this.eaten) return;
    this.eaten = true;
    scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 14,
      alpha: 0,
      scale: 1.5,
      duration: 260,
      onComplete: () => this.sprite.destroy(),
    });
  }
}
