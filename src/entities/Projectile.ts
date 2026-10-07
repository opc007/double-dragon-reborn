/**
 * Projectile —— 敌人扔的杂物和枪弹。
 *
 * 全部程序化：没有精灵图，按 kind 画几何形状。
 * 弹道保留原作的手感——石头飞得平、油桶飞得高、子弹直。
 */

import { GRAVITY } from '../core/constants';
import type { ThrowKind } from '../entities/Enemy';
import { sign } from '../core/math';

export class Projectile {
  kind: ThrowKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  band: number;
  life: number;
  spin = 0;
  dead = false;
  /** 炸药起爆倒计时；其余为 -1 */
  fuse = -1;
  private age = 0;

  constructor(kind: ThrowKind, x: number, y: number, vx: number, vy: number, band: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.band = band;
    this.life = 160;
    this.fuse = kind === 'dynamite' ? 46 : -1;
  }

  get damage(): number {
    switch (this.kind) {
      case 'rock': return 9;
      case 'barrel': return 15;
      case 'knife': return 12;
      case 'dynamite': return 26;
      case 'bullet': return 20; // 原作里机枪擦到基本秒杀
    }
  }

  get heavy(): boolean {
    return this.kind === 'barrel' || this.kind === 'bullet';
  }

  update(): void {
    this.age++;
    this.x += this.vx;
    this.y += this.vy;
    this.spin += this.vx * 0.25;

    // 子弹直线，其余受重力
    if (this.kind !== 'bullet') {
      this.vy += GRAVITY;
      if (this.vy > 9) this.vy = 9;
    }

    if (this.fuse > 0) {
      this.fuse--;
      if (this.fuse === 0) this.dead = true;
    }

    // 出界即消失
    if (this.x < -40 || this.x > 9999 || this.y > 260) this.dead = true;
    if (--this.life <= 0) this.dead = true;
  }

  /** 命中判定盒 */
  box(): { x: number; y: number; w: number; h: number } {
    const w = this.kind === 'bullet' ? 8 : 12;
    const h = this.kind === 'barrel' ? 14 : 10;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }

  /** 撞墙/撞地：非炸药类直接消失，炸药类起爆 */
  onImpact(): boolean {
    this.dead = true;
    return this.kind === 'dynamite';
  }

  facing(): 1 | -1 {
    return sign(this.vx) || 1;
  }
}
