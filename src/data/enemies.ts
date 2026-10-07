/**
 * 敌人图鉴 —— 复刻 FC 版黑武士帮（Black Warriors）的原班人马。
 *
 * 原作 7 种小怪 + 4 个关底。NES 版因为内存限制同屏最多刷 2 个且必须同种，
 * 这里放宽到可配置（默认 3），但保留了"小怪->精英->BOSS"的强度阶梯。
 */

import type { WeaponId } from './weapons';

export interface Pal {
  skin: string;
  skin2: string;
  top: string;
  bottom: string;
  hair: string;
}

export type AIKind =
  | 'brawler'    // 贴身拳脚
  | 'thrower'    // 扔杂物，远程骚扰
  | 'whip'       // 长距离抽打，控场
  | 'heavy'      // 大块头，慢但痛，击退强
  | 'knife'      // 快速突进
  | 'gun'        // 持枪，子弹判定极小
  | 'boss';      // 多阶段

export type HairStyle =
  | 'short' | 'bald' | 'mohawk' | 'bowl' | 'slick' | 'bandana' | 'long' | 'none';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  reach: number;
  aggro: number;
  score: number;
  exp: number;
  /** 体型缩放 */
  scale: number;
  pal: Pal;
  hair: HairStyle;
  weapon: WeaponId;
  ai: AIKind;
  /** 是否会抓玩家 */
  canGrab: boolean;
  /** 出场攻击冷却（帧） */
  cooldown: number;
  desc: string;
}

const E = (d: EnemyDef): EnemyDef => d;

export const ENEMIES: Record<string, EnemyDef> = {
  /* ---------------- 小兵 ---------------- */
  williams: E({
    id: 'williams', name: '威利姆斯', hp: 30, speed: 0.56, damage: 10, reach: 19,
    aggro: 120, score: 100, exp: 100, scale: 1.0, hair: 'short',
    pal: { skin: '#e8a878', skin2: '#b87a50', top: '#3a8a3a', bottom: '#c8a058', hair: '#402818' },
    weapon: 'fist', ai: 'brawler', canGrab: true, cooldown: 46,
    desc: '黑武士帮的街头小弟，数量最多，靠人海消耗你。',
  }),
  rowper: E({
    id: 'rowper', name: '洛珀', hp: 32, speed: 0.5, damage: 10, reach: 20,
    aggro: 150, score: 150, exp: 135, scale: 1.04, hair: 'bowl',
    pal: { skin: '#d89868', skin2: '#a86c44', top: '#d89868', bottom: '#c83a2a', hair: '#503020' },
    weapon: 'fist', ai: 'thrower', canGrab: true, cooldown: 62,
    desc: '会从远处扔石头和油桶，逼你不停走位。',
  }),
  linda: E({
    id: 'linda', name: '琳达', hp: 27, speed: 0.66, damage: 12, reach: 40,
    aggro: 170, score: 200, exp: 165, scale: 0.94, hair: 'long',
    pal: { skin: '#f0bc90', skin2: '#c09068', top: '#8a3ac8', bottom: '#5a2088', hair: '#e0b040' },
    weapon: 'whip', ai: 'whip', canGrab: false, cooldown: 54,
    desc: '帮里唯一的女人，皮鞭抽得又远又快，别贴脸。',
  }),
  abobo: E({
    id: 'abobo', name: '阿波波', hp: 50, speed: 0.44, damage: 14, reach: 26,
    aggro: 145, score: 300, exp: 240, scale: 1.22, hair: 'bald',
    pal: { skin: '#d09060', skin2: '#9a6038', top: '#d09060', bottom: '#8a6a3a', hair: '#d09060' },
    weapon: 'fist', ai: 'heavy', canGrab: true, cooldown: 58,
    desc: '光头巨汉，出拳比你还长，扔的重物能把人砸趴。',
  }),

  /* ---------------- BOSS ---------------- */
  bolo: E({
    id: 'bolo', name: '博洛斯', hp: 210, speed: 0.48, damage: 16, reach: 30,
    aggro: 220, score: 1200, exp: 640, scale: 1.38, hair: 'mohawk',
    pal: { skin: '#c88050', skin2: '#8a542c', top: '#c88050', bottom: '#6a4a2a', hair: '#2a1a10' },
    weapon: 'fist', ai: 'boss', canGrab: true, cooldown: 44,
    desc: '第一关的关底。剃着莫西干的光头大汉，抓摔又快又狠。',
  }),
  chin: E({
    id: 'chin', name: '钦泰', hp: 250, speed: 0.72, damage: 15, reach: 26,
    aggro: 240, score: 2000, exp: 820, scale: 1.06, hair: 'bowl',
    pal: { skin: '#e0b088', skin2: '#b08860', top: '#f0f0f0', bottom: '#e0e0e0', hair: '#181818' },
    weapon: 'fist', ai: 'boss', canGrab: true, cooldown: 36,
    desc: '中国拳师，腿法极快，FC 版新增的第二关 BOSS。',
  }),
  willy: E({
    id: 'willy', name: '威利', hp: 250, speed: 0.42, damage: 14, reach: 24,
    aggro: 260, score: 3000, exp: 1150, scale: 1.12, hair: 'slick',
    pal: { skin: '#d8a070', skin2: '#a07048', top: '#2a2a30', bottom: '#1a1a20', hair: '#141414' },
    weapon: 'fist', ai: 'gun', canGrab: false, cooldown: 40,
    desc: '黑武士帮首领。机枪子弹擦到就是重伤，永远不丢枪。',
  }),
  jimmy: E({
    id: 'jimmy', name: '吉米 · 李', hp: 330, speed: 0.80, damage: 17, reach: 27,
    aggro: 300, score: 6000, exp: 1900, scale: 1.04, hair: 'short',
    pal: { skin: '#f0c090', skin2: '#c09060', top: '#e8413a', bottom: '#3868f8', hair: '#201008' },
    weapon: 'fist', ai: 'boss', canGrab: true, cooldown: 30,
    desc:
      '你哥哥。双胞胎，学的是同一套双截拳——所以他会你的一切招式，而且比你更快。',
  }),
};

/** 主角配色（利比利 / 李比利） */
export const BILLY_PAL: Pal = {
  skin: '#f0c090', skin2: '#c09060', top: '#f0f0f0', bottom: '#3868f8', hair: '#1a0e06',
};

/** 二周目可用：吉米配色（双人模式 P2） */
export const JIMMY_PAL: Pal = {
  skin: '#f0c090', skin2: '#c09060', top: '#e8413a', bottom: '#3868f8', hair: '#1a0e06',
};
