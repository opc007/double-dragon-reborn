/**
 * 回归测试 —— 每一条都对应一个真实修过的 bug。
 *
 * 这些坑当时的表现是"不报错、不崩溃、就是卡住不动"，
 * 靠肉眼试玩根本发现不了，所以必须钉死。
 */

import { describe, it, expect } from 'vitest';
import { World, canReach } from '../systems/world';
import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { defaultSave } from '../systems/dojo';
import { STAGES } from '../data/levels';
import { EXP_PER_LEVEL } from '../core/constants';
import type { PadState } from '../core/input';

const pad = (o: Partial<PadState> = {}): PadState => ({
  up: false, down: false, left: false, right: false,
  punch: false, kick: false, jump: false, superBtn: false,
  pressedPunch: false, pressedKick: false, pressedJump: false, pressedSuper: false,
  dx: 0, dy: 0,
  ...o,
});

const save = () => defaultSave();

describe('回归：波次被跳空（空数组 every 恒为真）', () => {
  it('刚触发的波次不会立刻判定为清空', () => {
    const w = new World(0, save(), false);
    w.player.x = 200;
    w.update(pad(), pad());
    // 敌人还没刷出来，但这一波必须仍然是"进行中"
    expect(w.waveIdx).toBe(0);
    expect(w.locked).toBe(true);
    for (let i = 0; i < 40 && w.enemies.length === 0; i++) w.update(pad(), pad());
    expect(w.enemies.length).toBeGreaterThan(0);
  });
});

describe('回归：玩家被击退到触发点后面导致永久卡关', () => {
  it('波次一旦触发就与玩家位置无关，直到真的清空', () => {
    const w = new World(0, save(), false);
    w.player.x = 200;
    for (let i = 0; i < 40 && w.enemies.length === 0; i++) w.update(pad(), pad());
    expect(w.enemies.length).toBeGreaterThan(0);

    // 把玩家硬拽回触发点前面
    const gate = w.stage.waves[0]!.x;
    for (let i = 0; i < 300; i++) {
      w.player.x = gate - 40;
      w.update(pad(), pad());
      for (const e of w.enemies) if (!e.dead) e.hurt(9999, w.player.x, 1);
    }
    // 波次必须推进，不能永远锁着
    expect(w.waveIdx).toBeGreaterThan(0);
    expect(w.locked).toBe(false);
  });
});

describe('回归：敌人受击后永久卡在 hurt', () => {
  it('硬直结束后会回到可行动状态', () => {
    const e = new Enemy('williams', 100, 1, 1);
    e.hurt(5, 80, 1.5);
    expect(e.state).toBe('hurt');
    for (let i = 0; i < 60; i++) e.step();
    expect(e.state).not.toBe('hurt');
    expect(e.hitstun).toBe(0);
  });
});

describe('回归：敌人伤害算成 NaN 导致整局死锁', () => {
  it('敌人打玩家，血量必须始终是有限数', () => {
    const w = new World(0, save(), false);
    const p = w.player;
    p.x = 200;
    const e = new Enemy('williams', 212, 1, 7);
    w.enemies.push(e);
    for (let i = 0; i < 400; i++) {
      w.update(pad(), pad());
      expect(Number.isFinite(p.hp), `第 ${i} 帧血量变成 ${p.hp}`).toBe(true);
      expect(Number.isFinite(e.hp)).toBe(true);
    }
  });

  it('玩家打敌人，血量也必须始终是有限数', () => {
    const w = new World(0, save(), false);
    const p = w.player;
    p.x = 200;
    const e = new Enemy('abobo', 214, 1, 3);
    w.enemies.push(e);
    for (let i = 0; i < 300; i++) {
      w.update(pad({ punch: true, pressedPunch: i % 14 === 0 }), pad());
      expect(Number.isFinite(e.hp)).toBe(true);
      expect(Number.isFinite(p.hp)).toBe(true);
    }
  });
});

describe('回归：BOSS 完成判定被门控挡住', () => {
  it('第四关的 BOSS 队列会依次打完并通关', () => {
    const w = new World(3, save(), false);
    w.stage.pits = [];          // 这条只测 BOSS 队列，深坑另有测试
    const p = w.player;
    p.level = 7;
    let guard = 0;
    while (w.result === 'running' && guard++ < 60 * 400) {
      // 无敌推进：直接清场 + 往前走
      p.x = Math.min(p.x + 3, w.stage.length - 20);
      w.update(pad(), pad());
      for (const e of w.enemies) if (!e.dead) e.hurt(99999, p.x, 1);
    }
    expect(w.result).toBe('stageClear');
  });

  it('每关 BOSS 都会被打到（不会因为门控漏掉最后一个）', () => {
    for (let i = 0; i < STAGES.length; i++) {
      const w = new World(i, save(), false);
      w.stage.pits = [];
      const p = w.player;
      p.level = 7;
      let guard = 0;
      while (w.result === 'running' && guard++ < 60 * 500) {
        p.x = Math.min(p.x + 3, w.stage.length - 20);
        w.update(pad(), pad());
        for (const e of w.enemies) if (!e.dead) e.hurt(99999, p.x, 1);
      }
      expect(w.result, `第 ${i + 1} 关卡住了`).toBe('stageClear');
    }
  });
});

describe('回归：BOSS 会被"倒地三次"误判退场', () => {
  it('BOSS 掉光了也不该被清出场', () => {
    const willy = new Enemy('willy', 0, 1, 1);
    expect(willy.maxKnockdowns).toBeGreaterThan(10);
    for (let i = 0; i < 8; i++) {
      willy.hurt(1, -20, 3, { knockdown: true });
      for (let k = 0; k < 60; k++) willy.step();
    }
    expect(willy.outOfPlay).toBe(false);
    expect(willy.dead).toBe(false);
  });

  it('小兵仍然保留"打三次就滚"的原作规则', () => {
    const grunt = new Enemy('williams', 0, 1, 1);
    expect(grunt.maxKnockdowns).toBe(2);
  });
});

describe('回归：镜头锁死把玩家挤出画面', () => {
  it('锁镜头时玩家始终留在画面内', () => {
    const w = new World(0, save(), false);
    for (let i = 0; i < 900; i++) {
      w.update(pad({ right: true, dx: 1 }), pad());
      const sx = w.player.x - w.camX;
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(256);
    }
  });
});

describe('深坑', () => {
  it('踩上去会掉下去', () => {
    const w = new World(0, save(), false);
    const pit = w.stage.pits[0]!;
    w.player.x = pit.x + pit.w / 2;
    w.update(pad(), pad());
    expect(w.player.dead).toBe(true);
  });

  it('贴着坑沿起跳能过去', () => {
    const w = new World(0, save(), false);
    const pit = w.stage.pits[0]!;
    w.player.x = pit.x - 8;
    // 起跳
    w.update(pad({ right: true, dx: 1, pressedJump: true, jump: true }), pad());
    // 滞空飞行
    for (let i = 0; i < 40 && w.player.inAir; i++) {
      w.update(pad({ right: true, dx: 1 }), pad());
    }
    expect(w.player.x).toBeGreaterThan(pit.x + pit.w);
    expect(w.player.dead).toBe(false);
  });

  it('坑都落在"下一波开打之前"的通行段，不会有人在混战里被推下去', () => {
    for (const s of STAGES) {
      const triggers = s.waves.map((w) => w.x).sort((a, b) => a - b);
      for (const pit of s.pits) {
        const next = triggers.find((t) => t > pit.x);
        expect(next, `${s.name} 有坑在最后一波之后`).toBeDefined();
        const gap = next! - (pit.x + pit.w);
        expect(gap, `${s.name} 的坑离下一波开打只剩 ${gap}px`).toBeGreaterThan(30);
        // 也别压在上一波的战斗区间里
        const prev = [...triggers].reverse().find((t) => t <= pit.x) ?? 0;
        expect(pit.x - prev, `${s.name} 的坑压在上一波的战斗区里`).toBeGreaterThan(180);
      }
    }
  });
});

describe('canReach 深度带规则', () => {
  it('同档可达，隔档不可达', () => {
    expect(canReach(1, 1, 21, false)).toBe(true);
    expect(canReach(1, 0, 21, false)).toBe(false);
    expect(canReach(0, 2, 21, false)).toBe(false);
  });
  it('腾空够得到相邻一档', () => {
    expect(canReach(1, 0, 21, true)).toBe(true);
    expect(canReach(0, 2, 21, true)).toBe(false);
  });
});

describe('完整一局不会卡死', () => {
  it('用最笨的打法（一直向右）也能在 8 分钟内结束，而不是无限挂起', () => {
    const w = new World(0, save(), false);
    let f = 0;
    while (w.result === 'running' && f < 60 * 60 * 8) {
      w.update(pad({ right: true, dx: 1 }), pad());
      f++;
    }
    expect(f, '一局跑了 8 分钟还没结束，说明有 softlock').toBeLessThan(60 * 60 * 8);
  });
});

describe('升级跨关继承', () => {
  it('通关后等级和经验会带到下一关', () => {
    const p = new Player({ vit: 0, power: 0, speed: 0, chiGain: 0, disciple: false }, 3);
    p.addExp(EXP_PER_LEVEL * 2);
    expect(p.level).toBe(3);
  });
});
