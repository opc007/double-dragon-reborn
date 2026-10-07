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

const ACTIONS = ['up', 'down', 'left', 'right', 'punch', 'kick', 'jump', 'superBtn'] as const;

/**
 * 单轴方向裁决。
 * neg = 负方向键（左 / 上），pos = 正方向键（右 / 下）。
 * 两个方向同时按住时取"最后按下的那个"，而不是相加成 0 ——
 * 否则玩家会看到"人物一直在动但完全操作不了"。
 */
function resolveAxis(neg: boolean, pos: boolean, orderNeg: number, orderPos: number): number {
  if (neg && !pos) return -1;
  if (pos && !neg) return 1;
  if (!neg && !pos) return 0;
  return orderNeg > orderPos ? -1 : 1;
}

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
  /**
   * 本帧内"曾经按下过"的键。
   * 为什么不能只看 down：一次极短的敲击（keydown 和 keyup 落在同一帧之间）
   * 会被 down 的增删完全抹掉，按键等于从未发生过。真人手速通常有 50ms 以上，
   * 但掉帧或低配机器上会漏输入，所以边沿必须单独锁存到帧末。
   */
  private readonly edge = new Set<string>();
  /** 每个键的按下次序。左右同时按住时用"最后按的那个"，
   *  否则 dx 会算成 0 —— 玩家表现为"动画在动但完全操作不了"。 */
  private readonly keyOrder = new Map<string, number>();
  private orderSeq = 0;

  /** 全局键边沿 */
  private readonly sysDown = new Set<string>();
  private readonly sysPressedSet = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
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
    this.edge.add(e.code);
    this.keyOrder.set(e.code, ++this.orderSeq);
    this.sysDown.add(e.code);
    this.sysPressedSet.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
    this.sysDown.delete(e.code);
  };

  /** 切窗口时松开所有键，避免"一直往右走"的经典 bug */
  private onBlur = (): void => {
    this.clearAll();
  };

  private onVisibility = (): void => {
    if (document.hidden) this.clearAll();
  };

  /** 全清。keydown 收到了但 keyup 丢了（切窗口、锁屏、手机触摸被系统吃掉）时兜底。 */
  private clearAll(): void {
    this.down.clear();
    this.edge.clear();
    this.sysDown.clear();
    this.releaseVirtual();
  }

  /** 触摸层用：任何一根手指抬起/取消，都把虚拟键全松开 */
  releaseVirtual(): void {
    for (const v of [this.vpad1, this.vpad2]) {
      for (const k of ACTIONS) (v[k] as boolean) = false;
    }
  }

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
    /**
     * 每一帧必须"从零重建"这几个布尔值。
     * 之前的写法只在按下时置 true、从不置回 false ——
     * 键一旦按下就永远保持按下，人物会一直往一个方向走，
     * 再按反方向则 dx 算成 0，表现为"一直在动但完全操作不了"。
     */
    for (const k in map) {
      const slot = map[k]!;
      if (slot === 'dx' || slot === 'dy') continue;
      (pad[slot] as boolean) = this.down.has(k);
    }
    for (const k of ACTIONS) {
      if (vpad[k]) (pad[k] as boolean) = true;
    }

    // 边沿：从 edge 锁存集合取，而不是比较上一帧的 bool。
    // 这样"按下又松开"发生在同一帧内时依然算一次有效按下。
    const tapped = (slot: keyof PadState): boolean => {
      for (const k in map) {
        if (map[k] === slot && this.edge.has(k)) return true;
      }
      return false;
    };
    pad.pressedPunch = tapped('punch');
    pad.pressedKick = tapped('kick');
    pad.pressedJump = tapped('jump');
    pad.pressedSuper = tapped('superBtn');

    // 方向冲突裁决：左右/上下同时按住时，取"最后按下的那个"。
    // 原先直接相减会得到 0，玩家会觉得游戏卡死了。
    const slotOrder = (slot: keyof PadState): number => {
      let best = 0;
      for (const k in map) {
        if (map[k] === slot) best = Math.max(best, this.keyOrder.get(k) ?? 0);
      }
      return best;
    };
    pad.dx = resolveAxis(pad.left, pad.right, slotOrder('left'), slotOrder('right'));
    pad.dy = resolveAxis(pad.up, pad.down, slotOrder('up'), slotOrder('down'));
  }

  /** 每帧开头调用 */
  update(): void {
    this.apply(this.pad1, this.vpad1, P1_MAP);
    this.apply(this.pad2, this.vpad2, P2_MAP);
  }

  /** 每帧结尾调用，清理边沿 */
  endFrame(): void {
    this.edge.clear();
    this.sysPressedSet.clear();
  }
}
