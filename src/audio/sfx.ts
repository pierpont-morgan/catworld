// 程序化音效：全部用 Web Audio API 现场合成，零音频素材、零加载。
// 不依赖 Phaser，可在任何场景里直接 import 使用。
// 注意浏览器自动播放策略：必须在用户手势后创建 AudioContext，
// 由 main.ts 在首次 pointerdown/keydown 时调 initSfx()。

export type SfxName =
  | "swing" // 挥爪（短促噪声扫）
  | "hit" // 命中（方波下扫 + 噪声）
  | "dash" // 飞扑（上扫 whoosh）
  | "eat" // 吃鱼（两声 chomp）
  | "pickup" // 拾取（上行琶音）
  | "key" // 金钥匙/开箱（亮闪琶音）
  | "door" // 传送门（空灵上行）
  | "win" // 胜利（三和弦）
  | "lose" // 失败（下行）
  | "click" // UI 点击
  | "hatch" // 孵化完成（小鸟啾啾）
  | "hurt" // 猫受击（低频闷哼）
  | "berry"; // 摘浆果（清脆两声）

let ctx: AudioContext | null = null;
let muted = false;

/** 首次用户手势后调用：创建 AudioContext（重复调用无害）。 */
export function initSfx(): void {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  } catch {
    ctx = null; // 极端环境无音频也不影响游戏
  }
}

/** 切换静音，返回切换后的静音状态。 */
export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

interface ToneOpts {
  /** 起始频率 */
  f: number;
  /** 结束频率（不填=不变） */
  f2?: number;
  /** 时长（秒） */
  t: number;
  /** 波形 */
  type?: OscillatorType;
  /** 音量 0..1 */
  v?: number;
  /** 相对 now 的延迟（秒） */
  at?: number;
}

/** 单个振荡器音：包络 attack 5ms → 指数衰减。 */
function tone({ f, f2, t, type = "square", v = 0.12, at = 0 }: ToneOpts): void {
  if (!ctx || muted) return;
  const now = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(30, f), now);
  if (f2 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), now + t);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(v, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t);
  o.connect(g).connect(ctx.destination);
  o.start(now);
  o.stop(now + t + 0.05);
}

/** 一小 burst 白噪声（打击/挥击的"嚓"感），可带低通。 */
function noise(t: number, v = 0.1, cutoff = 4000, at = 0): void {
  if (!ctx || muted) return;
  const now = ctx.currentTime + at;
  const len = Math.max(1, Math.floor(ctx.sampleRate * t));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const flt = ctx.createBiquadFilter();
  flt.type = "lowpass";
  flt.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t);
  src.connect(flt).connect(g).connect(ctx.destination);
  src.start(now);
}

export function playSfx(name: SfxName): void {
  if (!ctx || muted) return;
  try {
    switch (name) {
      case "swing":
        noise(0.09, 0.08, 6000);
        break;
      case "hit":
        tone({ f: 320, f2: 90, t: 0.12, type: "square", v: 0.14 });
        noise(0.08, 0.12, 2500);
        break;
      case "dash":
        noise(0.22, 0.1, 3000);
        tone({ f: 180, f2: 720, t: 0.2, type: "sawtooth", v: 0.07 });
        break;
      case "eat":
        tone({ f: 500, f2: 200, t: 0.09, type: "triangle", v: 0.16 });
        tone({ f: 600, f2: 250, t: 0.09, type: "triangle", v: 0.16, at: 0.1 });
        break;
      case "pickup":
        tone({ f: 523, t: 0.09, type: "triangle", v: 0.12 });
        tone({ f: 659, t: 0.09, type: "triangle", v: 0.12, at: 0.08 });
        tone({ f: 784, t: 0.14, type: "triangle", v: 0.12, at: 0.16 });
        break;
      case "key":
        [880, 1108, 1318, 1760].forEach((f, i) =>
          tone({ f, t: 0.16, type: "sine", v: 0.12, at: i * 0.09 })
        );
        break;
      case "door":
        tone({ f: 220, f2: 880, t: 0.5, type: "sine", v: 0.1 });
        tone({ f: 330, f2: 1320, t: 0.5, type: "sine", v: 0.06, at: 0.05 });
        break;
      case "win":
        [523, 659, 784, 1046].forEach((f, i) =>
          tone({ f, t: 0.22, type: "triangle", v: 0.13, at: i * 0.12 })
        );
        break;
      case "lose":
        [392, 330, 262, 196].forEach((f, i) =>
          tone({ f, t: 0.25, type: "triangle", v: 0.12, at: i * 0.16 })
        );
        break;
      case "click":
        tone({ f: 800, t: 0.05, type: "square", v: 0.06 });
        break;
      case "hatch":
        tone({ f: 1200, f2: 1800, t: 0.1, type: "sine", v: 0.1 });
        tone({ f: 1400, f2: 2000, t: 0.1, type: "sine", v: 0.1, at: 0.12 });
        tone({ f: 1600, f2: 2200, t: 0.14, type: "sine", v: 0.1, at: 0.24 });
        break;
      case "hurt":
        tone({ f: 200, f2: 90, t: 0.18, type: "sawtooth", v: 0.12 });
        break;
      case "berry":
        tone({ f: 900, t: 0.07, type: "sine", v: 0.12 });
        tone({ f: 1200, t: 0.1, type: "sine", v: 0.12, at: 0.08 });
        break;
    }
  } catch {
    // 音频失败不影响游戏
  }
}
