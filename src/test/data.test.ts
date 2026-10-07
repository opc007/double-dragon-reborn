import { describe, it, expect } from 'vitest';
import { MOVES, movesAtLevel, newlyUnlocked, type MoveId } from '../data/moves';
import { ENEMIES } from '../data/enemies';
import { WEAPONS } from '../data/weapons';
import { STAGES } from '../data/levels';

describe('招式表', () => {
  it('复刻 FC 版的解锁阶梯：1→7 逐级', () => {
    // 原作顺序：直拳/脚踢 → 上勾拳/回旋踢 → 飞踢 → 膝撞/摔 → 骑马 → 霸王肩 → 旋风腿
    expect(MOVES.punch.lv).toBe(1);
    expect(MOVES.kick.lv).toBe(1);
    expect(MOVES.uppercut.lv).toBe(2);
    expect(MOVES.roundhouse.lv).toBe(2);
    expect(MOVES.jumpKick.lv).toBe(3);
    expect(MOVES.knee.lv).toBe(4);
    expect(MOVES.suplex.lv).toBe(4);
    expect(MOVES.pin.lv).toBe(5);
    expect(MOVES.elbow.lv).toBe(6);
    expect(MOVES.spinKick.lv).toBe(7);
  });

  it('奥义不受等级限制，但不吃成长', () => {
    expect(MOVES.super.lv).toBe(1);
    expect(MOVES.super.growth).toBe(0);
  });

  it('每级至少有一招可学，Lv1 就有 3 招', () => {
    expect(movesAtLevel(1).length).toBeGreaterThanOrEqual(3);
    for (let lv = 1; lv < 7; lv++) {
      expect(newlyUnlocked(lv), `升到 ${lv + 1} 级应该有新招`).not.toBeNull();
    }
    expect(newlyUnlocked(7)).toBeNull();
  });

  it('强力招的伤害必须高于基础招', () => {
    expect(MOVES.uppercut.damage).toBeGreaterThan(MOVES.punch.damage);
    expect(MOVES.spinKick.damage).toBeGreaterThan(MOVES.kick.damage);
    expect(MOVES.suplex.damage).toBeGreaterThan(MOVES.knee.damage);
  });

  it('所有招式 id 唯一', () => {
    const ids = Object.values(MOVES).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('敌人图鉴', () => {
  it('原作 7 个杂兵 + 4 个 BOSS 全部到位', () => {
    for (const id of ['williams', 'rowper', 'linda', 'abobo', 'bolo', 'chin', 'willy', 'jimmy']) {
      expect(ENEMIES[id], `缺少敌人 ${id}`).toBeDefined();
    }
  });

  it('BOSS 血量必须显著高于小兵', () => {
    const grunt = ENEMIES.williams!.hp;
    for (const b of ['bolo', 'chin', 'willy', 'jimmy']) {
      expect(ENEMIES[b]!.hp, `${b} 太脆了`).toBeGreaterThan(grunt * 2);
    }
  });

  it('最终 BOSS 是亲哥哥吉米，且会抓人', () => {
    expect(ENEMIES.jimmy!.canGrab).toBe(true);
    expect(ENEMIES.jimmy!.hp).toBeGreaterThan(ENEMIES.willy!.hp);
  });

  it('威利持枪，不会被抓（枪手不该被贴身锁死）', () => {
    expect(ENEMIES.willy!.ai).toBe('gun');
    expect(ENEMIES.willy!.canGrab).toBe(false);
  });

  it('每个敌人都必须引用一个合法武器', () => {
    for (const e of Object.values(ENEMIES)) {
      expect(WEAPONS[e.weapon], `${e.id} 的武器 ${e.weapon} 不存在`).toBeDefined();
    }
  });
});

describe('武器', () => {
  it('鞭子射程必须显著长于拳头', () => {
    expect(WEAPONS.whip.range).toBeGreaterThan(WEAPONS.bat.range);
  });

  it('只有可投掷武器允许 throwable', () => {
    for (const w of Object.values(WEAPONS)) {
      if (!w.throwable) expect(w.throwDamage).toBe(0);
    }
  });

  it('炸药是一次性的', () => {
    expect(WEAPONS.dynamite.durability).toBe(1);
  });
});

describe('关卡', () => {
  it('四关，顺序是贫民窟→工厂→森林→基地', () => {
    expect(STAGES.length).toBe(4);
    expect(STAGES.map((s) => s.bg)).toEqual(['slum', 'factory', 'forest', 'hideout']);
  });

  it('波次 x 坐标严格递增（否则镜头会锁错位置）', () => {
    for (const s of STAGES) {
      for (let i = 1; i < s.waves.length; i++) {
        expect(s.waves[i]!.x, `${s.name} 第 ${i} 波`).toBeGreaterThan(s.waves[i - 1]!.x);
      }
    }
  });

  it('所有波次的敌人 id 都存在', () => {
    for (const s of STAGES) {
      for (const w of s.waves) {
        expect(w.enemies.length).toBeGreaterThan(0);
        for (const id of w.enemies) {
          expect(ENEMIES[id], `${s.name} 引用了不存在的敌人 ${id}`).toBeDefined();
        }
      }
    }
  });

  it('BOSS 触发点必须在关卡尾部', () => {
    for (const s of STAGES) {
      const last = s.waves[s.waves.length - 1]!.x;
      expect(s.length - 130).toBeGreaterThan(last);
    }
  });

  it('第四关是威利之后接吉米（FC 版招牌的双 BOSS）', () => {
    const last = STAGES[3]!;
    expect(last.boss).toBe('willy');
    expect(last.boss2).toBe('jimmy');
  });

  it('前三关只有单 BOSS', () => {
    for (const s of STAGES.slice(0, 3)) expect(s.boss2).toBeUndefined();
  });

  it('敌人强度随关卡上升', () => {
    const avgExp = (i: number): number => {
      const s = STAGES[i]!;
      const all = s.waves.flatMap((w) => w.enemies);
      return all.reduce((s2, id) => s2 + ENEMIES[id]!.exp, 0) / all.length;
    };
    expect(avgExp(1)).toBeGreaterThan(avgExp(0));
    expect(avgExp(3)).toBeGreaterThan(avgExp(1));
  });
});

describe('招式引用完整性', () => {
  it('MOVES 的 key 与 MoveId 一致', () => {
    const ids = Object.keys(MOVES) as MoveId[];
    for (const id of ids) expect(MOVES[id]!.id).toBe(id);
  });
});
