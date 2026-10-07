/**
 * HUD 与文本渲染。
 *
 * 布局照搬 FC 版：血条在最上沿（原作就是这样，玩家看不见自己血量很难受）、
 * 命数和分数在左上、计时器在右上、经验和等级在左下。
 */

import { VIEW_W, VIEW_H, CHI_MAX, MAX_LEVEL, EXP_PER_LEVEL } from '../core/constants';
import { clamp } from '../core/math';
import type { Player } from '../entities/Player';

export const FONT = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const FONT_XS = '8px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const FONT_S = '9px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const FONT_L = '16px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const FONT_XL = '26px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number, y: number,
  opts?: { font?: string; color?: string; align?: CanvasTextAlign; shadow?: boolean },
): void {
  ctx.font = opts?.font ?? FONT;
  ctx.textAlign = opts?.align ?? 'left';
  ctx.textBaseline = 'top';
  if (opts?.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillText(s, Math.round(x) + 1, Math.round(y) + 1);
  }
  ctx.fillStyle = opts?.color ?? '#f0e8d8';
  ctx.fillText(s, Math.round(x), Math.round(y));
  ctx.textAlign = 'left';
}

/* ---------------- 血条 ---------------- */

export function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  ratio: number, color: string, label?: string,
): void {
  const r = clamp(ratio, 0, 1);
  ctx.fillStyle = '#1a1614';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a2a26';
  ctx.fillRect(x, y, w, h);
  // 分段刻度，每 25 点一格
  ctx.fillStyle = '#0f0c0a';
  for (let i = 25; i < 100; i += 25) {
    ctx.fillRect(x + Math.round((w * i) / 100), y, 1, h);
  }
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * r), h);
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x, y, Math.round(w * r), 1);
  if (label) {
    // 名字标在血条左边，避免压在条上糊成一团
    const w = label.length * 5 + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - w - 5, y - 1, w + 3, h + 2);
    text(ctx, label, x - w - 3, y - 1, { font: FONT_S, color: '#e8dcc8', shadow: false });
  }
}

/* ---------------- 命数小人 ---------------- */

function drawLifeIcon(ctx: CanvasRenderingContext2D, x: number, y: number, pal: { top: string; hair: string }): void {
  ctx.fillStyle = '#0f0c0a';
  ctx.fillRect(x - 1, y - 1, 7, 12);
  ctx.fillStyle = '#f0c090';
  ctx.fillRect(x, y, 5, 4);
  ctx.fillStyle = pal.hair;
  ctx.fillRect(x, y, 5, 2);
  ctx.fillStyle = pal.top;
  ctx.fillRect(x, y + 4, 5, 4);
  ctx.fillStyle = '#3868f8';
  ctx.fillRect(x, y + 8, 5, 3);
}

/* ---------------- 主 HUD ---------------- */

export interface HudCtx {
  players: Player[];
  lives: number;
  score: number;
  coins: number;
  timer: number;
  stageName: string;
  p2: boolean;
}

export function drawHud(ctx: CanvasRenderingContext2D, c: HudCtx): void {
  // 顶部压一条暗色带，保证文字可读
  ctx.fillStyle = 'rgba(10,8,12,0.55)';
  ctx.fillRect(0, 0, VIEW_W, 15);
  ctx.fillStyle = 'rgba(10,8,12,0.45)';
  ctx.fillRect(0, VIEW_H - 26, VIEW_W, 26);

  const p = c.players[0]!;
  const barW = c.p2 ? 86 : 100;
  drawHpBar(ctx, 34, 3, barW, 6, p.hp / p.hpMax,
    p.hp / p.hpMax > 0.3 ? '#e8413a' : '#ff8a3a', 'BILLY');

  if (c.p2 && c.players[1]) {
    const q = c.players[1];
    drawHpBar(ctx, 34, 11, barW, 5, q.hp / q.hpMax, '#4a8af0', 'JIMMY');
  }

  // 命数
  for (let i = 0; i < Math.min(c.lives, 5); i++) {
    drawLifeIcon(ctx, 4 + i * 8, 20, p.pal);
  }
  text(ctx, `x${c.lives}`, 4 + Math.min(c.lives, 5) * 8, 21, { font: FONT_S, color: '#cfc4b0' });

  // 分数 + 铜钱
  text(ctx, `${String(c.score).padStart(7, '0')}`, 4, 32, { color: '#ffd24a' });
  if (c.coins > 0) {
    text(ctx, `$${c.coins}`, VIEW_W - 4, 32, { font: FONT_S, color: '#ffd24a', align: 'right' });
  }

  // 计时器
  const t = Math.max(0, Math.ceil(c.timer));
  const low = t <= 10;
  const flash = low && (performance.now() / 250) % 2 < 1;
  text(ctx, String(t).padStart(2, '0'), VIEW_W - 4, 3, {
    font: FONT_L, align: 'right', color: low ? (flash ? '#ff4a3a' : '#ffb0a0') : '#f0e8d8',
  });

  // 关卡名（淡）
  text(ctx, c.stageName, VIEW_W - 30, 12, { font: FONT_S, align: 'right', color: 'rgba(220,210,190,0.42)' });

  /* ---- 左下：等级 / 经验 / 气 ---- */
  const y0 = VIEW_H - 23;
  text(ctx, `LV${p.level}`, 4, y0, { color: p.level >= 7 ? '#ffd24a' : '#e8dcc8' });

  // 7 颗心 = 7 级
  for (let i = 0; i < MAX_LEVEL; i++) {
    const hx = 28 + i * 9;
    drawHeart(ctx, hx, y0 + 1, p.level > i);
  }

  // 经验条
  const exW = 60;
  ctx.fillStyle = '#0f0c0a';
  ctx.fillRect(4, y0 + 9, exW + 2, 5);
  ctx.fillStyle = '#2a2620';
  ctx.fillRect(5, y0 + 10, exW, 3);
  const expRatio = p.level >= MAX_LEVEL ? 1 : p.exp / EXP_PER_LEVEL;
  ctx.fillStyle = '#5ad2a0';
  ctx.fillRect(5, y0 + 10, Math.round(exW * expRatio), 3);

  // 气槽
  const cy = y0 + 16;
  const chiW = 86;
  ctx.fillStyle = '#0f0c0a';
  ctx.fillRect(4, cy, chiW + 2, 6);
  ctx.fillStyle = '#241c10';
  ctx.fillRect(5, cy + 1, chiW, 4);
  const cr = p.chi / CHI_MAX;
  ctx.fillStyle = p.chiFull ? (Math.sin(performance.now() / 90) > 0 ? '#fff0a0' : '#ffb020') : '#e8a020';
  ctx.fillRect(5, cy + 1, Math.round(chiW * cr), 4);
  if (p.chiFull) {
    text(ctx, 'Q 奥义', 96, cy, {
      font: FONT_S, color: Math.sin(performance.now() / 90) > 0 ? '#fff0a0' : '#ff9020',
    });
  } else {
    text(ctx, '气', 96, cy, { font: FONT_S, color: 'rgba(200,180,150,0.45)' });
  }
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean): void {
  const c = on ? '#ff4a5a' : '#3a3038';
  ctx.fillStyle = c;
  ctx.fillRect(x, y + 1, 2, 2);
  ctx.fillRect(x + 3, y + 1, 2, 2);
  ctx.fillRect(x - 1, y + 2, 7, 2);
  ctx.fillRect(x, y + 4, 5, 1);
  ctx.fillRect(x + 1, y + 5, 3, 1);
  ctx.fillRect(x + 2, y + 6, 1, 1);
}

/* ---------------- 全屏横幅（关卡开始 / 结束） ---------------- */

export function drawBanner(
  ctx: CanvasRenderingContext2D,
  title: string,
  sub: string,
  alpha: number,
  accent = '#e8413a',
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(8,6,10,0.78)';
  ctx.fillRect(0, 88, VIEW_W, 62);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 88, VIEW_W, 2);
  ctx.fillRect(0, 148, VIEW_W, 2);
  text(ctx, title, VIEW_W / 2, 100, { font: FONT_L, align: 'center', color: '#f5efe0' });
  if (sub) text(ctx, sub, VIEW_W / 2, 122, { font: FONT_S, align: 'center', color: accent });
  ctx.restore();
}

/** 对话框（开场剧情） */
export function drawDialogue(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  alpha: number,
  topY?: number,
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const h = 12 + lines.length * 13;
  const y = topY ?? VIEW_H - h - 12;
  ctx.fillStyle = 'rgba(6,5,8,0.86)';
  ctx.fillRect(16, y, VIEW_W - 32, h);
  ctx.strokeStyle = '#6a5a4a';
  ctx.lineWidth = 1;
  ctx.strokeRect(16.5, y + 0.5, VIEW_W - 33, h - 1);
  lines.forEach((l, i) => text(ctx, l, 24, y + 5 + i * 13, { color: '#e8dcc8' }));
  ctx.restore();
}

/** 连段数提示 */
export function drawCombo(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  if (n < 2) return;
  const s = 1 + Math.min(n, 20) * 0.045;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  text(ctx, `${n}`, 0, 0, { font: FONT_L, align: 'center', color: '#ffd24a' });
  text(ctx, 'HIT', 0, 15, { font: FONT_S, align: 'center', color: '#ff8a3a' });
  ctx.restore();
}
