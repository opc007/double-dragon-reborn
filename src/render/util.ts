/** 渲染层共用的小工具。 */

/** 从名字里取一个稳定的伪随机数（0..1），同名字永远同值。 */
export function rngFloat(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** 颜色工具（与 sprite.ts 同一套逻辑，抽出来共用） */
export function parseColor(c: string): [number, number, number] {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/-?\d+(\.\d+)?/g);
  if (m && m.length >= 3) return [Number(m[0]), Number(m[1]), Number(m[2])];
  return [128, 128, 128];
}

export function shade(col: string, amt: number): string {
  const [r, g, b] = parseColor(col);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${cl(r + amt * 255)},${cl(g + amt * 255)},${cl(b + amt * 255)})`;
}

export function vGrad(
  ctx: CanvasRenderingContext2D, y0: number, y1: number, base: string,
): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(base, 0.18));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.22));
  return g;
}
