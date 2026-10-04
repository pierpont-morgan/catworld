import { Inventory } from "./Inventory";

/**
 * 跨场景的"本局状态"：背包、孵化进度、是否已有宠物、抓松鼠计数、皮肤。
 * 主世界(WorldScene)与森林(ForestScene)共享同一份，这样穿过传送门来回时
 * 物品/装备/孵化都延续。模块级单例 = 同一 JS 实例跨场景；不持久化（刷新页面即重置）。
 * "本局结束"：猫死亡时调 softReset() —— 孩子向设计，只回出生点，不清空战利品。
 */
class RunState {
  inventory = new Inventory();
  /** 孵化结束时刻（null=未在孵化）；now>=此值即孵化完成待领取 */
  incubatorEndsAt: number | null = null;
  /** 是否已领取小恐龙宠物（跨场景：进新场景按此重新生成跟随宠物） */
  hasPet = false;
  /** 累计抓住松鼠的次数（森林，可重复抓，3/5 只时有小庆祝） */
  squirrelsCaught = 0;
  /** 黑猫皮肤是否已解锁（主世界宝箱） */
  skinUnlocked = false;
  /** 当前是否使用黑猫皮肤 */
  useBlackCat = false;

  /**
   * 死亡结算：保留一切战利品（背包实例/宠物/孵化进度/皮肤/计数都不动），
   * 惩罚仅为场景重启回到出生点。如需加死亡惩罚，只改这里。
   */
  softReset(): void {
    // 故意不清空任何东西
  }

  /** 彻底开新一局（暂未使用：当前死亡走 softReset；保留给未来"新游戏"按钮）。 */
  reset(): void {
    this.inventory = new Inventory();
    this.incubatorEndsAt = null;
    this.hasPet = false;
    this.squirrelsCaught = 0;
    this.skinUnlocked = false;
    this.useBlackCat = false;
  }
}

export const runState = new RunState();
