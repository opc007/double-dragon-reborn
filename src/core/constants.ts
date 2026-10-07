/**
 * 全局常量 —— 对齐 FC《双截龙》(1988) 的手感与画面。
 *
 * 逻辑分辨率固定 256x240（NES 原生），渲染时整数倍放大。
 * 所有坐标单位 = 逻辑像素，1 逻辑像素 = 1 NES 像素。
 */

/* ---------- 画布 ---------- */
export const VIEW_W = 256;
export const VIEW_H = 240;

/* ---------- 纵深（"belt scroll" 双层纵深是双截龙的灵魂） ---------- */
/**
 * 三个可行走深度带。band 越大 = 越靠屏幕下方 = 离摄像机越近 = 角色画得越大。
 * 敌人和你不在同一深度带时，打不到对方——这是双截龙的核心策略层。
 */
export const DEPTH_BANDS: readonly number[] = [178, 194, 210];
export const BAND_COUNT = DEPTH_BANDS.length;

/* ---------- 物理 ---------- */
export const GRAVITY = 0.55;
export const MAX_FALL = 9.5;

/* ---------- 玩家 ---------- */
export const PLAYER_HP_MAX = 120;
export const PLAYER_SPEED = 1.4;
export const PLAYER_JUMP_V = -6.9;
export const PLAYER_START_LIVES = 3;

/* ---------- 战斗 ---------- */
/** 受击硬直上限（帧） */
export const HITSTUN_MAX = 20;
/** 死亡后复活无敌帧 */
export const INVULN_FRAMES = 48;
/** 贴住敌人时自动进入抓取的距离 */
export const GRAB_RANGE = 16;
export const GRAB_HOLD_MAX = 150;
/** 攻击判定距离 */
export const RANGE_PUNCH = 21;
export const RANGE_KICK = 27;
export const RANGE_JUMP_KICK = 31;
export const RANGE_HEADBUTT = 20;
export const RANGE_ELBOW = 19;
export const RANGE_SPIN = 34;

/** 投掷 */
export const THROW_VX = 3.5;
export const THROW_VY = -4.4;
export const THROW_DAMAGE = 26;
/** 掉进坑里直接秒杀 */
export const PIT_INSTAKILL = true;

/** 倒地 */
export const KNOCKDOWN_FRAMES = 44;
export const GETUP_FRAMES = 14;

/* ---------- 升级（复刻 FC 版 7 级系统） ---------- */
export const EXP_PER_LEVEL = 1000;
export const MAX_LEVEL = 7;

/* ---------- 新增系统：气 / Chi ---------- */
export const CHI_MAX = 100;
/** 命中回复的气量 */
export const CHI_ON_HIT = 4.5;
export const CHI_ON_KILL = 12;
/** 奥义持续帧 */
export const SUPER_FRAMES = 74;
export const SUPER_DAMAGE = 34;

/* ---------- 关卡 ---------- */
export const STAGE_COUNT = 4;
export const TIME_START = 99;
export const TIME_FLOW = 0.014; // 每帧递减；99 单位 ≈ 118 秒，每清一波补满

/* ---------- 摄像机 ---------- */
export const CAM_LERP = 0.12;
export const CAM_LOOKAHEAD = 18;
