import Phaser from "phaser";

/**
 * 森林浆果丛：回血点。靠近按 E 摘浆果吃（+15 血），摘完变灰，
 * 45 秒后重新长出。给森林补上"回血手段"，残血进门不再必败。
 */
const PICK_RANGE = 78;
const HEAL = 15;
const REGROW_MS = 45000;

export class BerryBush {
  readonly sprite: Phaser.GameObjects.Sprite;
  private hasBerries = true;
  private regrowAt = 0;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = scene.add.sprite(x, y, "bush").setDepth(4);
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  /** 猫在可摘范围内且有果子 */
  inRange(catX: number, catY: number): boolean {
    return (
      this.hasBerries && Phaser.Math.Distance.Between(this.x, this.y, catX, catY) <= PICK_RANGE
    );
  }

  /**
   * 尝试摘取：有果子则扣掉、变灰、45 秒后长回，返回是否成功。
   * 回血由场景执行（Cat.heal + 飘字），这里只管状态。
   */
  tryPick(now: number): boolean {
    if (!this.hasBerries) return false;
    this.hasBerries = false;
    this.regrowAt = now + REGROW_MS;
    this.sprite.setTint(0x777788); // 摘完变灰，提示"要等一会儿"
    // 摘果子的小抖动
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + 4,
      duration: 60,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.sprite.setX(this.x),
    });
    return true;
  }

  update(now: number): void {
    if (!this.hasBerries && now >= this.regrowAt) {
      this.hasBerries = true;
      this.sprite.clearTint();
      // 长回来时弹一下，吸引注意
      this.scene.tweens.add({
        targets: this.sprite,
        scale: { from: 1.25, to: 1 },
        duration: 240,
        ease: "Back.out",
      });
    }
  }

  static readonly HEAL = HEAL;
}
