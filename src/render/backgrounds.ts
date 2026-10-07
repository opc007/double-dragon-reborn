/**
 * 程序化关卡背景。四张图全部用矩形画出来，零素材。
 *
 * 布局用固定种子的 PRNG 生成：同一关每次进入长得完全一样，
 * 这样截图回归才有意义（nanning-gtta 的 smoke 测试就是这么做的）。
 */

import { makeRNG, rint } from '../core/rng';
import { VIEW_W, VIEW_H, DEPTH_BANDS } from '../core/constants';
import type { BGKind, Pit } from '../data/levels';

export interface Bg {
  kind: BGKind;
  seed: number;
  /** 深坑 */
  pits: Pit[];
  /** 远景层物件 */
  far: BgItem[];
  /** 中景层物件 */
  mid: BgItem[];
  /** 近景层物件（贴在地面后，制造纵深） */
  floorLayer: BgItem[];
  /** 地面装饰 */
  floor: BgItem[];
  /** 墙面横向分割线 */
  seams: { y: number }[];
}

export interface BgItem {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 次要形状参数 */
  v: number;
  /** 颜色索引 */
  c: number;
}

/** 按关卡种子生成整套装饰 */
export function buildBg(kind: BGKind, seed: number): Bg {
  const rng = makeRNG(seed);
  const bg: Bg = { kind, seed, pits: [], far: [], mid: [], floorLayer: [], floor: [], seams: [] };
  // 墙面的水平分割线：给大片暗色加一条结构线，画面立刻不空
  for (let y = 24; y < 150; y += rint(rng, 18, 34)) bg.seams.push({ y });

  switch (kind) {
    case 'slum': buildSlum(bg, rng); break;
    case 'factory': buildFactory(bg, rng); break;
    case 'forest': buildForest(bg, rng); break;
    case 'hideout': buildHideout(bg, rng); break;
  }
  return bg;
}

const SLUM_FAR = ['#2a2438', '#332a44', '#241f30'];
const SLUM_MID = ['#3a3248', '#443a54', '#2e283c'];
const FACTORY_FAR = ['#1e2428', '#252c31', '#191e22'];
const FACTORY_MID = ['#2b3439', '#33403f', '#232b30'];
const FOREST_FAR = ['#16241c', '#1a2c22', '#122018'];
const FOREST_MID = ['#20382a', '#264233', '#1a2e22'];
const HIDEOUT_FAR = ['#20161c', '#281a20', '#1a1218'];
const HIDEOUT_MID = ['#30202a', '#3a2833', '#241820'];

function buildSlum(bg: Bg, rng: () => number): void {
  let x = -40;
  while (x < 3600) {
    const w = rint(rng, 26, 54);
    const h = rint(rng, 52, 104);
    bg.far.push({ x, y: 150, w, h, v: rint(rng, 2, 5), c: rint(rng, 0, 2) });
    x += w + rint(rng, 3, 12);
  }
  x = -30;
  while (x < 3600) {
    const w = rint(rng, 34, 62);
    const h = rint(rng, 34, 76);
    bg.mid.push({ x, y: 176, w, h, v: rng() < 0.4 ? 1 : 0, c: rint(rng, 0, 2) });
    x += w + rint(rng, 6, 20);
  }
  nearLayer(bg, rng, 3600);
  scatterFloor(bg, rng, 3600, 0.5);
}

function buildFactory(bg: Bg, rng: () => number): void {
  let x = -40;
  while (x < 3800) {
    bg.far.push({
      x, y: 150, w: rint(rng, 40, 90), h: rint(rng, 40, 88), v: rint(rng, 0, 3), c: rint(rng, 0, 2),
    });
    x += rint(rng, 14, 48);
  }
  x = -30;
  while (x < 3800) {
    // 管道
    bg.mid.push({
      x, y: 150, w: rint(rng, 50, 120), h: rint(rng, 6, 12), v: 0, c: rint(rng, 0, 2),
    });
    // 储罐
    if (rng() < 0.45) {
      bg.mid.push({
        x: x + rint(rng, 0, 40), y: 158, w: rint(rng, 18, 30), h: rint(rng, 24, 44),
        v: 1, c: rint(rng, 0, 2),
      });
    }
    x += rint(rng, 60, 130);
  }
  nearLayer(bg, rng, 3800);
  scatterFloor(bg, rng, 3800, 0.55);
}

function buildForest(bg: Bg, rng: () => number): void {
  let x = -40;
  while (x < 3900) {
    bg.far.push({ x, y: 150, w: rint(rng, 10, 20), h: rint(rng, 70, 130), v: 0, c: rint(rng, 0, 2) });
    x += rint(rng, 10, 30);
  }
  x = -30;
  while (x < 3900) {
    bg.mid.push({ x, y: 168, w: rint(rng, 14, 26), h: rint(rng, 46, 84), v: rng() < 0.25 ? 1 : 0, c: rint(rng, 0, 2) });
    x += rint(rng, 18, 46);
  }
  nearLayer(bg, rng, 3900);
  scatterFloor(bg, rng, 3900, 0.45);
}

function buildHideout(bg: Bg, rng: () => number): void {
  for (let i = 0; i < 30; i++) {
    bg.far.push({ x: i * 100 + rint(rng, -20, 20), y: 150, w: rint(rng, 60, 100), h: rint(rng, 20, 60), v: 0, c: rint(rng, 0, 2) });
  }
  x2loop(bg, rng, 3700);
  nearLayer(bg, rng, 3700);
  scatterFloor(bg, rng, 3700, 0.4);
}

function x2loop(bg: Bg, rng: () => number, end: number): void {
  let x = -30;
  while (x < end) {
    bg.mid.push({ x, y: 152, w: rint(rng, 12, 26), h: rint(rng, 50, 96), v: 1, c: rint(rng, 0, 2) });
    x += rint(rng, 70, 140);
  }
}

/**
 * 墙面结构线 + 竖向柱。
 * 背景最容易显得"空"的原因就是缺少中间尺度的结构，这里补上。
 */
function drawBackWall(
  ctx: CanvasRenderingContext2D,
  bg: Bg,
  camX: number,
  P0: { far: string[] },
): void {
  // 横向分割线
  ctx.fillStyle = 'rgba(255,255,255,0.030)';
  for (const s of bg.seams) {
    ctx.fillRect(0, s.y, VIEW_W, 1);
  }
  // 竖向柱子，间距固定，随相机滚动
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  const off = -((camX * 0.45) % 64);
  for (let x = off - 64; x < VIEW_W + 64; x += 64) {
    ctx.fillRect(Math.round(x), 0, 6, 172);
    ctx.fillStyle = 'rgba(255,255,255,0.022)';
    ctx.fillRect(Math.round(x) + 6, 0, 1, 172);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
  }
  void P0;
}

/** 近景层：贴地的杂物剪影，给纵深一个"近"参照物 */
function nearLayer(bg: Bg, rng: () => number, end: number): void {
  for (let x = 10; x < end; x += rint(rng, 70, 190)) {
    bg.floorLayer.push({
      x, y: 176, w: rint(rng, 6, 16), h: rint(rng, 10, 26),
      v: rint(rng, 0, 2), c: rint(rng, 0, 2),
    });
  }
}

/** 地面杂物：垃圾桶、纸箱、破洞、井盖 */
function scatterFloor(bg: Bg, rng: () => number, end: number, density: number): void {
  for (let x = 20; x < end; x += rint(rng, 90, 220)) {
    if (rng() > density) continue;
    bg.floor.push({
      x, y: 0, w: rint(rng, 8, 20), h: rint(rng, 6, 14),
      v: rint(rng, 0, 2), c: rint(rng, 0, 3),
    });
  }
}

/* ---------------- 绘制 ---------------- */

const PALETTES: Record<BGKind, {
  sky: [string, string]; far: string[]; mid: string[]; floor: string; floor2: string; line: string;
}> = {
  slum: {
    sky: ['#1a1626', '#3a2438'], far: SLUM_FAR, mid: SLUM_MID,
    floor: '#4a3c38', floor2: '#3a2e2c', line: '#5c4a44',
  },
  factory: {
    sky: ['#12181c', '#243036'], far: FACTORY_FAR, mid: FACTORY_MID,
    floor: '#3a4044', floor2: '#2c3236', line: '#4c545a',
  },
  forest: {
    sky: ['#0e1a14', '#1e3326'], far: FOREST_FAR, mid: FOREST_MID,
    floor: '#2e3a2a', floor2: '#243024', line: '#3e4c38',
  },
  hideout: {
    sky: ['#140e14', '#2a1a24'], far: HIDEOUT_FAR, mid: HIDEOUT_MID,
    floor: '#3a2c34', floor2: '#2c2128', line: '#4c3a44',
  },
};

export function drawBg(
  ctx: CanvasRenderingContext2D,
  bg: Bg,
  camX: number,
  frame: number,
): void {
  const P0 = PALETTES[bg.kind];
  const vw = VIEW_W;
  const vh = VIEW_H;

  // 天空
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, P0.sky[0]);
  g.addColorStop(1, P0.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);

  const layer = (items: BgItem[], par: number, colors: string[], yOff: number) => {
    for (const it of items) {
      const sx = Math.round(it.x - camX * par);
      if (sx + it.w < -8 || sx > vw + 8) continue;
      drawItem(ctx, it, sx, it.y + yOff, colors, bg.kind, frame);
    }
  };

  layer(bg.far, 0.32, P0.far, 0);
  drawBackWall(ctx, bg, camX, P0);
  layer(bg.mid, 0.62, P0.mid, 0);
  layer(bg.floorLayer, 0.85, P0.mid, 0);

  // 地面：三段纵深带
  drawFloor(ctx, P0, camX, bg.pits);

  // 地面杂物画在对应深度带上
  for (const it of bg.floor) {
    const band = it.v;
    const sx = Math.round(it.x - camX);
    if (sx < -20 || sx > vw + 20) continue;
    const y = DEPTH_BANDS[band]!;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx - it.w / 2, y - 1, it.w, 2);
    ctx.fillStyle = P0.line;
    ctx.fillRect(sx - it.w / 2, y - it.h, it.w, it.h - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(sx - it.w / 2, y - it.h, it.w, 1.5);
  }
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  P0: { floor: string; floor2: string; line: string },
  camX: number,
  pits: Pit[],
): void {
  const bands = DEPTH_BANDS;
  const vw = VIEW_W;
  for (let i = 0; i < bands.length; i++) {
    const y = bands[i]!;
    const h = i === bands.length - 1 ? VIEW_H - y : (bands[i + 1]! - y);
    ctx.fillStyle = i % 2 === 0 ? P0.floor : P0.floor2;
    ctx.fillRect(0, y, vw, h);
    // 深度分隔线
    ctx.fillStyle = P0.line;
    ctx.fillRect(0, y - 1, vw, 1);
  }

  // 深坑：把地面挖掉，露出底下的黑
  for (const p of pits) {
    const sx = Math.round(p.x - camX);
    if (sx + p.w < -8 || sx > vw + 8) continue;
    ctx.fillStyle = '#07060a';
    ctx.fillRect(sx, DEPTH_BANDS[0]! - 2, p.w, VIEW_H - DEPTH_BANDS[0]! + 2);
    // 坑沿：上沿留一条亮边，下沿做锯齿
    ctx.fillStyle = P0.line;
    ctx.fillRect(sx - 2, DEPTH_BANDS[0]! - 2, 2, 3);
    ctx.fillRect(sx + p.w, DEPTH_BANDS[0]! - 2, 2, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let k = 0; k < p.w; k += 3) {
      ctx.fillRect(sx + k, DEPTH_BANDS[0]! + (k % 6 === 0 ? 0 : 2), 2, 2);
    }
    // 坑底的危险色条（让玩家知道这里能摔死人）
    ctx.fillStyle = 'rgba(200,60,40,0.30)';
    ctx.fillRect(sx, VIEW_H - 8, p.w, 3);
  }

  // 地面砖缝（随相机滚动，强化横向移动感）
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < bands.length; i++) {
    const y = bands[i]!;
    const off = -((camX * 0.8) % 32);
    for (let x = off - 32; x < VIEW_W + 32; x += 32) {
      ctx.fillRect(Math.round(x), y, 1, i === bands.length - 1 ? VIEW_H - y : bands[i + 1]! - y);
    }
  }
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  it: BgItem,
  sx: number, y: number,
  colors: string[],
  kind: BGKind,
  frame: number,
): void {
  const c = colors[it.c % colors.length]!;
  ctx.fillStyle = c;
  ctx.fillRect(sx, y - it.h, it.w, it.h);

  switch (kind) {
    case 'slum': {
      // 窗
      ctx.fillStyle = 'rgba(255,210,120,0.18)';
      for (let r = 0; r < it.v; r++) {
        for (let cc = 0; cc < Math.max(1, it.v - 1); cc++) {
          const wx = sx + 4 + cc * 9;
          const wy = y - it.h + 6 + r * 11;
          if (wx + 5 < sx || wx > sx + it.w - 4) continue;
          ctx.fillRect(wx, wy, 5, 6);
        }
      }
      // 空调外机
      if (it.v === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(sx + it.w - 8, y - it.h + 3, 6, 6);
      }
      break;
    }
    case 'factory': {
      // 铆钉 / 通风口
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let r = 0; r < it.h; r += 8) ctx.fillRect(sx + 2, y - it.h + r + 2, it.w - 4, 1);
      if (it.v === 1) {
        // 亮着的小灯
        const blink = (frame >> 4) % 2 === 0;
        ctx.fillStyle = blink ? '#ff6a3a' : '#7a2a18';
        ctx.fillRect(sx + it.w / 2 - 1.5, y - it.h - 3, 3, 3);
      }
      break;
    }
    case 'forest': {
      if (it.v === 1) {
        // 树冠
        ctx.beginPath();
        ctx.arc(sx + it.w / 2, y - it.h, it.w * 0.9, Math.PI, 0);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(sx + it.w / 3, y - it.h, 2, it.h);
      }
      break;
    }
    case 'hideout': {
      // 灯带
      const on = (Math.floor(frame / 12) + it.c) % 3 === 0;
      ctx.fillStyle = on ? '#e0506a' : '#4a2030';
      ctx.fillRect(sx + 1, y - it.h + 4, it.w - 2, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(sx, y - 4, it.w, 4);
      break;
    }
  }
}

/** 远景滚动时的暗角，把注意力收到中间 */
export function drawVignette(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(0.35, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
