import Phaser from "phaser";

/**
 * 敌人史莱姆。简单 AI：进入仇恨范围就追猫，被击中时进入短暂硬直被击退。
 * 分多个品种（颜色 = 强度）：紫(弱) < 绿 < 红 < 紫王(大型，死亡分裂成 4 只紫)，血量/接触伤害/体型依次递增。
 * 血量逻辑很轻量，先内联在这里；将来复杂化可抽到 core/。
 */
export type SlimeKind = "purple" | "green" | "red" | "king" | "gold";

interface SlimeDef {
  /** 纹理 key（art/pixelart.ts 程序化生成） */
  texture: string;
  /** 待机动画 key（manifest 注册） */
  anim: string;
  maxHealth: number;
  speed: number;
  aggroRange: number;
  /** 显示与物理体缩放（大王放大成大型史莱姆） */
  scale: number;
  /** 贴上猫时每次造成的接触伤害 */
  contactDamage: number;
  /** true=见到猫就逃跑（金史莱姆）；默认追猫 */
  flee?: boolean;
}

const SLIME_DEFS: Record<SlimeKind, SlimeDef> = {
  purple: { texture: "slime", anim: "slime-idle", maxHealth: 40, speed: 70, aggroRange: 280, scale: 1, contactDamage: 8 },
  green: { texture: "slime-green", anim: "slime-green-idle", maxHealth: 70, speed: 62, aggroRange: 300, scale: 1.1, contactDamage: 10 },
  red: { texture: "slime-red", anim: "slime-red-idle", maxHealth: 110, speed: 92, aggroRange: 340, scale: 1.05, contactDamage: 14 },
  // 紫王：大型紫史莱姆，死亡时由 WorldScene 分裂成 4 只紫色小史莱姆
  king: { texture: "slime-king", anim: "slime-king-idle", maxHealth: 260, speed: 46, aggroRange: 380, scale: 1.9, contactDamage: 22 },
  // 金：稀有，不攻击(接触0伤)、血厚、移速快、见猫就逃，击败掉金钥匙
  gold: { texture: "slime-gold", anim: "slime-gold-idle", maxHealth: 220, speed: 150, aggroRange: 360, scale: 0.85, contactDamage: 0, flee: true },
};

export class Enemy {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly kind: SlimeKind;
  private health: number;
  private readonly def: SlimeDef;
  private stunUntil = 0;
  /** 长僵直(>=1s)的泛蓝指示截止时刻；到点在 update 里清掉 tint */
  private hardStunUntil = 0;
  private dead = false;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  /** 僵直时头顶的眩晕细线（绕头转的小星花） */
  private readonly stunGfx: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: SlimeKind = "purple") {
    this.scene = scene;
    this.kind = kind;
    this.def = SLIME_DEFS[kind];
    this.health = this.def.maxHealth;
    this.sprite = scene.physics.add.sprite(x, y, this.def.texture);
    this.sprite
      .setCollideWorldBounds(true)
      .setDrag(720, 720) // 被击退后逐渐减速
      .setSize(30, 22)
      .setOffset(9, 22)
      .setScale(this.def.scale);
    this.sprite.play(this.def.anim);
    this.hpBar = scene.add.graphics().setDepth(40);
    this.stunGfx = scene.add.graphics().setDepth(45);
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
  /** 接触猫时造成的伤害 */
  get contactDamage(): number {
    return this.def.contactDamage;
  }
  /** 触发接触伤害的中心距离（随体型放大） */
  get contactRange(): number {
    return 26 * this.def.scale;
  }
  /** 僵直中：不追猫、也不造成接触伤害（猫可贴在旁边安全输出） */
  isStunned(now: number): boolean {
    return now < this.stunUntil;
  }

  update(targetX: number, targetY: number, now: number): void {
    if (this.dead) return;

    if (now >= this.stunUntil) {
      const dx = targetX - this.sprite.x;
      const dy = targetY - this.sprite.y;
      const d = Math.hypot(dx, dy);
      if (d > 4 && d < this.def.aggroRange) {
        const sign = this.def.flee ? -1 : 1; // 金史莱姆见猫就往反方向逃
        this.sprite.setVelocity(sign * (dx / d) * this.def.speed, sign * (dy / d) * this.def.speed);
      } else {
        this.sprite.setVelocity(0, 0);
      }
    }
    // 长僵直结束：清掉泛蓝 + 恢复可被推动（白闪由 takeDamage 的 delayedCall 负责）
    if (this.hardStunUntil && now >= this.hardStunUntil) {
      this.hardStunUntil = 0;
      if (!this.dead) {
        this.sprite.clearTint();
        this.sprite.setImmovable(false);
      }
    }
    this.drawHpBar();
    this.drawStun(now);
  }

  /** 僵直时在头顶画 3 个绕头旋转的小星花（眩晕细线指示）。 */
  private drawStun(now: number): void {
    const g = this.stunGfx;
    g.clear();
    if (this.dead || !this.isStunned(now)) return;
    const cx = this.sprite.x;
    const cy = this.sprite.y - 26 * this.def.scale - 14; // 血条之上
    const orbit = 9;
    const t = now / 260;
    g.lineStyle(1.5, 0xfff06a, 0.95);
    for (let i = 0; i < 3; i++) {
      const a = t + (i * Math.PI * 2) / 3;
      const px = cx + Math.cos(a) * orbit;
      const py = cy + Math.sin(a) * orbit * 0.5; // 椭圆轨道，像绕头转
      const s = 2.4;
      g.beginPath();
      g.moveTo(px - s, py);
      g.lineTo(px + s, py);
      g.strokePath();
      g.beginPath();
      g.moveTo(px, py - s);
      g.lineTo(px, py + s);
      g.strokePath();
    }
  }

  /** 受击：扣血 + 击退 + 僵直 stunMs（默认 220ms 短僵直）。 */
  takeDamage(amount: number, knockbackX: number, knockbackY: number, now: number, stunMs = 220): void {
    if (this.dead) return;
    this.health -= amount;
    this.sprite.setVelocity(knockbackX, knockbackY);
    this.stunUntil = now + stunMs;
    const hard = stunMs >= 1000; // 长僵直（飞扑）：泛蓝 + 设为不可推动
    if (hard) {
      this.hardStunUntil = now + stunMs;
      // 关键：不可推动后，冲刺的猫不能再用碰撞体把敌人“推土机”式带飞，
      // 敌人位移只由 knockback 决定（击退距离才真正可控）。
      this.sprite.setImmovable(true);
    }

    // 命中白闪反馈；白闪结束后，若仍在长僵直则泛蓝，否则恢复
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (this.dead) return;
      if (this.scene.time.now < this.hardStunUntil) this.sprite.setTint(0x66ccff);
      else this.sprite.clearTint();
    });

    if (this.health <= 0) this.die();
  }

  private die(): void {
    this.dead = true;
    this.sprite.setVelocity(0, 0);
    this.hpBar.clear();
    this.stunGfx.clear();
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scale: this.def.scale * 0.2,
      angle: 200,
      duration: 240,
      onComplete: () => {
        this.hpBar.destroy();
        this.stunGfx.destroy();
        this.sprite.destroy();
      },
    });
  }

  private drawHpBar(): void {
    const w = 36 * this.def.scale;
    const h = 5;
    const x = this.sprite.x - w / 2;
    const y = this.sprite.y - 26 * this.def.scale - 6;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.5).fillRect(x, y, w, h);
    const pct = Phaser.Math.Clamp(this.health / this.def.maxHealth, 0, 1);
    this.hpBar.fillStyle(0xff5555, 1).fillRect(x, y, w * pct, h);
  }
}
