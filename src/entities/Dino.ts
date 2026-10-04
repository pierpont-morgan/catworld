import Phaser from "phaser";
import { HARD_STUN_MS } from "../core/Combat";

/**
 * 绿色恐龙：远程喷火怪。保持与猫一定距离，周期性「蓄势 → 喷火」。
 * 关键规则：**只有喷出的火舌会掉猫血；平时贴上去（接触）不掉血**（contactDamage=0，
 * WorldScene 的接触伤害循环不含恐龙）。火焰命中由 WorldScene 调 hitsCat() 判定。
 * 被猫攻击同样进短僵直/击退；死亡时由 WorldScene 掉落恐龙蛋 + 金色爪子。
 */
const MAX_HEALTH = 180;
const MOVE_SPEED = 56;
const AGGRO_RANGE = 460;
const PREFERRED_DIST = 160; // 与猫保持的距离（远了靠近、近了后退）
const FIRE_RANGE = 330; // 进入此距离且冷却好了就喷火
const FIRE_COOLDOWN = 2600;
const TELEGRAPH_MS = 520; // 喷火前摇（泛红预警）
const BREATHE_MS = 1000; // 喷火持续
const FLAME_LEN = 82; // 火舌长度（缩短一半，靠扫动覆盖范围）
/** 进入喷火前摇的最远距离：火舌长度 + 命中宽容。远于此距离时先靠近，不"空喷" */
const FLAME_COMMIT_DIST = FLAME_LEN + 24;
const FLAME_HALF_ANGLE = 0.42; // 瞬时火舌半张角（弧度，约 24°）
const FLAME_SWEEP = Math.PI / 4; // 扫动幅度 ±45° → 覆盖约 90°
const FLAME_SWEEP_PERIOD = 420; // 扫动一个来回的毫秒
const FLAME_DAMAGE = 24; // 命中一次的伤害（距离短了、伤害加高；猫有 700ms 无敌帧）

type DinoState = "approach" | "telegraph" | "breathe";

export class Dino {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private health = MAX_HEALTH;
  private state: DinoState = "approach";
  private stateUntil = 0;
  private nextFireAt = 0;
  private aimAngle = 0; // 喷火时锁定的中心瞄准方向
  private flameAngle = 0; // 当前火舌方向（中心方向 + 扫动偏移）
  private breatheStart = 0; // 本次喷火起始时刻（算扫动相位）
  private flame?: Phaser.GameObjects.Sprite;
  private stunUntil = 0;
  private dead = false;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.sprite = scene.physics.add.sprite(x, y, "dino");
    this.sprite
      .setCollideWorldBounds(true)
      .setDrag(700, 700)
      .setSize(28, 24)
      .setOffset(10, 20);
    this.sprite.play("dino-idle");
    this.hpBar = scene.add.graphics().setDepth(40);
    this.nextFireAt = scene.time.now + 1200;
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }
  get isDead(): boolean {
    return this.dead;
  }
  /** 接触不掉血 */
  get contactDamage(): number {
    return 0;
  }
  get contactRange(): number {
    return 28;
  }
  isStunned(now: number): boolean {
    return now < this.stunUntil;
  }

  update(targetX: number, targetY: number, now: number): void {
    if (this.dead) return;
    const dx = targetX - this.sprite.x;
    const dy = targetY - this.sprite.y;
    const d = Math.hypot(dx, dy) || 1;
    this.sprite.setFlipX(dx < 0); // 朝猫（贴图默认朝右）

    if (now < this.stunUntil) {
      // 被击退僵直中：取消正在进行的喷火
      this.endBreathe();
    } else {
      switch (this.state) {
        case "approach": {
          if (d < AGGRO_RANGE) {
            if (d < FIRE_RANGE && now >= this.nextFireAt && d > FLAME_COMMIT_DIST) {
              // 冷却好了但距离太远喷不中：无视"保持距离"死区，直接朝猫拉近到火舌射程内
              this.sprite.setVelocity((dx / d) * MOVE_SPEED, (dy / d) * MOVE_SPEED);
            } else if (d > PREFERRED_DIST + 30) this.sprite.setVelocity((dx / d) * MOVE_SPEED, (dy / d) * MOVE_SPEED);
            else if (d < PREFERRED_DIST - 30) this.sprite.setVelocity((-dx / d) * MOVE_SPEED, (-dy / d) * MOVE_SPEED);
            else this.sprite.setVelocity(0, 0);
            // 只有火舌够得着才进入前摇，否则继续靠近——避免站在火舌外"空喷"
            if (d < FIRE_RANGE && now >= this.nextFireAt && d <= FLAME_COMMIT_DIST) {
              this.state = "telegraph";
              this.stateUntil = now + TELEGRAPH_MS;
              this.sprite.setVelocity(0, 0);
            }
          } else {
            this.sprite.setVelocity(0, 0);
          }
          break;
        }
        case "telegraph": {
          this.sprite.setVelocity(0, 0);
          // 前摇泛红脉冲预警
          const p = 0.5 + 0.5 * Math.sin(now / 40);
          this.sprite.setTint(Phaser.Display.Color.GetColor(255, Math.floor(120 * (1 - p)), Math.floor(60 * (1 - p))));
          if (now >= this.stateUntil) {
            this.aimAngle = Math.atan2(dy, dx);
            this.flameAngle = this.aimAngle;
            this.breatheStart = now;
            this.state = "breathe";
            this.stateUntil = now + BREATHE_MS;
            this.sprite.clearTint();
            this.startBreathe();
          }
          break;
        }
        case "breathe": {
          this.sprite.setVelocity(0, 0);
          // 火舌在中心方向附近来回扫动，覆盖约 90°
          this.flameAngle = this.aimAngle + Math.sin(((now - this.breatheStart) / FLAME_SWEEP_PERIOD) * Math.PI * 2) * FLAME_SWEEP;
          this.positionFlame();
          if (now >= this.stateUntil) {
            this.endBreathe();
            this.state = "approach";
            this.nextFireAt = now + FIRE_COOLDOWN;
          }
          break;
        }
      }
    }

    if (this.flame) this.positionFlame();
    this.drawHpBar();
  }

  /** 正在喷火且猫在火舌锥形内 → 返回伤害，否则 0。供 WorldScene 每帧判定。 */
  hitsCat(catX: number, catY: number): number {
    if (this.dead || this.state !== "breathe") return 0;
    const dx = catX - this.sprite.x;
    const dy = catY - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist > FLAME_LEN || dist < 1) return 0;
    const ang = Math.atan2(dy, dx);
    const diff = Math.abs(Phaser.Math.Angle.Wrap(ang - this.flameAngle));
    return diff <= FLAME_HALF_ANGLE ? FLAME_DAMAGE : 0;
  }

  private startBreathe(): void {
    this.flame = this.scene.add.sprite(this.sprite.x, this.sprite.y, "dino-fire").setDepth(15);
    this.flame.setOrigin(0, 0.5); // 从恐龙嘴部沿瞄准方向延伸
    this.flame.play("dino-fire");
    this.positionFlame();
  }

  private positionFlame(): void {
    if (!this.flame) return;
    const mouthX = this.sprite.x + Math.cos(this.flameAngle) * 14;
    const mouthY = this.sprite.y + Math.sin(this.flameAngle) * 14;
    this.flame.setPosition(mouthX, mouthY);
    this.flame.setRotation(this.flameAngle);
    this.flame.setScale(FLAME_LEN / 48, 1.1); // 横向拉到火舌长度
  }

  private endBreathe(): void {
    if (this.flame) {
      this.flame.destroy();
      this.flame = undefined;
    }
  }

  /**
   * 受击。只有"硬僵直"（stunMs >= HARD_STUN_MS，即短距/右键飞扑）才会打断正在进行的
   * 喷火（前摇 telegraph 同样可被硬僵直打断）并击退/僵直；
   * 普通爪击（stunMs < HARD_STUN_MS）在喷火/前摇期间只掉血，不打断、不击退、不僵直。
   * 未喷火时任何命中都正常击退 + 僵直。
   */
  takeDamage(amount: number, knockbackX: number, knockbackY: number, now: number, stunMs = 220): void {
    if (this.dead) return;
    this.health -= amount;
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (!this.dead) this.sprite.clearTint();
    });
    const active = this.state === "breathe" || this.state === "telegraph"; // 喷火中或前摇中
    const canInterrupt = stunMs >= HARD_STUN_MS; // 硬僵直才打断
    if (active && !canInterrupt) {
      // 喷火/前摇中被普通爪击：照常掉血，但火不灭、不被推、不僵直
    } else {
      this.sprite.setVelocity(knockbackX, knockbackY);
      this.stunUntil = now + stunMs;
      if (active) {
        this.endBreathe();
        this.state = "approach";
        this.nextFireAt = now + 800;
        this.sprite.clearTint(); // 前摇的泛红预警也要清掉，避免僵直中还红着
      }
    }
    if (this.health <= 0) this.die();
  }

  private die(): void {
    this.dead = true;
    this.endBreathe();
    this.sprite.setVelocity(0, 0);
    this.hpBar.clear();
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scale: 0.2,
      angle: 200,
      duration: 260,
      onComplete: () => {
        this.hpBar.destroy();
        this.sprite.destroy();
      },
    });
  }

  private drawHpBar(): void {
    const w = 40;
    const h = 5;
    const x = this.sprite.x - w / 2;
    const y = this.sprite.y - 30;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.5).fillRect(x, y, w, h);
    const pct = Phaser.Math.Clamp(this.health / MAX_HEALTH, 0, 1);
    this.hpBar.fillStyle(0x66dd55, 1).fillRect(x, y, w * pct, h);
  }
}
