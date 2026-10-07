/**
 * 确定性随机 —— mulberry32。
 *
 * 关卡装饰、敌人刷落点这类"每次都该长得一样"的东西必须用带种子的 PRNG，
 * 不能用 Math.random，否则同一关两次进入长得不一样，回归测试也没法截图比对。
 */
export function makeRNG(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type RNG = () => number;

/** 区间随机 */
export const rrange = (rng: RNG, a: number, b: number): number => a + rng() * (b - a);

/** 整区间随机（含端点） */
export const rint = (rng: RNG, a: number, b: number): number =>
  Math.floor(a + rng() * (b - a + 1));

/** 数组随机取一个 */
export function rpick<T>(rng: RNG, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}
