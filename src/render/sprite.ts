/**
 * 角色渲染 —— 追求"好看的 2D 动作角色"，不是像素小人。
 *
 * 问题出在比例：早期版本头几乎占全身 1/3、身体是个圆角方板，
 * 看起来像姜饼人。这里按 7.5 头身重做：
 *   · 头小、肩宽、腰收、腿长
 *   · 三角肌 → 上臂 → 前臂 逐段收细
 *   · 大腿 → 膝 → 小腿 → 脚，有真正的脚掌形状
 *   · 衣服是分片画的（背心 / 腰带 / 裤子），不是一整块
 *   · 五官有下颌线、耳朵、眉眼，不再是一张圆脸
 *
 * 姿态系统不变：每个姿态只描述手肘 / 膝盖 / 髋 / 肩的角度。
 */

import { clamp } from '../core/math';
import type { Fighter } from '../entities/Fighter';
import type { WeaponId } from '../data/weapons';
import { shade, vGrad } from './util';

/** 骨架基准（scale = 1 时约 40 单位高，7.5 头身） */
const SK = {
  /** 头顶 */
  top: -40,
  /** 下巴 */
  chin: -32.4,
  /** 颈根 */
  neck: -30,
  /** 肩线 */
  shoulderY: -28,
  shoulderW: 4.3,
  /** 胸腔底 / 腰 */
  waistY: -21.5,
  waistW: 2.7,
  /** 胯 */
  hipY: -17.5,
  hipW: 3.4,
  upperArm: 6.4,
  foreArm: 6.0,
  thigh: 8.0,
  shin: 7.6,
  headR: 3.5,
  limbW: 3.1,
};

interface Pose {
  aF: number; aFb: number;
  lF: number; lFb: number;
  lean: number;
  crouch: number;
  exF: number; exL: number;
  headDx: number;
  elbow: number;
  knee: number;
}

const P = (o: Partial<Pose> = {}): Pose => ({
  aF: 0.28, aFb: -0.2, elbow: 0.42,
  lF: 0.08, lFb: -0.08, knee: 0.16,
  lean: 0, crouch: 0, exF: 0, exL: 0, headDx: 0,
  ...o,
});

function poseOf(f: Fighter): Pose {
  const t = f.stateT;
  const ph = f.anim;

  switch (f.state) {
    case 'idle': {
      const b = Math.sin(ph * 0.075);
      return P({
        aF: 0.3 + b * 0.09, aFb: -0.22 - b * 0.09, elbow: 0.5 + b * 0.06,
        lF: 0.1, lFb: -0.1, knee: 0.14, crouch: b * 0.35,
      });
    }
    case 'walk': {
      const k = Math.floor(ph / 7) % 4;
      const s = [0.72, 0.16, -0.72, -0.16][k]!;
      return P({
        aF: -s * 0.52, aFb: s * 0.52, elbow: 0.34,
        lF: s, lFb: -s, knee: 0.2 + Math.abs(s) * 0.5,
        lean: 0.1, crouch: 0.5,
      });
    }
    case 'air':
      return P({ aF: -0.55, aFb: 0.45, elbow: 0.8, lF: 0.8, lFb: -0.45, knee: 0.9, crouch: -0.8 });
    case 'attack': {
      const d = f.atk?.def;
      const total = d ? d.startup + d.active + d.recover : 20;
      const k = clamp(t / total, 0, 1);
      const ext = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
      if (!d) return P();
      switch (d.id) {
        case 'punch':
        case 'elbow':
          return P({
            aF: 1.0, exF: ext * 1.05, elbow: 0.85 - ext * 0.72, aFb: -0.65,
            lF: 0.16, lFb: -0.18, knee: 0.24, lean: 0.26 * ext, crouch: 0.7,
          });
        case 'kick':
          return P({
            lF: 1.22, exL: ext * 1.15, knee: 0.9 - ext * 0.75,
            aF: 0.05, aFb: -0.85, elbow: 0.75, lean: -0.16, crouch: 1.0,
          });
        case 'uppercut':
          return P({
            aF: -1.45 - ext * 0.9, exF: ext * 0.75, elbow: 0.25, aFb: -0.6,
            lF: 0.16, lFb: -0.18, knee: 0.3, lean: 0.32, crouch: 1.1,
          });
        case 'roundhouse':
          return P({
            lF: 1.42, exL: ext * 1.2, knee: 1.0 - ext * 0.85,
            aF: -0.35, aFb: 0.55, elbow: 0.95, lean: -0.3, crouch: 0.8,
          });
        case 'jumpKick':
          return P({
            lF: 1.42, exL: ext * 1.2, knee: 0.95 - ext * 0.8,
            aF: -0.85, aFb: 0.75, elbow: 0.7, crouch: -0.7,
          });
        case 'spinKick':
        case 'super': {
          const spin = ph * 0.55;
          return P({
            aF: Math.sin(spin) * 1.25, aFb: Math.sin(spin + Math.PI) * 1.25, elbow: 0.25,
            lF: Math.cos(spin) * 0.95, lFb: Math.cos(spin + Math.PI) * 0.95, knee: 0.5,
          });
        }
        case 'knee':
        case 'headbutt':
          return P({
            aF: 0.85, aFb: 0.85, elbow: 1.15,
            lF: 1.0, lFb: -0.2, knee: 1.1, lean: 0.18, crouch: 1.0,
          });
        default:
          return P({ exF: ext });
      }
    }
    case 'super': {
      const spin = ph * 0.62;
      return P({
        aF: Math.sin(spin) * 1.45, aFb: Math.sin(spin + Math.PI) * 1.45, elbow: 0.2,
        lF: Math.cos(spin) * 1.1, lFb: Math.cos(spin + Math.PI) * 1.1, knee: 0.4, crouch: -1.2,
      });
    }
    case 'hurt':
      return P({
        aF: -0.85, aFb: -0.45, elbow: 0.55,
        lF: -0.28, lFb: 0.32, knee: 0.3, lean: -0.4, headDx: -1.4, crouch: 0.5,
      });
    case 'down':
      return P({ aF: 1.45, aFb: 1.45, elbow: 0.3, lF: 1.35, lFb: 1.15, knee: 0.5, crouch: 7.5 });
    case 'getup':
      return P({ aF: 0.75, aFb: -0.55, elbow: 0.6, lF: 0.45, lFb: -0.28, knee: 0.8, crouch: 4.2 - t * 0.24 });
    case 'grab':
      return P({ aF: 1.42, aFb: 1.42, elbow: 0.85, lF: 0.2, lFb: -0.22, knee: 0.24, lean: 0.18 });
    case 'grabbed':
      return P({ aF: 1.0, aFb: 1.0, elbow: 0.95, lF: 0.26, lFb: -0.26, knee: 0.4, lean: -0.18, crouch: 0.9 });
    case 'thrown': {
      const spin = ph * 0.4;
      return P({
        aF: Math.sin(spin) * 1.15, aFb: Math.sin(spin + Math.PI) * 1.15, elbow: 0.3,
        lF: Math.cos(spin) * 0.85, lFb: Math.cos(spin + Math.PI) * 0.85, knee: 0.6,
      });
    }
    case 'dead':
      return P({ crouch: 6.5 });
    default:
      return P();
  }
}

/* ================= 绘图部件 ================= */

/** 锥形肢体：从根部到末端逐段收细，比等宽线条有型得多 */
function taperedLimb(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, a1: number, a2: number,
  l1: number, l2: number,
  w0: number, w1: number, w2: number,
  base: string, extend: number, dark: boolean,
): { hx: number; hy: number } {
  const kx = x0 + Math.sin(a1) * l1;
  const ky = y0 + Math.cos(a1) * l1;
  const l2e = l2 * (1 + extend * 0.5);
  const ex = kx + Math.sin(a1 + a2) * l2e;
  const ey = ky + Math.cos(a1 + a2) * l2e;

  const col = dark ? shade(base, -0.16) : base;
  const top = Math.min(y0, ey) - 1;
  const bot = Math.max(y0, ey) + 1;
  const grad = vGrad(ctx, top, bot, col);

  // 关节球：让转折处不出现缺口
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x0, y0, w0 * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(kx, ky, w1 * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.34)';
  ctx.lineWidth = w0 + 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = grad;
  ctx.lineWidth = w0;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.lineWidth = w1;
  ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(ex, ey); ctx.stroke();

  // 高光：沿上缘一条细亮边
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = Math.max(0.5, w0 * 0.26);
  ctx.beginPath();
  ctx.moveTo(x0 - w0 * 0.2, y0 - w0 * 0.2);
  ctx.lineTo(kx - w0 * 0.2, ky - w0 * 0.2);
  ctx.lineTo(ex - w0 * 0.22, ey - w0 * 0.22);
  ctx.stroke();
  void w2;
  return { hx: ex, hy: ey };
}

/** 脚：脚掌 + 脚跟，不是圆头 */
function drawFoot(
  ctx: CanvasRenderingContext2D, x: number, y: number, dir: number,
  base: string, lift: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  const g = vGrad(ctx, -3.0, 0.7, shade(base, -0.3));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-2.3, 0.2);
  ctx.quadraticCurveTo(-2.6, -2.0 - lift, -0.5, -2.5 - lift);
  ctx.lineTo(3.4, -2.3 - lift);
  ctx.quadraticCurveTo(4.5, -1.8 - lift, 4.1, -0.1);
  ctx.lineTo(3.8, 0.4);
  ctx.lineTo(-2.3, 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.55;
  ctx.stroke();
  // 鞋面高光
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(-0.3, -2.1 - lift, 3.2, 0.6);
  ctx.restore();
  void dir;
}

/**
 * 躯干：肩 → 胸 → 腰 → 胯，一笔连成，靠宽度变化出体积。
 * 这是"看着有型"的关键——等宽的方板一眼就廉价。
 */
function torso(
  ctx: CanvasRenderingContext2D,
  hipY: number, waistY: number, shY: number, neckY: number,
  hipW: number, waistW: number, shW: number,
  lean: number, top: string, bottom: string, skin: string,
): void {
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(lean * 0.42);

  // 胯 → 腰 → 肩 的整体轮廓
  ctx.beginPath();
  ctx.moveTo(-hipW, 0);
  ctx.bezierCurveTo(-waistW - 0.1, -1.5, -waistW, waistY - hipY + 1.5, -shW, shY - hipY);
  ctx.quadraticCurveTo(0, shY - hipY - 1.6, shW, shY - hipY);
  ctx.bezierCurveTo(waistW, waistY - hipY + 1.5, waistW + 0.1, -1.5, hipW, 0);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, shY - hipY - 2, 1, top);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // 锁骨窝：胸肌之间的浅阴影，让上半身不是一块平板
  const chestY = shY - hipY + 2.4;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, chestY, shW * 0.55, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 背心下摆
  const hemY = waistY - hipY + 1.2;
  ctx.fillStyle = shade(top, -0.3);
  ctx.beginPath();
  ctx.moveTo(-waistW - 0.3, hemY);
  ctx.quadraticCurveTo(0, hemY + 0.9, waistW + 0.3, hemY);
  ctx.lineTo(waistW + 0.2, hemY + 1.1);
  ctx.quadraticCurveTo(0, hemY + 2.0, -waistW - 0.2, hemY + 1.1);
  ctx.closePath();
  ctx.fill();

  // 腰带
  ctx.fillStyle = vGrad(ctx, hemY + 0.8, hemY + 2.6, bottom);
  ctx.beginPath();
  ctx.roundRect(-hipW - 0.2, hemY + 1.0, (hipW + 0.2) * 2, 1.7, 0.7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.45;
  ctx.stroke();
  // 带扣
  ctx.fillStyle = shade(bottom, 0.35);
  ctx.fillRect(-0.7, hemY + 1.15, 1.4, 1.4);

  // 脖子
  ctx.fillStyle = vGrad(ctx, neckY - hipY, shY - hipY + 1, skin);
  ctx.beginPath();
  ctx.moveTo(-1.5, neckY - hipY);
  ctx.lineTo(1.5, neckY - hipY);
  ctx.lineTo(1.75, shY - hipY + 1.4);
  ctx.lineTo(-1.75, shY - hipY + 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(-1.6, shY - hipY + 0.2, 3.4, 0.9);

  ctx.restore();
}

/** 头：颅骨 + 下颌 + 耳 + 发型 + 五官 */
function head(
  ctx: CanvasRenderingContext2D,
  hx: number, hy: number, lean: number,
  pal: Fighter['pal'], style: string,
): void {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean * 0.32);

  const r = SK.headR;
  // hy 是头心。颅顶 = hy - r*1.15，下巴 = hy + r*1.25
  const topY = -r * 1.15;
  const botY = r * 1.25;

  // 脸型：上宽下窄，带一点方下颌，不是纯圆
  ctx.beginPath();
  ctx.moveTo(-r * 0.92, -r * 0.15);
  ctx.bezierCurveTo(-r * 0.95, topY + 0.2, r * 0.95, topY + 0.2, r * 0.92, -r * 0.15);
  ctx.bezierCurveTo(r * 0.9, r * 0.5, r * 0.52, botY, 0, botY);
  ctx.bezierCurveTo(-r * 0.52, botY, -r * 0.9, r * 0.5, -r * 0.92, -r * 0.15);
  ctx.closePath();

  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.5, r * 0.15, 0, r * 0.1, r * 1.5);
  g.addColorStop(0, shade(pal.skin, 0.18));
  g.addColorStop(0.62, pal.skin);
  g.addColorStop(1, shade(pal.skin, -0.22));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.lineWidth = 0.55;
  ctx.stroke();

  // 下颌投影
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.1, r * 0.95, r * 0.95, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // 颧骨高光
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.2, r * 0.42, r * 0.3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 耳
  ctx.fillStyle = shade(pal.skin, -0.1);
  ctx.beginPath();
  ctx.ellipse(-r * 0.92, r * 0.05, r * 0.2, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  drawHair(ctx, style, r, pal.hair, pal.skin, shade(pal.skin, 0.1));

  // 五官
  ctx.fillStyle = 'rgba(18,14,22,0.9)';
  ctx.beginPath();
  ctx.ellipse(r * 0.38, -r * 0.02, r * 0.15, r * 0.19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(r * 0.42, -r * 0.08, r * 0.05, 0, Math.PI * 2);
  ctx.fill();
  // 眉
  ctx.strokeStyle = pal.hair;
  ctx.lineWidth = r * 0.17;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.06, -r * 0.42);
  ctx.lineTo(r * 0.66, -r * 0.3);
  ctx.stroke();
  // 鼻 + 嘴
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(r * 0.5, r * 0.16);
  ctx.lineTo(r * 0.66, r * 0.24);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(110,52,44,0.55)';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(r * 0.2, r * 0.58);
  ctx.lineTo(r * 0.58, r * 0.55);
  ctx.stroke();

  ctx.restore();
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  style: string, r: number, color: string, skin: string, skinHi: string,
): void {
  const g = ctx.createLinearGradient(0, -r * 1.5, 0, r * 0.6);
  g.addColorStop(0, shade(color, 0.26));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, -0.18));

  switch (style) {
    case 'bald':
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, -r * 0.55, r * 0.4, r * 0.22, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'short':
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, r * 0.05);
      ctx.bezierCurveTo(-r * 1.05, -r * 1.25, r * 0.6, -r * 1.45, r * 0.98, -r * 0.4);
      ctx.bezierCurveTo(r * 0.7, -r * 0.72, -r * 0.4, -r * 0.6, -r * 0.95, r * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bowl':
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 1.05, r * 0.35);
      ctx.bezierCurveTo(-r * 1.2, -r * 1.4, r * 0.9, -r * 1.55, r * 1.05, -r * 0.3);
      ctx.bezierCurveTo(r * 0.9, -r * 0.62, -r * 0.5, -r * 0.5, -r * 1.05, r * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    case 'slick':
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, r * 0.0);
      ctx.bezierCurveTo(-r * 1.15, -r * 1.35, r * 0.75, -r * 1.5, r * 1.05, -r * 0.45);
      ctx.bezierCurveTo(r * 0.55, -r * 0.95, -r * 0.45, -r * 0.7, -r * 1.0, r * 0.0);
      ctx.closePath();
      ctx.fill();
      break;
    case 'mohawk': {
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 0.34, -r * 0.95);
      ctx.quadraticCurveTo(-r * 0.1, -r * 2.5, r * 0.42, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.05, -r * 1.25, -r * 0.34, -r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, r * 0.02);
      ctx.bezierCurveTo(-r * 1.0, -r * 1.2, r * 0.6, -r * 1.35, r * 0.98, -r * 0.42);
      ctx.bezierCurveTo(r * 0.6, -r * 0.7, -r * 0.4, -r * 0.55, -r * 0.95, r * 0.02);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bandana':
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 1.02, -r * 0.1);
      ctx.lineTo(-r * 0.98, -r * 0.62);
      ctx.quadraticCurveTo(0, -r * 1.25, r * 1.0, -r * 0.55);
      ctx.lineTo(r * 1.02, -r * 0.05);
      ctx.bezierCurveTo(r * 0.4, -r * 0.3, -r * 0.4, -r * 0.3, -r * 1.02, -r * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.98, -r * 0.35);
      ctx.lineTo(-r * 1.75, -r * 0.05);
      ctx.lineTo(-r * 0.95, r * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    case 'long':
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-r * 1.05, r * 1.8);
      ctx.bezierCurveTo(-r * 1.25, -r * 1.35, r * 0.85, -r * 1.5, r * 1.0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.95, -r * 0.6, -r * 0.6, -r * 0.5, -r * 1.05, r * 1.8);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      break;
  }
  void skin; void skinHi;
}

/* ================= 武器 ================= */

function drawWeaponInHand(
  ctx: CanvasRenderingContext2D, hx: number, hy: number, ang: number, id: WeaponId,
): void {
  if (id === 'fist') return;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang * 0.55);
  ctx.lineCap = 'round';

  const metal = (c: string): CanvasGradient => {
    const g = ctx.createLinearGradient(0, -3, 0, 3);
    g.addColorStop(0, shade(c, 0.32));
    g.addColorStop(0.45, c);
    g.addColorStop(1, shade(c, -0.28));
    return g;
  };
  const outline = (w: number): void => {
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = w;
    ctx.stroke();
  };

  switch (id) {
    case 'bat':
      ctx.beginPath(); ctx.moveTo(0.4, 0.6); ctx.lineTo(17.6, -1.6);
      outline(4.0);
      ctx.strokeStyle = metal('#c88a4a');
      ctx.lineWidth = 2.7;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(17, -2.2);
      ctx.stroke();
      break;
    case 'knife':
      ctx.beginPath();
      ctx.moveTo(-0.4, -1.0); ctx.lineTo(9.6, -2.1); ctx.lineTo(9.6, 1.4); ctx.lineTo(-0.4, 1.6);
      ctx.closePath();
      outline(0.9);
      ctx.fillStyle = metal('#d8d8e0');
      ctx.fill();
      break;
    case 'whip':
      ctx.beginPath(); ctx.moveTo(0.3, 0.4);
      ctx.quadraticCurveTo(14, -7, 27, -2);
      outline(2.4);
      ctx.strokeStyle = metal('#8a4a2a');
      ctx.lineWidth = 1.1;
      ctx.stroke();
      break;
    case 'rock':
      ctx.beginPath(); ctx.ellipse(3, 0.5, 5, 4.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, 0, 4.5, 4.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = metal('#9a9a92'); ctx.fill();
      break;
    case 'barrel':
      ctx.beginPath(); ctx.roundRect(-0.4, -6.6, 10, 13, 2.2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
      ctx.beginPath(); ctx.roundRect(0, -7, 9, 13, 2.2);
      ctx.fillStyle = metal('#3a7a4a'); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(0.7, -6, 7.6, 1.2);
      break;
    case 'dynamite':
      ctx.beginPath(); ctx.roundRect(-0.3, -5.6, 6, 11, 1.5);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
      ctx.beginPath(); ctx.roundRect(0, -6.2, 5, 11, 1.5);
      ctx.fillStyle = metal('#c83a2a'); ctx.fill();
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(2, -6.2);
      ctx.quadraticCurveTo(7.5, -9, 5, -11.2); ctx.stroke();
      break;
  }
  ctx.restore();
}

/* ================= 主绘制 ================= */

export interface DrawOpts {
  camX: number;
  weapon?: WeaponId;
  isPlayer?: boolean;
  glow?: boolean;
}

export function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, o: DrawOpts): void {
  const sx = Math.round(f.x - o.camX);
  if (sx < -60 || sx > 320) return;

  const depthT = f.band / 2;
  const s = f.scale * (0.86 + depthT * 0.18);
  const sy = Math.round(f.y);

  const po = poseOf(f);
  const cr = po.crouch;
  const hipY = (SK.hipY + cr) * s;
  const waistY = (SK.waistY + cr) * s;
  const shY = (SK.shoulderY + cr) * s;
  const neckY = (SK.neck + cr) * s;
  const headY = (SK.chin - SK.headR * 1.2 + cr * 0.85) * s;
  const shW = SK.shoulderW * s;
  const waistW = SK.waistW * s;
  const hipW = SK.hipW * s;

  const pal = f.flash > 0 && f.flash % 4 < 2
    ? { ...f.pal, skin: '#ffffff', skin2: '#ffe0e0', top: '#ffffff', bottom: '#ffffff', hair: '#ffffff' }
    : f.pal;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(f.facing * s, s);

  /* --- 接地软阴影 --- */
  const sw = 7.6 * (1 + depthT * 0.16);
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, sw);
  sh.addColorStop(0, 'rgba(0,0,0,0.44)');
  sh.addColorStop(0.55, 'rgba(0,0,0,0.2)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.save();
  ctx.scale(1, 0.3);
  ctx.beginPath(); ctx.arc(0, 0, sw, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  if (o.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(0, headY * 0.8, 2, 0, headY * 0.8, 22);
    gl.addColorStop(0, 'rgba(255,200,90,0.32)');
    gl.addColorStop(1, 'rgba(255,160,40,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(0, headY * 0.8, 22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 站姿微开胯，避免两条腿并成一根柱子
  const stance = po.crouch < 0.4 ? 0.55 : 0.2;
  const upperW = SK.limbW * 1.18;
  const foreW = SK.limbW * 0.92;
  const thighW = SK.limbW * 1.3;
  const shinW = SK.limbW * 0.95;
  const footLift = f.inAir ? 0.6 : 0;

  /* --- 后腿 --- */
  const legB = taperedLimb(
    ctx, -stance * s, hipY, po.lFb, -po.knee * 0.5,
    SK.thigh * s, SK.shin * s, thighW, shinW, shinW,
    pal.bottom, 0, true,
  );
  drawFoot(ctx, legB.hx, legB.hy, f.facing, shade(pal.bottom, -0.3), footLift);

  /* --- 后臂（含三角肌）--- */
  const shBx = -Math.sin(po.lean) * 1.4;
  ctx.fillStyle = vGrad(ctx, shY - 1, shY + 2.4, shade(pal.skin2, -0.16));
  ctx.beginPath(); ctx.arc(shBx, shY, upperW * 0.82, 0, Math.PI * 2); ctx.fill();
  taperedLimb(
    ctx, shBx, shY, po.aFb, -0.3,
    SK.upperArm * s, SK.foreArm * s, upperW * 0.92, foreW * 0.9, foreW * 0.9,
    pal.skin2, 0, true,
  );

  /* --- 躯干 --- */
  torso(ctx, hipY, waistY, shY, neckY, hipW, waistW, shW, po.lean, pal.top, pal.bottom, pal.skin);

  /* --- 前腿 --- */
  const legF = taperedLimb(
    ctx, stance * s * 0.3, hipY, po.lF, -po.knee * 0.5,
    SK.thigh * s, SK.shin * s, thighW, shinW, shinW,
    pal.bottom, po.exL, false,
  );
  drawFoot(ctx, legF.hx, legF.hy, f.facing, shade(pal.bottom, -0.12), footLift);

  /* --- 头 --- */
  head(ctx, Math.sin(po.lean) * 3.0 + po.headDx, headY, po.lean, pal, f.hair);

  /* --- 前臂 --- */
  const shFx = Math.sin(po.lean) * 1.4;
  ctx.fillStyle = vGrad(ctx, shY - 1, shY + 2.4, pal.skin);
  ctx.beginPath(); ctx.arc(shFx, shY, upperW * 0.9, 0, Math.PI * 2); ctx.fill();
  const armF = taperedLimb(
    ctx, shFx, shY, po.aF, po.elbow,
    SK.upperArm * s, SK.foreArm * s, upperW, foreW, foreW,
    pal.skin, po.exF, false,
  );

  if (o.weapon) {
    drawWeaponInHand(ctx, armF.hx, armF.hy, po.aF, o.weapon);
  } else {
    // 拳头：带指节高光，出拳方向一眼看清
    const fg = ctx.createRadialGradient(armF.hx - 0.7, armF.hy - 0.8, 0.2, armF.hx, armF.hy, 2.3);
    fg.addColorStop(0, shade(pal.skin, 0.24));
    fg.addColorStop(1, shade(pal.skin, -0.14));
    ctx.beginPath(); ctx.arc(armF.hx, armF.hy, 2.0, 0, Math.PI * 2);
    ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.34)';
    ctx.lineWidth = 0.45; ctx.stroke();
  }

  ctx.restore();
}

/** 命中特效：柔光 + 放射线 */
export function drawHitFlash(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number, dir: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.globalCompositeOperation = 'lighter';

  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
  core.addColorStop(0, 'rgba(255,255,255,0.92)');
  core.addColorStop(0.32, 'rgba(255,214,130,0.58)');
  core.addColorStop(1, 'rgba(255,130,50,0)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(255,240,190,0.55)';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = -0.6 + i * 0.3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * size * 0.3, Math.sin(a) * size * 0.3);
    ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
    ctx.stroke();
  }
  ctx.restore();
}
