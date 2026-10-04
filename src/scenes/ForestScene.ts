import Phaser from "phaser";
import { WORLD, WORLD_SEED } from "../config";
import { Cat } from "../entities/Cat";
import { Squirrel } from "../entities/Squirrel";
import { Pet } from "../entities/Pet";
import { DialogBox } from "../entities/DialogBox";
import { InventoryUI, HatchInfo } from "../entities/InventoryUI";
import { AttackSpec } from "../core/Combat";
import { runState } from "../core/RunState";
import { EMPTY, generateForest, GeneratedWorld } from "../core/worldgen";
import { playSfx, toggleMute } from "../audio/sfx";
import { BerryBush } from "../entities/BerryBush";

/**
 * 第二关：森林（22×22 瓦片，面积约主地图 1/5，全是森林）。
 * 与主世界共享本局状态（runState）：背包/装备/孵化/宠物延续。猫的能力（三连爪击、
 * 蓄力飞扑、HUD、背包）这里同样可用。玩法：从上方右键飞扑抓住松鼠 → 橘猫走来对话。
 * 出生点旁有一道返回门，靠近按 E 回主世界。
 */
const FOREST_COLS = 22;
const FOREST_ROWS = 22;
const GAMEPAD_DEADZONE = 0.15;
const PAD_BTN_A = 0;
const PAD_BTN_X = 2;
const PAD_BTN_Y = 3;
const DOOR_RANGE = 76;
const HATCH_MS = 60000;

/** 橘猫占位台词（用户可随时改文本） */
const GINGER_LINES = [
  "（一只橘猫慢慢踱过来，尾巴轻轻一甩）",
  "哟——没想到真有猫能逮住那只滑头松鼠。",
  "这片森林比看上去要古老得多，树影里藏着不少东西。",
  "我叫橘子。接下来的路，或许我们能搭个伴。",
  "不过在那之前——先让我掂量掂量你的身手！接招吧！",
];

interface ForestHit {
  damage: number;
  knockback: number;
  stunMs: number;
  radius: number;
  follow: boolean;
  expireAt: number;
  cx: number;
  cy: number;
  hitSet: Set<Squirrel>;
  /** 本次挥击是否已命中橘猫（每次攻击只命中一次） */
  hitGinger: boolean;
}

type Phase = "play" | "ginger" | "dialog" | "battle" | "won";

/** 橘猫战斗数值 */
const GINGER_MAX_HP = 120;
const GINGER_CONTACT_DMG = 12;
const GINGER_CONTACT_RANGE = 40;

export class ForestScene extends Phaser.Scene {
  private cat!: Cat;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private obstacleLayer!: Phaser.Tilemaps.TilemapLayer;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private runKey!: Phaser.Input.Keyboard.Key;
  private advanceKey!: Phaser.Input.Keyboard.Key;
  private invKey!: Phaser.Input.Keyboard.Key;
  private muteKey!: Phaser.Input.Keyboard.Key;

  private squirrel?: Squirrel;
  private ginger?: Phaser.Physics.Arcade.Sprite;
  private pet?: Pet;
  private dialog!: DialogBox;
  private invUI!: InventoryUI;
  private hud!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Graphics;
  private returnDoor?: Phaser.GameObjects.Sprite;
  /** 浆果丛：森林回血点（3 丛，摘完 45 秒长回） */
  private bushes: BerryBush[] = [];
  /** 抓走松鼠后，隔一段时间再刷一只回来（可重复抓，计数成就） */
  private squirrelRespawnAt = 0;
  private phase: Phase = "play";
  private returning = false;
  /** 森林出生点（松鼠重生用） */
  private spawnX = 0;
  private spawnY = 0;
  /** 命中顿帧进行中（防重入） */
  private hitStopping = false;
  /** 当前目标指引 */
  private questText!: Phaser.GameObjects.Text;

  private queuedAttack = false;
  private activeHit: ForestHit | null = null;

  // 橘猫战斗状态
  private gingerHpBar!: Phaser.GameObjects.Graphics;
  private gingerHp = 0;
  private gingerStunUntil = 0;
  private readonly gingerKb = new Phaser.Math.Vector2();
  private gingerHitNextAt = 0;
  private gingerDefeated = false;

  constructor() {
    super("Forest");
  }

  create(): void {
    this.phase = "play";
    this.returning = false;
    this.queuedAttack = false;
    this.activeHit = null;
    this.squirrel = undefined;
    this.ginger = undefined;
    this.pet = undefined;
    this.bushes = [];
    this.squirrelRespawnAt = 0;
    this.hitStopping = false;
    this.gingerDefeated = false;
    this.gingerStunUntil = 0;
    this.gingerHitNextAt = 0;
    this.gingerKb.set(0, 0);

    const W = FOREST_COLS * WORLD.tileSize;
    const H = FOREST_ROWS * WORLD.tileSize;
    this.physics.world.setBounds(0, 0, W, H);

    const world = this.buildForestMap();
    this.spawnX = world.spawn.x;
    this.spawnY = world.spawn.y;

    this.cat = new Cat(this, world.spawn.x, world.spawn.y);
    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    this.physics.add.collider(this.cat.sprite, this.obstacleLayer);

    // 松鼠
    const sx = Phaser.Math.Clamp(world.spawn.x + 150, 96, W - 96);
    const sy = Phaser.Math.Clamp(world.spawn.y + 80, 96, H - 96);
    this.squirrel = new Squirrel(this, sx, sy, W, H);
    this.physics.add.collider(this.squirrel.sprite, this.obstacleLayer);

    // 浆果丛：出生点附近 3 丛，森林回血点
    const bushOffsets = [
      [110, 50],
      [-120, 70],
      [30, -130],
    ];
    for (const [ox, oy] of bushOffsets) {
      const bx = Phaser.Math.Clamp(world.spawn.x + ox, 80, W - 80);
      const by = Phaser.Math.Clamp(world.spawn.y + oy, 80, H - 80);
      this.bushes.push(new BerryBush(this, bx, by));
    }

    // 返回门（出生点左侧）
    const dx = Phaser.Math.Clamp(world.spawn.x - 130, 80, W - 80);
    this.returnDoor = this.add.sprite(dx, world.spawn.y, "door").setDepth(8);

    // 跨关宠物：本局已有宠物 → 这里也生成跟随
    if (runState.hasPet) this.pet = new Pet(this, this.cat.x - 40, this.cat.y);
    // 黑猫皮肤跨场景延续
    if (runState.useBlackCat) this.cat.setSkin("black");

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.startFollow(this.cat.sprite, true, 0.1, 0.1);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys("W,A,S,D") as typeof this.wasd;
    this.runKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.advanceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.invKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.muteKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);

    this.dialog = new DialogBox(this);
    this.invUI = new InventoryUI(this, runState.inventory, {
      getHatch: (now) => this.getHatchInfo(now),
      onEquipToggle: () => runState.inventory.toggleEquipClaw(),
      onStartHatch: () => this.startHatch(),
      onCollectPet: () => this.collectPet(),
      skin: {
        unlocked: () => runState.skinUnlocked,
        isBlack: () => runState.useBlackCat,
        onToggle: () => {
          runState.useBlackCat = !runState.useBlackCat;
          this.cat.setSkin(runState.useBlackCat ? "black" : "white");
          playSfx("click");
        },
      },
    });
    this.setupInput();
    this.createHud();

    this.cameras.main.fadeIn(600, 0, 0, 0);
  }

  update(time: number, delta: number): void {
    const now = time;
    if (this.returning) return;
    this.cat.equippedGoldClaw = runState.inventory.equippedClaw; // 爪痕银/金

    // 背包开关（B）：打开时先取消蓄力（怒气保留），防"背包开着打出飞扑"
    if (Phaser.Input.Keyboard.JustDown(this.invKey) && !this.dialog.isActive) {
      if (this.cat.isCharging) this.cat.cancelCharge();
      playSfx("click");
      this.invUI.toggle();
    }
    // 静音开关（M）
    if (Phaser.Input.Keyboard.JustDown(this.muteKey)) {
      this.announce(toggleMute() ? "🔇 已静音（按 M 恢复）" : "🔊 声音开");
    }

    // 对话中：猫站定，等待推进
    if (this.dialog.isActive) {
      // 对话推进由 DialogBox 自己监听 E/空格/点击；手柄 A 在 gamepad 处理。此处只冻结猫
      this.cat.update(new Phaser.Math.Vector2(0, 0), false, delta, now);
      this.afterFrame(now);
      return;
    }
    // 橘猫走来：猫站定看橘猫
    if (this.phase === "ginger") {
      this.cat.update(new Phaser.Math.Vector2(0, 0), false, delta, now);
      this.updateGingerApproach();
      this.afterFrame(now);
      return;
    }

    // ---- 正常玩法 ----
    const dir = new Phaser.Math.Vector2(0, 0);
    if (this.cursors.left.isDown || this.wasd.A.isDown) dir.x -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dir.x += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dir.y -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dir.y += 1;
    let wantsToRun = this.runKey.isDown;
    const pad = this.input.gamepad?.getPad(0);
    if (pad) {
      const stick = pad.leftStick;
      if (stick.length() > GAMEPAD_DEADZONE) dir.add(stick);
      if (pad.R2 > 0.1) wantsToRun = true;
    }
    dir.limit(1);

    // 爪击在移动前消费（攻击当帧就停下）
    if (this.queuedAttack) {
      this.queuedAttack = false;
      const spec = this.cat.tryClaw(now);
      if (spec) this.spawnHit(spec, now);
    }

    this.cat.update(dir, wantsToRun, delta, now);
    // 蓄力兜底：背包/对话打开时不补发（打开瞬间已 cancelCharge），防误触打出飞扑
    if (this.cat.isCharging && !this.isDashHeld() && !this.invUI.isOpen && !this.dialog.isActive)
      this.releaseDash();
    this.updateHit(now);
    if (this.phase === "play" && this.squirrel) this.squirrel.update(now);
    // 松鼠被抓走后隔 20 秒回来一只，可重复抓（计数成就）
    if (this.phase === "won" && !this.squirrel && this.squirrelRespawnAt > 0 && now >= this.squirrelRespawnAt) {
      this.squirrelRespawnAt = 0;
      const W = FOREST_COLS * WORLD.tileSize;
      const H = FOREST_ROWS * WORLD.tileSize;
      const sx = Phaser.Math.Clamp(this.spawnX + 150, 96, W - 96);
      const sy = Phaser.Math.Clamp(this.spawnY + 80, 96, H - 96);
      this.squirrel = new Squirrel(this, sx, sy, W, H);
      this.physics.add.collider(this.squirrel.sprite, this.obstacleLayer);
      this.announce("又有一只松鼠溜进了森林…");
    }
    for (const b of this.bushes) b.update(now);
    if (this.phase === "battle") {
      this.updateGingerBattle(now, delta);
      if (this.cat.stats.health <= 0) {
        this.loseBattle();
        return;
      }
    }
    if (this.invUI.isOpen) this.invUI.refresh(now);

    // E：靠近返回门 → 回主世界（仅非战斗阶段，防战斗中按 E 逃跑）；
    // 否则试试摘浆果（森林回血）
    if (Phaser.Input.Keyboard.JustDown(this.advanceKey)) {
      if ((this.phase === "play" || this.phase === "won") && this.nearReturnDoor()) this.returnToWorld();
      else this.tryPickBerry();
    }

    this.afterFrame(now);
  }

  /** 每帧收尾：宠物跟随 + HUD + 门提示。 */
  private afterFrame(now: number): void {
    if (this.pet) this.pet.update(this.cat.x, this.cat.y);
    this.updateHud();
    this.drawMarker(now);
  }

  // ----- 战斗命中（松鼠 / 橘猫） -----

  private spawnHit(spec: AttackSpec, now: number): void {
    playSfx("swing");
    this.activeHit = {
      damage: Math.round(spec.damage * runState.inventory.damageMult), // 装备金爪 ×1.5
      knockback: spec.knockback,
      stunMs: spec.stunMs ?? 220,
      radius: spec.radius,
      follow: spec.kind === "dash",
      expireAt: now + spec.activeMs,
      cx: this.cat.x + this.cat.facing.x * spec.reach,
      cy: this.cat.y + this.cat.facing.y * spec.reach,
      hitSet: new Set<Squirrel>(),
      hitGinger: false,
    };
  }

  private updateHit(now: number): void {
    const h = this.activeHit;
    if (!h) return;
    if (now > h.expireAt) {
      this.activeHit = null;
      return;
    }
    const cx = h.follow ? this.cat.x : h.cx;
    const cy = h.follow ? this.cat.y : h.cy;

    // 松鼠（play 阶段）：左键吓跑、上方飞扑抓住
    const sq = this.squirrel;
    if (
      sq &&
      !sq.isCaught &&
      !h.hitSet.has(sq) &&
      Phaser.Math.Distance.Between(cx, cy, sq.x, sq.y) <= h.radius + 14
    ) {
      h.hitSet.add(sq);
      const fromAbove = h.follow && this.cat.facing.y > 0 && this.cat.y < sq.y + 12;
      if (fromAbove) this.catchSquirrel();
      else sq.flee(this.cat.x, this.cat.y, now);
    }

    // 橘猫（battle 阶段）：扣血 + 击退 + 僵直
    const g = this.ginger;
    if (
      this.phase === "battle" &&
      g &&
      !this.gingerDefeated &&
      !h.hitGinger &&
      Phaser.Math.Distance.Between(cx, cy, g.x, g.y) <= h.radius + 18
    ) {
      h.hitGinger = true;
      this.gingerHp -= h.damage;
      this.cat.addRage(h.damage);
      playSfx("hit");
      this.hitStop(50); // 命中顿帧
      if (h.follow) this.cameras.main.shake(90, 0.004);
      g.setTintFill(0xffffff);
      this.time.delayedCall(80, () => {
        if (!this.gingerDefeated) g.clearTint();
      });
      const kx = g.x - this.cat.x;
      const ky = g.y - this.cat.y;
      const kd = Math.hypot(kx, ky) || 1;
      const power = h.follow ? 11 : 6; // 飞扑击退更远（帧步进，见 updateGingerBattle 的 delta 换算）
      this.gingerKb.set((kx / kd) * power, (ky / kd) * power);
      g.setVelocity(0, 0); // 被击中先停下，击退由 gingerKb 逐帧积分
      this.gingerStunUntil = now + h.stunMs;
      if (this.gingerHp <= 0) this.winBattle();
    }
  }

  /** 命中顿帧：暂停整个场景 ms 毫秒（物理/tween/计时全冻），打击感的主要来源。 */
  private hitStop(ms: number): void {
    if (this.hitStopping) return;
    this.hitStopping = true;
    this.scene.pause();
    setTimeout(() => {
      this.scene.resume();
      this.hitStopping = false;
    }, ms);
  }

  private pressDash(): void {
    const now = this.time.now;
    const spec = this.cat.tryInstantDash(now);
    if (spec) {
      playSfx("dash");
      this.spawnHit(spec, now);
    } else this.cat.beginCharge(now);
  }

  private releaseDash(): void {
    const spec = this.cat.releaseCharge(this.time.now);
    if (spec) {
      playSfx("dash");
      this.spawnHit(spec, this.time.now);
    }
  }

  private isDashHeld(): boolean {
    if (this.input.activePointer.rightButtonDown()) return true;
    const pad = this.input.gamepad?.getPad(0);
    return !!(pad && pad.buttons[PAD_BTN_Y] && pad.buttons[PAD_BTN_Y].pressed);
  }

  // ----- 抓住松鼠 → 橘猫登场 -----

  private catchSquirrel(): void {
    if (this.phase !== "play" || !this.squirrel) return;
    this.squirrel.setCaught(this);
    this.activeHit = null;
    // 抓松鼠计数成就
    runState.squirrelsCaught++;
    const n = runState.squirrelsCaught;
    if (n === 1) this.announce("🎉 第一次抓住松鼠！");
    else if (n === 3) this.announce("🎉 抓到第 3 只松鼠了！");
    else if (n === 5) this.announce("🎉 第 5 只！你是抓松鼠大师！");
    this.phase = "ginger";
    const W = FOREST_COLS * WORLD.tileSize;
    const H = FOREST_ROWS * WORLD.tileSize;
    const gx = Phaser.Math.Clamp(this.cat.x + 240, 80, W - 80);
    const gy = Phaser.Math.Clamp(this.cat.y - 140, 80, H - 80);
    // 橘猫用物理体 + 速度移动（带障碍碰撞，不再穿墙；速度按秒算，不随帧率变）
    this.ginger = this.physics.add.sprite(gx, gy, "cat-ginger").setDepth(9);
    this.ginger.setCollideWorldBounds(true);
    this.physics.add.collider(this.ginger, this.obstacleLayer);
    this.physics.add.collider(this.ginger, this.cat.sprite);
    this.ginger.play("cat-ginger-walk-left");
    if (n <= 1) this.announce("你抓住了松鼠！一只橘猫正朝你走来…");
  }

  private updateGingerApproach(): void {
    const g = this.ginger;
    if (!g) return;
    const dx = this.cat.x - g.x;
    const dy = this.cat.y - g.y;
    const d = Math.hypot(dx, dy);
    if (d > 74) {
      const speed = 96; // px/秒（原 1.6/帧 @60fps）
      g.setVelocity((dx / d) * speed, (dy / d) * speed);
      g.play(`cat-ginger-walk-${this.facingOf(dx, dy)}`, true);
    } else {
      g.setVelocity(0, 0);
      g.play(`cat-ginger-idle-${this.facingOf(dx, dy)}`, true);
      this.phase = "dialog";
      this.dialog.show("橘猫", GINGER_LINES, () => this.startGingerBattle());
    }
  }

  private facingOf(dx: number, dy: number): "down" | "up" | "left" | "right" {
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "up" : "down";
  }

  // ----- 橘猫战斗 -----

  private startGingerBattle(): void {
    this.phase = "battle";
    this.gingerHp = GINGER_MAX_HP;
    this.gingerDefeated = false;
    this.gingerStunUntil = 0;
    this.gingerHitNextAt = 0;
    this.gingerKb.set(0, 0);
    this.announce("橘猫切磋开始！左键爪击 / 右键蓄力飞扑，打败它！");
  }

  /** 战斗中橘猫 AI：被击退时滑行衰减，否则追猫并接触造成伤害（速度按秒算）。 */
  private updateGingerBattle(now: number, delta: number): void {
    const g = this.ginger;
    if (!g || this.gingerDefeated) return;
    const dtScale = delta / 16.667; // 把原来的"每帧"步进换算成 delta 步进
    if (now < this.gingerStunUntil) {
      // 击退滑行：gingerKb 存的是"每帧位移"，按 delta 积分并衰减
      g.x += this.gingerKb.x * dtScale;
      g.y += this.gingerKb.y * dtScale;
      this.gingerKb.scale(Math.pow(0.85, dtScale));
    } else {
      const dx = this.cat.x - g.x;
      const dy = this.cat.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > GINGER_CONTACT_RANGE) {
        const speed = 96; // px/秒（原 GINGER_SPEED 1.6/帧 @60fps）
        g.setVelocity((dx / d) * speed, (dy / d) * speed);
        g.play(`cat-ginger-walk-${this.facingOf(dx, dy)}`, true);
      } else {
        g.setVelocity(0, 0);
        g.play(`cat-ginger-idle-${this.facingOf(dx, dy)}`, true);
        if (now >= this.gingerHitNextAt && this.cat.tryTakeDamage(GINGER_CONTACT_DMG, now)) {
          this.gingerHitNextAt = now + 650;
          playSfx("hurt");
        }
      }
    }
    this.drawGingerHp();
  }

  private drawGingerHp(): void {
    const g = this.ginger;
    this.gingerHpBar.clear();
    if (!g || this.gingerDefeated) return;
    const w = 44;
    const h = 5;
    const x = g.x - w / 2;
    const y = g.y - 34;
    this.gingerHpBar.fillStyle(0x000000, 0.5).fillRect(x, y, w, h);
    const pct = Phaser.Math.Clamp(this.gingerHp / GINGER_MAX_HP, 0, 1);
    this.gingerHpBar.fillStyle(0xffa040, 1).fillRect(x, y, w * pct, h);
  }

  private winBattle(): void {
    this.gingerDefeated = true;
    this.phase = "won";
    this.gingerHpBar.clear();
    const g = this.ginger;
    if (g) {
      g.setVelocity(0, 0);
      this.tweens.add({
        targets: g,
        alpha: 0,
        scale: 0.2,
        angle: 180,
        duration: 400,
        onComplete: () => g.destroy(),
      });
    }
    // 胜利结算：不再是"一句 announce 就结束"——给对话收尾 + 实质奖励
    this.dialog.show(
      "橘子",
      ["好身手！是我小看你了。", "这片森林认你这个朋友了。拿去吧——森林的谢礼！", "（你的生命上限提高了，以后常来玩呀）"],
      () => {
        this.cat.stats.maxHealth += 20;
        this.cat.stats.health = this.cat.stats.maxHealth;
        playSfx("win");
        this.announce("🎉 打败了橘猫！生命上限 +20，森林永远欢迎你");
        // 20 秒后回来一只新松鼠，还能再抓（计数成就）
        this.squirrelRespawnAt = this.time.now + 20000;
      }
    );
  }

  private loseBattle(): void {
    if (this.returning) return;
    this.returning = true;
    this.gingerHpBar.clear();
    playSfx("lose");
    this.cat.sprite.setVelocity(0, 0);
    this.physics.pause();
    this.announce("你被橘猫击败了…撤回主世界");
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("World"));
  }

  // ----- 背包 / 孵化（共享 runState） -----

  private getHatchInfo(now: number): HatchInfo {
    if (this.pet || runState.hasPet) return { phase: "has-pet" };
    const e = runState.incubatorEndsAt;
    if (e !== null) return now >= e ? { phase: "ready" } : { phase: "hatching", remainingMs: e - now };
    return runState.inventory.has("dino-egg") ? { phase: "has-egg" } : { phase: "empty" };
  }

  private startHatch(): void {
    if (this.pet || runState.incubatorEndsAt !== null) return;
    if (runState.inventory.remove("dino-egg", 1)) runState.incubatorEndsAt = this.time.now + HATCH_MS;
  }

  private collectPet(): void {
    if (this.pet || runState.incubatorEndsAt === null || this.time.now < runState.incubatorEndsAt) return;
    this.pet = new Pet(this, this.cat.x - 40, this.cat.y);
    runState.incubatorEndsAt = null;
    runState.hasPet = true;
  }

  // ----- 浆果丛（森林回血） -----

  /** 摘最近的可摘浆果丛：+15 血 + 飘字 + 音效。成功返回 true。 */
  private tryPickBerry(): boolean {
    const now = this.time.now;
    for (const b of this.bushes) {
      if (!b.inRange(this.cat.x, this.cat.y)) continue;
      if (!b.tryPick(now)) continue;
      this.cat.heal(BerryBush.HEAL);
      playSfx("berry");
      this.pet?.happy();
      const txt = this.add
        .text(this.cat.x, this.cat.y - 44, `+${BerryBush.HEAL}`, {
          fontSize: "18px",
          color: "#06d6a0",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(70);
      this.tweens.add({
        targets: txt,
        y: txt.y - 26,
        alpha: 0,
        duration: 700,
        onComplete: () => txt.destroy(),
      });
      return true;
    }
    return false;
  }

  // ----- 返回门 -----

  private nearReturnDoor(): boolean {
    return (
      !!this.returnDoor &&
      Phaser.Math.Distance.Between(this.returnDoor.x, this.returnDoor.y, this.cat.x, this.cat.y) <= DOOR_RANGE
    );
  }

  private returnToWorld(): void {
    if (this.returning) return;
    this.returning = true;
    this.cat.sprite.setVelocity(0, 0);
    this.physics.pause();
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("World"));
  }

  // ----- 输入 -----

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.dialog.isActive) return; // 对话中：推进交给 DialogBox 自己的监听，这里只拦截攻击
      if (this.invUI.isOpen || this.phase === "ginger") return; // 仅"橘猫走来"过场禁攻击；战斗(battle)放行
      if (p.rightButtonDown()) this.pressDash();
      else if (p.leftButtonDown()) this.queuedAttack = true;
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonReleased()) this.releaseDash();
    });
    this.input.gamepad?.on(
      "down",
      (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
        if (this.dialog.isActive) {
          if (button.index === PAD_BTN_A) this.dialog.advance();
          return;
        }
        if (this.invUI.isOpen || this.phase === "ginger") return; // 仅"橘猫走来"过场禁攻击；战斗(battle)放行
        if (button.index === PAD_BTN_X) this.queuedAttack = true;
        else if (button.index === PAD_BTN_Y) this.pressDash();
      }
    );
    this.input.gamepad?.on(
      "up",
      (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
        if (button.index === PAD_BTN_Y) this.releaseDash();
      }
    );
  }

  // ----- HUD / 提示 -----

  private createHud(): void {
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.marker = this.add.graphics().setDepth(55);
    this.gingerHpBar = this.add.graphics().setDepth(40);
    this.add
      .text(16, 12, "森林 · WASD 移动 · 左键 爪击 · 右键 蓄力飞扑(从松鼠上方扑可抓住它) · E 摘浆果 · B 背包 · M 静音", {
        fontSize: "13px",
        color: "#ffffff",
      })
      .setScrollFactor(0)
      .setDepth(100);
    // 当前目标指引
    this.questText = this.add
      .text(16, 94, "", {
        fontSize: "13px",
        color: "#ffe066",
        fontStyle: "bold",
        backgroundColor: "#00000066",
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(100);
  }

  /** 按当前进度给出一句话目标（HUD 第二行）。 */
  private getQuestText(): string {
    switch (this.phase) {
      case "play":
        return this.squirrel
          ? "🎯 从松鼠上方用右键飞扑抓住它！（浆果丛可回血）"
          : `🎯 已抓住 ${runState.squirrelsCaught} 只松鼠，门在出生点旁可回主世界`;
      case "ginger":
      case "dialog":
        return "🎯 听听橘猫想说什么…";
      case "battle":
        return "🎯 打败橘猫！小心它的冲撞（血条在它头顶）";
      case "won":
        return "🎯 你赢了！出生点旁的门可以回主世界，松鼠还会再来";
    }
  }

  private updateHud(): void {
    const { health, maxHealth, stamina, maxStamina, rage, maxRage } = this.cat.stats;
    const w = 200;
    this.hud.clear();
    this.hud.fillStyle(0x000000, 0.4).fillRect(16, 36, w, 14);
    this.hud.fillStyle(0xef476f, 1).fillRect(16, 36, w * (health / maxHealth), 14);
    this.hud.fillStyle(0x000000, 0.4).fillRect(16, 54, w, 14);
    this.hud.fillStyle(0xffd166, 1).fillRect(16, 54, w * (stamina / maxStamina), 14);
    const rr = rage / maxRage;
    this.hud.fillStyle(0x000000, 0.4).fillRect(16, 72, w, 14);
    this.hud.fillStyle(rr >= 1 ? 0x06d6a0 : 0xfb8500, 1).fillRect(16, 72, w * rr, 14);
    this.questText.setText(this.getQuestText());
  }

  /** 返回门/浆果丛在范围内时画提示环。 */
  private drawMarker(now: number): void {
    this.marker.clear();
    const pulse = 0.6 + 0.4 * Math.sin(now / 120);
    if (this.returnDoor && !this.dialog.isActive && this.nearReturnDoor()) {
      this.marker.lineStyle(3, 0x66e0ff, pulse).strokeCircle(this.returnDoor.x, this.returnDoor.y, 30);
    }
    // 可摘的浆果丛画绿环
    if (!this.dialog.isActive) {
      for (const b of this.bushes) {
        if (b.inRange(this.cat.x, this.cat.y))
          this.marker.lineStyle(2, 0x7CFC00, pulse).strokeCircle(b.x, b.y, 26);
      }
    }
  }

  /** 屏幕上方居中的临时提示（淡出后销毁）。 */
  private announce(msg: string): void {
    const t = this.add
      .text(this.scale.width / 2, 96, msg, {
        fontSize: "16px",
        color: "#ffe066",
        fontStyle: "bold",
        backgroundColor: "#000000aa",
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(120);
    this.tweens.add({ targets: t, alpha: 0, delay: 2000, duration: 700, onComplete: () => t.destroy() });
  }

  /** 用 core/worldgen 的森林数据建地面层 + 障碍层（全森林、密树）。 */
  private buildForestMap(): GeneratedWorld {
    const T = WORLD.tileSize;
    const world = generateForest(FOREST_COLS, FOREST_ROWS, T, WORLD_SEED + 1);
    const map = this.make.tilemap({ data: world.ground, tileWidth: T, tileHeight: T });
    const tileset = map.addTilesetImage("tiles", undefined, T, T, 0, 0)!;
    this.groundLayer = map.createLayer(0, tileset, 0, 0)!;
    this.groundLayer.setDepth(-10);
    this.obstacleLayer = map.createBlankLayer("obstacles", tileset, 0, 0)!;
    this.obstacleLayer.setDepth(0);
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const t = world.obstacles[y][x];
        if (t !== EMPTY) this.obstacleLayer.putTileAt(t, x, y);
      }
    }
    this.obstacleLayer.setCollisionByExclusion([EMPTY]);
    return world;
  }
}
