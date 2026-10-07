/**
 * 平衡试玩机器人。
 *
 * 平衡不能靠感觉调——写一个会打的 bot 反复跑关，量化"能撑多久、能不能过关"。
 * 这个脚本是纯逻辑模拟（不渲染），跑 100 局只要几秒。
 *
 *   npx vite-node src/systems/bot.ts -- --runs 100
 */

import { World } from './world';
import { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { defaultSave, type DojoSave } from './dojo';
import type { PadState } from '../core/input';
import { RANGE_KICK, RANGE_PUNCH } from '../core/constants';

export function blankPad(): PadState {
  return {
    up: false, down: false, left: false, right: false,
    punch: false, kick: false, jump: false, superBtn: false,
    pressedPunch: false, pressedKick: false, pressedJump: false, pressedSuper: false,
    dx: 0, dy: 0,
  };
}

/** 一个"及格玩家"的 AI：会打、会躲、会用纵深、会抓投 */
export function botPad(
  me: Player,
  enemies: Enemy[],
  prev: PadState,
  camX: number,
  stageLen: number,
  pits: { x: number; w: number }[] = [],
): PadState {
  const p = blankPad();
  const go = (dir: -1 | 0 | 1): void => { p.dx = dir; };
  const depth = (dir: -1 | 0 | 1): void => { p.dy = dir; };

  if (me.dead || me.state === 'down' || me.state === 'getup' || me.state === 'grabbed') return p;

  // 前面有坑 → 跳。真人一定会跳，bot 也得会，不然平衡数据全是摔死率
  for (const pit of pits) {
    const d = pit.x - me.x;
    if (d > -4 && d < 8) {   // 贴着坑沿起跳，滞空刚好能跨过去
      p.jump = true; p.pressedJump = true;   // 玩家读的是边沿触发
      p.dx = me.vx !== 0 ? (me.vx > 0 ? 1 : -1) : 1;
      return p;
    }
  }
  if (me.state === 'grab') {
    if (me.grabTarget) p.kick = true;      // 往人群里摔
    return p;
  }
  if (me.state === 'attack' || me.state === 'super') return p;

  let target: Enemy | null = null;
  let bd = Infinity;
  for (const e of enemies) {
    if (e.dead || e.outOfPlay) continue;
    const d = Math.abs(e.x - me.x) + Math.abs(e.band - me.band) * 30;
    if (d < bd) { bd = d; target = e; }
  }

  if (target) {
    const dx = target.x - me.x;
    const adx = Math.abs(dx);
    const sgn: -1 | 1 = dx > 0 ? 1 : -1;

    // 有人正在起手 → 拉开距离或跳开（模拟真人会躲）
    const incoming = enemies.some(
      (e) => !e.dead && e.state === 'attack' && Math.abs(e.x - me.x) < 34 && e.band === me.band,
    );
    if (incoming) {
      if (adx < 24) { p.jump = true; go(0); } else { go(sgn === 1 ? -1 : 1); }
      return p;
    }

    // 先把横向距离拉近，再去对齐深度带。
    // 反过来会跟敌人互相干瞪眼：bot 追深度带不靠近，敌人又站在索敌范围外不动。
    if (adx > 44) { go(sgn); return p; }
    if (target.band !== me.band) {
      depth(target.band > me.band ? -1 : 1);
      return p;
    }
    if (adx > RANGE_KICK) { go(sgn); return p; }

    const press = !prev.punch && !prev.kick;
    if (press) {
      if (adx > RANGE_PUNCH) p.kick = true; else p.punch = true;
    } else if (!prev.punch && !prev.kick) {
      p.punch = true;
    }
    return p;
  }

  // 没人 → 往关卡深处推进，镜头拉太开就往回走一点
  const sx = me.x - camX;
  if (sx < VIEW_GATE) go(1);
  else if (sx > VIEW_W_FAR) go(-1);
  void stageLen;
  return p;
}

const VIEW_GATE = 150;
const VIEW_W_FAR = 210;

export interface RunResult {
  cleared: boolean;
  frames: number;
  lives: number;
  /** 通到第几关（0=第一关都没过，4=全通） */
  stagesCleared: number;
  level: number;
  score: number;
  /** 每关用时（秒） */
  stageTimes: number[];
  /** 死在哪一关的次数 */
  deathsPerStage: number[];
}

const STAGE_FRAMES = 60 * 60 * 3; // 单关最多 3 分钟算超时

/** 跑完整四关 */
export function playOne(_seedShift: number, save: DojoSave): RunResult {
  let w = new World(0, save, false);
  let pad = blankPad();
  let frames = 0;
  let stageIdx = 0;
  const stageTimes: number[] = [];
  const deathsPerStage = [0, 0, 0, 0];
  let level = 1;
  let exp = 0;
  let score = 0;
  let lives = 3;
  let stageStart = 0;
  const totalFrames = STAGE_FRAMES * 4;

  while (frames < totalFrames) {
    const me = w.player;
    pad = botPad(me, w.enemies, pad, w.camX, w.stage.length, w.stage.pits);
    w.update(pad, blankPad());
    frames++;
    level = Math.max(level, me.level);
    exp = me.exp;
    score = Math.max(score, me.score);

    if (w.result === 'stageClear') {
      stageTimes.push(Math.round((frames - stageStart) / 60));
      stageIdx++;
      if (stageIdx >= 4) {
        return { cleared: true, frames, lives, stagesCleared: 4, level, score, stageTimes, deathsPerStage };
      }
      w = new World(stageIdx, save, false);
      w.player.level = level;          // 等级和经验跨关继承（原作行为）
      w.player.exp = exp;
      w.lives = lives;
      stageStart = frames;
      continue;
    }

    if (w.result === 'dead') {
      deathsPerStage[stageIdx]!++;
      if (!w.consumeLife()) {
        return { cleared: false, frames, lives: 0, stagesCleared: stageIdx, level, score, stageTimes, deathsPerStage };
      }
      lives = w.lives;                 // 扣完命后把剩余命数带走
      w.lives = lives;
    }
  }
  return { cleared: false, frames, lives, stagesCleared: stageIdx, level, score, stageTimes, deathsPerStage };
}



/** 跑 N 局给统计 */
export interface ManyResult {
  clearRate: number;
  avgMinutes: number;
  avgLevel: number;
  avgLives: number;
  avgScore: number;
  /** 平均能打到第几关 */
  avgStage: number;
  /** 各关平均死亡次数 */
  deathsPerStage: number[];
  /** 各关平均用时（秒） */
  stageTimes: number[];
  /** 卡关分布：死在哪一关 */
  stuckAt: number[];
}

export function playMany(n: number, save: DojoSave = defaultSave()): ManyResult {
  let clears = 0;
  let frames = 0;
  let level = 0;
  let lives = 0;
  let score = 0;
  let stageSum = 0;
  const deaths = [0, 0, 0, 0];
  const times = [0, 0, 0, 0];
  const stuck = [0, 0, 0, 0];

  for (let i = 0; i < n; i++) {
    const r = playOne(i, save);
    if (r.cleared) clears++;
    frames += r.frames;
    level += r.level;
    lives += r.lives;
    score += r.score;
    stageSum += r.stagesCleared;
    for (let k = 0; k < 4; k++) {
      deaths[k]! += r.deathsPerStage[k]!;
      if (r.stageTimes[k]) times[k]! += r.stageTimes[k]!;
    }
    if (!r.cleared) stuck[r.stagesCleared]!++;
  }
  return {
    clearRate: clears / n,
    avgMinutes: Math.round((frames / n / 60 / 60) * 10) / 10,
    avgLevel: Math.round((level / n) * 100) / 100,
    avgLives: Math.round((lives / n) * 100) / 100,
    avgScore: Math.round(score / n),
    avgStage: Math.round((stageSum / n) * 100) / 100,
    deathsPerStage: deaths.map((d) => Math.round((d / n) * 100) / 100),
    stageTimes: times.map((t) => Math.round(t / n)),
    stuckAt: stuck,
  };
}
