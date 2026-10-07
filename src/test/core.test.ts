import { describe, it, expect } from 'vitest';
import { clamp, sign, lerp, rectHit, angDiff, boxOf, bandY } from '../core/math';
import { makeRNG, rint, rrange } from '../core/rng';
import { DEPTH_BANDS, EXP_PER_LEVEL, MAX_LEVEL } from '../core/constants';

describe('math', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('sign 返回字面量类型', () => {
    expect(sign(3)).toBe(1);
    expect(sign(-3)).toBe(-1);
    expect(sign(0)).toBe(0);
  });

  it('lerp', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('rectHit 边界不算命中', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectHit(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectHit(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it('angDiff 归一化到 [-PI, PI]', () => {
    expect(Math.abs(angDiff(0.1, 6.2))).toBeLessThan(0.2);
    expect(angDiff(0, 0)).toBe(0);
  });

  it('boxOf 以脚底为原点', () => {
    const b = boxOf({ x: 50, y: 200, w: 16, h: 32 });
    expect(b.x).toBe(42);
    expect(b.y).toBe(168);
    expect(b.h).toBe(32);
  });

  it('bandY 越界会钳住', () => {
    expect(bandY(-5, DEPTH_BANDS)).toBe(DEPTH_BANDS[0]);
    expect(bandY(99, DEPTH_BANDS)).toBe(DEPTH_BANDS[DEPTH_BANDS.length - 1]);
  });
});

describe('rng', () => {
  it('同种子完全可复现（关卡装饰靠这个保证一致）', () => {
    const a = makeRNG(12345);
    const b = makeRNG(12345);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('输出落在 [0,1)', () => {
    const r = makeRNG(999);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rint 含端点，rrange 覆盖区间', () => {
    const r = makeRNG(7);
    for (let i = 0; i < 200; i++) {
      const v = rint(r, 3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      const f = rrange(r, -1, 1);
      expect(f).toBeGreaterThanOrEqual(-1);
      expect(f).toBeLessThan(1);
    }
  });
});

describe('升级曲线', () => {
  it('7 级封顶，每级 1000 经验', () => {
    expect(MAX_LEVEL).toBe(7);
    expect(EXP_PER_LEVEL).toBe(1000);
  });
});
