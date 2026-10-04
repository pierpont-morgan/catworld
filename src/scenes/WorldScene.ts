import Phaser from "phaser";
import { WORLD, WORLD_SEED } from "../config";
import { Cat } from "../entities/Cat";
import { Enemy, SlimeKind } from "../entities/Enemy";
import { Dino } from "../entities/Dino";
import { Fish } from "../entities/Fish";
import { DroppedItem } from "../entities/DroppedItem";
import { Pet } from "../entities/Pet";
import { InventoryUI, HatchInfo } from "../entities/InventoryUI";
import { AttackSpec } from "../core/Combat";
import { Inventory, ItemId, ITEM_DEFS } from "../core/Inventory";
import { runState } from "../core/RunState";
import { EMPTY, TILE, generateWorld, GeneratedWorld } from "../core/worldgen";
import { playSfx, toggleMute } from "../audio/sfx";

/** 左摇杆死区，过滤手柄静止时的微小漂移 */
const GAMEPAD_DEADZONE = 0.15;
/** 手柄 A 键索引（吃鱼） */
const PAD_BTN_A = 0;
/** 手柄 X 键索引（轻攻击/爪击） */
const PAD_BTN_X = 2;
/** 手柄 Y 键索引（重攻击/冲刺） */
const PAD_BTN_Y = 3;

/** 吃鱼的捕获半径（猫到鱼的中心距离）。需够大以便隔着水从岸边触发 */
const FISH_CAPTURE_RANGE = 52;
/** 吃鱼朝向阈值：猫朝向与"猫→鱼"方向的点积，>= 此值才算"猫头对着鱼"（约 60°内） */
const FISH_FACING_DOT = 0.5;
/** 每条鱼回血量 */
const FISH_HEAL = 25;

/** 各品种史莱姆的目标数量（被打到只剩 1 后会慢慢补回此上限）。金=稀有，只 1 只 */
const SLIME_MAX: Record<SlimeKind, number> = { purple: 4, green: 3, red: 2, king: 1, gold: 1 };
/** 恐龙目标数量 */
const DINO_MAX = 2;
/** 小鱼目标数量 */
const FISH_MAX = 6;
/** 补充间隔：每隔这么久补 1 个，体现"慢慢增加" */
const RESPAWN_INTERVAL_MS = 6000;
/** 拾取掉落物的距离 */
const PICKUP_RANGE = 64;
/** 在门前可开门的距离 */
const DOOR_RANGE = 76;
/** 孵化时长：1 分钟 */
const HATCH_MS = 60000;

/** 小地图边长（像素）与离屏幕边的留白；世界为正方形，故用单一缩放 */
const MINIMAP_SIZE = 150;
const MINIMAP_MARGIN = 12;
/** 小地图上各品种史莱姆的标记色（与实际贴图配色对应） */
const MINIMAP_SLIME_COLOR: Record<SlimeKind, number> = {
  purple: 0x9a6cdf,
  green: 0x5fcf5f,
  red: 0xe05a5a,
  king: 0x9a6cdf, // 大王也是紫色（靠体型区分）
  gold: 0xffd23f, // 金史莱姆
};

/**
 * 一类可再生群体（某色史莱姆 / 小鱼）的补充状态。
 * 规则：数量掉到 <=1 时进入 regen，之后每隔 RESPAWN_INTERVAL_MS 补 1 个，补满 max 后停止。
 */
interface SpawnGroup {
  max: number;
  regen: boolean;
  nextAt: number;
  count: () => number;
  spawn: () => boolean;
}

/** 正在生效的命中判定 */
interface ActiveHit {
  damage: number;
  knockback: number;
  radius: number;
  /** 命中时给敌人的僵直时长（毫秒），undefined 用 Enemy 默认短僵直 */
  stunMs?: number;
  expireAt: number;
  /** true=判定跟随猫身（冲刺）；false=固定在挥击点（爪击） */
  follow: boolean;
  cx: number;
  cy: number;
  hitSet: Set<Enemy | Dino>;
}

/**
 * 主世界场景：开放地图 + 玩家猫咪 + 敌人 + 战斗 + 相机跟随 + HUD。
 * 这是原型的核心场景，后续 NPC / 任务都会挂在这里或拆分成新场景。
 */
export class WorldScene extends Phaser.Scene {
  private cat!: Cat;
  private enemies: Enemy[] = [];
  private dinos: Dino[] = [];
  private fish: Fish[] = [];
  private drops: DroppedItem[] = [];
  private pet?: Pet;
  private invUI!: InventoryUI;
  private invKey!: Phaser.Input.Keyboard.Key;
  /** 数字键 2：长按 5 秒直接传送到关卡2（森林）的快捷键 */
  private key2!: Phaser.Input.Keyboard.Key;
  private holdText!: Phaser.GameObjects.Text;
  /** 背包：跨场景共享的本局背包（主世界 ↔ 森林延续） */
  private get inventory(): Inventory {
    return runState.inventory;
  }
  /** 孵化结束时刻，存在共享本局状态里（跨场景延续） */
  private get incubatorEndsAt(): number | null {
    return runState.incubatorEndsAt;
  }
  private set incubatorEndsAt(v: number | null) {
    runState.incubatorEndsAt = v;
  }
  /** 已击败的恐龙总数（达 2 触发金史莱姆出现） */
  private dinoKills = 0;
  /** 恐龙掉落(蛋+金爪)是否已发放过（整局只掉一次） */
  private dinoLootDropped = false;
  /** 金史莱姆是否已生成（只出现一次） */
  private goldSpawned = false;
  /** 捡到金钥匙后出现的传送门（通往森林第二关） */
  private door?: Phaser.GameObjects.Sprite;
  /** 出生点旁的宝箱：金钥匙开它，解锁黑猫皮肤（只出现一次） */
  private chest?: Phaser.GameObjects.Sprite;
  private chestOpened = false;
  /** 正在过场进入森林：冻结主世界 */
  private enteringForest = false;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private obstacleLayer!: Phaser.Tilemaps.TilemapLayer;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private runKey!: Phaser.Input.Keyboard.Key;
  private eatKey!: Phaser.Input.Keyboard.Key;
  private muteKey!: Phaser.Input.Keyboard.Key;
  /** 命中顿帧进行中（防重入） */
  private hitStopping = false;
  /** 当前目标指引（HUD 第二行，孩子能看懂的一句话目标） */
  private questText!: Phaser.GameObjects.Text;

  /** 本帧待执行的爪击意图（由鼠标左键/手柄X事件写入，update 消费）。飞扑改为蓄力，按下/松开直接走 Cat。 */
  private queuedAttack: "claw" | null = null;
  /** 本帧待执行的吃鱼意图（手柄 A；键盘 E 在 update 里用 JustDown 直接判定） */
  private queuedEat = false;
  private activeHit: ActiveHit | null = null;

  /** 吃鱼瞄准提示（画在可吃目标鱼身上的高亮环） */
  private fishMarker!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  /** 小地图（固定屏幕右上角，显示猫/敌人/鱼的位置） */
  private minimap!: Phaser.GameObjects.Graphics;
  /** 猫已死亡：冻结世界、显示重来对话框 */
  private dead = false;

  /** 敌人可生成的瓦片（可走、远离出生点）与靠岸水瓦片（放鱼），create 时算好供初始 + 补充复用 */
  private enemyTiles: { x: number; y: number }[] = [];
  private shoreTiles: { x: number; y: number }[] = [];
  /** 各品种史莱姆 + 小鱼的再生群体 */
  private spawnGroups: SpawnGroup[] = [];

  constructor() {
    super("World");
  }

  create(): void {
    this.enemies = [];
    this.dinos = [];
    this.fish = [];
    this.drops = [];
    this.pet = undefined;
    this.dinoKills = 0;
    this.dinoLootDropped = false;
    this.goldSpawned = false;
    this.door = undefined;
    this.chest = undefined;
    this.chestOpened = false;
    this.enteringForest = false;
    this.queuedAttack = null;
    this.queuedEat = false;
    this.activeHit = null;
    this.dead = false;

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);

    const world = this.buildTilemap();

    // 玩家猫咪从地图出生点出现
    this.cat = new Cat(this, world.spawn.x, world.spawn.y);
    this.physics.add.collider(this.cat.sprite, this.groundLayer);
    this.physics.add.collider(this.cat.sprite, this.obstacleLayer);

    // 算好可生成的瓦片，初始铺满敌人 + 湖中小鱼，并登记再生群体
    this.collectSpawnTiles(world);
    this.fishMarker = this.add.graphics().setDepth(55);
    // 金史莱姆开局不出现，要击败 2 只恐龙后才登场（见 onTargetDeath）
    (Object.keys(SLIME_MAX) as SlimeKind[])
      .filter((kind) => kind !== "gold")
      .forEach((kind) => {
        for (let i = 0; i < SLIME_MAX[kind]; i++) this.spawnEnemyOfKind(kind, false);
      });
    for (let i = 0; i < DINO_MAX; i++) this.spawnDino(false);
    for (let i = 0; i < FISH_MAX; i++) this.spawnOneFish();
    this.setupSpawnGroups();

    // 相机跟随
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.startFollow(this.cat.sprite, true, 0.1, 0.1);

    this.setupInput();
    this.createHud();
    this.invUI = new InventoryUI(this, this.inventory, {
      getHatch: (now) => this.getHatchInfo(now),
      onEquipToggle: () => this.inventory.toggleEquipClaw(),
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

    // 跨关延续：本局已有宠物 → 重新生成跟随；已持有金钥匙 → 传送门常驻（可反复往返森林）
    if (runState.hasPet) this.pet = new Pet(this, this.cat.x - 40, this.cat.y);
    if (this.inventory.has("golden-key")) this.spawnDoor();
    // 宝箱：出生点附近的可走点（皮肤没解锁才出现）；黑猫皮肤跨场景延续
    if (!runState.skinUnlocked) this.spawnChest(world);
    if (runState.useBlackCat) this.cat.setSkin("black");
  }

  update(time: number, delta: number): void {
    if (this.dead) return;
    if (import.meta.env.DEV) this.updateHold2(); // 长按 2 传送是调试后门，仅开发模式可用
    if (this.enteringForest) return; // 进门过场时冻结世界
    const now = time;

    // ---- 背包开关（B）：打开时先取消蓄力（怒气保留），防"背包开着打出飞扑" ----
    if (Phaser.Input.Keyboard.JustDown(this.invKey)) {
      if (this.cat.isCharging) this.cat.cancelCharge();
      playSfx("click");
      this.invUI.toggle();
    }
    this.cat.equippedGoldClaw = this.inventory.equippedClaw; // 同步爪痕银/金

    // ---- 静音开关（M）----
    if (Phaser.Input.Keyboard.JustDown(this.muteKey)) {
      this.announce(toggleMute() ? "🔇 已静音（按 M 恢复）" : "🔊 声音开");
    }

    // ---- 移动输入 ----
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
    dir.limit(1); // 键盘斜向不超速，摇杆轻推保留模拟速度

    // ---- 爪击在移动前消费 ----，这样攻击当帧 Cat.update 就能看到攻击态而停止走/跑（需求4）
    if (this.queuedAttack) {
      this.queuedAttack = null;
      const spec = this.cat.tryClaw(now);
      if (spec) this.spawnHit(spec, now);
    }

    this.cat.update(dir, wantsToRun, delta, now);

    // 蓄力兜底：在蓄力但右键/Y 实际已松开（可能松在画布外，pointerup 没触发）时补发松开。
    // 背包打开时不补发（打开瞬间已 cancelCharge 取消蓄力），防误触打出飞扑。
    if (this.cat.isCharging && !this.isDashHeld() && !this.invUI.isOpen) this.releaseDash();

    this.updateHit(now);

    // ---- 拾取/吃鱼 ----（键盘 E 边沿 + 手柄 A）：优先捡掉落物，没有再吃鱼
    for (const f of this.fish) f.update(now);
    if (Phaser.Input.Keyboard.JustDown(this.eatKey) || this.queuedEat) {
      this.queuedEat = false;
      // 交互优先级：进门 > 宝箱 > 拾取 > 吃鱼（键盘 E / 手柄 A 共用）
      if (!this.tryOpenDoor() && !this.tryOpenChest() && !this.tryPickup()) this.tryEatFish();
    }
    this.fish = this.fish.filter((f) => !f.isEaten);
    this.drops = this.drops.filter((d) => !d.isCollected);
    this.drawFishMarker();

    // ---- 敌人 AI + 接触伤害 ----
    for (const e of this.enemies) {
      e.update(this.cat.x, this.cat.y, now);
      if (
        !e.isDead &&
        !e.isStunned(now) && // 僵直中的敌人不造成接触伤害（飞扑后猫可贴脸安全输出）
        Phaser.Math.Distance.Between(e.x, e.y, this.cat.x, this.cat.y) < e.contactRange + 20
      ) {
        this.cat.tryTakeDamage(e.contactDamage, now);
      }
    }
    this.enemies = this.enemies.filter((e) => !e.isDead);

    // ---- 恐龙 AI + 火焰伤害 ----（接触不掉血，只有火舌掉血）
    for (const dino of this.dinos) {
      dino.update(this.cat.x, this.cat.y, now);
      const dmg = dino.hitsCat(this.cat.x, this.cat.y);
      if (dmg > 0) this.cat.tryTakeDamage(dmg, now);
    }
    this.dinos = this.dinos.filter((d) => !d.isDead);

    // ---- 宠物跟随 ----
    if (this.pet) this.pet.update(this.cat.x, this.cat.y);

    // ---- 死亡判定 ----
    if (this.cat.stats.health <= 0) {
      this.gameOver();
      return;
    }

    this.updateRespawn(now);
    this.updateHud();
    if (this.invUI.isOpen) this.invUI.refresh(now);
  }

  /** 根据攻击规格在猫前方生成一次命中判定 */
  private spawnHit(spec: AttackSpec, now: number): void {
    playSfx("swing");
    this.activeHit = {
      damage: Math.round(spec.damage * this.inventory.damageMult), // 装备金爪 ×1.5
      knockback: spec.knockback,
      radius: spec.radius,
      stunMs: spec.stunMs,
      expireAt: now + spec.activeMs,
      follow: spec.kind === "dash",
      cx: this.cat.x + this.cat.facing.x * spec.reach,
      cy: this.cat.y + this.cat.facing.y * spec.reach,
      hitSet: new Set<Enemy | Dino>(),
    };
  }

  /** 每帧检测命中判定与敌人的重叠，每个敌人每次攻击只命中一次 */
  private updateHit(now: number): void {
    const h = this.activeHit;
    if (!h) return;
    if (now > h.expireAt) {
      this.activeHit = null;
      return;
    }
    const cx = h.follow ? this.cat.x : h.cx;
    const cy = h.follow ? this.cat.y : h.cy;
    // 用快照遍历：大王死亡 splitKing 会往 this.enemies 追加 4 只紫，
    // 若遍历原数组，这几只会被同一次挥击当帧命中秒掉，故迭代副本。史莱姆与恐龙都参与命中。
    for (const e of [...this.enemies, ...this.dinos]) {
      if (e.isDead || h.hitSet.has(e)) continue;
      if (Phaser.Math.Distance.Between(cx, cy, e.x, e.y) <= h.radius + 18) {
        h.hitSet.add(e);
        const kd = new Phaser.Math.Vector2(e.x - this.cat.x, e.y - this.cat.y).normalize();
        // 恐龙按 stunMs(>=HARD_STUN_MS)自行决定是否打断喷火，史莱姆忽略多余逻辑，统一调用
        e.takeDamage(h.damage, kd.x * h.knockback, kd.y * h.knockback, now, h.stunMs);
        this.cat.addRage(h.damage); // 打中敌人攒怒气
        playSfx("hit");
        this.hitStop(50); // 命中顿帧 50ms，打击感
        if (h.follow) this.cameras.main.shake(90, 0.004); // 飞扑命中加小震屏
        if (e.isDead) this.onTargetDeath(e);
      }
    }
  }

  /** 目标死亡时的掉落/分裂：恐龙→蛋+金爪；紫王→分裂；金史莱姆→金钥匙。 */
  private onTargetDeath(e: Enemy | Dino): void {
    if (e instanceof Dino) {
      this.dinoKills++;
      // 蛋 + 金爪整局只掉一次
      if (!this.dinoLootDropped) {
        this.dropItem("dino-egg", e.x, e.y);
        this.dropItem("golden-claw", e.x, e.y);
        this.dinoLootDropped = true;
      }
      // 击败 2 只恐龙后，金史莱姆出现（只一次，远离猫）。
      // 注意：只在真正生成成功时置位；若随机选点 12 次全失败（被猫挡住），
      // 下次再杀恐龙（补充的也会）时会重试，避免奖励链永久锁死。
      if (this.dinoKills >= 2 && !this.goldSpawned) {
        if (this.spawnEnemyOfKind("gold", true)) this.goldSpawned = true;
      }
    } else if (e.kind === "king") {
      this.splitKing(e.x, e.y);
    } else if (e.kind === "gold") {
      this.dropItem("golden-key", e.x, e.y);
    }
  }

  /**
   * 按下右键/Y：怒气满则立刻飞扑（无蓄力圈，直接发动并生成命中）；否则进入蓄力攒怒气。
   */
  private pressDash(): void {
    const now = this.time.now;
    const spec = this.cat.tryInstantDash(now);
    if (spec) {
      playSfx("dash");
      this.spawnHit(spec, now);
    } else this.cat.beginCharge(now);
  }

  /** 松开右键/Y：若蓄满则发动飞扑并生成命中（未蓄满 Cat 内部返回 null，不发动）。 */
  private releaseDash(): void {
    const spec = this.cat.releaseCharge(this.time.now);
    if (spec) {
      playSfx("dash");
      this.spawnHit(spec, this.time.now);
    }
  }

  /** 命中顿帧：暂停整个场景 ms 毫秒（物理/tween/计时全冻），打击感的主要来源。 */
  private hitStop(ms: number): void {
    if (this.hitStopping) return;
    this.hitStopping = true;
    this.scene.pause();
    // 用原生 setTimeout 恢复（场景暂停后 Phaser 的 delayedCall 不会走）
    setTimeout(() => {
      this.scene.resume();
      this.hitStopping = false;
    }, ms);
  }

  /** 右键或手柄 Y 是否仍被按住（用于蓄力兜底判断）。 */
  private isDashHeld(): boolean {
    if (this.input.activePointer.rightButtonDown()) return true;
    const pad = this.input.gamepad?.getPad(0);
    return !!(pad && pad.buttons[PAD_BTN_Y] && pad.buttons[PAD_BTN_Y].pressed);
  }

  // ----- 吃鱼 -----

  /**
   * 找到当前可吃的鱼：在捕获半径内、且猫头朝向它（点积 >= 阈值）的最近一条。
   * 没有则返回 null。供高亮提示和实际吃鱼共用，保证"看到环就能吃"。
   */
  private findEatTarget(): Fish | null {
    let best: Fish | null = null;
    let bestDist = Infinity;
    const f = this.cat.facing;
    for (const fish of this.fish) {
      if (fish.isEaten) continue;
      const dx = fish.x - this.cat.x;
      const dy = fish.y - this.cat.y;
      const d = Math.hypot(dx, dy);
      if (d > FISH_CAPTURE_RANGE || d < 0.001) continue;
      if ((dx * f.x + dy * f.y) / d < FISH_FACING_DOT) continue; // 猫头没对着
      if (d < bestDist) {
        bestDist = d;
        best = fish;
      }
    }
    return best;
  }

  /** 吃掉当前瞄准的鱼并回血 */
  private tryEatFish(): void {
    const target = this.findEatTarget();
    if (!target) return;
    target.eat(this);
    this.cat.eat(FISH_HEAL, this.time.now); // 回血 + 播放吃东西动画
    this.showHealText(FISH_HEAL);
    playSfx("eat");
    this.pet?.happy(); // 小恐龙看到开饭也很开心
  }

  /** 在可吃目标鱼身上画高亮环（提示"按 E 可吃"） */
  private drawFishMarker(): void {
    this.fishMarker.clear();
    const pulse = 0.6 + 0.4 * Math.sin(this.time.now / 120);
    // 可拾取的掉落物高亮（金圈，提示"按 E 拾取"）
    const pick = this.findPickupTarget();
    if (pick) this.fishMarker.lineStyle(2, 0xffd23f, pulse).strokeCircle(pick.x, pick.y, 22);
    // 可吃的小鱼高亮
    const target = this.findEatTarget();
    if (target) this.fishMarker.lineStyle(2, 0xffe066, pulse).strokeCircle(target.x, target.y, 20);
    // 在门前可进入时的高亮（青色环，提示"按 E/A 进入"）
    if (this.door) {
      const dd = Phaser.Math.Distance.Between(this.door.x, this.door.y, this.cat.x, this.cat.y);
      if (dd <= DOOR_RANGE) this.fishMarker.lineStyle(3, 0x66e0ff, pulse).strokeCircle(this.door.x, this.door.y, 30);
    }
    // 未开过的宝箱在范围内时高亮（金环，提示"按 E 开箱"）
    if (this.chest && !this.chestOpened) {
      const cd = Phaser.Math.Distance.Between(this.chest.x, this.chest.y, this.cat.x, this.cat.y);
      if (cd <= DOOR_RANGE) this.fishMarker.lineStyle(3, 0xffd23f, pulse).strokeCircle(this.chest.x, this.chest.y, 30);
    }
  }

  /** 猫头顶冒一个上浮淡出的回血数字 */
  private showHealText(amount: number): void {
    const txt = this.add
      .text(this.cat.x, this.cat.y - 44, `+${amount}`, {
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
  }

  // ----- 死亡 / 重来 -----

  private gameOver(): void {
    if (this.dead) return;
    this.dead = true;
    // 孩子向：死亡不清空战利品（背包/宠物/孵化/皮肤全保留），惩罚仅为回出生点重来
    runState.softReset();
    playSfx("lose");
    this.cat.die();
    this.physics.pause();
    this.fishMarker.clear();

    const w = this.scale.width;
    const h = this.scale.height;
    this.add.graphics().setScrollFactor(0).setDepth(200).fillStyle(0x000000, 0.6).fillRect(0, 0, w, h);
    this.add
      .text(w / 2, h / 2 - 28, "猫咪倒下了…", { fontSize: "34px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201);
    this.add
      .text(w / 2, h / 2 + 22, "按 R 或 点击屏幕  重新开始", { fontSize: "18px", color: "#ffd166" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201);

    this.input.keyboard!.once("keydown-R", () => this.scene.restart());
    this.input.once("pointerdown", () => this.scene.restart());
  }

  // ----- 输入 -----

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys("W,A,S,D") as typeof this.wasd;
    this.runKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.eatKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.invKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.muteKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.key2 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);

    // 鼠标：左键爪击 / 右键按住蓄力、松开发动飞扑。disableContextMenu 让右键不弹出菜单。
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.dead || this.invUI?.isOpen) return; // 背包打开时点击交给 UI，不触发攻击
      if (pointer.rightButtonDown()) this.pressDash();
      else if (pointer.leftButtonDown()) this.queuedAttack = "claw";
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.dead || this.invUI?.isOpen) return;
      if (pointer.rightButtonReleased()) this.releaseDash();
    });

    // 手柄：X 爪击 / Y 按住蓄力、松开发动飞扑 / A 吃鱼
    this.input.gamepad?.on(
      "down",
      (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
        if (this.dead) return;
        if (button.index === PAD_BTN_X) this.queuedAttack = "claw";
        else if (button.index === PAD_BTN_Y) this.pressDash();
        else if (button.index === PAD_BTN_A) this.queuedEat = true;
      }
    );
    this.input.gamepad?.on(
      "up",
      (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
        if (this.dead) return;
        if (button.index === PAD_BTN_Y) this.releaseDash();
      }
    );
  }

  /**
   * 由 core/worldgen 的数据建出地面层 + 障碍层两张 Tilemap 图层并设好碰撞。
   * 返回生成数据，供出生点/敌人放置使用。
   */
  private buildTilemap(): GeneratedWorld {
    const T = WORLD.tileSize;
    const cols = WORLD.width / T;
    const rows = WORLD.height / T;
    const world = generateWorld(cols, rows, T, WORLD_SEED);

    const map = this.make.tilemap({ data: world.ground, tileWidth: T, tileHeight: T });
    const tileset = map.addTilesetImage("tiles", undefined, T, T, 0, 0)!;

    this.groundLayer = map.createLayer(0, tileset, 0, 0)!;
    this.groundLayer.setDepth(-10);
    this.groundLayer.setCollision(TILE.WATER); // 水不可通行

    this.obstacleLayer = map.createBlankLayer("obstacles", tileset, 0, 0)!;
    this.obstacleLayer.setDepth(0);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const t = world.obstacles[y][x];
        if (t !== EMPTY) this.obstacleLayer.putTileAt(t, x, y);
      }
    }
    this.obstacleLayer.setCollisionByExclusion([EMPTY]); // 树/石头全部碰撞

    return world;
  }

  /**
   * 扫一遍地图，缓存：①敌人可生成的瓦片（可走、离出生点 > 320）；
   * ②靠岸水瓦片（四邻有可走地块，放鱼用，保证猫能从岸边够到）。初始生成与后续补充都复用。
   */
  private collectSpawnTiles(world: GeneratedWorld): void {
    const T = WORLD.tileSize;
    const NB = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    this.enemyTiles = [];
    this.shoreTiles = [];
    for (let y = 1; y < world.height - 1; y++) {
      for (let x = 1; x < world.width - 1; x++) {
        const walkable = world.ground[y][x] !== TILE.WATER && world.obstacles[y][x] === EMPTY;
        if (walkable) {
          const px = (x + 0.5) * T;
          const py = (y + 0.5) * T;
          if (Phaser.Math.Distance.Between(px, py, world.spawn.x, world.spawn.y) >= 320) {
            this.enemyTiles.push({ x, y });
          }
        } else if (world.ground[y][x] === TILE.WATER) {
          const accessible = NB.some(([dx, dy]) => {
            const gx = x + dx;
            const gy = y + dy;
            return world.ground[gy][gx] !== TILE.WATER && world.obstacles[gy][gx] === EMPTY;
          });
          if (accessible) this.shoreTiles.push({ x, y });
        }
      }
    }
  }

  /**
   * 生成一只指定品种的史莱姆。avoidCat=true 时（补充用）尽量离猫远点，避免凭空刷在脸上。
   * 返回是否成功放置。
   */
  private spawnEnemyOfKind(kind: SlimeKind, avoidCat = true): boolean {
    if (this.enemyTiles.length === 0) return false;
    const T = WORLD.tileSize;
    for (let i = 0; i < 12; i++) {
      const t = Phaser.Utils.Array.GetRandom(this.enemyTiles);
      const px = (t.x + 0.5) * T;
      const py = (t.y + 0.5) * T;
      if (avoidCat && Phaser.Math.Distance.Between(px, py, this.cat.x, this.cat.y) < 420) continue;
      this.spawnEnemyAt(kind, px, py);
      return true;
    }
    return false;
  }

  /** 在指定坐标直接生成一只史莱姆并挂好碰撞（随机选点之外的通用创建逻辑）。 */
  private spawnEnemyAt(kind: SlimeKind, x: number, y: number): Enemy {
    const enemy = new Enemy(this, x, y, kind);
    this.physics.add.collider(enemy.sprite, this.groundLayer);
    this.physics.add.collider(enemy.sprite, this.obstacleLayer);
    this.physics.add.collider(enemy.sprite, this.cat.sprite);
    this.enemies.push(enemy);
    return enemy;
  }

  /** 大王死亡分裂：在其位置四周生成 4 只紫色小史莱姆。 */
  private splitKing(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const ang = (Math.PI * 2 * i) / 4 + Math.PI / 4;
      this.spawnEnemyAt("purple", x + Math.cos(ang) * 30, y + Math.sin(ang) * 30);
    }
  }

  /** 生成一只恐龙（随机敌人瓦片；avoidCat=true 时躲开猫，补充用）。返回是否成功。 */
  private spawnDino(avoidCat = true): boolean {
    if (this.enemyTiles.length === 0) return false;
    const T = WORLD.tileSize;
    for (let i = 0; i < 12; i++) {
      const t = Phaser.Utils.Array.GetRandom(this.enemyTiles);
      const px = (t.x + 0.5) * T;
      const py = (t.y + 0.5) * T;
      if (avoidCat && Phaser.Math.Distance.Between(px, py, this.cat.x, this.cat.y) < 460) continue;
      const dino = new Dino(this, px, py);
      this.physics.add.collider(dino.sprite, this.groundLayer);
      this.physics.add.collider(dino.sprite, this.obstacleLayer);
      this.physics.add.collider(dino.sprite, this.cat.sprite);
      this.dinos.push(dino);
      return true;
    }
    return false;
  }

  /** 在 (x,y) 附近撒一个掉落物（带随机抖动，避免多件重叠）。 */
  private dropItem(id: ItemId, x: number, y: number): void {
    const ox = Phaser.Math.Between(-18, 18);
    const oy = Phaser.Math.Between(-18, 18);
    this.drops.push(new DroppedItem(this, x + ox, y + oy, id));
  }

  // ----- 拾取掉落物 -----

  /** 拾取半径内最近的掉落物，无则 null。 */
  private findPickupTarget(): DroppedItem | null {
    let best: DroppedItem | null = null;
    let bd = Infinity;
    for (const d of this.drops) {
      if (d.isCollected) continue;
      const dist = Phaser.Math.Distance.Between(d.x, d.y, this.cat.x, this.cat.y);
      if (dist <= PICKUP_RANGE && dist < bd) {
        bd = dist;
        best = d;
      }
    }
    return best;
  }

  /** 捡起最近的掉落物进背包；成功返回 true（用于让 E 优先拾取再吃鱼）。 */
  private tryPickup(): boolean {
    const t = this.findPickupTarget();
    if (!t) return false;
    t.collect(this);
    this.inventory.add(t.itemId);
    this.showPickupText(ITEM_DEFS[t.itemId].name);
    playSfx("pickup");
    if (t.itemId === "golden-key") this.spawnDoor(); // 捡到金钥匙 → 随机位置出现传送门
    return true;
  }

  // ----- 传送门 / 进入第二关（森林）-----

  /** 捡到金钥匙后在随机较远的可走点生成一道传送门（只一道）。 */
  private spawnDoor(): void {
    if (this.door) return;
    if (this.enemyTiles.length === 0) {
      this.announce("这里没有可落脚的地方，传送门打不开了…");
      return;
    }
    const T = WORLD.tileSize;
    let bx = this.cat.x;
    let by = this.cat.y;
    let bestD = -1;
    // 采样若干可走点，取离猫最远的 → "随机位置"且不会贴脸出现
    for (let i = 0; i < 24; i++) {
      const t = Phaser.Utils.Array.GetRandom(this.enemyTiles);
      const px = (t.x + 0.5) * T;
      const py = (t.y + 0.5) * T;
      const d = Phaser.Math.Distance.Between(px, py, this.cat.x, this.cat.y);
      if (d > bestD) {
        bestD = d;
        bx = px;
        by = py;
      }
    }
    this.door = this.add.sprite(bx, by, "door").setDepth(10).setScale(0);
    this.tweens.add({ targets: this.door, scale: 1, duration: 320, ease: "Back.out" });
    playSfx("door");
    this.announce("金钥匙打开了一道传送门！走到门前按 E / A 进入森林");
  }

  /** 靠近门按 E/A：触发过场进入森林。成功返回 true。 */
  private tryOpenDoor(): boolean {
    if (!this.door) return false;
    if (Phaser.Math.Distance.Between(this.door.x, this.door.y, this.cat.x, this.cat.y) > DOOR_RANGE) return false;
    this.enterForest();
    return true;
  }

  /** 在出生点附近找一个可走点放宝箱（金钥匙开它，解锁黑猫皮肤）。 */
  private spawnChest(world: GeneratedWorld): void {
    const T = WORLD.tileSize;
    const cands: { x: number; y: number }[] = [];
    for (let y = 1; y < world.height - 1; y++) {
      for (let x = 1; x < world.width - 1; x++) {
        if (world.ground[y][x] === TILE.WATER || world.obstacles[y][x] !== EMPTY) continue;
        const px = (x + 0.5) * T;
        const py = (y + 0.5) * T;
        const d = Phaser.Math.Distance.Between(px, py, world.spawn.x, world.spawn.y);
        if (d >= 100 && d <= 260) cands.push({ x: px, y: py });
      }
    }
    if (cands.length === 0) return;
    const p = Phaser.Utils.Array.GetRandom(cands);
    this.chest = this.add.sprite(p.x, p.y, "chest").setDepth(8);
  }

  /** 靠近宝箱按 E：有金钥匙则开箱解锁黑猫皮肤；没钥匙给一句提示。成功/已提示都返回 true（占掉这次 E）。 */
  private tryOpenChest(): boolean {
    const c = this.chest;
    if (!c || this.chestOpened) return false;
    if (Phaser.Math.Distance.Between(c.x, c.y, this.cat.x, this.cat.y) > DOOR_RANGE) return false;
    if (!this.inventory.has("golden-key")) {
      this.announce("宝箱上了锁，需要一把金钥匙（打倒 2 只恐龙引出金色史莱姆）");
      return true;
    }
    this.chestOpened = true;
    this.inventory.remove("golden-key", 1);
    runState.skinUnlocked = true;
    runState.useBlackCat = true;
    this.cat.setSkin("black");
    playSfx("key");
    this.tweens.add({ targets: c, scale: { from: 1, to: 1.35 }, yoyo: true, duration: 170 });
    this.announce("🎉 宝箱打开了！你换上了帅气的黑猫皮肤（按 B 在背包里换回白猫）");
    return true;
  }

  /** 长按数字键 2 满 5 秒 → 直接传送到关卡2（森林）。期间显示倒计时提示。 */
  private updateHold2(): void {
    if (this.enteringForest) return;
    if (this.key2.isDown) {
      const held = this.key2.getDuration();
      const left = Math.max(0, 5 - held / 1000);
      this.holdText.setVisible(true).setText(`长按【2】进入关卡2（森林）… ${left.toFixed(1)}s`);
      if (held >= 5000) {
        this.holdText.setVisible(false);
        this.enterForest();
      }
    } else {
      this.holdText.setVisible(false);
    }
  }

  /** 过场：淡出主世界 → 启动森林场景（淡入在 ForestScene.create 里）。 */
  private enterForest(): void {
    if (this.enteringForest) return;
    this.enteringForest = true;
    playSfx("door");
    this.cat.sprite.setVelocity(0, 0);
    this.physics.pause();
    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Forest"));
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
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 700, onComplete: () => t.destroy() });
  }

  /** 拾取时冒一个上浮淡出的物品名 */
  private showPickupText(name: string): void {
    const txt = this.add
      .text(this.cat.x, this.cat.y - 44, `获得 ${name}`, { fontSize: "16px", color: "#ffd166", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(70);
    this.tweens.add({ targets: txt, y: txt.y - 26, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
  }

  // ----- 孵化器 / 宠物 -----

  /** 计算孵化器当前对外状态（供背包 UI 渲染）。 */
  private getHatchInfo(now: number): HatchInfo {
    if (this.pet || runState.hasPet) return { phase: "has-pet" };
    if (this.incubatorEndsAt !== null) {
      if (now >= this.incubatorEndsAt) return { phase: "ready" };
      return { phase: "hatching", remainingMs: this.incubatorEndsAt - now };
    }
    return this.inventory.has("dino-egg") ? { phase: "has-egg" } : { phase: "empty" };
  }

  /** 放入恐龙蛋开始孵化（消耗 1 个蛋，计时 1 分钟）。 */
  private startHatch(): void {
    if (this.pet || this.incubatorEndsAt !== null) return;
    if (this.inventory.remove("dino-egg", 1)) this.incubatorEndsAt = this.time.now + HATCH_MS;
  }

  /** 领取孵化好的小恐龙：生成跟随宠物。 */
  private collectPet(): void {
    if (this.pet || this.incubatorEndsAt === null || this.time.now < this.incubatorEndsAt) return;
    this.pet = new Pet(this, this.cat.x - 40, this.cat.y);
    this.incubatorEndsAt = null;
    runState.hasPet = true; // 跨场景记住已有宠物
  }

  /** 在随机靠岸水瓦片放一条鱼。返回是否成功。 */
  private spawnOneFish(): boolean {
    if (this.shoreTiles.length === 0) return false;
    const T = WORLD.tileSize;
    const t = Phaser.Utils.Array.GetRandom(this.shoreTiles);
    this.fish.push(new Fish(this, (t.x + 0.5) * T, (t.y + 0.5) * T));
    return true;
  }

  /** 登记可再生群体：每色史莱姆一组 + 小鱼一组 */
  private setupSpawnGroups(): void {
    // 金史莱姆稀有：只在开局出现一次，击杀后不再生 → 不登记再生群体
    this.spawnGroups = (Object.keys(SLIME_MAX) as SlimeKind[])
      .filter((kind) => kind !== "gold")
      .map((kind) => ({
      max: SLIME_MAX[kind],
      regen: false,
      nextAt: 0,
      count: () => this.enemies.reduce((n, e) => n + (!e.isDead && e.kind === kind ? 1 : 0), 0),
      spawn: () => this.spawnEnemyOfKind(kind),
    }));
    this.spawnGroups.push({
      max: FISH_MAX,
      regen: false,
      nextAt: 0,
      count: () => this.fish.length,
      spawn: () => this.spawnOneFish(),
    });
    this.spawnGroups.push({
      max: DINO_MAX,
      regen: false,
      nextAt: 0,
      count: () => this.dinos.reduce((n, d) => n + (d.isDead ? 0 : 1), 0),
      spawn: () => this.spawnDino(),
    });
  }

  /**
   * 再生：某群体被打/吃到只剩 <=1 时进入补充态，之后每隔 RESPAWN_INTERVAL_MS 补 1 个，
   * 补满 max 后停止（"慢慢增加"）。大王 max=1，被清掉后也会按此规则补回 1 只。
   */
  private updateRespawn(now: number): void {
    for (const g of this.spawnGroups) {
      const c = g.count();
      if (c <= 1 && !g.regen) {
        g.regen = true;
        g.nextAt = now + RESPAWN_INTERVAL_MS; // 第一只也要等一个间隔，避免立刻补
      }
      if (c >= g.max) g.regen = false;
      if (g.regen && c < g.max && now >= g.nextAt) {
        if (g.spawn()) g.nextAt = now + RESPAWN_INTERVAL_MS;
      }
    }
  }

  // ----- HUD（固定在屏幕上，不随相机滚动）-----

  private createHud(): void {
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.minimap = this.add.graphics().setScrollFactor(0).setDepth(101);
    this.holdText = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 60, "", {
        fontSize: "18px",
        color: "#ffe066",
        fontStyle: "bold",
        backgroundColor: "#000000aa",
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(130)
      .setVisible(false);
    this.add
      .text(
        16,
        12,
        "WASD 移动 · Shift 奔跑 · 左键 爪击 · 右键 怒气飞扑 · E 吃鱼/拾取 · B 背包 · M 静音",
        { fontSize: "13px", color: "#ffffff" }
      )
      .setScrollFactor(0)
      .setDepth(100);
    // 当前目标指引（孩子能看懂的一句话目标，随进度变化）
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
    if (!this.dinoLootDropped) return `🎯 打倒喷火恐龙 ${Math.min(this.dinoKills, 2)}/2（掉恐龙蛋和金爪子）`;
    if (!runState.skinUnlocked) {
      if (this.inventory.has("golden-key")) return "🎯 用金钥匙打开出生点旁的宝箱！";
      return "🎯 抓住金色史莱姆，拿到金钥匙！";
    }
    if (this.door) return "🎯 去金色传送门按 E，进入森林探险！";
    return "🎯 森林里有松鼠和橘猫等你去挑战！";
  }

  /** 小地图：把世界缩放到右上角的小方框，画出猫(白)、敌人(按品种上色)、鱼(橙)的位置 */
  private drawMinimap(): void {
    const g = this.minimap;
    const size = MINIMAP_SIZE;
    const ox = this.scale.width - size - MINIMAP_MARGIN;
    const oy = this.scale.height - size - MINIMAP_MARGIN;
    const s = size / WORLD.width; // 世界为正方形

    g.clear();
    g.fillStyle(0x12281a, 0.6).fillRect(ox, oy, size, size);
    g.lineStyle(2, 0xffffff, 0.6).strokeRect(ox, oy, size, size);

    // 鱼（橙）
    g.fillStyle(0xff9f43, 1);
    for (const f of this.fish) g.fillCircle(ox + f.x * s, oy + f.y * s, 2);

    // 敌人（按品种上色，大王标记更大）
    for (const e of this.enemies) {
      if (e.isDead) continue;
      g.fillStyle(MINIMAP_SLIME_COLOR[e.kind], 1);
      g.fillCircle(ox + e.x * s, oy + e.y * s, e.kind === "king" ? 4 : 2.5);
    }
    // 恐龙（绿色方点）
    g.fillStyle(0x2e7d32, 1);
    for (const d of this.dinos) {
      if (!d.isDead) g.fillRect(ox + d.x * s - 2, oy + d.y * s - 2, 4, 4);
    }

    // 猫（亮白带黑描边，最显眼）
    const cx = ox + this.cat.x * s;
    const cy = oy + this.cat.y * s;
    g.fillStyle(0x000000, 1).fillCircle(cx, cy, 4);
    g.fillStyle(0xffffff, 1).fillCircle(cx, cy, 3);
  }

  private updateHud(): void {
    const { health, maxHealth, stamina, maxStamina, rage, maxRage } = this.cat.stats;
    const w = 200;
    this.hud.clear();
    // 生命条（红）
    this.hud.fillStyle(0x000000, 0.4).fillRect(16, 36, w, 14);
    this.hud.fillStyle(0xef476f, 1).fillRect(16, 36, w * (health / maxHealth), 14);
    // 体力条（黄）
    this.hud.fillStyle(0x000000, 0.4).fillRect(16, 54, w, 14);
    this.hud.fillStyle(0xffd166, 1).fillRect(16, 54, w * (stamina / maxStamina), 14);
    // 怒气条（橙→满了变亮绿提示可发动）
    const rageRatio = rage / maxRage;
    this.hud.fillStyle(0x000000, 0.4).fillRect(16, 72, w, 14);
    this.hud.fillStyle(rageRatio >= 1 ? 0x06d6a0 : 0xfb8500, 1).fillRect(16, 72, w * rageRatio, 14);

    this.questText.setText(this.getQuestText());
    this.drawMinimap();
  }
}
