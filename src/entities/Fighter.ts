/**
 * Fighter —— 玩家和敌人共用的战斗基类。
 *
 * 这里装着双截龙最关键的手感：受击硬直、击退、倒地、起身、抓取。
 * 原作之所以"打起来爽"，不是因为判定大，而是因为
 * ——硬直够长能连段、击退有层次能控制距离、倒地能追打。
 * 这三条都在这个类里。
 */

import {
  DEPTH_BANDS, GRAVITY, MAX_FALL, BAND_COUNT,
  KNOCKDOWN_FRAMES, GETUP_FRAMES, HITSTUN_MAX,
} from '../core/constants';
import { clamp, sign } from '../core/math';
import type { MoveDef } from '../data/moves';
import type { WeaponDef } from '../data/weapons';

export type FState =
  | 'idle' | 'walk' | 'air' | 'attack' | 'hurt' | 'down' | 'getup'
  | 'grab' | 'grabbed' | 'thrown' | 'super' | 'dead';

export interface ActiveAttack {
  def: MoveDef | WeaponDef;
  isMove: boolean;
  isSuper: boolean;
  /** 已经命中过的目标，避免同一次挥击多次计伤 */
  hit: Set<Fighter>;
  /** 挥击的世界坐标（用于画刀光） */
  fx: number;
  fy: number;
  dir: 1 | -1;
  /** 多段招式（骑马掌掴 / 旋风腿）的当前段数 */
  tick: number;
}

export abstract class Fighter {
  /* ---- 变换 ---- */
  x = 0;
  /** 脚底 Y */
  y = DEPTH_BANDS[1]!;
  vx = 0;
  vy = 0;
  /** 纵深档位 0..2 */
  band = 1;
  facing: 1 | -1 = 1;
  w = 19;
  h = 38;
  /** 体型缩放，渲染用 */
  scale = 1;

  /* ---- 生存 ---- */
  hp = 100;
  hpMax = 100;
  state: FState = 'idle';
  /** 在当前状态里待了多少帧 */
  stateT = 0;
  /** 动画相位 */
  anim = 0;
  hitstun = 0;
  invuln = 0;
  /** 已经倒地并爬起来的次数，超过上限就退场 */
  knockdowns = 0;
  maxKnockdowns = 2;
  dead = false;
  /** 从画面外飞出去（掉坑 / 被扔出屏幕） */
  outOfPlay = false;

  /* ---- 招式 ---- */
  atk: ActiveAttack | null = null;
  grabTarget: Fighter | null = null;
  grabbedBy: Fighter | null = null;
  grabT = 0;
  /** 被抓住/被抓时下一帧要施加的投掷速度 */
  throwFrom: { vx: number; vy: number } | null = null;

  /* ---- 外观 ---- */
  pal = {
    skin: '#f0c090', skin2: '#c09060', top: '#f0f0f0', bottom: '#3868f8', hair: '#1a0e06',
  };
  hair: string = 'short';
  /** 渲染用的受击闪白计时 */
  flash = 0;
  /** 玩家标记。不能用 constructor.name 判断——生产构建会混淆类名 */
  isPlayer = false;
  /** 本次挥击的伤害。放在基类上，战斗系统才能对玩家和敌人一视同仁地结算。 */
  pendingDamage = 0;
  /** 连段加成倍率 */
  get comboMult(): number { return 1; }

  /** 显式的"在空中"标记。
   *  之前用 y 反推，换深度带的那一帧会误判成空中，
   *  导致隔着一档的敌人在"空中判定"下被打到——深度带规则直接失效。 */
  inAir = false;

  get airborne(): boolean {
    return this.inAir;
  }

  get alive(): boolean {
    return !this.dead;
  }

  get busy(): boolean {
    return this.state === 'attack' || this.state === 'hurt' ||
      this.state === 'down' || this.state === 'getup' ||
      this.state === 'super' || this.state === 'thrown' || this.state === 'dead';
  }

  /** 可否自由行动（不是抓人状态时） */
  get actionable(): boolean {
    return !this.dead && this.hitstun <= 0 &&
      (this.state === 'idle' || this.state === 'walk' || this.state === 'air');
  }

  groundY(): number {
    return DEPTH_BANDS[clamp(this.band, 0, BAND_COUNT - 1)]!;
  }

  get cx(): number {
    return this.x;
  }

  get cy(): number {
    return this.y - this.h / 2;
  }

  /* ---------------- 状态切换 ---------------- */

  setState(s: FState): void {
    this.state = s;
    this.stateT = 0;
  }

  /** 进入受击硬直 */
  hurt(dmg: number, fromX: number, knock: number, opts?: { knockdown?: boolean; launch?: boolean }): void {
    // 防御：任何非有限伤害都当成 0，避免 NaN 血量把整局游戏死锁
    if (!Number.isFinite(dmg)) dmg = 0;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 6;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(fromX, knock);
      return;
    }
    this.atk = null;
    const dir: 1 | -1 = this.x < fromX ? 1 : -1;
    this.facing = dir === this.facing ? (-this.facing as 1 | -1) : this.facing;
    this.vx = dir * knock;
    if (opts?.launch) {
      this.vy = -3.6;
      this.launchIntoKnockdown();
    } else if (opts?.knockdown) {
      this.launchIntoKnockdown();
    } else {
      this.vy = -0.9;
      this.hitstun = clamp(Math.round(6 + knock * 5), 4, HITSTUN_MAX);
      this.setState('hurt');
    }
  }

  private launchIntoKnockdown(): void {
    this.knockdowns++;
    this.hitstun = 0;
    this.setState('down');
    this.stateT = 0;
  }

  die(fromX: number, knock: number): void {
    this.dead = true;
    this.atk = null;
    this.knockdowns = this.maxKnockdowns + 1;
    this.vx = (this.x < fromX ? 1 : -1) * Math.max(2.2, knock);
    this.vy = -3.4;
    this.setState('thrown');
  }

  /** 被扔出屏幕 / 掉坑 */
  tossOut(dir: 1 | -1): void {
    this.outOfPlay = true;
    this.dead = true;
    this.inAir = true;
    this.setState('thrown');
    this.vx = dir * 5.2;
    this.vy = -2.2;
  }

  startGrab(target: Fighter): void {
    this.grabTarget = target;
    target.grabbedBy = this;
    target.setState('grabbed');
    target.atk = null;
    this.setState('grab');
    this.grabT = 0;
  }

  releaseGrab(): void {
    if (this.grabTarget) {
      this.grabTarget.grabbedBy = null;
      if (this.grabTarget.state === 'grabbed') this.grabTarget.setState('idle');
    }
    this.grabTarget = null;
    if (this.state === 'grab') this.setState('idle');
  }

  /* ---------------- 每帧推进 ---------------- */

  /** 物理与状态计时。子类在 super.step() 之前写输入意图 */
  step(): void {
    this.stateT++;
    this.anim++;
    if (this.flash > 0) this.flash--;
    if (this.hitstun > 0) this.hitstun--;
    if (this.invuln > 0) this.invuln--;

    // 硬直结束 → 回到可行动状态。
    // 少了这一行，任何被打中的敌人都会永久卡在 hurt，整波就永远清不掉。
    if (this.state === 'hurt' && this.hitstun <= 0) {
      this.setState(this.inAir ? 'air' : 'idle');
    }

    switch (this.state) {
      case 'down':
        // 倒地 → 到点直接退场（双截龙里打三次就滚）
        if (this.stateT >= KNOCKDOWN_FRAMES) {
          if (this.knockdowns > this.maxKnockdowns) {
            this.setState('dead');
            this.outOfPlay = true;
            this.vx = sign(this.vx || 1) * 2.4;
          } else {
            this.setState('getup');
            this.invuln = Math.max(this.invuln, 14);
          }
        }
        break;
      case 'getup':
        if (this.stateT >= GETUP_FRAMES) this.setState('idle');
        break;
      case 'thrown':
        // 被扔飞：飞出屏幕边界就判定退场
        break;
      default:
        break;
    }

    this.physics();
  }

  protected physics(): void {
    const gy = this.groundY();

    if (this.inAir) {
      this.vy += GRAVITY;
      if (this.vy > MAX_FALL) this.vy = MAX_FALL;
      this.y += this.vy;
      if (this.y >= gy) {
        this.y = gy;
        this.vy = 0;
        this.inAir = false;
        this.onLand();
      }
    } else {
      // 站地上：脚底永远吸附在当前深度带上，换档即刻生效
      this.y = gy;
      this.vy = 0;
    }

    this.x += this.vx;

    // 摩擦：地面减速，空中几乎不减速
    const friction = this.airborne ? 0.985 : 0.78;
    this.vx *= friction;
    if (Math.abs(this.vx) < 0.02) this.vx = 0;

    // 抓取中双方位置绑定
    if (this.state === 'grab' && this.grabTarget) {
      const t = this.grabTarget;
      t.x = this.x + this.facing * 15;
      t.y = this.y;
      t.band = this.band;
      t.facing = (-this.facing) as 1 | -1;
      this.grabT++;
    }
    if (this.state === 'grabbed' && this.grabbedBy) {
      this.grabT++;
    }
  }

  protected onLand(): void {}

  /** 被抓住的人挣扎太久会自己挣脱 */
  tickGrabBreak(): void {
    if (this.state === 'grabbed' && this.grabT > 150) {
      this.grabbedBy?.releaseGrab();
    }
  }

  /** 攻击判定盒（仅在 active 帧使用） */
  attackBox(): { x: number; y: number; w: number; h: number } | null {
    const a = this.atk;
    if (!a) return null;
    const r = a.def.range;
    const dir = a.dir;
    const cx = this.x + dir * (r * 0.5 + 4);
    const cy = this.y - this.h * 0.52;
    // 旋风腿 / 奥义是环形判定，用大盒子覆盖前后
    const wide = a.def.range > 36;
    const w = wide ? r * 1.5 : r;
    return { x: cx - w / 2, y: cy - 16, w, h: 32 };
  }

  /** 挥击特效坐标，渲染层用来画刀光 */
  updateFx(): void {
    const a = this.atk;
    if (!a) return;
    a.fx = this.x + a.dir * a.def.range * 0.55;
    a.fy = this.y - this.h * 0.5;
  }
}
