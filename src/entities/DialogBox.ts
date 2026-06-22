import Phaser from "phaser";

/**
 * 底部对话框：逐句显示，按 E / 左键 / 手柄 A 推进，放完最后一句回调 onDone。
 * 固定屏幕坐标（setScrollFactor 0）。由场景在对话激活时拦截推进键并调 advance()。
 */
export class DialogBox {
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly speakerText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private speaker = "";
  private idx = 0;
  private active = false;
  private onDone?: () => void;

  constructor(scene: Phaser.Scene) {
    const W = scene.scale.width;
    const H = scene.scale.height;
    const bw = W - 80;
    const bh = 120;
    const bx = 40;
    const by = H - bh - 24;

    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.82).fillRoundedRect(bx, by, bw, bh, 12);
    g.lineStyle(2, 0xffd166, 0.95).strokeRoundedRect(bx, by, bw, bh, 12);
    this.add(g);

    this.speakerText = this.add(
      scene.add.text(bx + 18, by + 12, "", { fontSize: "16px", color: "#ffd166", fontStyle: "bold" })
    );
    this.bodyText = this.add(
      scene.add.text(bx + 18, by + 42, "", {
        fontSize: "16px",
        color: "#ffffff",
        wordWrap: { width: bw - 36 },
        lineSpacing: 4,
      })
    );
    this.add(
      scene.add
        .text(bx + bw - 16, by + bh - 14, "E / 空格 / 点击 继续 ▶", { fontSize: "12px", color: "#aaaaaa" })
        .setOrigin(1, 1)
    );

    // 自己监听推进键（事件驱动，不依赖场景 update 的 JustDown 时序）：仅对话激活时推进
    const advance = (): void => {
      if (this.active) this.advance();
    };
    scene.input.keyboard?.on("keydown-E", advance);
    scene.input.keyboard?.on("keydown-SPACE", advance);
    scene.input.on("pointerdown", advance);

    this.setVisible(false);
  }

  get isActive(): boolean {
    return this.active;
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(310);
    this.objs.push(o);
    return o;
  }

  private setVisible(v: boolean): void {
    for (const o of this.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
  }

  /** 开始一段对话。 */
  show(speaker: string, lines: string[], onDone?: () => void): void {
    this.speaker = speaker;
    this.lines = lines;
    this.onDone = onDone;
    this.idx = 0;
    this.active = true;
    this.setVisible(true);
    this.render();
  }

  /** 推进到下一句；放完则关闭并回调。 */
  advance(): void {
    if (!this.active) return;
    this.idx++;
    if (this.idx >= this.lines.length) {
      this.active = false;
      this.setVisible(false);
      this.onDone?.();
      return;
    }
    this.render();
  }

  private render(): void {
    this.speakerText.setText(this.speaker);
    this.bodyText.setText(this.lines[this.idx]);
  }
}
