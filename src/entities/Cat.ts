import Phaser from "phaser";
import { CatStats, createDefaultCatStats, tickStamina } from "../core/CatStats";
import { AttackSpec, ComboController, RAGE_FULL_CHARGE_MS } from "../core/Combat";

/**
 * 玩家控制的猫咪（Phaser 层）。
 * 渲染 + 输入在这里；移动速度/体力委托 core/CatStats，连击逻辑委托 core/Combat。
 */
export class Cat {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly stats: CatStats;
  /** 当前朝向（单位向量），决定攻击方向；默认朝下 */
  readonly facing = new Phaser.Math.Vector2(0, 1);

  private readonly scene: Phaser.Scene;
  private readonly combo = new ComboController();
  private dashUntil = 0;
  private readonly dashVel = new Phaser.Math.Vector2();
  private invulnUntil = 0;
  /** 爪击动画播放到此时刻前不被走/待机动画打断 */
  private attackAnimUntil = 0;
  /** 当前爪击用的动画前缀（cat-attack=左爪 / cat-attack2=右爪），update 据此续播正确的爪 */
  private attackAnimBase = "cat-attack";
  /** 冲刺飞扑动画播放到此时刻前优先播放 */
  private jumpAnimUntil = 0;
  /** 吃鱼动画播放到此时刻前：站定播吃东西动画，不被走/待机打断 */
  private eatAnimUntil = 0;

  /** 是否正在原地蓄力（按住右键/Y），蓄力时按速率攒怒气 */
  private charging = false;
  /** 是否已装备金色爪子（由 WorldScene 每帧同步）：决定爪痕特效银/金 */
  equippedGoldClaw = false;
  /** 头顶蓄力进度指示环 */
  private readonly chargeGfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.stats = createDefaultCatStats();
    this.sprite = scene.physics.add.sprite(x, y, "cat");
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setSize(22, 16).setOffset(21, 38); // 贴合 64px 帧里偏下居中的猫身
    this.sprite.setDepth(10);
    this.sprite.play("cat-idle-down");
    this.chargeGfx = scene.add.graphics().setDepth(60);
  }

  /** 由朝向向量判断四方向动画名（素材含专属左/右帧，无需翻转） */
  private facingDir(): "down" | "up" | "left" | "right" {
    if (Math.abs(this.facing.x) >= Math.abs(this.facing.y)) return this.facing.x < 0 ? "left" : "right";
    return this.facing.y < 0 ? "up" : "down";
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  /**
   * 每帧更新移动。冲刺期间锁定为冲刺速度并忽略转向；蓄力期间原地不动但可转向瞄准。
   * @param dir 期望移动方向（未归一化，长度<=1）
   * @param wantsToRun 是否按住奔跑键
   * @param dtMs Phaser 毫秒级 delta
   * @param now Phaser 当前时间（毫秒）
   */
  update(dir: Phaser.Math.Vector2, wantsToRun: boolean, dtMs: number, now: number): void {
    const dashing = now < this.dashUntil;
    const charging = this.charging && !dashing;
    // 爪击硬直中：停止走/跑，朝向锁定为起手方向（飞扑 dash 不算，它要靠位移命中）
    const clawing = !dashing && !charging && now < this.attackAnimUntil;
    // 吃鱼硬直中：站定播吃东西动画（优先级低于爪击/蓄力/飞扑）
    const eating = !dashing && !charging && !clawing && now < this.eatAnimUntil;
    let running = false;

    if (dashing) {
      this.sprite.setVelocity(this.dashVel.x, this.dashVel.y);
      running = true; // 冲刺也用跑步动画
    } else if (charging) {
      // 原地蓄力：不位移，但仍可用方向键/摇杆调整朝向来瞄准飞扑方向；同时按速率攒怒气
      this.sprite.setVelocity(0, 0);
      if (dir.lengthSq() > 0.0001) this.facing.copy(dir).normalize();
      const gain = (this.stats.maxRage / RAGE_FULL_CHARGE_MS) * dtMs; // 2.5 秒从 0 充满
      this.stats.rage = Math.min(this.stats.maxRage, this.stats.rage + gain);
    } else if (clawing) {
      // 攻击时停止移动：站定挥爪，不接受方向输入位移、也不转向
      this.sprite.setVelocity(0, 0);
      tickStamina(this.stats, false, dtMs / 1000); // 站定时正常恢复体力
      this.sprite.clearTint();
    } else if (eating) {
      // 吃鱼时站定：不位移、不转向，正常恢复体力
      this.sprite.setVelocity(0, 0);
      tickStamina(this.stats, false, dtMs / 1000);
      this.sprite.clearTint();
    } else {
      const speed = tickStamina(this.stats, wantsToRun, dtMs / 1000);
      this.sprite.setVelocity(dir.x * speed, dir.y * speed);
      if (dir.lengthSq() > 0.0001) this.facing.copy(dir).normalize();
      this.sprite.clearTint();
      running = speed >= this.stats.runSpeed - 0.5;
    }

    const facingDir = this.facingDir();

    // 动画优先级：飞扑 > 蓄力 > 爪击 > 跑/走 > 待机；都按四方向选对应动画（不翻转）
    if (now < this.jumpAnimUntil) {
      // 没有向下飞扑的图：朝下时沿用攻击帧，其余播放飞扑
      this.sprite.play(facingDir === "down" ? "cat-attack-down" : `cat-jump-${facingDir}`, true);
    } else if (charging) {
      this.sprite.play(`cat-charge-${facingDir}`, true); // 蓄力姿势（坐着挥爪/后腿站立），配合头顶指示环+泛光
    } else if (now < this.attackAnimUntil) {
      this.sprite.play(`${this.attackAnimBase}-${facingDir}`, true);
    } else if (eating) {
      this.sprite.play(`cat-eat-${facingDir}`, true);
    } else if (dir.lengthSq() > 0.0001) {
      this.sprite.play(`cat-${running ? "run" : "walk"}-${facingDir}`, true);
    } else {
      this.sprite.play(`cat-idle-${facingDir}`, true);
    }

    this.drawCharge(now, charging);
  }

  /**
   * 尝试爪击/连招（左键/手柄X）。命中判定由场景按返回的 AttackSpec 执行。
   * 第1下左爪、第2下右爪（按 comboIndex 选动画）；第3下是短距飞扑（dash）。
   */
  tryClaw(now: number): AttackSpec | null {
    const spec = this.combo.tryClaw(now);
    if (!spec) return null;
    if (spec.kind === "dash") {
      this.startDash(spec, now); // 第三击：短距飞扑，播飞扑动画（爪痕在 startDash 里出）
    } else {
      // 挥爪动画比命中判定略长，保证动作看得清；每击强制从首帧重播（update 里用
      // ignoreIfPlaying 续播，不打断本次重播）
      this.attackAnimUntil = now + Math.max(spec.activeMs, 320);
      this.attackAnimBase = spec.comboIndex === 1 ? "cat-attack2" : "cat-attack"; // 1=右爪
      this.sprite.play(`${this.attackAnimBase}-${this.facingDir()}`, false);
      this.spawnClawFx(); // 抬爪时在猫前方闪一道细爪痕
    }
    return spec;
  }

  /** 是否正在蓄力（供场景做"按钮已松开却没收到事件"的兜底判断）。 */
  get isCharging(): boolean {
    return this.charging;
  }

  /** 右键/Y 按下：开始原地蓄力（已在蓄力或冲刺硬直中则忽略）。怒气在 update 里按速率增长。 */
  beginCharge(now: number): void {
    if (this.charging || now < this.dashUntil) return;
    this.charging = true;
  }

  /**
   * 右键/Y 松开：怒气满（rage >= maxRage）则发动飞扑、清空怒气并返回 AttackSpec；
   * 未满则取消、返回 null（怒气保留，下次按住继续攒/靠打怪攒）。
   */
  releaseCharge(now: number): AttackSpec | null {
    if (!this.charging) return null;
    this.charging = false;
    this.chargeGfx.clear();
    this.sprite.clearTint();
    if (this.stats.rage < this.stats.maxRage) return null; // 怒气没满，不发动
    const spec = this.fireDash(now);
    if (spec) this.stats.rage = 0; // 真正发动才清空怒气
    return spec;
  }

  /** 打中敌人增加怒气（由场景在命中时调用），不超过上限。 */
  addRage(amount: number): void {
    this.stats.rage = Math.min(this.stats.maxRage, this.stats.rage + amount);
  }

  /**
   * 右键/Y 按下时调用：怒气已满则**立刻**发动飞扑、清空怒气并返回 AttackSpec
   * （无需进入蓄力圈等待）；未满或正在冲刺中则返回 null，由场景改走 beginCharge 蓄力。
   */
  tryInstantDash(now: number): AttackSpec | null {
    if (now < this.dashUntil) return null;
    if (this.stats.rage < this.stats.maxRage) return null;
    const spec = this.fireDash(now);
    if (spec) this.stats.rage = 0;
    return spec;
  }

  /** 发动右键蓄力飞扑：返回攻击规格。 */
  private fireDash(now: number): AttackSpec | null {
    const spec = this.combo.tryDash(now);
    if (spec) this.startDash(spec, now);
    return spec;
  }

  /** 在猫"脚的前方"闪一道细弯爪痕：默认银色，装备金爪则金色。绕朝向旋转、短暂放大淡出。 */
  private spawnClawFx(): void {
    if (!this.sprite.active) return;
    const ang = Math.atan2(this.facing.y, this.facing.x);
    // 位置：猫身下移到脚部(+12)，再沿朝向往前 16px → "脚的前方"，不在头部
    const fx = this.scene.add
      .sprite(this.x + this.facing.x * 16, this.y + 12 + this.facing.y * 16, "claw-fx")
      .setOrigin(0.15, 0.5) // 以爪痕凹侧(靠猫一端)为支点，弧线朝前展开
      .setDepth(20)
      .setRotation(ang)
      .setScale(0.7)
      .setTint(this.equippedGoldClaw ? 0xffd23f : 0xd8d8e0);
    this.scene.tweens.add({
      targets: fx,
      scale: 1.0,
      alpha: 0,
      duration: 170,
      onComplete: () => fx.destroy(),
    });
  }

  /** 按 AttackSpec 发动一次飞扑位移：dashMs 控位移时长（不填=activeMs），飞扑动画至少播 360ms。 */
  private startDash(spec: AttackSpec, now: number): void {
    const dashMs = spec.dashMs ?? spec.activeMs;
    this.dashUntil = now + dashMs;
    this.jumpAnimUntil = now + Math.max(dashMs, 360);
    this.dashVel.copy(this.facing).scale(spec.dashSpeed ?? 0);
    // 飞扑突进/打击的过程短暂无敌，贴脸命中也不掉血（短距飞扑、右键飞扑都走这里）
    this.invulnUntil = Math.max(this.invulnUntil, now + Math.max(dashMs, spec.activeMs) + 100);
    // 爪痕延到"扑出去之后"再出现：用 dashMs 延时，落地时在新位置前方显示，避免出现在猫身后
    this.scene.time.delayedCall(dashMs, () => this.spawnClawFx());
  }

  /** 受击扣血，带无敌帧；真正扣血返回 true。 */
  tryTakeDamage(amount: number, now: number): boolean {
    if (now < this.invulnUntil) return false;
    this.stats.health = Math.max(0, this.stats.health - amount);
    this.invulnUntil = now + 700;
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.3,
      duration: 90,
      yoyo: true,
      repeat: 3,
      onComplete: () => this.sprite.setAlpha(1),
    });
    return true;
  }

  /** 回血（吃鱼），不超过上限。 */
  heal(amount: number): void {
    this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + amount);
  }

  /** 吃鱼：朝当前方向播一次吃东西动画并回血，期间短暂站定（约 0.7s）。 */
  eat(amount: number, now: number): void {
    this.heal(amount);
    this.eatAnimUntil = now + 700;
    this.sprite.play(`cat-eat-${this.facingDir()}`, false); // 强制从首帧重播
  }

  /** 死亡表现：取消蓄力、停下、变灰、停动画（实际逻辑由场景判定 health<=0）。 */
  die(): void {
    this.charging = false;
    this.chargeGfx.clear();
    this.sprite.setVelocity(0, 0);
    this.sprite.setTint(0x888888);
    this.sprite.anims.stop();
  }

  /** 在猫头顶画怒气进度环：蓄力中按 rage/maxRage 渐满+猫身渐亮，满了变绿并脉冲泛光。 */
  private drawCharge(now: number, charging: boolean): void {
    const g = this.chargeGfx;
    g.clear();
    if (!charging) return;

    const ratio = Math.min(1, this.stats.rage / this.stats.maxRage);
    const ready = ratio >= 1;
    const cx = this.sprite.x;
    const cy = this.sprite.y - 40;
    const r = 16;
    const start = -Math.PI / 2;

    g.lineStyle(4, 0x000000, 0.35).strokeCircle(cx, cy, r); // 底环
    g.lineStyle(4, ready ? 0x06d6a0 : 0xffd166, 1); // 进度弧（从正上方顺时针）
    g.beginPath();
    g.arc(cx, cy, r, start, start + ratio * Math.PI * 2, false);
    g.strokePath();

    if (ready) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 80);
      g.fillStyle(0x06d6a0, 0.2 + 0.35 * pulse).fillCircle(cx, cy, r);
      this.sprite.setTint(0xffffb4); // 蓄满泛暖光，提示可松开
    } else {
      const b = Math.floor(180 + 75 * ratio);
      this.sprite.setTint(Phaser.Display.Color.GetColor(255, 255, b));
    }
  }
}
