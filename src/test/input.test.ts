/**
 * 输入层回归测试 —— 全部对应一个真实修过的 bug。
 *
 * 最重要的一条：`apply()` 曾经在按下时置 true、从不置回 false，
 * 于是**你按过的每个键都会永远保持按下**。表现为人物一直往一个方向走，
 * 再按反方向 dx 算成 0 —— "一直在动但完全操作不了"。
 * 这种 bug 在游戏里极难用眼睛发现，所以必须钉死。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Input } from '../core/input';

interface Listener {
  fn: (e: unknown) => void;
  opts?: unknown;
}

class WindowStub {
  private ls = new Map<string, Listener[]>();
  readonly doc = {
    hidden: false,
    listeners: {} as Record<string, Listener[]>,
    addEventListener(t: string, fn: (e: unknown) => void): void {
      (this.listeners[t] ??= []).push({ fn });
    },
  };
  addEventListener(type: string, fn: (e: unknown) => void, opts?: unknown): void {
    const arr = this.ls.get(type) ?? [];
    arr.push({ fn, opts });
    this.ls.set(type, arr);
  }
  removeEventListener(type: string, fn: (e: unknown) => void): void {
    const arr = this.ls.get(type) ?? [];
    this.ls.set(type, arr.filter((l) => l.fn !== fn));
  }
  dispatch(type: string, e: unknown): void {
    for (const l of this.ls.get(type) ?? []) l.fn(e);
  }
  /** 模拟一次完整的"按下 → 保持若干帧 → 松开" */
  tap(code: string, frames = 1): void {
    this.dispatch('keydown', { code, repeat: false, preventDefault() {} });
    for (let i = 0; i < frames; i++) this.tick();
    this.dispatch('keyup', { code, preventDefault() {} });
  }
  tick(): void {
    // 每帧：update → 业务读取 → endFrame
    (this.current as Input | undefined)?.update();
    (this.current as Input | undefined)?.endFrame();
  }
  current: Input | undefined;
}

const ev = (code: string) => ({ code, repeat: false, preventDefault() {} });

describe('Input：按下的键必须能松开', () => {
  let w: WindowStub;
  let inp: Input;

  beforeEach(() => {
    w = new WindowStub();
    (globalThis as unknown as { window: unknown }).window = w;
    (globalThis as unknown as { document: unknown }).document = w.doc;
    inp = new Input();
    w.current = inp;
  });

  it('按住 D 时 dx=1', () => {
    w.dispatch('keydown', ev('KeyD'));
    inp.update();
    expect(inp.pad1.dx).toBe(1);
  });

  it('松开 D 后 dx 归零（这条曾经是坏的：键按一次就永远按下）', () => {
    w.dispatch('keydown', ev('KeyD'));
    inp.update();
    inp.endFrame();
    expect(inp.pad1.dx).toBe(1);

    w.dispatch('keyup', ev('KeyD'));
    inp.update();
    inp.endFrame();
    expect(inp.pad1.dx).toBe(0);
    expect(inp.pad1.right).toBe(false);
  });

  it('反复走停走之后不会残留方向', () => {
    for (let i = 0; i < 5; i++) w.tap('KeyD', 3);
    inp.update();
    inp.endFrame();
    expect(inp.pad1.dx).toBe(0);
  });

  it('松开后动作键也会清掉', () => {
    w.dispatch('keydown', ev('KeyJ'));
    inp.update(); inp.endFrame();
    expect(inp.pad1.punch).toBe(true);
    w.dispatch('keyup', ev('KeyJ'));
    inp.update(); inp.endFrame();
    expect(inp.pad1.punch).toBe(false);
  });
});

describe('Input：左右同时按住', () => {
  let w: WindowStub;
  let inp: Input;

  beforeEach(() => {
    w = new WindowStub();
    (globalThis as unknown as { window: unknown }).window = w;
    (globalThis as unknown as { document: unknown }).document = w.doc;
    inp = new Input();
    w.current = inp;
  });

  it('左右都按 → 不会卡在 0（"操作不了"的直接成因）', () => {
    w.dispatch('keydown', ev('KeyA'));
    w.dispatch('keydown', ev('KeyD'));
    inp.update(); inp.endFrame();
    // 关键：绝不能是 0。取最后按下的那个方向。
    expect(inp.pad1.dx).not.toBe(0);
    expect(inp.pad1.dx).toBe(1);
  });

  it('最后按下的方向获胜（幽灵键场景：D 卡住时按 A 能反向）', () => {
    w.dispatch('keydown', ev('KeyD'));
    inp.update(); inp.endFrame();
    w.dispatch('keydown', ev('KeyA'));
    inp.update(); inp.endFrame();
    expect(inp.pad1.dx).toBe(-1);
  });

  it('反向后先按的那个变成胜者', () => {
    w.dispatch('keydown', ev('KeyA'));
    inp.update(); inp.endFrame();
    w.dispatch('keydown', ev('KeyD'));
    inp.update(); inp.endFrame();
    expect(inp.pad1.dx).toBe(1);
  });

  it('上下同理', () => {
    w.dispatch('keydown', ev('KeyS'));
    inp.update(); inp.endFrame();
    w.dispatch('keydown', ev('KeyW'));
    inp.update(); inp.endFrame();
    expect(inp.pad1.dy).toBe(-1);
  });
});

describe('Input：极短敲击不能丢', () => {
  it('keydown 和 keyup 在同一帧之间也要算一次有效按下', () => {
    const w = new WindowStub();
    (globalThis as unknown as { window: unknown }).window = w;
    (globalThis as unknown as { document: unknown }).document = w.doc;
    const inp = new Input();

    w.dispatch('keydown', ev('KeyJ'));
    w.dispatch('keyup', ev('KeyJ'));   // 还没跑过一帧就松开了
    inp.update();
    expect(inp.pad1.pressedPunch, '极短敲击被漏掉了').toBe(true);
    inp.endFrame();

    inp.update();
    expect(inp.pad1.pressedPunch, '下一帧不应该还在触发').toBe(false);
    inp.endFrame();
  });

  it('正常敲击只触发一次', () => {
    const w = new WindowStub();
    (globalThis as unknown as { window: unknown }).window = w;
    (globalThis as unknown as { document: unknown }).document = w.doc;
    const inp = new Input();

    w.dispatch('keydown', ev('KeyK'));
    inp.update();
    expect(inp.pad1.pressedKick).toBe(true);
    inp.endFrame();

    inp.update();  // 仍按着
    expect(inp.pad1.pressedKick).toBe(false);
    inp.endFrame();
  });
});

describe('Input：幽灵键兜底', () => {
  it('窗口失焦要清空所有键', () => {
    const w = new WindowStub();
    (globalThis as unknown as { window: unknown }).window = w;
    (globalThis as unknown as { document: unknown }).document = w.doc;
    const inp = new Input();

    w.dispatch('keydown', ev('KeyD'));
    inp.update();
    expect(inp.pad1.dx).toBe(1);

    w.dispatch('blur', {});
    inp.update();
    expect(inp.pad1.dx).toBe(0);
  });

  it('页面切到后台要清空所有键', () => {
    const w = new WindowStub();
    (globalThis as unknown as { window: unknown }).window = w;
    (globalThis as unknown as { document: unknown }).document = w.doc;
    const inp = new Input();

    w.dispatch('keydown', ev('KeyD'));
    inp.update();
    expect(inp.pad1.dx).toBe(1);

    w.doc.hidden = true;
    w.doc.listeners.visibilitychange?.forEach((l) => l.fn({}));
    inp.update();
    expect(inp.pad1.dx).toBe(0);
  });

  it('触摸层松手要清空虚拟键', () => {
    const w = new WindowStub();
    (globalThis as unknown as { window: unknown }).window = w;
    (globalThis as unknown as { document: unknown }).document = w.doc;
    const inp = new Input();

    inp.setVirtual(false, 'right', true);
    inp.setVirtual(false, 'punch', true);
    inp.update();
    expect(inp.pad1.right).toBe(true);

    inp.releaseVirtual();
    inp.update();
    expect(inp.pad1.right).toBe(false);
    expect(inp.pad1.punch).toBe(false);
  });
});

describe('Input：P2 独立', () => {
  it('P1 的键不影响 P2', () => {
    const w = new WindowStub();
    (globalThis as unknown as { window: unknown }).window = w;
    (globalThis as unknown as { document: unknown }).document = w.doc;
    const inp = new Input();

    w.dispatch('keydown', ev('ArrowRight'));
    inp.update(); inp.endFrame();
    expect(inp.pad2.dx).toBe(1);
    expect(inp.pad1.dx).toBe(0);
  });
});

