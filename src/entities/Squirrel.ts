import Phaser from "phaser";

/**
 * 森林松鼠：平时在出生点附近小范围慢悠悠游走，猫靠近也不跑。
 * 被攻击（左键爪击的命中范围扫到，或非"从上方"的飞扑）会**瞬间高速跳开**——呈现"打不中"。
 * 只有猫从它上方右键飞扑命中才会被抓住（判定在 ForestScene）。
 */
const WANDER_R = 44; // 游走半径（很小）
const WANDER_SPEED = 34;
const FLEE_SPEED = 280;
const FLEE_MS = 650;

export class Squirrel {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly home = new Phaser.Math.Vector2();
  private readonly target = new Phaser.Math.Vector2();
  private wanderUntil = 0;
  private fleeUntil = 0;
  private readonly fleeDir = new Phaser.Math.Vector2();
  private caught = false;
  /** 世界边界（可选）：flee() 挪窝时把新窝 clamp 到界内，避免设进墙/水里 */
  private readonly boundW?: number;
  private readonly boundH?: number;

  constructor(scene: Phaser.Scene, x: number, y: number, boundW?: number, boundH?: number) {
    this.sprite = scene.physics.add.sprite(x, y, "squirrel");
    this.sprite.setCollideWorldBounds(true).setSize(16, 14).setOffset(16, 24).setDepth(8);
    this.sprite.play("squirrel-idle");
    this.home.set(x, y);
    this.target.set(x, y);
    this.boundW = boundW;
    this.boundH = boundH;
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }
  get isCaught(): boolean {
    return this.caught;
  }
  isFleeing(now: number): boolean {
    return now < this.fleeUntil;
  }

  update(now: number): void {
    if (this.caught) {
      this.sprite.setVelocity(0, 0);
      return;
    }
    if (now < this.fleeUntil) {
      // 逃逸：朝远离来源方向高速冲
      this.sprite.setVelocity(this.fleeDir.x * FLEE_SPEED, this.fleeDir.y * FLEE_SPEED);
      this.sprite.setFlipX(this.fleeDir.x < 0);
      return;
    }
    // 小范围游走：到点或超时就换个新目标
    const reached = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) < 6;
    if (now >= this.wanderUntil || reached) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * WANDER_R;
      this.target.set(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
      this.wanderUntil = now + 900 + Math.random() * 1400;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      this.sprite.setVelocity((dx / d) * WANDER_SPEED, (dy / d) * WANDER_SPEED);
      this.sprite.setFlipX(dx < 0);
    } else {
      this.sprite.setVelocity(0, 0);
    }
  }

  /** 被攻击吓到：瞬间朝远离 (fromX,fromY) 的方向跳开，并把"窝"挪到逃跑方向。 */
  flee(fromX: number, fromY: number, now: number): void {
    if (this.caught) return;
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.fleeDir.set(dx / d, dy / d);
    this.fleeUntil = now + FLEE_MS;
    this.home.set(this.x + this.fleeDir.x * 120, this.y + this.fleeDir.y * 120); // 新窝在逃跑方向
    if (this.boundW !== undefined && this.boundH !== undefined) {
      // 新窝 clamp 到世界边界内，防止挪进墙外/水里（不传参时行为不变）
      this.home.x = Phaser.Math.Clamp(this.home.x, 40, this.boundW - 40);
      this.home.y = Phaser.Math.Clamp(this.home.y, 40, this.boundH - 40);
    }
    this.wanderUntil = 0;
  }

  /** 被抓住：停下、缩小淡出（被猫逮到）。 */
  setCaught(scene: Phaser.Scene): void {
    if (this.caught) return;
    this.caught = true;
    this.sprite.setVelocity(0, 0);
    this.sprite.anims.stop();
    scene.tweens.add({
      targets: this.sprite,
      scale: 0.2,
      alpha: 0,
      angle: 120,
      duration: 360,
      onComplete: () => this.sprite.destroy(),
    });
  }
}
