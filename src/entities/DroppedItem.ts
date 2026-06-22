import Phaser from "phaser";
import { ItemId, ITEM_DEFS } from "../core/Inventory";

/**
 * 地面掉落物（恐龙蛋 / 金爪 / 金钥匙）。原地上下浮动，靠近按 E 拾取进背包。
 * 拾取判定与表现由 WorldScene 负责（findPickupTarget / tryPickup）。
 */
export class DroppedItem {
  readonly sprite: Phaser.GameObjects.Image;
  readonly itemId: ItemId;
  private collected = false;

  constructor(scene: Phaser.Scene, x: number, y: number, itemId: ItemId) {
    this.itemId = itemId;
    this.sprite = scene.add.image(x, y, ITEM_DEFS[itemId].icon).setDepth(20).setScale(0.7);
    scene.tweens.add({
      targets: this.sprite,
      y: y - 6,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }
  get isCollected(): boolean {
    return this.collected;
  }

  /** 被拾取：上浮淡出后销毁。 */
  collect(scene: Phaser.Scene): void {
    if (this.collected) return;
    this.collected = true;
    scene.tweens.killTweensOf(this.sprite);
    scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 22,
      alpha: 0,
      scale: 1.0,
      duration: 260,
      onComplete: () => this.sprite.destroy(),
    });
  }
}
