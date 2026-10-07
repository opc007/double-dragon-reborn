/**
 * 关卡数据 —— 复刻原作四关：贫民窟 → 工厂 → 森林 → 敌方基地。
 *
 * 清版规则照搬原作：走到触发点后镜头锁死，必须把这一波全清完才能继续往前。
 * 这条规则是双截龙节奏感的来源——它把"赶路"变成了"一关一关的破拆"。
 */

import type { WeaponId } from './weapons';

export type BGKind = 'slum' | 'factory' | 'forest' | 'hideout';

export interface Pit {
  x: number;
  w: number;
}

export interface Wave {
  /** 触发的 X 坐标 */
  x: number;
  /** 敌人 id 列表（会分批刷出，遵守 max 限制） */
  enemies: string[];
  /** 同屏上限 */
  max: number;
  /** 这波开始前场上散落的武器 */
  loot?: WeaponId[];
}

export interface Stage {
  id: number;
  name: string;
  en: string;
  bg: BGKind;
  /** 关卡总长度（逻辑像素） */
  length: number;
  /** 程序化装饰随机种子 */
  seed: number;
  intro: string[];
  waves: Wave[];
  /** 地上的深坑：掉下去直接退场（原作的招牌死法） */
  pits: Pit[];
  boss: string | null;
  /** 第二 BOSS（第四关：威利之后是亲哥哥） */
  boss2?: string;
  outro: string[];
}

export const STAGES: Stage[] = [
  {
    id: 1,
    name: '第一关 · 贫民窟',
    en: 'MISSION 1 — CITY SLUM',
    bg: 'slum',
    length: 3480,
    seed: 0x51a3,
    intro: ['城市边缘。霓虹烂了一半。', '黑武士帮的地盘，从这里开始。'],
    waves: [
      { x: 190, enemies: ['williams', 'williams'], max: 2 },
      { x: 620, enemies: ['williams', 'williams', 'rowper'], max: 2, loot: ['rock'] },
      { x: 1080, enemies: ['rowper', 'rowper'], max: 2, loot: ['bat'] },
      { x: 1520, enemies: ['williams', 'rowper', 'williams'], max: 2 },
      { x: 1980, enemies: ['linda', 'williams'], max: 2, loot: ['whip'] },
      { x: 2380, enemies: ['rowper', 'williams', 'rowper'], max: 2 },
      { x: 2760, enemies: ['linda', 'rowper'], max: 2, loot: ['bat'] },
      { x: 3080, enemies: ['williams', 'williams', 'williams'], max: 2, loot: ['rock'] },
    ],
    pits: [{ x: 560, w: 22 }, { x: 1920, w: 24 }, { x: 2700, w: 22 }],
    boss: 'bolo',
    outro: ['博洛斯倒下了。', '但这只是个开始。'],
  },
  {
    id: 2,
    name: '第二关 · 废弃工厂',
    en: 'MISSION 2 — ABANDONED FACTORY',
    bg: 'factory',
    length: 3880,
    seed: 0x7c22,
    intro: ['工厂停工三年了。', '但传送带还在转——有人在下面干活。'],
    waves: [
      { x: 180, enemies: ['williams', 'rowper'], max: 2, loot: ['rock'] },
      { x: 640, enemies: ['abobo', 'williams'], max: 2 },
      { x: 1120, enemies: ['rowper', 'rowper', 'linda'], max: 2, loot: ['barrel'] },
      { x: 1600, enemies: ['abobo', 'rowper'], max: 2 },
      { x: 2080, enemies: ['williams', 'linda', 'williams'], max: 2, loot: ['bat'] },
      { x: 2560, enemies: ['abobo', 'abobo'], max: 2 },
      { x: 2960, enemies: ['rowper', 'linda', 'williams'], max: 2, loot: ['whip'] },
      { x: 3340, enemies: ['abobo', 'rowper'], max: 2, loot: ['barrel'] },
    ],
    pits: [{ x: 580, w: 22 }, { x: 1540, w: 24 }, { x: 2900, w: 24 }],
    boss: 'chin',
    outro: ['钦泰收掌。', '"你哥哥在等你。"'],
  },
  {
    id: 3,
    name: '第三关 · 城郊林道',
    en: 'MISSION 3 — CITY OUTSKIRTS',
    bg: 'forest',
    length: 4080,
    seed: 0x2f8b,
    intro: ['出城的路只有一条。', '林子里很静，静得不对劲。'],
    waves: [
      { x: 190, enemies: ['linda', 'williams'], max: 2 },
      { x: 620, enemies: ['rowper', 'abobo'], max: 2, loot: ['knife'] },
      { x: 1080, enemies: ['williams', 'williams', 'williams'], max: 2 },
      { x: 1560, enemies: ['abobo', 'linda'], max: 2, loot: ['barrel'] },
      { x: 2040, enemies: ['rowper', 'rowper', 'rowper'], max: 2 },
      { x: 2520, enemies: ['abobo', 'abobo', 'linda'], max: 2, loot: ['bat'] },
      { x: 2960, enemies: ['williams', 'rowper', 'abobo'], max: 2 },
      { x: 3400, enemies: ['linda', 'linda', 'abobo'], max: 2, loot: ['knife'] },
    ],
    pits: [{ x: 560, w: 22 }, { x: 1500, w: 24 }, { x: 1980, w: 24 }, { x: 3340, w: 24 }],
    boss: 'abobo',
    outro: ['路上清干净了。', '再往前，就是他们的老巢。'],
  },
  {
    id: 4,
    name: '第四关 · 敌方基地',
    en: 'MISSION 4 — ENEMY BASE',
    bg: 'hideout',
    length: 4080,
    seed: 0x9d41,
    intro: ['基地最深处。', '威利在这儿。'],
    waves: [
      { x: 180, enemies: ['abobo', 'williams', 'rowper'], max: 2, loot: ['dynamite'] },
      { x: 660, enemies: ['linda', 'abobo'], max: 2 },
      { x: 1140, enemies: ['rowper', 'rowper', 'williams'], max: 2, loot: ['barrel'] },
      { x: 1620, enemies: ['abobo', 'linda', 'abobo'], max: 2 },
      { x: 2060, enemies: ['rowper', 'abobo', 'williams'], max: 2, loot: ['bat'] },
      { x: 2480, enemies: ['abobo', 'abobo', 'linda'], max: 2, loot: ['dynamite'] },
      { x: 2900, enemies: ['rowper', 'rowper', 'abobo'], max: 2 },
    ],
    pits: [{ x: 600, w: 22 }, { x: 1560, w: 24 }, { x: 2000, w: 24 }],
    boss: 'willy',
    boss2: 'jimmy',
    outro: ['你赢了。', '但赢你的是谁？'],
  },
];

export const stageCount = STAGES.length;

/** 拿到 0..n-1 的关卡 */
export function getStage(n: number): Stage {
  return STAGES[Math.max(0, Math.min(STAGES.length - 1, n))]!;
}
