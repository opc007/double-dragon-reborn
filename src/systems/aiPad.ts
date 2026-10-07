/**
 * 师弟 AI —— 用假输入驱动一个真正的 Player。
 *
 * 这么写的好处：师弟和玩家跑的是同一套招式/升级/抓投代码，
 * 不会出现"AI 会一招玩家不会"的割裂感。他也会升级，也会被打倒。
 */

import type { PadState } from '../core/input';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { RANGE_KICK, RANGE_PUNCH } from '../core/constants';

function blankPad(): PadState {
  return {
    up: false, down: false, left: false, right: false,
    punch: false, kick: false, jump: false, superBtn: false,
    pressedPunch: false, pressedKick: false, pressedJump: false, pressedSuper: false,
    dx: 0, dy: 0,
  };
}

export function driveDisciple(
  me: Player,
  leader: Player,
  enemies: Enemy[],
  prev: PadState,
): PadState {
  const p = blankPad();

  // 已经阵亡/被抓住就什么都不做
  if (me.dead || me.state === 'grabbed' || me.state === 'down' || me.state === 'getup') {
    return p;
  }

  // 找最近的活着的敌人
  let target: Enemy | null = null;
  let bd = Infinity;
  for (const e of enemies) {
    if (e.dead || e.outOfPlay) continue;
    const d = Math.abs(e.x - me.x) + Math.abs(e.band - me.band) * 40;
    if (d < bd) { bd = d; target = e; }
  }

  if (target) {
    const dx = target.x - me.x;
    const adx = Math.abs(dx);
    const sameBand = target.band === me.band;

    // 纵深对齐
    if (!sameBand) {
      if (target.band > me.band) p.up = true;
      else p.down = true;
    } else if (adx > RANGE_PUNCH - 4) {
      // 靠近
      if (dx > 0) p.right = true; else p.left = true;
    } else if (target.state === 'down' || target.state === 'getup') {
      // 敌人倒地，先等一下再打（别乱踩）
      p.dx = 0;
    } else {
      const kick = adx > RANGE_PUNCH && adx <= RANGE_KICK;
      const press = !prev.punch && !prev.kick;
      if (press) {
        if (kick) p.kick = true; else p.punch = true;
      }
    }
  } else {
    // 没敌人就跟着大哥
    const dx = leader.x - me.x;
    if (dx > 26) p.right = true;
    else if (dx < -26) p.left = true;
    if (leader.band > me.band) p.up = true;
    else if (leader.band < me.band) p.down = true;
  }

  p.dx = (p.right ? 1 : 0) - (p.left ? 1 : 0);
  p.dy = (p.down ? 1 : 0) - (p.up ? 1 : 0);
  return p;
}
