import Phaser from "phaser";

/**
 * 手柄读取：以浏览器原生 Gamepad API 为准，不依赖 Phaser 的 pad1/getPad(0)。
 *
 * 原因：Windows 上 Steam/虚拟设备常占 index 0，真手柄在 1/2…
 * Phaser 的 pad1 会钉死在第一只出现的垫上；按钮 "down" 事件仍从真手柄发出
 * （所以攻击有反应），但读 pad1 摇杆永远是 0 → "只有攻击键有用"。
 */

export const GAMEPAD_DEADZONE = 0.15;

/** 标准映射（Xbox；PS：×○□△） */
export const PAD_BTN_A = 0;
export const PAD_BTN_B = 1;
export const PAD_BTN_X = 2;
export const PAD_BTN_Y = 3;
/** 标准十字键 */
const BTN_DPAD_UP = 12;
const BTN_DPAD_DOWN = 13;
const BTN_DPAD_LEFT = 14;
const BTN_DPAD_RIGHT = 15;
/** RT / R2 */
const BTN_R2 = 7;

export interface PadMove {
  x: number;
  y: number;
  wantsToRun: boolean;
}

/** 列出浏览器当前所有非空手柄（含轴/键原始值）。 */
export function listNativePads(): Gamepad[] {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return [];
  const out: Gamepad[] = [];
  const raw = navigator.getGamepads();
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (p) out.push(p);
  }
  return out;
}

/**
 * 选"正在用的"那只垫：优先有摇杆偏转/键按下的；否则取 timestamp 最新的。
 * 避免钉死在占坑的空设备上。
 */
export function pickActiveNativePad(): Gamepad | null {
  const pads = listNativePads();
  if (pads.length === 0) return null;

  let best: Gamepad | null = null;
  let bestScore = -1;
  for (const p of pads) {
    let score = 0;
    // 最近有过输入的 timestamp 更大
    score += Math.min(p.timestamp, 1e15) / 1e15;
    for (let i = 0; i < p.axes.length; i++) {
      if (Math.abs(p.axes[i]) > GAMEPAD_DEADZONE) score += 10;
    }
    for (let i = 0; i < p.buttons.length; i++) {
      if (p.buttons[i]?.pressed) score += 20;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/**
 * 兼容层：仍返回 Phaser Gamepad（给旧调用）；内部用原生 API 选活跃垫再映射。
 * 若 Phaser 插件里还没有对应 index，返回 null（调用方应改走原生读写）。
 */
export function getActivePad(scene: Phaser.Scene): Phaser.Input.Gamepad.Gamepad | null {
  const native = pickActiveNativePad();
  if (!native) return null;
  const plugin = scene.input.gamepad;
  if (!plugin) return null;
  const pad = plugin.getPad(native.index);
  return pad ?? null;
}

/**
 * 读移动：合并所有已连接手柄的左摇杆 + 十字键（任一有输入即算）。
 * 直接读原生 axes/buttons，绕开 Phaser leftStick / pad1。
 */
export function readPadMove(_pad?: Phaser.Input.Gamepad.Gamepad | null, deadzone = GAMEPAD_DEADZONE): PadMove {
  let x = 0;
  let y = 0;
  let wantsToRun = false;

  for (const p of listNativePads()) {
    // 左摇杆：标准映射 axes[0]=X axes[1]=Y（不读 6/7，旧垫 hat 静止值可能是 -1 会误触）
    if (p.axes.length >= 2) {
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > deadzone) {
        x += ax;
        y += ay;
      }
    }

    const btns = p.buttons;
    if (btns[BTN_DPAD_LEFT]?.pressed) x -= 1;
    if (btns[BTN_DPAD_RIGHT]?.pressed) x += 1;
    if (btns[BTN_DPAD_UP]?.pressed) y -= 1;
    if (btns[BTN_DPAD_DOWN]?.pressed) y += 1;

    if ((btns[BTN_R2]?.value ?? 0) > 0.1 || btns[BTN_R2]?.pressed) wantsToRun = true;
  }

  // 限制到合理范围，避免多垫叠加超速（场景里还会 dir.limit(1)）
  const len = Math.hypot(x, y);
  if (len > 1.25) {
    x /= len;
    y /= len;
  }
  return { x, y, wantsToRun };
}

/** 任一已连接手柄上该键是否按下。 */
export function padButtonDown(_pad: Phaser.Input.Gamepad.Gamepad | null | undefined, index: number): boolean {
  for (const p of listNativePads()) {
    if (p.buttons[index]?.pressed) return true;
  }
  return false;
}

/** 不依赖 Phaser 垫对象的按键查询。 */
export function anyPadButtonDown(index: number): boolean {
  return padButtonDown(null, index);
}
