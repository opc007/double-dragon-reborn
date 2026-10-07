/**
 * 程序化背景 —— 四关全部现画，零素材。
 *
 * 从"几个方块"改成"有光照有空气"的现代 2D：
 *   · 天空是多段渐变 + 一处光源辉光
 *   · 远景层做大气透视（越远越淡越蓝），这是让 2D 有空间感最有效的一招
 *   · 楼体是带渐变的路径，窗户逐格点亮，颜色不统一
 *   · 地面有光池、反射和细纹理
 *   · 每关有环境粒子（尘/火星/雨/灰烬）
 *
 * 布局仍然用带种子的 PRNG，保证同一关每次进入长得一样。
 */

import { makeRNG, rint } from '../core/rng';
import { VIEW_W, VIEW_H, DEPTH_BANDS } from '../core/constants';
import type { BGKind, Pit } from '../data/levels';
import { rngFloat } from './util';

export interface BgItem {
  x: number;
  y: number;
  w: number;
  h: number;
  v: number;
  c: number;
}

export interface Bg {
  kind: BGKind;
  seed: number;
  pits: Pit[];
  far: BgItem[];
  mid: BgItem[];
  floorLayer: BgItem[];
  floor: BgItem[];
  /** 窗户的逐格亮灭 */
  winSeed: number;
}

export function buildBg(kind: BGKind, seed: number): Bg {
  const rng = makeRNG(seed);
  const bg: Bg = {
    kind, seed, pits: [], far: [], mid: [], floorLayer: [], floor: [], winSeed: seed ^ 0x5bf0,
  };
  const end = 3600;
  switch (kind) {
    case 'slum': buildSlum(bg, rng, end); break;
    case 'factory': buildFactory(bg, rng, end); break;
    case 'forest': buildForest(bg, rng, end); break;
    case 'hideout': buildHideout(bg, rng, end); break;
  }
  return bg;
}

/* ---------------- 各关装饰 ---------------- */

function buildSlum(bg: Bg, rng: () => number, end: number): void {
  let x = -40;
  while (x < end) {
    const w = rint(rng, 28, 60);
    bg.far.push({ x, y: 168, w, h: rint(rng, 46, 104), v: rint(rng, 1, 3), c: rint(rng, 0, 2) });
    x += w + rint(rng, 4, 16);
  }
  x = -30;
  while (x < end) {
    bg.mid.push({
      x, y: 178, w: rint(rng, 38, 70), h: rint(rng, 30, 72),
      v: rint(rng, 0, 2), c: rint(rng, 0, 2),
    });
    x += rint(rng, 10, 34);
  }
  nearLayer(bg, rng, end);
  scatterFloor(bg, rng, end, 0.45);
}

function buildFactory(bg: Bg, rng: () => number, end: number): void {
  let x = -40;
  while (x < end) {
    bg.far.push({ x, y: 168, w: rint(rng, 44, 96), h: rint(rng, 36, 86), v: rint(rng, 0, 3), c: rint(rng, 0, 2) });
    x += rint(rng, 18, 54);
  }
  x = -30;
  while (x < end) {
    bg.mid.push({ x, y: 150, w: rint(rng, 56, 130), h: rint(rng, 6, 13), v: 0, c: rint(rng, 0, 2) });
    if (rng() < 0.45) {
      bg.mid.push({
        x: x + rint(rng, 0, 44), y: 164, w: rint(rng, 20, 34), h: rint(rng, 24, 48),
        v: 1, c: rint(rng, 0, 2),
      });
    }
    x += rint(rng, 66, 140);
  }
  nearLayer(bg, rng, end);
  scatterFloor(bg, rng, end, 0.5);
}

function buildForest(bg: Bg, rng: () => number, end: number): void {
  let x = -40;
  while (x < end) {
    bg.far.push({ x, y: 168, w: rint(rng, 12, 24), h: rint(rng, 64, 128), v: 0, c: rint(rng, 0, 2) });
    x += rint(rng, 10, 32);
  }
  x = -30;
  while (x < end) {
    bg.mid.push({
      x, y: 172, w: rint(rng, 16, 30), h: rint(rng, 44, 86),
      v: rng() < 0.3 ? 1 : 0, c: rint(rng, 0, 2),
    });
    x += rint(rng, 20, 52);
  }
  nearLayer(bg, rng, end);
  scatterFloor(bg, rng, end, 0.4);
}

function buildHideout(bg: Bg, rng: () => number, end: number): void {
  for (let i = 0; i < 26; i++) {
    bg.far.push({ x: i * 108 + rint(rng, -20, 20), y: 168, w: rint(rng, 64, 104), h: rint(rng, 24, 64), v: 0, c: rint(rng, 0, 2) });
  }
  let x = -30;
  while (x < end) {
    bg.mid.push({ x, y: 168, w: rint(rng, 12, 26), h: rint(rng, 46, 92), v: 1, c: rint(rng, 0, 2) });
    x += rint(rng, 76, 150);
  }
  nearLayer(bg, rng, end);
  scatterFloor(bg, rng, end, 0.35);
}

function nearLayer(bg: Bg, rng: () => number, end: number): void {
  for (let x = 10; x < end; x += rint(rng, 76, 200)) {
    bg.floorLayer.push({ x, y: 180, w: rint(rng, 7, 18), h: rint(rng, 12, 30), v: rint(rng, 0, 2), c: rint(rng, 0, 2) });
  }
}

function scatterFloor(bg: Bg, rng: () => number, end: number, density: number): void {
  for (let x = 20; x < end; x += rint(rng, 96, 230)) {
    if (rng() > density) continue;
    bg.floor.push({ x, y: 0, w: rint(rng, 8, 22), h: rint(rng, 6, 15), v: rint(rng, 0, 2), c: rint(rng, 0, 3) });
  }
}

/* ---------------- 调色板 ---------------- */

interface Pal {
  skyTop: string; skyMid: string; skyLow: string;
  glow: string; glowX: number;
  far: string[]; mid: string[]; near: string;
  floor: [string, string]; floorLine: string;
  lightPool: string;
  haze: string;
  /** 环境粒子 */
  motes: string; moteRate: number; moteUp: boolean;
  winLit: string; winDark: string;
}

const PALETTES: Record<BGKind, Pal> = {
  slum: {
    skyTop: '#150f22', skyMid: '#2e1c3a', skyLow: '#5a2b3a',
    glow: 'rgba(255,150,90,0.16)', glowX: 0.72,
    far: ['#2b2340', '#332a4a', '#241d36'],
    mid: ['#3d3252', '#463a5e', '#302742'],
    near: '#241d33',
    floor: ['#4a3b34', '#33262a'], floorLine: '#6b5348',
    lightPool: 'rgba(255,170,110,0.10)',
    haze: 'rgba(90,60,90,0.30)',
    motes: 'rgba(255,200,150,0.5)', moteRate: 0.10, moteUp: true,
    winLit: 'rgba(255,205,130,0.85)', winDark: 'rgba(30,24,40,0.7)',
  },
  factory: {
    skyTop: '#0d1418', skyMid: '#1c2c33', skyLow: '#2f4650',
    glow: 'rgba(120,200,220,0.12)', glowX: 0.28,
    far: ['#1c262b', '#223038', '#182126'],
    mid: ['#2c3a41', '#35474f', '#243036'],
    near: '#1c262b',
    floor: ['#3a454a', '#2a3236'], floorLine: '#55666d',
    lightPool: 'rgba(120,200,220,0.09)',
    haze: 'rgba(70,110,125,0.28)',
    motes: 'rgba(180,225,235,0.4)', moteRate: 0.07, moteUp: true,
    winLit: 'rgba(150,220,235,0.8)', winDark: 'rgba(22,32,38,0.7)',
  },
  forest: {
    skyTop: '#0a1610', skyMid: '#152b1e', skyLow: '#2a4a34',
    glow: 'rgba(150,230,160,0.13)', glowX: 0.45,
    far: ['#152a1e', '#1a3324', '#12241a'],
    mid: ['#20402d', '#274a34', '#1a3526'],
    near: '#16281c',
    floor: ['#31402f', '#232f24'], floorLine: '#4a5f44',
    lightPool: 'rgba(150,220,150,0.09)',
    haze: 'rgba(60,110,80,0.30)',
    motes: 'rgba(190,240,180,0.55)', moteRate: 0.13, moteUp: true,
    winLit: 'rgba(180,230,150,0.7)', winDark: 'rgba(18,34,24,0.7)',
  },
  hideout: {
    skyTop: '#100a12', skyMid: '#241624', skyLow: '#3a2030',
    glow: 'rgba(230,70,90,0.14)', glowX: 0.5,
    far: ['#2a1d28', '#332330', '#221722'],
    mid: ['#3d2937', '#493040', '#2e1f2b'],
    near: '#1c1219',
    floor: ['#4a3742', '#33252f'], floorLine: '#6b4e5e',
    lightPool: 'rgba(240,90,110,0.10)',
    haze: 'rgba(90,45,60,0.30)',
    motes: 'rgba(255,140,120,0.45)', moteRate: 0.09, moteUp: false,
    winLit: 'rgba(255,120,110,0.75)', winDark: 'rgba(28,18,24,0.7)',
  },
};

/* ---------------- 绘制 ---------------- */

export function drawBg(ctx: CanvasRenderingContext2D, bg: Bg, camX: number, frame: number): void {
  const P0 = PALETTES[bg.kind];

  /* 天空：多段渐变 */
  const g = ctx.createLinearGradient(0, 0, 0, 176);
  g.addColorStop(0, P0.skyTop);
  g.addColorStop(0.55, P0.skyMid);
  g.addColorStop(1, P0.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, 178);

  /* 城市辉光：给天空一个光源，画面才不会是一块死色 */
  const gx = P0.glowX * VIEW_W;
  const gg = ctx.createRadialGradient(gx, 168, 4, gx, 168, 130);
  gg.addColorStop(0, P0.glow);
  gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg;
  ctx.fillRect(0, 0, VIEW_W, 178);

  /* 远景：带大气透视 */
  const farFog = ctx.createLinearGradient(0, 60, 0, 176);
  farFog.addColorStop(0, 'rgba(0,0,0,0)');
  farFog.addColorStop(1, P0.haze);
  layerBuildings(ctx, bg, bg.far, camX * 0.3, P0.far, P0, frame, 0.55);
  ctx.fillStyle = farFog;
  ctx.fillRect(0, 0, VIEW_W, 178);

  /* 中景：更实一点 */
  layerBuildings(ctx, bg, bg.mid, camX * 0.58, P0.mid, P0, frame, 1);

  /* 近景层 */
  layerNear(ctx, bg, camX * 0.82, P0);

  /* 地面 */
  drawFloor(ctx, bg, P0, camX);

  /* 地面小物 */
  drawFloorProps(ctx, bg, P0, camX);

  /* 环境粒子 */
  drawMotes(ctx, bg, P0, camX, frame);
}

/** 带渐变和窗户的建筑层 */
function layerBuildings(
  ctx: CanvasRenderingContext2D,
  bg: Bg, items: BgItem[], par: number,
  colors: string[], P0: Pal, frame: number, alpha: number,
): void {
  const wr = makeRNG(bg.winSeed);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const it of items) {
    const sx = Math.round(it.x - par);
    if (sx + it.w < -10 || sx > VIEW_W + 10) continue;
    const c = colors[it.c % colors.length]!;
    const y = it.y;
    const h = it.h;
    if (h <= 0) continue;

    if (bg.kind === 'forest' && it.v === 0) {
      drawTree(ctx, sx, y, it.w, h, c, P0, wr);
      continue;
    }
    if (bg.kind === 'factory' && it.v === 0) {
      drawPipe(ctx, sx, y, it.w, it.h, c, P0);
      continue;
    }
    if (bg.kind === 'hideout' && it.v === 1) {
      drawPillar(ctx, sx, y, it.w, h, c, P0, frame, it.c);
      continue;
    }
    drawBuilding(ctx, sx, y, it.w, h, c, P0, wr, bg.kind, it.v, frame);
  }
  ctx.restore();
}

function drawBuilding(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  c: string, P0: Pal, wr: () => number, kind: BGKind, variant: number, frame: number,
): void {
  // 楼体：竖向渐变 + 侧面暗部，做出体积
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, c);
  g.addColorStop(0.72, c);
  g.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y - h, w, h);

  // 顶部边缘高光（城市的轮廓被天光照亮）
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(x, y - h, w, 1.2);

  // 窗户网格：逐格随机亮灭，不整齐才像真的楼
  const cw = 5, ch = 6, gap = 3;
  const cols = Math.max(1, Math.floor((w - 4) / (cw + gap)));
  const rows = Math.max(1, Math.floor((h - 8) / (ch + gap)));
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const on = wr() < 0.34;
      const wx = x + 3 + cIdx * (cw + gap);
      const wy = y - h + 5 + r * (ch + gap);
      if (wx + cw > x + w - 1 || wy + ch > y - 1) continue;
      if (on) {
        // 亮着的窗：暖光，偶尔轻微闪烁
        const flick = (frame >> 5) + cIdx + r;
        ctx.fillStyle = flick % 17 === 0 ? P0.winLit : P0.winLit;
        ctx.fillRect(wx, wy, cw, ch);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(wx, wy, cw, 1);
      } else {
        ctx.fillStyle = P0.winDark;
        ctx.fillRect(wx, wy, cw, ch);
      }
    }
  }

  // 楼顶杂物：空调外机 / 水塔 / 天线
  if (variant === 1 && w > 20) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + w - 9, y - h - 4, 7, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + w - 9, y - h - 4, 7, 1);
  } else if (variant === 2 && w > 26) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + 5, y - h - 7, 3, 8);
    ctx.fillRect(x + 2, y - h - 8, 9, 2);
  }

  if (kind === 'slum' && variant === 0) {
    // 涂鸦招牌
    ctx.fillStyle = 'rgba(255,110,90,0.20)';
    ctx.fillRect(x + 2, y - h + 14, w - 4, 4);
  }
}

function drawTree(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  c: string, P0: Pal, wr: () => number,
): void {
  // 树干
  const tg = ctx.createLinearGradient(x, 0, x + w, 0);
  tg.addColorStop(0, c);
  tg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.32, y);
  ctx.lineTo(x + w * 0.38, y - h * 0.72);
  ctx.lineTo(x + w * 0.62, y - h * 0.72);
  ctx.lineTo(x + w * 0.68, y);
  ctx.closePath();
  ctx.fill();
  // 树冠：几团叠加的椭圆，不是规则圆
  ctx.fillStyle = c;
  for (let i = 0; i < 3; i++) {
    const cx = x + w * (0.2 + wr() * 0.6);
    const cy = y - h * (0.72 + wr() * 0.28);
    const r = 5 + wr() * 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 顶部受光
  ctx.fillStyle = 'rgba(180,230,170,0.10)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y - h * 0.95, w * 0.5, h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  void P0;
}

function drawPipe(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  c: string, P0: Pal,
): void {
  const g = ctx.createLinearGradient(0, y - h, 0, y);
  g.addColorStop(0, 'rgba(255,255,255,0.14)');
  g.addColorStop(0.35, c);
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y - h, w, h);
  // 法兰
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x + 6, y - h - 1, 2.5, h + 2);
  ctx.fillRect(x + w - 9, y - h - 1, 2.5, h + 2);
  void P0;
}

function drawPillar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  c: string, P0: Pal, frame: number, idx: number,
): void {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(0.4, c);
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y - h, w, h);
  // 危险灯带
  const on = (Math.floor(frame / 10) + idx) % 3 === 0;
  ctx.fillStyle = on ? 'rgba(255,90,90,0.55)' : 'rgba(90,30,40,0.5)';
  ctx.fillRect(x + 1, y - h + 6, w - 2, 1.6);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x, y - 4, w, 4);
  void P0;
}

function layerNear(
  ctx: CanvasRenderingContext2D, bg: Bg, par: number, P0: Pal,
): void {
  for (const it of bg.floorLayer) {
    const sx = Math.round(it.x - par);
    if (sx + it.w < -10 || sx > VIEW_W + 10) continue;
    const c = P0.mid[it.c % P0.mid.length]!;
    const g = ctx.createLinearGradient(sx, 0, sx + it.w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.45, c);
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, 178 - it.h, it.w, it.h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(sx, 178 - it.h, it.w, 1);
  }
  void bg;
}

function drawFloor(
  ctx: CanvasRenderingContext2D, bg: Bg, P0: Pal, camX: number,
): void {
  const bands = DEPTH_BANDS;
  for (let i = 0; i < bands.length; i++) {
    const y = bands[i]!;
    const h = i === bands.length - 1 ? VIEW_H - y : bands[i + 1]! - y;
    // 每档的底色做上下渐变，别再是一块平色
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, P0.floor[i % 2]);
    g.addColorStop(1, P0.floor[(i + 1) % 2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, VIEW_W, h);

    // 深度交界：一道暗边 + 一道高光，做出"台阶"的感觉
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, y - 1.5, VIEW_W, 1.5);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, y, VIEW_W, 0.8);
  }

  // 光池：地面不是均匀的，有一滩一滩的光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const off = -(camX * 0.7) % 150;
  for (let x = off - 150; x < VIEW_W + 150; x += 150) {
    const g = ctx.createRadialGradient(x + 60, 196, 2, x + 60, 196, 64);
    g.addColorStop(0, P0.lightPool);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 176, 150, VIEW_H - 176);
  }
  ctx.restore();

  // 地面细纹理：石板缝 + 噪点感
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  const so = -((camX * 0.85) % 30);
  for (let x = so - 30; x < VIEW_W + 30; x += 30) {
    for (let i = 0; i < bands.length; i++) {
      const y = bands[i]!;
      const h = i === bands.length - 1 ? VIEW_H - y : bands[i + 1]! - y;
      ctx.fillRect(Math.round(x), y, 0.8, h);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = so - 30 + 1.2; x < VIEW_W + 30; x += 30) {
    ctx.fillRect(Math.round(x), 178, 0.8, VIEW_H - 178);
  }

  drawPits(ctx, bg, P0, camX);
}

function drawPits(ctx: CanvasRenderingContext2D, bg: Bg, P0: Pal, camX: number): void {
  for (const p of bg.pits) {
    const sx = Math.round(p.x - camX);
    if (sx + p.w < -10 || sx > VIEW_W + 10) continue;
    const top = DEPTH_BANDS[0]! - 2;

    // 坑：纯黑 + 上下渐变，两侧壁有一点反光
    const g = ctx.createLinearGradient(0, top, 0, VIEW_H);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.6, '#05040a');
    g.addColorStop(1, '#0a0812');
    ctx.fillStyle = g;
    ctx.fillRect(sx, top, p.w, VIEW_H - top);

    // 坑壁受光
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(sx, top, 1.5, VIEW_H - top);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(sx + p.w - 1.5, top, 1.5, VIEW_H - top);

    // 坑沿高光
    ctx.fillStyle = P0.floorLine;
    ctx.fillRect(sx - 2, top - 1, 2.5, 2.5);
    ctx.fillRect(sx + p.w - 0.5, top - 1, 2.5, 2.5);

    // 坑底的危险色条：告诉玩家这里会摔死人
    ctx.fillStyle = 'rgba(220,60,50,0.22)';
    ctx.fillRect(sx, VIEW_H - 6, p.w, 2.5);
  }
}

function drawFloorProps(
  ctx: CanvasRenderingContext2D, bg: Bg, P0: Pal, camX: number,
): void {
  for (const it of bg.floor) {
    const sx = Math.round(it.x - camX);
    if (sx < -20 || sx > VIEW_W + 20) continue;
    const y = DEPTH_BANDS[it.v]!;
    const w = it.w, h = it.h;

    // 接地阴影
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(sx, y, w * 0.6, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    const g = ctx.createLinearGradient(sx - w / 2, 0, sx + w / 2, 0);
    const base = P0.mid[it.c % P0.mid.length]!;
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.4, base);
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - w / 2, y - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(sx - w / 2, y - h, w, 1);
  }
}

/** 环境粒子：每关不同的漂浮物 */
function drawMotes(
  ctx: CanvasRenderingContext2D, bg: Bg, P0: Pal, camX: number, frame: number,
): void {
  const n = Math.round(VIEW_W * P0.moteRate);
  ctx.save();
  ctx.fillStyle = P0.motes;
  for (let i = 0; i < n; i++) {
    // 用序号做伪随机，保证位置稳定不闪
    const rx = ((i * 97.3) % VIEW_W) - camX * 0.25;
    const speed = 0.25 + ((i * 37) % 100) / 140;
    const baseY = (i * 53.7) % 176;
    const y = P0.moteUp
      ? (baseY - (frame * speed * 0.4) % 200 + 200) % 200 - 10
      : (baseY + (frame * speed * 0.4) % 200) % 200 - 10;
    const x = ((rx % VIEW_W) + VIEW_W) % VIEW_W;
    const r = 0.4 + ((i * 13) % 10) / 14;
    ctx.globalAlpha = 0.18 + ((i * 7) % 10) / 16;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  void bg;
}

/** 暗角：把注意力收到画面中心 */
export function drawVignette(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(
    VIEW_W / 2, VIEW_H * 0.46, VIEW_H * 0.32,
    VIEW_W / 2, VIEW_H * 0.5, VIEW_H * 0.92,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.46)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  void rngFloat;
}
