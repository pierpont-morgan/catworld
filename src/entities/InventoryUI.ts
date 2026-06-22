import Phaser from "phaser";
import { Inventory, ITEM_ORDER, ITEM_DEFS } from "../core/Inventory";

/** 孵化器对外状态（由 WorldScene 计算后传给 UI 渲染） */
export type HatchPhase = "empty" | "has-egg" | "hatching" | "ready" | "has-pet";
export interface HatchInfo {
  phase: HatchPhase;
  /** hatching 阶段剩余毫秒 */
  remainingMs?: number;
}

export interface InventoryUIHooks {
  getHatch: (now: number) => HatchInfo;
  onEquipToggle: () => void;
  onStartHatch: () => void;
  onCollectPet: () => void;
}

const PANEL_W = 460;
const PANEL_H = 340;

/**
 * 背包界面（按 B 开关）。固定在屏幕中央，显示物品/金爪装备/孵化器。
 * 全部用屏幕绝对坐标 + setScrollFactor(0)，逐个对象切可见性（不用 container，避免
 * scrollFactor 与容器变换导致交互命中区错位）。
 */
export class InventoryUI {
  private readonly scene: Phaser.Scene;
  private readonly inv: Inventory;
  private readonly hooks: InventoryUIHooks;
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private open = false;

  private countTexts: Phaser.GameObjects.Text[] = [];
  private equipBtn!: Phaser.GameObjects.Text;
  private hatchStatus!: Phaser.GameObjects.Text;
  private hatchBtn!: Phaser.GameObjects.Text;
  private hatchAction: (() => void) | null = null;

  constructor(scene: Phaser.Scene, inv: Inventory, hooks: InventoryUIHooks) {
    this.scene = scene;
    this.inv = inv;
    this.hooks = hooks;
    this.build();
    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    this.setVisible(this.open);
  }

  close(): void {
    this.open = false;
    this.setVisible(false);
  }

  private setVisible(v: boolean): void {
    for (const o of this.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(300);
    this.objs.push(o);
    return o;
  }

  private build(): void {
    const s = this.scene;
    const cx = s.scale.width / 2;
    const cy = s.scale.height / 2;
    const left = cx - PANEL_W / 2;
    const top = cy - PANEL_H / 2;

    // 半透明遮罩 + 面板底
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.45).fillRect(0, 0, s.scale.width, s.scale.height);
    g.fillStyle(0x23202b, 0.96).fillRoundedRect(left, top, PANEL_W, PANEL_H, 12);
    g.lineStyle(2, 0xffd166, 0.9).strokeRoundedRect(left, top, PANEL_W, PANEL_H, 12);
    this.add(g);

    this.add(
      s.add.text(cx, top + 22, "背包", { fontSize: "22px", color: "#ffd166", fontStyle: "bold" }).setOrigin(0.5)
    );
    this.add(
      s.add.text(cx, top + 46, "按 B 关闭", { fontSize: "12px", color: "#cccccc" }).setOrigin(0.5)
    );

    // 物品列表
    const rowY0 = top + 78;
    ITEM_ORDER.forEach((id, i) => {
      const def = ITEM_DEFS[id];
      const y = rowY0 + i * 46;
      this.add(s.add.image(left + 40, y, def.icon).setScale(0.62).setOrigin(0.5));
      const cnt = this.add(
        s.add.text(left + 70, y - 8, "", { fontSize: "15px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0, 0.5)
      );
      this.add(
        s.add
          .text(left + 70, y + 10, def.desc, { fontSize: "11px", color: "#aaaaaa" })
          .setOrigin(0, 0.5)
      );
      this.countTexts[i] = cnt;
      if (id === "golden-claw") {
        this.equipBtn = this.add(
          s.add
            .text(left + PANEL_W - 24, y, "", { fontSize: "14px", color: "#06d6a0", fontStyle: "bold" })
            .setOrigin(1, 0.5)
        );
        this.equipBtn.on("pointerover", () => this.equipBtn.setColor("#9bf6d6"));
        this.equipBtn.on("pointerout", () => this.refreshEquipColor());
        this.equipBtn.on("pointerdown", () => {
          this.hooks.onEquipToggle();
          this.refresh(s.time.now);
        });
      }
    });

    // 分割线 + 孵化器
    const incY = rowY0 + 3 * 46 + 6;
    const lg = s.add.graphics();
    lg.lineStyle(1, 0x554f63, 1).lineBetween(left + 20, incY - 8, left + PANEL_W - 20, incY - 8);
    this.add(lg);
    this.add(s.add.text(left + 24, incY + 8, "🥚 孵化器", { fontSize: "16px", color: "#ffd166", fontStyle: "bold" }).setOrigin(0, 0.5));
    this.hatchStatus = this.add(
      s.add.text(left + 24, incY + 34, "", { fontSize: "13px", color: "#ffffff" }).setOrigin(0, 0.5)
    );
    this.hatchBtn = this.add(
      s.add.text(left + 24, incY + 60, "", { fontSize: "14px", color: "#06d6a0", fontStyle: "bold" }).setOrigin(0, 0.5)
    );
    this.hatchBtn.on("pointerover", () => this.hatchBtn.setColor("#9bf6d6"));
    this.hatchBtn.on("pointerout", () => this.hatchBtn.setColor("#06d6a0"));
    this.hatchBtn.on("pointerdown", () => {
      this.hatchAction?.();
      this.refresh(s.time.now);
    });
  }

  private refreshEquipColor(): void {
    this.equipBtn.setColor(this.inv.equippedClaw ? "#ffd166" : "#06d6a0");
  }

  /** 每帧（界面打开时）刷新计数与孵化倒计时。 */
  refresh(now: number): void {
    ITEM_ORDER.forEach((id, i) => {
      this.countTexts[i].setText(`${ITEM_DEFS[id].name}  ×${this.inv.counts[id]}`);
    });

    // 金爪装备按钮
    if (this.inv.counts["golden-claw"] > 0) {
      this.equipBtn.setText(this.inv.equippedClaw ? "[已装备]" : "[装备]");
      this.equipBtn.setInteractive({ useHandCursor: true });
    } else {
      this.equipBtn.setText("(未拥有)");
      this.equipBtn.setColor("#777777");
      this.equipBtn.disableInteractive();
    }
    if (this.inv.counts["golden-claw"] > 0) this.refreshEquipColor();

    // 孵化器
    const h = this.hooks.getHatch(now);
    this.hatchAction = null;
    this.hatchBtn.disableInteractive().setVisible(this.open);
    switch (h.phase) {
      case "has-pet":
        this.hatchStatus.setText("已带着小恐龙宠物在身边");
        this.hatchBtn.setText("");
        break;
      case "ready":
        this.hatchStatus.setText("✅ 孵化完成！");
        this.hatchBtn.setText("[领取小恐龙]").setInteractive({ useHandCursor: true });
        this.hatchAction = this.hooks.onCollectPet;
        break;
      case "hatching": {
        const sec = Math.max(0, Math.ceil((h.remainingMs ?? 0) / 1000));
        const mm = Math.floor(sec / 60);
        const ss = String(sec % 60).padStart(2, "0");
        this.hatchStatus.setText(`孵化中…  ${mm}:${ss}`);
        this.hatchBtn.setText("");
        break;
      }
      case "has-egg":
        this.hatchStatus.setText("孵化器空闲");
        this.hatchBtn.setText("[放入恐龙蛋开始孵化（1 分钟）]").setInteractive({ useHandCursor: true });
        this.hatchAction = this.hooks.onStartHatch;
        break;
      case "empty":
      default:
        this.hatchStatus.setText("孵化器空闲（需要恐龙蛋）");
        this.hatchBtn.setText("");
        break;
    }
  }
}
