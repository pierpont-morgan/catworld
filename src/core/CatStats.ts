// 引擎无关的猫咪核心数据与逻辑。
// 这里不依赖 Phaser —— 迁移到 Godot 4 时，这套规则可以几乎原样翻成 GDScript。
// 渲染/输入交给 Phaser 层（src/entities/Cat.ts），它读写这里的状态。

export interface CatStats {
  /** 生命值 */
  health: number;
  maxHealth: number;
  /** 体力，奔跑时消耗，停下时恢复 */
  stamina: number;
  maxStamina: number;
  /** 愤怒值，蓄满可发动右键飞扑；按住右键蓄力或打中敌人都会增长 */
  rage: number;
  maxRage: number;
  /** 普通移动速度（像素/秒） */
  walkSpeed: number;
  /** 奔跑速度（像素/秒） */
  runSpeed: number;
  /** 体力耗尽中：true 时禁跑，直到回血到阈值（迟滞，避免在 0 体力处每帧横跳） */
  exhausted: boolean;
}

export function createDefaultCatStats(): CatStats {
  return {
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
    rage: 0,
    maxRage: 100,
    walkSpeed: 160,
    runSpeed: 300,
    exhausted: false,
  };
}

/** 奔跑每秒消耗的体力 */
const STAMINA_DRAIN_PER_SEC = 25;
/** 不奔跑时每秒恢复的体力 */
const STAMINA_REGEN_PER_SEC = 18;
/** 耗尽后需回血到此比例才能再次奔跑 */
const RUN_RECOVER_RATIO = 0.35;

/**
 * 根据是否正在奔跑更新体力。dt 单位为秒。
 * 返回该帧实际可用的移动速度，并就地修改 stats.stamina / stats.exhausted。
 */
export function tickStamina(stats: CatStats, wantsToRun: boolean, dt: number): number {
  // 耗尽状态：只回血，回到阈值才解除，期间一律 walk
  if (stats.exhausted) {
    stats.stamina = Math.min(stats.maxStamina, stats.stamina + STAMINA_REGEN_PER_SEC * dt);
    if (stats.stamina >= stats.maxStamina * RUN_RECOVER_RATIO) stats.exhausted = false;
    return stats.walkSpeed;
  }

  if (wantsToRun && stats.stamina > 0) {
    stats.stamina = Math.max(0, stats.stamina - STAMINA_DRAIN_PER_SEC * dt);
    if (stats.stamina <= 0) stats.exhausted = true; // 本帧跑完后进入耗尽
    return stats.runSpeed;
  }

  stats.stamina = Math.min(stats.maxStamina, stats.stamina + STAMINA_REGEN_PER_SEC * dt);
  return stats.walkSpeed;
}
