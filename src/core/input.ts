/**
 * 输入层。键盘为主，同时暴露一套虚拟手柄接口，
 * 这样移动端触摸键可以直接写进同一份状态里，不必在游戏逻辑里分叉。
 */

export interface PadState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  punch: boolean;
  kick: boolean;
  jump: boolean;
  superBtn: boolean;
  /** 本帧刚按下（边沿触发） */
  pressedPunch: boolean;
  pressedKick: boolean;
  pressedJump: boolean;
  pressedSuper: boolean;
  /** 方向 -1 / 0 / 1 */
  dx: number;
  dy: number;
}

const BLANK = (): PadState => ({
  up: false, down: false, left: false, right: false,
  punch: false, kick: false, jump: false, superBtn: false,
  pressedPunch: false, pressedKick: false, pressedJump: false, pressedSuper: false,
  dx: 0, dy: 0,
});

type KeyMap = Record<string, keyof PadState | 'dx' | 'dy'>;

/** P1：WASD + J K L Q（右手 JKL，经典 FC 手感） */
const P1_MAP: KeyMap = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  KeyJ: 'punch', KeyK: 'kick', KeyL: 'jump', KeyQ: 'superBtn',
};

/** P2：小键盘优先，兼容没有小键盘的笔记本 */
const P2_MAP: KeyMap = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Numpad1: 'punch', Numpad2: 'kick', Numpad3: 'jump', Numpad0: 'superBtn',
  Period: 'punch', Slash: 'kick', Comma: 'jump', Quote: 'superBtn',
};

export class Input {
  readonly pad1: PadState = BLANK();
  readonly pad2: PadState = BLANK();
  /** 虚拟按键（触摸层写入），与键盘合并 */
  private readonly vpad1: PadState = BLANK();
  private readonly vpad2: PadState = BLANK();
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();

  /** 全局键边沿 */
  private readonly sysDown = new Set<string>();
  private readonly sysPressedSet = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // 方向键/空格会滚动页面，全部拦掉
    if (
      e.code.startsWith('Arrow') || e.code === 'Space' ||
      e.code === 'Enter' || e.code === 'Tab' || e.code.startsWith('Slash') ||
      e.code.startsWith('Quote')
    ) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.down.add(e.code);
    this.pressedThisFrame.add(e.code);
    this.sysDown.add(e.code);
    this.sysPressedSet.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
    this.sysDown.delete(e.code);
  };

  /** 切窗口时松开所有键，避免"一直往右走"的经典 bug */
  private onBlur = (): void => {
    this.down.clear();
    this.sysDown.clear();
  };

  /** 触摸层调用 */
  setVirtual(p2: boolean, key: keyof PadState, on: boolean): void {
    const p = p2 ? this.vpad2 : this.vpad1;
    if (key === 'dx' || key === 'dy') return;
    (p[key] as boolean) = on;
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** 全局键本帧是否刚按下 */
  sysPressed(code: string): boolean {
    return this.sysPressedSet.has(code);
  }

  private apply(pad: PadState, vpad: PadState, map: KeyMap): void {
    const prevPunch = pad.punch;
    const prevKick = pad.kick;
    const prevJump = pad.jump;
    const prevSuper = pad.superBtn;

    for (const k in map) {
      const slot = map[k]!;
      if (slot === 'dx' || slot === 'dy') continue;
      if (this.down.has(k)) (pad[slot] as boolean) = true;
    }
    for (const k of ['up', 'down', 'left', 'right', 'punch', 'kick', 'jump', 'superBtn'] as const) {
      if (vpad[k]) (pad[k] as boolean) = true;
    }

    pad.pressedPunch = pad.punch && !prevPunch;
    pad.pressedKick = pad.kick && !prevKick;
    pad.pressedJump = pad.jump && !prevJump;
    pad.pressedSuper = pad.superBtn && !prevSuper;

    pad.dx = (pad.right ? 1 : 0) - (pad.left ? 1 : 0);
    pad.dy = (pad.down ? 1 : 0) - (pad.up ? 1 : 0);
  }

  /** 每帧开头调用 */
  update(): void {
    this.apply(this.pad1, this.vpad1, P1_MAP);
    this.apply(this.pad2, this.vpad2, P2_MAP);
  }

  /** 每帧结尾调用，清理边沿 */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.sysPressedSet.clear();
  }
}
