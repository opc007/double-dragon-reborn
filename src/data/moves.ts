/**
 * 招式表 —— 复刻 FC 版最标志性的设计：靠打敌人攒经验升级，逐级解锁新招。
 *
 * 原作（NES, 1988）是全系列唯一有等级系统的一作：
 *   Lv1 直拳/脚踢/头槌   Lv2 上勾拳/回旋踢   Lv3 飞踢
 *   Lv4 抓发膝撞/过肩摔 Lv5 骑马掌掴        Lv6 霸王肩   Lv7 旋风腿
 * 这个"越打越强"的手感是复刻时最不能丢的东西。
 */

export type MoveId =
  | 'punch' | 'kick' | 'headbutt' | 'combo' | 'combo'
  | 'uppercut' | 'roundhouse'
  | 'jumpKick'
  | 'knee' | 'suplex'
  | 'pin'
  | 'elbow'
  | 'spinKick'
  | 'super';

export interface MoveDef {
  id: MoveId;
  name: string;
  /** 解锁所需等级 */
  lv: number;
  damage: number;
  /** 攻击判定距离（逻辑像素） */
  range: number;
  /** 起手到命中的帧数 */
  startup: number;
  /** 命中判定持续的帧数 */
  active: number;
  /** 命中后的收招帧数 */
  recover: number;
  /** 击退强度 */
  knock: number;
  /** 命中后是否浮空 */
  launch: boolean;
  /** 命中后是否必定倒地 */
  knockdown: boolean;
  /** 伤害随等级成长的斜率 */
  growth: number;
  /** 一次挥击打几段（1 = 单段） */
  hits?: number;
  desc: string;
}

const M = (d: MoveDef): MoveDef => d;

export const MOVES: Record<MoveId, MoveDef> = {
  /**
   * 双截连打 —— 拳和脚同时按下。
   * 给玩家的入门大招：不用方向、不用等级、不用背任何东西，按 J+K 就行。
   * 三段打击，出手快收招也快，是"想爽一下"时最该按的键。
   */
  combo: M({
    id: 'combo', name: '双截连打', lv: 1, damage: 9, range: 32,
    startup: 4, active: 27, recover: 13, knock: 0.9, launch: false, knockdown: false,
    growth: 1.5, hits: 3,
    desc: '同时按 J 和 K。连续三段打击，最容易上手的连招。',
  }),
  punch: M({
    id: 'punch', name: '直拳', lv: 1, damage: 8, range: 27,
    startup: 4, active: 3, recover: 8, knock: 1.0, launch: false, knockdown: false, growth: 1.8,
    desc: '最快的近身拳，出手快收招快，连段的基本单位。',
  }),
  kick: M({
    id: 'kick', name: '脚踢', lv: 1, damage: 10, range: 35,
    startup: 6, active: 4, recover: 10, knock: 1.6, launch: false, knockdown: false, growth: 2.1,
    desc: '距离比拳远，击退更强，代价是前摇更长。',
  }),
  headbutt: M({
    id: 'headbutt', name: '头槌', lv: 1, damage: 6, range: 25,
    startup: 5, active: 3, recover: 9, knock: 0.8, launch: false, knockdown: false, growth: 1.5,
    desc: '贴住对手时自动使出，一下下磨血。',
  }),
  uppercut: M({
    id: 'uppercut', name: '上勾拳', lv: 2, damage: 13, range: 27,
    startup: 6, active: 4, recover: 14, knock: 1.2, launch: true, knockdown: true, growth: 2.5,
    desc: '↓+拳。把敌人打飞起来，是起手的空中追击。',
  }),
  roundhouse: M({
    id: 'roundhouse', name: '回旋踢', lv: 2, damage: 12, range: 37,
    startup: 7, active: 5, recover: 13, knock: 2.4, launch: false, knockdown: true, growth: 2.4,
    desc: '↓+脚。大力击退，敌人会被踹翻。',
  }),
  jumpKick: M({
    id: 'jumpKick', name: '飞踢', lv: 3, damage: 14, range: 40,
    startup: 4, active: 8, recover: 6, knock: 2.0, launch: false, knockdown: false, growth: 2.7,
    desc: '空中+脚。全游戏最安全的起手，够不着的地方全靠它。',
  }),
  knee: M({
    id: 'knee', name: '抓发膝撞', lv: 4, damage: 11, range: 24,
    startup: 4, active: 3, recover: 7, knock: 0.4, launch: false, knockdown: false, growth: 2.1,
    desc: '抓住敌人后+拳。锁住对方不让跑，连打收益很高。',
  }),
  suplex: M({
    id: 'suplex', name: '过肩摔', lv: 4, damage: 22, range: 24,
    startup: 8, active: 4, recover: 16, knock: 3.4, launch: false, knockdown: true, growth: 3.2,
    desc: '抓住敌人后+脚。把人甩出去，撞到别的敌人两边一起重伤。',
  }),
  pin: M({
    id: 'pin', name: '骑马掌掴', lv: 5, damage: 8, range: 24,
    startup: 5, active: 3, recover: 5, knock: 0, launch: false, knockdown: false, growth: 1.8,
    desc: '抓住敌人后连按拳。连续命中，压制力最强。',
  }),
  elbow: M({
    id: 'elbow', name: '霸王肩', lv: 6, damage: 20, range: 24,
    startup: 5, active: 3, recover: 12, knock: 2.2, launch: false, knockdown: true, growth: 3.4,
    desc: '敌人绕到背后时按拳。反身一击，全游戏最疼的单招。',
  }),
  spinKick: M({
    id: 'spinKick', name: '旋风腿', lv: 7, damage: 24, range: 44,
    startup: 6, active: 12, recover: 10, knock: 3.0, launch: false, knockdown: true, growth: 3.6,
    desc: '空中+拳。360° 全方位回旋，敌人围上来时的解法。',
  }),
  super: M({
    id: 'super', name: '双截奥义', lv: 1, damage: 34, range: 46,
    startup: 10, active: 46, recover: 18, knock: 4.0, launch: true, knockdown: true, growth: 0,
    desc: '气满后按 Q。全屏龙卷腿，一口气清场。',
  }),
};

/** 按等级排出可用的招式（给 UI 提示用） */
export function movesAtLevel(lv: number): MoveDef[] {
  return Object.values(MOVES).filter((m) => m.id !== 'super' && m.lv <= lv);
}

/** 升到下一级时新解锁的招式；已经全解锁则返回 null */
export function newlyUnlocked(lv: number): MoveDef | null {
  const next = Object.values(MOVES).find((m) => m.id !== 'super' && m.lv === lv + 1);
  return next ?? null;
}
