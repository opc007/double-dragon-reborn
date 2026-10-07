/**
 * 道场（Dojo）—— 原作没有的元系统。
 *
 * 原作的成长曲线是"一局之内"的：死了就没了，经验不带走。
 * 这里加一层局外的道场经营：打怪攒铜钱，铜钱换永久强化。
 * 目的不是变强，是让"再来一次"有个盼头。
 */

export interface DojoStats {
  /** 体力上限加成 */
  vit: number;
  /** 伤害加成（百分比） */
  power: number;
  /** 移动速度加成（百分比） */
  speed: number;
  /** 获气速度加成（百分比） */
  chiGain: number;
  /** 是否有 AI 师弟 */
  disciple: boolean;
}

export type UpgradeId = 'vit' | 'power' | 'speed' | 'chi' | 'disciple';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  max: number;
  /** 每一级的价格 */
  cost: (lv: number) => number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'vit', name: '铁骨功', desc: '体力上限 +12', max: 5, cost: (l) => 260 + l * 180 },
  { id: 'power', name: '内劲', desc: '所有伤害 +9%', max: 5, cost: (l) => 320 + l * 220 },
  { id: 'speed', name: '轻功', desc: '移动速度 +8%', max: 3, cost: (l) => 300 + l * 240 },
  { id: 'chi', name: '气功', desc: '获气速度 +25%', max: 3, cost: (l) => 280 + l * 200 },
  { id: 'disciple', name: '收徒', desc: '带一名师弟同行', max: 1, cost: () => 1200 },
];

export interface DojoSave {
  coins: number;
  lv: Record<UpgradeId, number>;
  /** 历史最高通关关卡数 */
  cleared: number;
  bestScore: number;
  /** 通关次数 */
  clears: number;
}

const KEY = 'dd-reborn-dojo-v1';

export function defaultSave(): DojoSave {
  return { coins: 0, lv: { vit: 0, power: 0, speed: 0, chi: 0, disciple: 0 }, cleared: 0, bestScore: 0, clears: 0 };
}

export function loadDojo(): DojoSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const p = JSON.parse(raw) as Partial<DojoSave>;
    const base = defaultSave();
    return {
      coins: typeof p.coins === 'number' ? p.coins : base.coins,
      lv: { ...base.lv, ...(p.lv ?? {}) },
      cleared: p.cleared ?? 0,
      bestScore: p.bestScore ?? 0,
      clears: p.clears ?? 0,
    };
  } catch {
    return defaultSave();
  }
}

export function saveDojo(s: DojoSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式下写不了，忽略即可 */
  }
}

export function statsOf(s: DojoSave): DojoStats {
  return {
    vit: s.lv.vit * 12,
    power: s.lv.power * 9,
    speed: s.lv.speed * 8,
    chiGain: s.lv.chi * 25,
    disciple: s.lv.disciple > 0,
  };
}

export function upgradeCost(s: DojoSave, id: UpgradeId): number | null {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return null;
  const lv = s.lv[id];
  if (lv >= def.max) return null;
  return def.cost(lv);
}
