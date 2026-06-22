// 背包数据模型（引擎无关，纯 TS）。物品计数 + 金爪装备状态。
// 渲染/交互在 entities/InventoryUI.ts；孵化计时在 WorldScene（需要场景时间）。
// 仅本局有效：随 scene.restart 重建，不做持久化。

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
  "golden-key": { id: "golden-key", name: "金钥匙", icon: "item-key", equippable: false, desc: "通往恐龙时代（下一关，暂未开放）" },
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

  /** 扣除 n 个，不足返回 false。 */
  remove(id: ItemId, n = 1): boolean {
    if (this.counts[id] < n) return false;
    this.counts[id] -= n;
    return true;
  }

  has(id: ItemId, n = 1): boolean {
    return this.counts[id] >= n;
  }

  /** 切换金爪装备（没有金爪则忽略；扔掉/用完后若已装备则自动卸下由调用方保证）。 */
  toggleEquipClaw(): void {
    if (this.counts["golden-claw"] > 0) this.equippedClaw = !this.equippedClaw;
    else this.equippedClaw = false;
  }

  /** 当前攻击伤害倍率（装备金爪 = 1.5）。 */
  get damageMult(): number {
    return this.equippedClaw && this.counts["golden-claw"] > 0 ? 1.5 : 1;
  }
}
