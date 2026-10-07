/**
 * 角色渲染 —— 现代 2D 风格，不再是马赛克。
 *
 * 逻辑坐标仍是 256x240 的世界单位（游戏手感完全不受影响），
 * 但画布按 4 倍分辨率绘制并开启抗锯齿，所以：
 *   · 地面阴影是软边椭圆，不是一块黑
 *   · 肢体和躯干带垂直渐变（上亮下暗 = 光从上方来）
 *   · 朝向一侧有轮廓光（rim light），角色从背景里"浮"出来
 *   · 头发/衣服是一整块形状，不再是像素拼贴
 *
 * 姿态系统没变：每个姿态只描述手肘/膝盖的角度，渲染时按角度算关节位置。
 */

import { clamp } from '../core/math';
import type { Fighter } from '../entities/Fighter';
import type { WeaponId } from '../data/weapons';
import { shade, vGrad } from './util';

/* 比例：整体放大 + 肢体加粗。
 * 之前 3.0 宽的肢体在 256 宽的屏幕上细得像面条，缩小到手机上更明显。 */
const SK = {
  hipY: -13,
  shY: -23,
  headY: -30,
  headR: 5.2,
  upperArm: 6.8,
  foreArm: 6.6,
  thigh: 7.4,
  shin: 7.4,
  limbW: 4.0,
};

interface Pose {
  aF: number; aFb: number;
  /** 前臂的肘部弯曲量（弧度） */
  elbow: number;
  lF: number; lFb: number;
  lean: number;
  crouch: number;
  exF: number; exL: number;
  headDx: number;
}

const P = (o: Partial<Pose> = {}): Pose => ({
  aF: 0.30, aFb: -0.22, elbow: 0.45, lF: 0.10, lFb: -0.10,
  lean: 0, crouch: 0, exF: 0, exL: 0, headDx: 0,
  ...o,
});

function poseOf(f: Fighter): Pose {
  const t = f.stateT;
  const ph = f.anim;

  switch (f.state) {
    case 'idle': {
      const b = Math.sin(ph * 0.08) * 0.5;
      return P({ aF: 0.34 + b * 0.1, aFb: -0.24 - b * 0.1, elbow: 0.5, lF: 0.12, lFb: -0.12, crouch: b * 0.2 });
    }
    case 'walk': {
      const k = Math.floor(ph / 7) % 4;
      const s = [0.7, 0.15, -0.7, -0.15][k]!;
      return P({ aF: -s * 0.55, aFb: s * 0.55, elbow: 0.35, lF: s, lFb: -s, lean: 0.12, crouch: 0.4 });
    }
    case 'air':
      return P({ aF: -0.6, aFb: 0.5, elbow: 0.9, lF: 0.75, lFb: -0.5, crouch: -0.6 });
    case 'attack': {
      const d = f.atk?.def;
      const total = d ? d.startup + d.active + d.recover : 20;
      const k = clamp(t / total, 0, 1);
      const ext = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
      if (!d) return P();
      switch (d.id) {
        case 'punch':
        case 'elbow':
          return P({ aF: 1.05, exF: ext * 1.1, elbow: 0.75 - ext * 0.6, aFb: -0.7, lF: 0.2, lFb: -0.2, lean: 0.3 * ext, crouch: 0.5 });
        case 'kick':
          return P({ lF: 1.3, exL: ext * 1.2, aF: 0.1, elbow: 0.8, aFb: -0.9, lean: -0.2, crouch: 0.8 });
        case 'uppercut':
          return P({ aF: -1.5 - ext, exF: ext * 0.8, elbow: 0.3, aFb: -0.6, lF: 0.2, lFb: -0.2, lean: 0.35, crouch: 0.9 });
        case 'roundhouse':
          return P({ lF: 1.5, exL: ext * 1.3, aF: -0.4, aFb: 0.6, lean: -0.35, crouch: 0.6 });
        case 'jumpKick':
          return P({ lF: 1.5, exL: ext * 1.3, aF: -0.9, elbow: 0.7, aFb: 0.8, crouch: -0.5 });
        case 'spinKick':
        case 'super': {
          const spin = ph * 0.55;
          return P({
            aF: Math.sin(spin) * 1.3, aFb: Math.sin(spin + Math.PI) * 1.3,
            lF: Math.cos(spin) * 1.0, lFb: Math.cos(spin + Math.PI) * 1.0,
          });
        }
        case 'knee':
        case 'headbutt':
          return P({ aF: 0.9, aFb: 0.9, elbow: 1.2, lF: 1.1, lFb: -0.2, lean: 0.2, crouch: 0.8 });
        default:
          return P({ exF: ext });
      }
    }
    case 'super': {
      const spin = ph * 0.62;
      return P({
        aF: Math.sin(spin) * 1.5, aFb: Math.sin(spin + Math.PI) * 1.5,
        lF: Math.cos(spin) * 1.2, lFb: Math.cos(spin + Math.PI) * 1.2,
        crouch: -1,
      });
    }
    case 'hurt':
      return P({ aF: -0.9, aFb: -0.5, elbow: 0.6, lF: -0.3, lFb: 0.35, lean: -0.45, headDx: -1.5 });
    case 'down':
      return P({ aF: 1.5, aFb: 1.5, lF: 1.4, lFb: 1.2, crouch: 6 });
    case 'getup':
      return P({ aF: 0.8, aFb: -0.6, lF: 0.5, lFb: -0.3, crouch: 3.2 - t * 0.2 });
    case 'grab':
      return P({ aF: 1.5, aFb: 1.5, elbow: 0.9, lF: 0.25, lFb: -0.25, lean: 0.2 });
    case 'grabbed':
      return P({ aF: 1.1, aFb: 1.1, elbow: 1.0, lF: 0.3, lFb: -0.3, lean: -0.2, crouch: 0.8 });
    case 'thrown': {
      const spin = ph * 0.4;
      return P({
        aF: Math.sin(spin) * 1.2, aFb: Math.sin(spin + Math.PI) * 1.2,
        lF: Math.cos(spin) * 0.9, lFb: Math.cos(spin + Math.PI) * 0.9,
      });
    }
    case 'dead':
      return P({ crouch: 5 });
    default:
      return P();
  }
}

/* ---------------- 肢体 ---------------- */

/**
 * 两段肢体（上臂+前臂 / 大腿+小腿）。
 * 用描边 + 渐变，端点圆头，看起来是有体积的锥形而不是火柴棍。
 */
function limb(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, a1: number, a2: number,
  l1: number, l2: number, w: number, base: string, extend: number, dark: boolean,
): void {
  const kx = x0 + Math.sin(a1) * l1;
  const ky = y0 + Math.cos(a1) * l1;
  const l2e = l2 * (1 + extend * 0.55);
  const ex = kx + Math.sin(a1 + a2) * l2e;
  const ey = ky + Math.cos(a1 + a2) * l2e;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 底部投影：让肢体和身体之间有缝隙
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = w + 1.6;
  ctx.beginPath();
  ctx.moveTo(x0 + 0.5, y0 + 0.6); ctx.lineTo(kx + 0.5, ky + 0.6); ctx.lineTo(ex + 0.5, ey + 0.6);
  ctx.stroke();

  // 主体
  const g = vGrad(ctx, Math.min(y0, ey) - 1, Math.max(y0, ey) + 1, dark ? shade(base, -0.12) : base);
  ctx.strokeStyle = g;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.lineTo(ex, ey);
  ctx.stroke();

  // 高光：朝上一侧的一条细亮边
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = w * 0.32;
  ctx.beginPath();
  ctx.moveTo(x0 - w * 0.22, y0 - w * 0.2);
  ctx.lineTo(kx - w * 0.22, ky - w * 0.2);
  ctx.lineTo(ex - w * 0.22, ey - w * 0.2);
  ctx.stroke();
}

/* ---------------- 躯干 ---------------- */

function torso(
  ctx: CanvasRenderingContext2D, hipY: number, shY: number, lean: number, top: string, bottom: string,
): void {
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(lean * 0.5);

  const topY = shY - hipY;
  const w = 4.6;

  // 上衣：圆角梯形
  ctx.beginPath();
  ctx.moveTo(-w, topY + 1);
  ctx.quadraticCurveTo(-w - 0.4, topY + 3.2, -w + 0.5, topY + 6.5);
  ctx.lineTo(w - 0.5, topY + 6.5);
  ctx.quadraticCurveTo(w + 0.4, topY + 3.2, w, topY + 1);
  ctx.quadraticCurveTo(0, topY - 1.4, -w, topY + 1);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, topY - 2, topY + 8, top);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // 裤子腰带
  ctx.beginPath();
  ctx.roundRect(-w - 0.2, topY + 6.2, (w + 0.2) * 2, 2.6, 1.1);
  ctx.fillStyle = vGrad(ctx, topY + 6, topY + 9, bottom);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.6;
  ctx.stroke();

  ctx.restore();
}

/* ---------------- 头 ---------------- */

function head(
  ctx: CanvasRenderingContext2D,
  hx: number, hy: number, lean: number,
  pal: Fighter['pal'], style: string,
): void {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean * 0.35);

  const r = SK.headR;

  // 脖子
  ctx.fillStyle = shade(pal.skin2, -0.1);
  ctx.beginPath();
  ctx.roundRect(-1.5, r * 0.5, 3, 3.4, 1.2);
  ctx.fill();

  // 脸：偏心径向渐变，光从左上
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.2, 0, 0, r * 1.15);
  g.addColorStop(0, shade(pal.skin, 0.16));
  g.addColorStop(0.7, pal.skin);
  g.addColorStop(1, shade(pal.skin, -0.2));
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // 下巴阴影
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, r * 0.75, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawHair(ctx, style, r, pal.hair, pal.skin2);

  // 五官（朝前）
  ctx.fillStyle = 'rgba(20,16,24,0.88)';
  ctx.beginPath();
  ctx.ellipse(r * 0.34, -r * 0.08, 0.62, 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  // 眉
  ctx.strokeStyle = pal.hair;
  ctx.lineWidth = 0.75;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.06, -r * 0.5);
  ctx.lineTo(r * 0.62, -r * 0.38);
  ctx.stroke();
  // 嘴
  ctx.strokeStyle = 'rgba(90,40,35,0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(r * 0.22, r * 0.44);
  ctx.lineTo(r * 0.6, r * 0.42);
  ctx.stroke();

  ctx.restore();
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  style: string, r: number, color: string, skinShade: string,
): void {
  const g = ctx.createLinearGradient(0, -r * 1.2, 0, r * 0.4);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(1, shade(color, -0.1));
  ctx.fillStyle = style === 'bald' ? skinShade : g;

  switch (style) {
    case 'bald':
      // 光头：只留一点高光
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, -r * 0.5, r * 0.42, r * 0.24, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
      break;
    case 'short':
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 1.02, Math.PI * 1.02, Math.PI * 2.05);
      ctx.lineTo(r * 0.9, r * 0.05);
      ctx.lineTo(-r * 0.85, r * 0.02);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bowl':
      ctx.beginPath();
      ctx.arc(0, -r * 0.2, r * 1.14, Math.PI * 0.96, Math.PI * 2.1);
      ctx.lineTo(r * 1.05, r * 0.55);
      ctx.lineTo(-r * 1.0, r * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'slick':
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, -r * 0.5, r * 1.15, r * 0.62, -0.32, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mohawk':
      ctx.beginPath();
      ctx.moveTo(-r * 0.22, -r * 0.72);
      ctx.quadraticCurveTo(0, -r * 2.05, r * 0.3, -r * 0.66);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.92, Math.PI * 1.05, Math.PI * 2);
      ctx.fill();
      break;
    case 'bandana':
      ctx.beginPath();
      ctx.roundRect(-r * 1.02, -r * 0.62, r * 2.04, r * 0.78, 0.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, -r * 0.5);
      ctx.lineTo(-r * 1.75, -r * 0.1);
      ctx.lineTo(-r * 0.98, r * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    case 'long':
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 1.06, Math.PI * 1.0, Math.PI * 2.08);
      ctx.lineTo(r * 1.02, r * 1.5);
      ctx.lineTo(-r * 0.55, r * 1.6);
      ctx.lineTo(-r * 1.0, r * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      break;
  }
}

/* ---------------- 武器 ---------------- */

function drawWeaponInHand(
  ctx: CanvasRenderingContext2D,
  hx: number, hy: number, ang: number, id: WeaponId,
): void {
  if (id === 'fist') return;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang * 0.6);
  ctx.lineCap = 'round';

  const metal = (c: string) => {
    const g = ctx.createLinearGradient(0, -3, 0, 3);
    g.addColorStop(0, shade(c, 0.3));
    g.addColorStop(0.5, c);
    g.addColorStop(1, shade(c, -0.25));
    return g;
  };

  switch (id) {
    case 'bat':
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(0.4, 0.6); ctx.lineTo(17.4, -1.4); ctx.stroke();
      ctx.strokeStyle = metal('#c88a4a');
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(17, -2); ctx.stroke();
      break;
    case 'knife':
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.moveTo(-0.4, -0.9); ctx.lineTo(9.4, -1.9);
      ctx.lineTo(9.4, 1.3); ctx.lineTo(-0.4, 1.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = metal('#d8d8e0');
      ctx.beginPath(); ctx.moveTo(0, -0.6); ctx.lineTo(9, -1.5);
      ctx.lineTo(9, 0.9); ctx.lineTo(0, 1.1); ctx.closePath(); ctx.fill();
      break;
    case 'whip':
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0.3, 0.4);
      ctx.quadraticCurveTo(14, -6.6, 26, -1.6); ctx.stroke();
      ctx.strokeStyle = metal('#8a4a2a');
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(14, -7, 26, -2); ctx.stroke();
      break;
    case 'rock': {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(3, 0.5, 4.6, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = metal('#9a9a92');
      ctx.beginPath(); ctx.ellipse(3, 0, 4.2, 3.9, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'barrel':
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.roundRect(-0.4, -6.2, 10, 12.4, 2); ctx.fill();
      ctx.fillStyle = metal('#3a7a4a');
      ctx.beginPath(); ctx.roundRect(0, -6.6, 9, 12.4, 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(0.6, -5.6, 7.8, 1.1);
      break;
    case 'dynamite':
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.roundRect(-0.3, -5.4, 6, 10.6, 1.4); ctx.fill();
      ctx.fillStyle = metal('#c83a2a');
      ctx.beginPath(); ctx.roundRect(0, -6, 5, 10.6, 1.4); ctx.fill();
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(2, -6);
      ctx.quadraticCurveTo(7, -8.6, 5, -10.6); ctx.stroke();
      break;
  }
  ctx.restore();
}

/* ---------------- 主绘制 ---------------- */

export interface DrawOpts {
  camX: number;
  weapon?: WeaponId;
  isPlayer?: boolean;
  glow?: boolean;
}

export function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, o: DrawOpts): void {
  const sx = Math.round(f.x - o.camX);
  if (sx < -50 || sx > 310) return;

  const depthT = f.band / 2;
  const s = f.scale * (0.86 + depthT * 0.2);
  const sy = Math.round(f.y);

  const pose = poseOf(f);
  const hipY = (SK.hipY + pose.crouch) * s;
  const shY = (SK.shY + pose.crouch) * s;
  const headY = (SK.headY + pose.crouch * 0.8) * s;

  const pal = f.flash > 0 && f.flash % 4 < 2
    ? { ...f.pal, skin: '#ffffff', skin2: '#ffe0e0', top: '#ffffff', bottom: '#ffffff', hair: '#ffffff' }
    : f.pal;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(f.facing * s, s);

  // 地面软阴影（比角色先画，作为接地感）
  const sw = 7.2 * (1 + depthT * 0.18);
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, sw);
  sh.addColorStop(0, 'rgba(0,0,0,0.42)');
  sh.addColorStop(0.6, 'rgba(0,0,0,0.2)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.save();
  ctx.scale(1, 0.34);
  ctx.beginPath();
  ctx.arc(0, 0, sw, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (o.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(0, headY * 0.8, 2, 0, headY * 0.8, 20);
    gl.addColorStop(0, 'rgba(255,200,90,0.30)');
    gl.addColorStop(1, 'rgba(255,160,40,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(0, headY * 0.8, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 轮廓光：只在朝向侧勾一道极细的亮边，把角色从背景里托出来。
  // 整圈画会变成一个突兀的圆环，所以只画朝向侧那一小段。
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = 'rgba(200,220,255,1)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(0, headY, SK.headR + 0.25, -0.75, 0.55);
  ctx.stroke();
  ctx.restore();

  // 后腿 / 后臂（压暗，拉开层次）
  limb(ctx, 0, hipY, pose.lFb, -Math.abs(pose.lFb) * 0.4 + 0.25,
    SK.thigh, SK.shin, SK.limbW, pal.bottom, 0, true);
  limb(ctx, Math.sin(pose.lean) * 2, shY, pose.aFb, -0.35,
    SK.upperArm, SK.foreArm, SK.limbW * 0.92, pal.skin2, 0, true);

  torso(ctx, hipY, shY, pose.lean, pal.top, pal.bottom);

  limb(ctx, 0, hipY, pose.lF, -Math.abs(pose.lF) * 0.4 + 0.25,
    SK.thigh, SK.shin, SK.limbW, pal.bottom, pose.exL, false);

  head(ctx, Math.sin(pose.lean) * 3.2 + pose.headDx, headY, pose.lean, pal, f.hair);

  // 前臂 + 武器
  const shFx = Math.sin(pose.lean) * 2;
  const angF = pose.aF;
  const handX = shFx + Math.sin(angF) * SK.upperArm * (1 + pose.exF * 0.5);
  const handY = shY + Math.cos(angF) * SK.upperArm * (1 + pose.exF * 0.5);
  limb(ctx, shFx, shY, angF, pose.elbow, SK.upperArm, SK.foreArm, SK.limbW, pal.skin, pose.exF, false);
  if (o.weapon) {
    drawWeaponInHand(ctx, handX, handY, angF, o.weapon);
  } else {
    // 空手画个拳头，出拳方向一眼就清楚
    const fg = ctx.createRadialGradient(handX - 0.8, handY - 0.8, 0.3, handX, handY, 2.4);
    fg.addColorStop(0, shade(pal.skin, 0.2));
    fg.addColorStop(1, shade(pal.skin, -0.12));
    ctx.beginPath();
    ctx.arc(handX, handY, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  ctx.restore();
}

/** 命中特效：柔和的光斑 + 放射线，不再是一块硬白 */
export function drawHitFlash(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number, dir: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.globalCompositeOperation = 'lighter';

  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
  core.addColorStop(0, 'rgba(255,255,255,0.9)');
  core.addColorStop(0.35, 'rgba(255,214,130,0.55)');
  core.addColorStop(1, 'rgba(255,130,50,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();

  // 放射线
  ctx.strokeStyle = 'rgba(255,240,190,0.5)';
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = -0.5 + i * 0.34;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * size * 0.3, Math.sin(a) * size * 0.3);
    ctx.lineTo(Math.cos(a) * size * 0.95, Math.sin(a) * size * 0.95);
    ctx.stroke();
  }
  ctx.restore();
}
