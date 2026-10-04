// 背包数据模型（引擎无关，纯 TS）。物品计数 + 金爪装备状态。
// 渲染/交互在 entities/InventoryUI.ts；孵化计时在场景里（需要场景时间）。
// 由 core/RunState 持有、跨场景共享；猫死亡时调 runState.softReset() ——
// 孩子向设计：死亡不掉任何战利品（背包/宠物/孵化/皮肤全保留），惩罚仅为回到出生点。

export type ItemId = "golden-claw" | "dino-egg" | "golden-key";

export interface ItemDef {
  id: ItemId;
  /** 中文名（UI 显示） */
  name: string;
  /** 贴图 key（掉落物 + 背包图标共用） */
  icon: string;
  /** 是否可装备 */
  equippable: boolean;
  /** 一句话说明 */
  desc: string;
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  "golden-claw": { id: "golden-claw", name: "金色爪子", icon: "item-claw", equippable: true, desc: "装备后攻击伤害 +50%" },
  "dino-egg": { id: "dino-egg", name: "恐龙蛋", icon: "item-egg", equippable: false, desc: "放进孵化器，1 分钟孵出小恐龙宠物" },
  "golden-key": { id: "golden-key", name: "金钥匙", icon: "item-key", equippable: false, desc: "打开出生点旁的宝箱，换上黑猫皮肤" },
};

/** 物品在 UI 中固定的展示顺序 */
export const ITEM_ORDER: ItemId[] = ["golden-claw", "dino-egg", "golden-key"];

export class Inventory {
  readonly counts: Record<ItemId, number> = { "golden-claw": 0, "dino-egg": 0, "golden-key": 0 };
  /** 金爪是否已装备 */
  equippedClaw = false;

  add(id: ItemId, n = 1): void {
    this.counts[id] += n;
  }

  /** 扣除 n 个，不足返回 false。某物品清零时若正装备着（如金爪）自动卸下。 */
  remove(id: ItemId, n = 1): boolean {
    if (this.counts[id] < n) return false;
    this.counts[id] -= n;
    if (this.counts[id] <= 0 && id === "golden-claw") this.equippedClaw = false;
    return true;
  }

  has(id: ItemId, n = 1): boolean {
    return this.counts[id] >= n;
  }

  /** 切换金爪装备（没有金爪则忽略；金爪清零时 remove() 已自动卸下）。 */
  toggleEquipClaw(): void {
    if (this.counts["golden-claw"] > 0) this.equippedClaw = !this.equippedClaw;
    else this.equippedClaw = false;
  }

  /** 当前攻击伤害倍率（装备金爪 = 1.5）。 */
  get damageMult(): number {
    return this.equippedClaw && this.counts["golden-claw"] > 0 ? 1.5 : 1;
  }
}
