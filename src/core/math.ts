/** 数学 / 几何工具。刻意保持无依赖，方便单测。 */

export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const sign = (v: number): -1 | 0 | 1 => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** 帧率无关的指数趋近 */
export const approach = (cur: number, target: number, rate: number): number =>
  cur + (target - cur) * rate;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boxOf(e: { x: number; y: number; w: number; h: number }): Box {
  // x = 中心，y = 脚底
  return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
}

export function rectHit(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 角度差归一化到 [-PI, PI] */
export function angDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const dist2 = (x1: number, y1: number, x2: number, y2: number): number =>
  (x2 - x1) ** 2 + (y2 - y1) ** 2;

/** 整数像素：避免画布上出现半像素模糊，锁死像素质感 */
export const px = (v: number): number => Math.round(v);

/** 从深度带取脚底 Y */
export function bandY(band: number, bands: readonly number[]): number {
  return bands[clamp(Math.round(band), 0, bands.length - 1)]!;
}
