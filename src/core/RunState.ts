import { Inventory } from "./Inventory";

/**
 * 跨场景的"本局状态"：背包、孵化进度、是否已有宠物。
 * 主世界(WorldScene)与森林(ForestScene)共享同一份，这样穿过传送门来回时
 * 物品/装备/孵化都延续。模块级单例 = 同一 JS 实例跨场景；不持久化（刷新页面即重置）。
 * "仅本局有效"：猫死亡时调 reset() 清空，等于开新的一局。
 */
class RunState {
  inventory = new Inventory();
  /** 孵化结束时刻（null=未在孵化）；now>=此值即孵化完成待领取 */
  incubatorEndsAt: number | null = null;
  /** 是否已领取小恐龙宠物（跨场景：进新场景按此重新生成跟随宠物） */
  hasPet = false;

  reset(): void {
    this.inventory = new Inventory();
    this.incubatorEndsAt = null;
    this.hasPet = false;
  }
}

export const runState = new RunState();
