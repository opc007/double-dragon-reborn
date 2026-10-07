/**
 * 程序化像素角色渲染。
 *
 * 仓库里没有一张精灵图：所有人都是用线段 + 矩形现画出来的。
 * 做法是"骨架 + 关节角度"——每个姿态只描述手肘/膝盖的角度，
 * 渲染时按角度算出关节位置再描边填充，这样任意组合都能出合理的一帧。
 */

import { clamp } from '../core/math';
import type { Fighter } from '../entities/Fighter';
import type { WeaponId } from '../data/weapons';

const OUTLINE = '#141018';

/* 骨架比例（scale = 1 时约 30px 高） */
const SK = {
  hipY: -11,
  shY: -19,
  headY: -24,
  headR: 4.2,
  upperArm: 6.2,
  foreArm: 6.0,
  thigh: 6.0,
  shin: 6.0,
  limbW: 2.6,
};

interface Pose {
  /** 手臂角度：0 = 垂直下，正 = 向前 */
  aF: number; aFb: number;
  /** 腿角度 */
  lF: number; lFb: number;
  /** 躯干前倾 */
  lean: number;
  /** 整体下蹲（正 = 蹲下） */
  crouch: number;
  /** 前臂/前腿额外伸展 0..1 */
  exF: number; exL: number;
  /** 头部位移 */
  headDx: number;
}

const P = (o: Partial<Pose> = {}): Pose => ({
  aF: 0.30, aFb: -0.22, lF: 0.10, lFb: -0.10, lean: 0, crouch: 0, exF: 0, exL: 0, headDx: 0,
  ...o,
});

/* ---------------- 姿态表 ---------------- */

function poseOf(f: Fighter): Pose {
  const t = f.stateT;
  const ph = f.anim;

  switch (f.state) {
    case 'idle': {
      const b = Math.sin(ph * 0.08) * 0.5;
      return P({ aF: 0.34 + b * 0.1, aFb: -0.24 - b * 0.1, lF: 0.12, lFb: -0.12, crouch: b * 0.2 });
    }
    case 'walk': {
      const k = Math.floor(ph / 7) % 4;
      const s = [0.7, 0.15, -0.7, -0.15][k]!;
      return P({
        aF: -s * 0.55, aFb: s * 0.55,
        lF: s, lFb: -s, lean: 0.12, crouch: 0.4,
      });
    }
    case 'air':
      return P({ aF: -0.6, aFb: 0.5, lF: 0.75, lFb: -0.5, crouch: -0.6 });
    case 'attack': {
      const d = f.atk?.def;
      const total = d ? d.startup + d.active + d.recover : 20;
      const k = clamp(t / total, 0, 1);
      const ext = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
      if (!d) return P();
      switch (d.id) {
        case 'punch':
        case 'elbow':
          return P({ aF: 1.4, exF: ext * 1.1, aFb: -0.7, lF: 0.2, lFb: -0.2, lean: 0.3 * ext, crouch: 0.5 });
        case 'kick':
          return P({ lF: 1.3, exL: ext * 1.2, aF: 0.1, aFb: -0.9, lean: -0.2, crouch: 0.8 });
        case 'uppercut':
          return P({ aF: -1.5 - ext, exF: ext * 0.8, aFb: -0.6, lF: 0.2, lFb: -0.2, lean: 0.35, crouch: 0.9 });
        case 'roundhouse':
          return P({ lF: 1.5, exL: ext * 1.3, aF: -0.4, aFb: 0.6, lean: -0.35, crouch: 0.6 });
        case 'jumpKick':
          return P({ lF: 1.5, exL: ext * 1.3, aF: -0.9, aFb: 0.8, crouch: -0.5 });
        case 'spinKick':
        case 'super': {
          const spin = ph * 0.55;
          return P({
            aF: Math.sin(spin) * 1.3, aFb: Math.sin(spin + Math.PI) * 1.3,
            lF: Math.cos(spin) * 1.0, lFb: Math.cos(spin + Math.PI) * 1.0,
            lean: 0, crouch: 0,
          });
        }
        case 'knee':
        case 'headbutt':
          return P({ aF: 0.9, aFb: 0.9, lF: 1.1, lFb: -0.2, lean: 0.2, crouch: 0.8 });
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
      return P({ aF: -0.9, aFb: -0.5, lF: -0.3, lFb: 0.35, lean: -0.45, headDx: -1.5 });
    case 'down':
      return P({ aF: 1.5, aFb: 1.5, lF: 1.4, lFb: 1.2, lean: 0, crouch: 6 });
    case 'getup':
      return P({ aF: 0.8, aFb: -0.6, lF: 0.5, lFb: -0.3, crouch: 3.2 - t * 0.2 });
    case 'grab':
      return P({ aF: 1.5, aFb: 1.5, lF: 0.25, lFb: -0.25, lean: 0.2 });
    case 'grabbed':
      return P({ aF: 1.1, aFb: 1.1, lF: 0.3, lFb: -0.3, lean: -0.2, crouch: 0.8 });
    case 'thrown': {
      const spin = ph * 0.4;
      return P({
        aF: Math.sin(spin) * 1.2, aFb: Math.sin(spin + Math.PI) * 1.2,
        lF: Math.cos(spin) * 0.9, lFb: Math.cos(spin + Math.PI) * 0.9,
        crouch: 0,
      });
    }
    case 'dead':
      return P({ crouch: 5 });
    default:
      return P();
  }
}

/* ---------------- 绘图原语 ---------------- */

function limb(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, a1: number, a2: number,
  l1: number, l2: number, w: number, fill: string, extend: number,
): void {
  const kx = x0 + Math.sin(a1) * l1;
  const ky = y0 + Math.cos(a1) * l1;
  const l2e = l2 * (1 + extend * 0.55);
  const ex = kx + Math.sin(a1 + a2) * l2e;
  const ey = ky + Math.cos(a1 + a2) * l2e;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w + 1.8;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(kx, ky); ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** 武器画在"前手"末端 */
function drawWeaponInHand(
  ctx: CanvasRenderingContext2D,
  hx: number, hy: number, ang: number, id: WeaponId, flip: number,
): void {
  if (id === 'fist') return;
  const c = Math.cos(ang), s = Math.sin(ang);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang * 0.6);
  ctx.lineCap = 'round';
  switch (id) {
    case 'bat':
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4.4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(17 * flip, -2); ctx.stroke();
      ctx.strokeStyle = '#c88a4a'; ctx.lineWidth = 2.6; ctx.stroke();
      break;
    case 'knife':
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9 * flip, -1); ctx.stroke();
      ctx.strokeStyle = '#e0e0e8'; ctx.lineWidth = 1.6; ctx.stroke();
      break;
    case 'whip': {
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(14 * flip, -7, 26 * flip, -2); ctx.stroke();
      ctx.strokeStyle = '#8a4a2a'; ctx.lineWidth = 1.2; ctx.stroke();
      break;
    }
    case 'rock': {
      ctx.fillStyle = OUTLINE; ctx.fillRect(-1, -5, 9, 9);
      ctx.fillStyle = '#9a9a92'; ctx.fillRect(0, -4, 7, 7);
      break;
    }
    case 'barrel': {
      ctx.fillStyle = OUTLINE; ctx.fillRect(-1, -7, 11, 13);
      ctx.fillStyle = '#3a7a4a'; ctx.fillRect(0, -6, 9, 11);
      ctx.fillStyle = '#8a8a92'; ctx.fillRect(0, -5, 9, 1.5);
      break;
    }
    case 'dynamite': {
      ctx.fillStyle = OUTLINE; ctx.fillRect(-1, -6, 7, 11);
      ctx.fillStyle = '#c83a2a'; ctx.fillRect(0, -5, 5, 9);
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(2, -5); ctx.quadraticCurveTo(7, -9, 5, -11); ctx.stroke();
      break;
    }
  }
  ctx.restore();
  void c; void s;
}

/* ---------------- 主绘制 ---------------- */

export interface DrawOpts {
  /** 相机 X */
  camX: number;
  /** 手上拿的武器 */
  weapon?: WeaponId;
  /** 玩家 / 敌人，用于区分描边色调 */
  isPlayer?: boolean;
  /** 气满时的发光 */
  glow?: boolean;
}

export function drawFighter(
  ctx: CanvasRenderingContext2D,
  f: Fighter,
  o: DrawOpts,
): void {
  const sx = Math.round(f.x - o.camX);
  if (sx < -40 || sx > 300) return;

  // 纵深缩放：越靠下越大
  const depthT = (f.band - 0) / 2;
  const s = f.scale * (0.88 + depthT * 0.22);
  const sy = Math.round(f.y);

  const pose = poseOf(f);
  const hipY = (SK.hipY + pose.crouch) * s;
  const shY = (SK.shY + pose.crouch) * s;
  const headY = (SK.headY + pose.crouch * 0.8) * s;

  const pal = f.flash > 0 && f.flash % 4 < 2
    ? { ...f.pal, skin: '#ffffff', skin2: '#ffd8d8', top: '#ffffff', bottom: '#ffffff', hair: '#ffffff' }
    : f.pal;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(f.facing * s, s);

  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  const shW = 7 * (1 + depthT * 0.2);
  ctx.fillRect(-shW, -1.5, shW * 2, 2.5);

  if (o.glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,180,60,0.22)';
    ctx.beginPath();
    ctx.arc(0, headY * 0.85, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const lean = pose.lean;

  // --- 后腿 ---
  limb(ctx, 0, hipY, pose.lFb, -Math.abs(pose.lFb) * 0.4 + 0.25,
    SK.thigh, SK.shin, SK.limbW, pal.bottom, 0);

  // --- 后臂 ---
  const shB = { x: Math.sin(lean) * 2, y: shY };
  limb(ctx, shB.x, shB.y, pose.aFb, -0.35, SK.upperArm, SK.foreArm, SK.limbW * 0.92, pal.skin2, 0);

  // --- 躯干 ---
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(lean * 0.5);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(-4.2, shY - hipY - 1, 8.4, (hipY === 0 ? 0 : 0) + (shY - hipY) * -1 + 12);
  ctx.fillStyle = pal.top;
  ctx.fillRect(-3.4, shY - hipY - 0.5, 6.8, (hipY - shY) + 3.5);
  // 裤子
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(-4, 0, 8, 3.2);
  ctx.fillStyle = pal.bottom;
  ctx.fillRect(-3.3, 0, 6.6, 2.6);
  ctx.restore();

  // --- 前腿 ---
  limb(ctx, 0, hipY, pose.lF, -Math.abs(pose.lF) * 0.4 + 0.25,
    SK.thigh, SK.shin, SK.limbW, pal.bottom, pose.exL);

  // --- 头 ---
  const hx = Math.sin(lean) * 3.2 + pose.headDx;
  const hy = headY;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean * 0.35);
  // 脖子
  ctx.fillStyle = pal.skin2;
  ctx.fillRect(-1.6, 4, 3.2, 3);
  // 脑袋
  ctx.beginPath();
  ctx.arc(0, 0, SK.headR + 0.9, 0, Math.PI * 2);
  ctx.fillStyle = OUTLINE;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, SK.headR, 0, Math.PI * 2);
  ctx.fillStyle = pal.skin;
  ctx.fill();
  // 头发
  drawHair(ctx, f.hair, SK.headR, pal.hair);
  // 眼睛（朝前）
  ctx.fillStyle = '#101018';
  ctx.fillRect(1.6, -0.6, 1.4, 1.5);
  // 眉
  ctx.fillStyle = pal.hair;
  ctx.fillRect(1.3, -2.2, 2.0, 0.9);
  ctx.restore();

  // --- 前臂（带武器） ---
  const shF = { x: Math.sin(lean) * 2, y: shY };
  const angF = pose.aF;
  const handX = shF.x + Math.sin(angF) * SK.upperArm * (1 + pose.exF * 0.5);
  const handY = shF.y + Math.cos(angF) * SK.upperArm * (1 + pose.exF * 0.5);
  limb(ctx, shF.x, shF.y, angF, 0.1, SK.upperArm, SK.foreArm, SK.limbW, pal.skin, pose.exF);
  if (o.weapon) drawWeaponInHand(ctx, handX, handY, angF, o.weapon, 1);

  ctx.restore();
}

/** 发型 —— 用来区分敌我，一眼就能认出谁是谁 */
function drawHair(
  ctx: CanvasRenderingContext2D,
  style: string,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  switch (style) {
    case 'bald':
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.ellipse(-0.6, -1.6, 2.2, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'short':
      ctx.beginPath();
      ctx.arc(0, -0.4, r + 0.3, Math.PI * 1.05, Math.PI * 2.1);
      ctx.fill();
      break;
    case 'bowl':
      ctx.beginPath();
      ctx.arc(0, -0.8, r + 0.7, Math.PI * 0.95, Math.PI * 2.15);
      ctx.fill();
      ctx.fillRect(-r - 0.6, -0.8, 2.2, 3.4);
      break;
    case 'slick':
      ctx.beginPath();
      ctx.ellipse(-0.8, -1.4, r + 0.6, 1.9, -0.35, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mohawk':
      ctx.fillRect(-0.9, -r - 3.4, 1.9, 4.2);
      ctx.beginPath();
      ctx.arc(0, -0.4, r * 0.75, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    case 'bandana':
      ctx.fillRect(-r - 0.5, -1.4, (r + 0.5) * 2, 1.8);
      ctx.fillRect(-r - 2.2, -1.2, 2.2, 1.2);
      break;
    case 'long':
      ctx.beginPath();
      ctx.arc(0, -0.4, r + 0.4, Math.PI * 0.95, Math.PI * 2.1);
      ctx.fill();
      ctx.fillRect(-r - 1.1, -0.6, 2.2, 6.4);
      break;
    default:
      break;
  }
}

/** 挥击特效：命中瞬间的白色冲击块 */
export function drawHitFlash(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number, dir: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(-2, -size * 0.5, size, 2.5);
  ctx.fillStyle = 'rgba(255,214,120,0.75)';
  ctx.fillRect(size * 0.3, -size * 0.8, size * 0.55, size * 1.6);
  ctx.fillStyle = 'rgba(255,140,60,0.5)';
  ctx.fillRect(size * 0.55, -size * 0.4, size * 0.4, size * 0.8);
  ctx.restore();
}
