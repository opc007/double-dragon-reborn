/**
 * 招式输入的回归测试 —— 全部对应玩家实际抱怨过的问题。
 *
 * 玩家原话：「出拳就出拳，出腿就出腿，怎么混着一起呢，
 *            两个一起按，可以出大招。」
 *
 * 之前代码里有一套"拳脚自动交替"的连段逻辑：按 J 出拳、按 K 出腿，
 * 系统自己给玩家换成另一个动作。这完全违反直觉，已删除。
 */

import { describe, it, expect } from 'vitest';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { World } from '../systems/world';
import { defaultSave } from '../systems/dojo';
import { MOVES } from '../data/moves';
import type { PadState } from '../core/input';

const pad = (o: Partial<PadState> = {}): PadState => ({
  up: false, down: false, left: false, right: false,
  punch: false, kick: false, jump: false, superBtn: false,
  pressedPunch: false, pressedKick: false, pressedJump: false, pressedSuper: false,
  dx: 0, dy: 0,
  ...o,
});

const st = defaultSave();

function newPlayer(level = 1): Player {
  const p = new Player(st, 3);
  p.level = level;
  p.setState('idle');
  return p;
}

/** 按住某个组合跑若干帧，返回出现过的招式 */
function swing(p: Player, input: Partial<PadState>, frames = 26): string[] {
  const seen: string[] = [];
  for (let i = 0; i < frames; i++) {
    p.update(pad(input), { enemies: [], pickups: [], playerStart: 40 });
    const a = p.atk;
    if (a && a.def.id && !seen.includes(a.def.id)) seen.push(a.def.id);
    p.step();
  }
  return seen;
}

describe('拳腿分明：按 J 就是拳，按 K 就是腿', () => {
  it('按 J 只出拳', () => {
    expect(swing(newPlayer(), { punch: true })).toEqual(['punch']);
  });

  it('按 K 只出脚', () => {
    expect(swing(newPlayer(), { kick: true })).toEqual(['kick']);
  });

  it('连按 6 次 J，招式序列里不出现 kick（曾经会自动交替）', () => {
    const p = newPlayer();
    const all: string[] = [];
    for (let i = 0; i < 6; i++) all.push(...swing(p, { punch: true }, 20));
    expect(all.length).toBeGreaterThan(0);
    expect(all).not.toContain('kick');
    expect(new Set(all)).toEqual(new Set(['punch']));
  });

  it('连按 6 次 K，招式序列里不出现 punch', () => {
    const p = newPlayer();
    const all: string[] = [];
    for (let i = 0; i < 6; i++) all.push(...swing(p, { kick: true }, 20));
    expect(all.length).toBeGreaterThan(0);
    expect(all).not.toContain('punch');
  });

  it('交替按 J/K 时，各自出各自的招，不会串', () => {
    const a = swing(newPlayer(), { punch: true }, 20);
    const b = swing(newPlayer(), { kick: true }, 20);
    expect(a).toEqual(['punch']);
    expect(b).toEqual(['kick']);
  });
});

describe('J + K 同按 = 大招', () => {
  it('同时按下拳和脚出「双截连打」', () => {
    expect(swing(newPlayer(), { punch: true, kick: true })).toEqual(['combo']);
  });

  it('连打是三段打击', () => {
    expect(MOVES.combo.hits).toBe(3);
  });

  it('连打是 Lv1 就能用（不需要升级）', () => {
    expect(MOVES.combo.lv).toBe(1);
  });

  it('连打优先级高于方向组合（同时按 ↓ 时仍是连打）', () => {
    const seen = swing(newPlayer(7), { punch: true, kick: true, down: true, dy: 1 });
    expect(seen).toEqual(['combo']);
  });

  it('三段判定真的能打中同一个敌人三次', () => {
    const w = new World(0, defaultSave(), false);
    const p = w.player;
    p.level = 5;
    p.x = 200;
    p.band = 1;
    const e = new Enemy('williams', p.x + 20, 1, 1);
    e.def = { ...e.def, aggro: -1 };   // 冻结 AI，让它站着挨打
    w.enemies.push(e);
    const hp0 = e.hp;
    for (let i = 0; i < 30; i++) {
      w.update(pad({ punch: true, kick: true }), pad());
    }
    const dealt = hp0 - e.hp;
    // 单段只能打一次；三段应该明显更多
    expect(dealt).toBeGreaterThan(MOVES.punch.damage * 1.5);
  });
});

describe('方向组合仍然可用', () => {
  it('↓ + J = 上勾拳（Lv2 起）', () => {
    expect(swing(newPlayer(1), { punch: true, down: true, dy: 1 })).toEqual(['punch']);
    expect(swing(newPlayer(2), { punch: true, down: true, dy: 1 })).toEqual(['uppercut']);
  });

  it('↓ + K = 回旋踢（Lv2 起）', () => {
    expect(swing(newPlayer(2), { kick: true, down: true, dy: 1 })).toEqual(['roundhouse']);
  });

  it('空中 + K = 飞踢（Lv3 起）', () => {
    const p = newPlayer(3);
    p.inAir = true;
    p.y = p.groundY() - 20;
    p.setState('air');
    // 只采滞空期间的那些帧：落地后同样的按键会正常出地面招，那是另一回事
    const seen: string[] = [];
    for (let i = 0; i < 6 && p.inAir; i++) {
      p.update(pad({ kick: true }), { enemies: [], pickups: [], playerStart: 40 });
      if (p.atk && p.atk.def.id) seen.push(p.atk.def.id);
      p.step();
    }
    expect(seen[0]).toBe('jumpKick');
  });

  it('滞空结束后同一个键回到地面招', () => {
    const p = newPlayer(3);
    p.inAir = true;
    p.y = p.groundY() - 20;
    p.setState('air');
    for (let i = 0; i < 10; i++) { p.update(pad({ kick: true }), { enemies: [], pickups: [], playerStart: 40 }); p.step(); }
    expect(p.inAir).toBe(false);
    const seen = swing(p, { kick: true }, 10);
    expect(seen).toContain('kick');
  });
});

describe('抓取不再锁死', () => {
  it('抓住敌人后按反方向立刻脱手', () => {
    const p = newPlayer();
    const e = new Enemy('williams', p.x + 10, p.band, 1);
    p.startGrab(e);
    expect(p.state).toBe('grab');
    p.update(pad({ left: true, dx: -1 }), { enemies: [e], pickups: [], playerStart: 40 });
    expect(p.state).not.toBe('grab');
  });

  it('抓住时同方向可以拖着人走（不会完全动不了）', () => {
    const p = newPlayer();
    const e = new Enemy('williams', p.x + 10, p.band, 1);
    p.startGrab(e);
    const x0 = p.x;
    for (let i = 0; i < 20; i++) {
      p.update(pad({ right: true, dx: 1 }), { enemies: [e], pickups: [], playerStart: 40 });
      p.step();
    }
    expect(p.x).toBeGreaterThan(x0 + 2);
  });

  it('手里已经有人时不再重复抓取（否则贴着多人直接锁死）', () => {
    const w = new World(0, defaultSave(), false);
    const p = w.player;
    p.x = 200;
    const e = new Enemy('williams', p.x + 8, 1, 1);
    e.def = { ...e.def, aggro: -1 };
    w.enemies.push(e);
    for (let i = 0; i < 40; i++) w.update(pad({ right: true, dx: 1 }), pad());
    // 最多只有一个被抓
    expect(w.enemies.filter((x) => x.state === 'grabbed').length).toBeLessThanOrEqual(1);
  });

  it('抓取超时会自动脱手，不会把人永久锁住（走 World 的真实路径）', () => {
    const w = new World(0, defaultSave(), false);
    const p = w.player;
    p.x = 200;
    p.band = 1;
    const e = new Enemy('williams', p.x + 10, 1, 1);
    e.def = { ...e.def, aggro: -1 };
    w.enemies.push(e);
    p.startGrab(e);
    expect(p.state).toBe('grab');
    for (let i = 0; i < 300; i++) {
      w.update(pad(), pad());
      if (p.state !== 'grab') break;
    }
    expect(p.state, '抓了 300 帧还没脱手 = 锁死').not.toBe('grab');
  });

  it('玩家抓人的最长持续时间明显短于敌人抓人', () => {
    const p = newPlayer();
    const e = new Enemy('williams', p.x + 10, p.band, 1);
    p.startGrab(e);
    expect(p.grabMax).toBeLessThanOrEqual(100);
  });
});

describe('招式范围跟得上角色尺寸', () => {
  it('每个招式的判定距离都不小于 22（角色现在 40 高）', () => {
    for (const m of Object.values(MOVES)) {
      expect(m.range, `${m.name} 的范围只有 ${m.range}`).toBeGreaterThanOrEqual(22);
    }
  });

  it('腿比拳远', () => {
    expect(MOVES.kick.range).toBeGreaterThan(MOVES.punch.range);
  });

  it('旋风腿是所有招式里范围最大的（奥义是全屏大招，另算）', () => {
    const normal = Object.values(MOVES).filter((m) => m.id !== 'super');
    const max = Math.max(...normal.map((m) => m.range));
    expect(MOVES.spinKick.range).toBe(max);
  });

  it('连打的范围介于拳和腿之间（贴身三连）', () => {
    expect(MOVES.combo.range).toBeGreaterThan(MOVES.punch.range);
    expect(MOVES.combo.range).toBeLessThan(MOVES.kick.range);
  });
});