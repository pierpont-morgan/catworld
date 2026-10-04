// 引擎无关的战斗逻辑：攻击数值定义 + 三连击状态机。
// 不依赖 Phaser，迁移 Godot 时可原样翻成 GDScript。
// 渲染、命中判定、击退由 Phaser 层（entities/scenes）消费这里返回的 AttackSpec 完成。

export type AttackKind = "claw" | "dash";

export interface AttackSpec {
  kind: AttackKind;
  /** 伤害值 */
  damage: number;
  /** 命中后给目标的击退速度 */
  knockback: number;
  /** 命中判定中心相对猫的前向距离（dash 为 0，判定跟随猫身） */
  reach: number;
  /** 命中判定半径 */
  radius: number;
  /** 判定持续时间（毫秒） */
  activeMs: number;
  /** 仅 dash：冲刺速度 */
  dashSpeed?: number;
  /** 仅 dash：位移持续时间（毫秒），与命中持续 activeMs 解耦；不填则等于 activeMs */
  dashMs?: number;
  /** 命中后给目标施加的僵直时长（毫秒）；不填用 Enemy 默认短僵直。僵直期间敌人不动也不造成接触伤害 */
  stunMs?: number;
  /** 连招序号 0/1/2，上层据此选挥爪动画（0=左爪 cat-attack，1=右爪 cat-attack2） */
  comboIndex?: number;
}

/**
 * "硬僵直"阈值（毫秒）：stunMs >= 此值才算硬僵直，可打断恐龙喷火/前摇、
 * 让史莱姆泛蓝 + 不可推动。三连第三击的 stunMs 恰好等于此阈值（见下），
 * 调数值时注意：第三击必须 >= HARD_STUN_MS，否则悄悄失去打断能力。
 */
export const HARD_STUN_MS = 1000;

// 爪击三连：第1下左爪、第2下右爪、第3下改为短距飞扑（鼓励打完整连招）。
// 伤害：第1下在原 12 上 -40%≈7，第2下在原 12 上 -20%≈10，第3下保持原 24。
const CLAW_COMBO: readonly AttackSpec[] = [
  { kind: "claw", comboIndex: 0, damage: 7, knockback: 150, reach: 42, radius: 34, activeMs: 160 },
  { kind: "claw", comboIndex: 1, damage: 10, knockback: 170, reach: 42, radius: 34, activeMs: 160 },
  // 第三击：短距飞扑。位移短(dashMs 小)，命中窗口 activeMs 给足。
  // 眩晕 1 秒 = HARD_STUN_MS（硬僵直阈值，可打断恐龙喷火/前摇）、击退 240。
  // 数值定案（2026-10-04）：以代码为准，CLAUDE.md 已同步为 1000/240。
  {
    kind: "dash",
    comboIndex: 2,
    damage: 24,
    knockback: 240,
    stunMs: HARD_STUN_MS,
    reach: 0,
    radius: 42,
    activeMs: 200,
    dashSpeed: 620,
    dashMs: 55,
  },
];

const DASH_ATTACK: AttackSpec = {
  kind: "dash",
  damage: 34, // 蓄力大招要有大招的样子：明显高于三连第三击的 24
  knockback: 300, // 右键飞扑击退更远
  stunMs: 2500, // 右键飞扑眩晕 2.5 秒（达硬僵直阈值，可打断恐龙喷火/前摇）
  reach: 0,
  radius: 36,
  activeMs: 220,
  dashSpeed: 620,
  dashMs: 220, // 显式写出（与 CLAW_COMBO[2] 的 dashMs:55 对称，别靠 ?? 兜底）
};

/** 愤怒条从 0 充满所需的蓄力时长（毫秒）：按住右键 2.5 秒可从空蓄满。打中敌人也会加怒气。 */
export const RAGE_FULL_CHARGE_MS = 2500;

/** 一击挥完后到可接下一击的最小间隔 */
const COMBO_GAP = 60;
/** 接招窗口：上一击结束后多久内再次攻击才算连招 */
const COMBO_WINDOW = 420;
/** 打完第三击后的硬直 */
const COMBO_FINISH_RECOVERY = 320;
/** 冲刺重击后的硬直 */
const DASH_RECOVERY = 260;

/**
 * 三连击 + 冲刺的攻击状态机（纯逻辑）。
 * 所有时间用毫秒；调用方传入当前时间 now。
 */
export class ComboController {
  private step = 0;
  private busyUntil = 0;
  private comboExpireAt = 0;

  /** 尝试爪击；返回本次该执行的攻击，若处于硬直则返回 null */
  tryClaw(now: number): AttackSpec | null {
    if (now < this.busyUntil) return null;
    if (now > this.comboExpireAt) this.step = 0; // 超出接招窗口，连招重置

    const spec = CLAW_COMBO[Math.min(this.step, CLAW_COMBO.length - 1)];
    this.step++;

    if (this.step >= CLAW_COMBO.length) {
      // 三连打完：进入硬直并重置
      this.busyUntil = now + spec.activeMs + COMBO_FINISH_RECOVERY;
      this.comboExpireAt = 0;
      this.step = 0;
    } else {
      this.busyUntil = now + spec.activeMs + COMBO_GAP;
      this.comboExpireAt = this.busyUntil + COMBO_WINDOW;
    }
    return spec;
  }

  /** 尝试冲刺重击；会打断并重置连招 */
  tryDash(now: number): AttackSpec | null {
    if (now < this.busyUntil) return null;
    this.step = 0;
    this.comboExpireAt = 0;
    this.busyUntil = now + DASH_ATTACK.activeMs + DASH_RECOVERY;
    return DASH_ATTACK;
  }
}
