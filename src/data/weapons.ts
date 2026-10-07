/**
 * 武器表 —— 复刻 FC 版"缴械夺武器"核心机制。
 *
 * 原作里打掉敌人手里的武器后可以捡起来用，但武器不能带过波次（内存限制）。
 * 这里保留"过波次丢失"的原味限制，让每波都要重新抢武器。
 */

export type WeaponId = 'fist' | 'bat' | 'knife' | 'whip' | 'rock' | 'barrel' | 'dynamite';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  damage: number;
  range: number;
  startup: number;
  active: number;
  recover: number;
  knock: number;
  /** 可用次数，0 = 无限（拳头） */
  durability: number;
  /** 能否投掷 */
  throwable: boolean;
  /** 投掷伤害 */
  throwDamage: number;
  /** 像素长度，用于画手持武器 */
  len: number;
  color: string;
  desc: string;
}

const W = (d: WeaponDef): WeaponDef => d;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fist: W({
    id: 'fist', name: '空手', damage: 0, range: 0, startup: 0, active: 0, recover: 0,
    knock: 0, durability: 0, throwable: false, throwDamage: 0, len: 0, color: '#000',
    desc: '双截拳的本体。等级越高越强。',
  }),
  bat: W({
    id: 'bat', name: '棒球棍', damage: 17, range: 28, startup: 7, active: 5, recover: 12,
    knock: 2.6, durability: 14, throwable: true, throwDamage: 14, len: 20, color: '#c88a4a',
    desc: '抡圆了伤害最高，清理密集小兵的首选。',
  }),
  knife: W({
    id: 'knife', name: '飞刀', damage: 11, range: 22, startup: 3, active: 3, recover: 7,
    knock: 0.7, durability: 11, throwable: true, throwDamage: 24, len: 9, color: '#d8d8e0',
    desc: '出手最快，扔出去杀伤力反而更高。',
  }),
  whip: W({
    id: 'whip', name: '皮鞭', damage: 8, range: 42, startup: 8, active: 4, recover: 11,
    knock: 1.4, durability: 24, throwable: false, throwDamage: 0, len: 34, color: '#8a4a2a',
    desc: '超长距离，够得着屏幕另一头。',
  }),
  rock: W({
    id: 'rock', name: '石头', damage: 9, range: 20, startup: 5, active: 3, recover: 9,
    knock: 1.2, durability: 3, throwable: true, throwDamage: 18, len: 7, color: '#9a9a92',
    desc: '路上到处都有，凑合用。',
  }),
  barrel: W({
    id: 'barrel', name: '油桶', damage: 14, range: 24, startup: 10, active: 5, recover: 18,
    knock: 3.6, durability: 6, throwable: true, throwDamage: 16, len: 13, color: '#3a7a4a',
    desc: '又沉又慢，但一击能把人砸飞。',
  }),
  dynamite: W({
    id: 'dynamite', name: '炸药', damage: 0, range: 0, startup: 0, active: 0, recover: 0,
    knock: 0, durability: 1, throwable: true, throwDamage: 99, len: 8, color: '#c83a2a',
    desc: '一炸一片，扔完就没了。',
  }),
};
