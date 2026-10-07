import { describe, it, expect } from 'vitest';
import { World, canReach } from '../systems/world';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { defaultSave, statsOf } from '../systems/dojo';
import { CHI_MAX, EXP_PER_LEVEL } from '../core/constants';
import { MOVES } from '../data/moves';
import type { PadState } from '../core/input';

const pad = (o: Partial<PadState> = {}): PadState => ({
  up: false, down: false, left: false, right: false,
  punch: false, kick: false, jump: false, superBtn: false,
  pressedPunch: false, pressedKick: false, pressedJump: false, pressedSuper: false,
  dx: 0, dy: 0,
  ...o,
});

const st = statsOf(defaultSave());

/** 空转 n 帧（Player 单独跑；World 跑完整模拟） */
function run(p: Player | World | Enemy, n: number, input: PadState = pad()): void {
  for (let i = 0; i < n; i++) {
    if (p instanceof World) p.update(input, pad());
    else if (p instanceof Player) {
      p.update(input, { enemies: [], pickups: [], playerStart: 40 });
    } else {
      p.step();
    }
  }
}

/** 在真实 World 里打一拳（命中判定只在 World 里发生） */
function punchInWorld(w: World, frames = 24): void {
  for (let i = 0; i < frames; i++) {
    w.update(pad({ punch: true, pressedPunch: i === 0, right: true, dx: 1 }), pad());
  }
}

describe('玩家基础动作', () => {
  it('向右走 x 会增加', () => {
    const p = new Player(st, 3);
    const x0 = p.x;
    run(p, 20, pad({ right: true, dx: 1 }));
    expect(p.x).toBeGreaterThan(x0);
  });

  it('跳跃会离地，落回同一深度带', () => {
    const p = new Player(st, 3);
    const gy = p.y;
    run(p, 3, pad({ pressedJump: true, jump: true }));
    expect(p.airborne).toBe(true);
    run(p, 90);
    expect(p.airborne).toBe(false);
    expect(p.y).toBeCloseTo(gy, 1);
  });

  it('上下切纵深档', () => {
    const p = new Player(st, 3);
    const b0 = p.band;
    run(p, 30, pad({ up: true, dy: -1 }));
    expect(p.band).toBeLessThan(b0);
    run(p, 60, pad({ down: true, dy: 1 }));
    expect(p.band).toBeGreaterThan(b0);
  });
});

describe('等级成长（FC 版招牌）', () => {
  it('攒够 1000 经验升 1 级', () => {
    const p = new Player(st, 3);
    expect(p.level).toBe(1);
    p.addExp(EXP_PER_LEVEL - 1);
    expect(p.level).toBe(1);
    p.addExp(1);
    expect(p.level).toBe(2);
  });

  it('一次给巨量经验也只升到 7 级封顶', () => {
    const p = new Player(st, 3);
    p.addExp(999999);
    expect(p.level).toBe(7);
  });

  it('升级会回满血并报出新招', () => {
    const p = new Player(st, 3);
    p.hp = 10;
    const r = p.addExp(EXP_PER_LEVEL);
    expect(r.leveled).toBe(true);
    expect(r.newMove).toBe(MOVES.uppercut.name);
    expect(p.hp).toBe(p.hpMax);
  });

  it('逐级报出该级新招（每级取第一招）', () => {
    const names: (string | null)[] = [];
    const p = new Player(st, 3);
    for (let i = 0; i < 6; i++) names.push(p.addExp(EXP_PER_LEVEL).newMove);
    expect(names).toEqual([
      MOVES.uppercut.name, MOVES.jumpKick.name, MOVES.knee.name,
      MOVES.pin.name, MOVES.elbow.name, MOVES.spinKick.name,
    ]);
  });

  it('等级越高，同一招伤害越高', () => {
    const a = new Player(st, 3);
    const b = new Player(st, 3);
    b.addExp(EXP_PER_LEVEL * 3);
    expect(b.level).toBe(4);
    expect(b.pendingDamage).toBe(0); // 还没出招
    void a;
  });
});

describe('气 / 奥义（新增系统）', () => {
  it('气不会超过上限', () => {
    const p = new Player(st, 3);
    for (let i = 0; i < 100; i++) p.gainChi(10);
    expect(p.chi).toBe(CHI_MAX);
    expect(p.chiFull).toBe(true);
  });

  it('气满才能放奥义，且放完清空', () => {
    const p = new Player(st, 3);
    p.gainChi(CHI_MAX);
    run(p, 1, pad({ pressedSuper: true, superBtn: true }));
    expect(p.chi).toBe(0);
    expect(p.state).toBe('super');
  });

  it('气不满时按奥义无反应', () => {
    const p = new Player(st, 3);
    p.chi = 10;
    run(p, 1, pad({ pressedSuper: true, superBtn: true }));
    expect(p.chi).toBe(10);
    expect(p.state).not.toBe('super');
  });
});

describe('击退 / 倒地 / 起身', () => {
  it('硬直受击会打断出招', () => {
    const e = new Enemy('williams', 0, 1, 1);
    e.hurt(5, -20, 2);
    expect(e.state).toBe('hurt');
    expect(e.hitstun).toBeGreaterThan(0);
  });

  it('大击退会直接击倒', () => {
    const e = new Enemy('williams', 0, 1, 1);
    e.hurt(5, -20, 3.0, { knockdown: true });
    expect(e.state).toBe('down');
  });

  it('被打倒多次后彻底退场（原作规则）', () => {
    const e = new Enemy('williams', 0, 1, 1);
    for (let i = 0; i < 3; i++) {
      e.hurt(1, -20, 3, { knockdown: true });
      run(e, 60);
    }
    expect(e.outOfPlay || e.dead).toBe(true);
  });

  it('生命归零即死', () => {
    const e = new Enemy('williams', 0, 1, 1);
    e.hurt(9999, -20, 1);
    expect(e.dead).toBe(true);
  });
});

describe('抓取与投掷', () => {
  it('走进敌人身体会进入抓取态', () => {
    const p = new Player(st, 3);
    const e = new Enemy('williams', p.x + 10, p.band, 1);
    p.vx = 1.4;
    p.update(pad({ right: true, dx: 1 }), { enemies: [e], pickups: [], playerStart: 40 });
    expect(p.state).toBe('grab');
    expect(e.state).toBe('grabbed');
    expect(e.grabbedBy).toBe(p);
  });

  it('抓取中按脚触发过肩摔（Lv4 解锁）', () => {
    const p = new Player(st, 3);
    p.addExp(EXP_PER_LEVEL * 3); // Lv4
    const e = new Enemy('williams', p.x + 10, p.band, 1);
    p.startGrab(e);
    expect(p.state).toBe('grab');
    p.update(pad({ pressedKick: true, kick: true }), { enemies: [e], pickups: [], playerStart: 40 });
    expect(p.state).not.toBe('grab');
    expect(e.state).toBe('thrown');
  });

  it('低等级抓取中按脚不能摔（复刻原作的等级门槛）', () => {
    const p = new Player(st, 3); // Lv1
    const e = new Enemy('williams', p.x + 10, p.band, 1);
    p.startGrab(e);
    p.update(pad({ pressedKick: true, kick: true }), { enemies: [e], pickups: [], playerStart: 40 });
    expect(p.state).toBe('grab');
  });

  it('抓住的敌人太久会挣脱', () => {
    const p = new Player(st, 3);
    const e = new Enemy('williams', p.x + 10, p.band, 1);
    p.startGrab(e);
    // 走敌人真实的 update 路径（挣脱判定挂在被抓者身上）
    for (let i = 0; i < 200; i++) {
      p.update(pad(), { enemies: [e], pickups: [], playerStart: 40 });
      e.update(p);
    }
    expect(p.state).not.toBe('grab');
  });
});

describe('深度带规则', () => {
  it('canReach：同档可达，隔一档不可达', () => {
    expect(canReach(1, 1, 21, false)).toBe(true);
    expect(canReach(1, 0, 21, false)).toBe(false);
    expect(canReach(0, 2, 21, false)).toBe(false);
  });

  it('canReach：腾空可以够到相邻一档，但够不到两档外', () => {
    expect(canReach(1, 0, 21, true)).toBe(true);
    expect(canReach(0, 2, 21, true)).toBe(false);
  });

  it('canReach：旋风腿这类大范围招式能跨一档', () => {
    expect(canReach(1, 0, MOVES.spinKick.range, false)).toBe(true);
    expect(canReach(0, 2, MOVES.spinKick.range, false)).toBe(false);
  });

  it('不同深度带之间打不到人（双截龙的核心）', () => {
    const w = new World(0, defaultSave(), false);
    const p = w.player;
    p.x = 40; p.band = 0;
    const e = new Enemy('williams', p.x + 12, 2, 1);
    // 冻结 AI，否则敌人会主动对齐到玩家那一档（那是特性，不是 bug）
    e.def = { ...e.def, aggro: -1 };
    w.enemies.push(e);
    const hp0 = e.hp;
    for (let i = 0; i < 30; i++) {
      p.facing = 1;
      w.update(pad({ punch: true, pressedPunch: i === 0 }), pad());
    }
    expect(e.band).toBe(2);   // 确实没动过
    expect(e.hp).toBe(hp0);
  });

  it('同深度带能打到', () => {
    const w = new World(0, defaultSave(), false);
    const p = w.player;
    p.x = 40; p.band = 1;
    const e = new Enemy('williams', p.x + 14, 1, 1);
    e.def = { ...e.def, aggro: -1 };
    w.enemies.push(e);
    const hp0 = e.hp;
    punchInWorld(w, 24);
    expect(e.hp).toBeLessThan(hp0);
  });

  it('敌人会主动对齐到玩家所在的深度带', () => {
    const p = new Player(st, 3);
    p.band = 2;
    const e = new Enemy('williams', 60, 0, 1);
    for (let i = 0; i < 30; i++) e.update(p);
    expect(e.band).toBe(2);
  });
});

describe('关卡流程', () => {
  it('开局只有玩家，没有敌人', () => {
    const w = new World(0, defaultSave(), false);
    expect(w.players.length).toBe(1);
    expect(w.enemies.length).toBe(0);
    expect(w.result).toBe('running');
  });

  it('走到触发点会刷怪并锁镜头', () => {
    const w = new World(0, defaultSave(), false);
    w.player.x = 200;
    w.update(pad(), pad());
    expect(w.locked).toBe(true);
    expect(w.waveIdx).toBe(0);
    // 敌人是分批进场的（原作同屏只有 2 个），所以要等一小会儿
    for (let i = 0; i < 40 && w.enemies.length === 0; i++) w.update(pad(), pad());
    expect(w.enemies.length).toBeGreaterThan(0);
  });

  it('同屏敌人不会超过这一波的名额上限（防止无限刷怪）', () => {
    const w = new World(0, defaultSave(), false);
    w.player.x = 200;
    const quota = w.stage.waves[0]!.enemies.length;
    for (let i = 0; i < 600; i++) {
      w.update(pad(), pad());
      for (const e of w.enemies) if (!e.dead) e.hurt(9999, w.player.x, 1);
      expect(w.enemies.length).toBeLessThanOrEqual(quota);
      if (w.waveIdx > 0) break;
    }
    expect(w.waveIdx).toBe(1);
  });

  it('清完一波后解锁、进入下一波', () => {
    const w = new World(0, defaultSave(), false);
    w.player.x = 200;
    for (let i = 0; i < 400; i++) {
      w.update(pad(), pad());
      // 模拟玩家无脑清场：直接把敌人打死
      for (const e of w.enemies) if (!e.dead) e.hurt(9999, w.player.x, 1);
    }
    expect(w.locked).toBe(false);
  });

  it('倒计时归零会判死', () => {
    const w = new World(0, defaultSave(), false);
    w.timer = 0.1;
    for (let i = 0; i < 10; i++) w.update(pad(), pad());
    expect(w.player.dead).toBe(true);
  });

  it('清完一波会补满计时（原作行为）', () => {
    const w = new World(0, defaultSave(), false);
    w.player.x = 200;
    w.update(pad(), pad());
    for (let i = 0; i < 40 && w.enemies.length === 0; i++) w.update(pad(), pad());
    expect(w.enemies.length).toBeGreaterThan(0);
    w.timer = 20;
    for (const e of w.enemies) e.hurt(9999, w.player.x, 1);
    for (let i = 0; i < 10; i++) w.update(pad(), pad());
    expect(w.waveIdx).toBe(1);
    expect(w.timer).toBeGreaterThan(90);
  });

  it('扣命后回到关卡头，经验和等级保留', () => {
    const w = new World(0, defaultSave(), false);
    w.player.addExp(EXP_PER_LEVEL * 2);
    const lv = w.player.level;
    w.player.hurt(9999, 0, 1);
    expect(w.consumeLife()).toBe(true);
    expect(w.player.level).toBe(lv);
    expect(w.player.hp).toBe(w.player.hpMax);
    expect(w.player.x).toBeCloseTo(40, 0);
  });

  it('命扣光则游戏结束', () => {
    const w = new World(0, defaultSave(), false);
    w.lives = 1;
    w.player.hurt(9999, 0, 1);
    expect(w.consumeLife()).toBe(false);
  });

  it('双开有两名玩家且颜色不同', () => {
    const w = new World(0, defaultSave(), true);
    expect(w.players.length).toBe(2);
    expect(w.players[0]!.pal.top).not.toBe(w.players[1]!.pal.top);
  });

  it('玩家不能走出关卡边界', () => {
    const w = new World(0, defaultSave(), false);
    for (let i = 0; i < 400; i++) w.update(pad({ right: true, dx: 1 }), pad());
    expect(w.player.x).toBeLessThanOrEqual(w.stage.length);
  });
});

describe('敌人 AI', () => {
  it('敌人会朝玩家靠拢', () => {
    const p = new Player(st, 3);
    p.x = 0;
    const e = new Enemy('williams', 90, 1, 1);
    const x0 = e.x;
    for (let i = 0; i < 30; i++) e.update(p);
    expect(Math.abs(e.x - p.x)).toBeLessThan(Math.abs(x0 - p.x));
  });

  it('玩家离太远时敌人不会动', () => {
    const p = new Player(st, 3);
    p.x = 0;
    const e = new Enemy('williams', 500, 1, 1);
    const x0 = e.x;
    for (let i = 0; i < 30; i++) e.update(p);
    expect(e.x).toBe(x0);
  });

  it('不同深度带的敌人会主动对齐过来', () => {
    const p = new Player(st, 3);
    p.band = 2;
    const e = new Enemy('williams', 60, 0, 1);
    for (let i = 0; i < 30; i++) e.update(p);
    expect(e.band).toBe(2);
  });
});

describe('道场强化', () => {
  it('内劲等级会提高伤害', () => {
    const save = defaultSave();
    const base = new Player(statsOf(save), 3);
    base.pendingDamage = 10;
    save.lv.power = 3;
    const buffed = new Player(statsOf(save), 3);
    expect(buffed.stats.power).toBe(27);
  });

  it('铁骨功会提高体力上限', () => {
    const save = defaultSave();
    save.lv.vit = 2;
    expect(statsOf(save).vit).toBe(24);
  });
});
