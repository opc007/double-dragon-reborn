/**
 * Player —— 玩家角色。
 *
 * 复刻 FC 版的等级成长：打敌人攒经验，每 1000 经验升一级，逐级解锁招式。
 * 这是原作最独特的设计——玩家前两关很弱，第三关开始突然能上勾拳把人打飞。
 * 那个"突然变强"的手感是复刻的题眼。
 *
 * 新增（原作没有）：气 / Chi 系统。命中攒气，气满放全屏奥义。
 */

import {
  PLAYER_HP_MAX, PLAYER_SPEED, PLAYER_JUMP_V, MAX_LEVEL, EXP_PER_LEVEL,
  CHI_MAX, CHI_ON_HIT, CHI_ON_KILL, SUPER_FRAMES, GRAB_RANGE, THROW_VX, THROW_VY,
  HITSTUN_MAX,
} from '../core/constants';
import { clamp, dist2, sign } from '../core/math';
import type { PadState } from '../core/input';
import { audio } from '../core/audio';
import { Fighter, type ActiveAttack } from './Fighter';
import { MOVES, type MoveId } from '../data/moves';
import { WEAPONS, type WeaponId, type WeaponDef } from '../data/weapons';
import { BILLY_PAL } from '../data/enemies';
import type { DojoStats } from '../systems/dojo';

export class Player extends Fighter {
  /* ---- 成长 ---- */
  level = 1;
  exp = 0;
  chi = 0;

  /* ---- 战斗统计 ---- */
  lives: number;
  score = 0;
  coins = 0;
  combo = 0;
  comboT = 0;
  private comboNext: MoveId = 'punch';

  /* ---- 武器 ---- */
  weapon: WeaponId = 'fist';
  weaponLeft = 0;

  /* ---- 强化（道场升级） ---- */
  stats: DojoStats;

  /** 无敌帧计数（复活/换场） */
  private respawnInv = 0;

  constructor(stats: DojoStats, lives: number, pal = BILLY_PAL) {
    super();
    this.stats = stats;
    this.lives = lives;
    this.pal = { ...pal };
    this.isPlayer = true;
    this.hpMax = PLAYER_HP_MAX + stats.vit;
    this.hp = this.hpMax;
    // 玩家靠命数，不靠倒地次数
    this.invuln = 60;
  }

  get chiFull(): boolean {
    return this.chi >= CHI_MAX;
  }

  /** 按当前等级和解锁的招式表，决定这次按键该出什么招 */
  private pickMove(pad: PadState): MoveId | null {
    if (this.airborne) {
      // 空中：Lv7 解锁旋风腿，否则是普通跳拳
      if (pad.punch && this.level >= 7) return 'spinKick';
      if (pad.kick && this.level >= 3) return 'jumpKick';
      if (pad.punch) return 'punch';
      if (pad.kick) return 'kick';
      return null;
    }

    // 蹲方向 + 拳 = 上勾拳，+ 脚 = 回旋踢
    if (pad.down && pad.punch && this.level >= 2) return 'uppercut';
    if (pad.down && pad.kick && this.level >= 2) return 'roundhouse';

    // 连段：拳→脚→拳 循环，比单按多一点点收益
    if (pad.punch) return this.level >= 1 ? (this.comboNext === 'punch' ? 'punch' : this.comboNext) : null;
    if (pad.kick) return 'kick';
    return null;
  }

  private startMove(id: MoveId, isSuper = false): void {
    const def = MOVES[id];
    const lvBonus = isSuper ? 0 : (this.level - 1) * def.growth;
    const dmgScale = 1 + this.stats.power / 100;
    const a: ActiveAttack = {
      def,
      isMove: true,
      isSuper,
      hit: new Set(),
      fx: this.x,
      fy: this.y,
      dir: this.facing,
      tick: 0,
    };
    this.atk = a;
    this.pendingDamage = Math.round((def.damage + lvBonus) * dmgScale * (isSuper ? 1 : 1));
    this.setState(isSuper ? 'super' : 'attack');
    if (isSuper) audio.sfx('super');
    else audio.sfx(id === 'kick' || id === 'roundhouse' || id === 'jumpKick' || id === 'spinKick' ? 'kick' : 'punch');
  }

  private startWeapon(w: WeaponDef): void {
    this.atk = {
      def: w, isMove: false, isSuper: false, hit: new Set(),
      fx: this.x, fy: this.y, dir: this.facing, tick: 0,
    };
    this.pendingDamage = Math.round(w.damage * (1 + this.stats.power / 100));
    this.setState('attack');
    audio.sfx(w.id === 'whip' ? 'whiff' : 'kick');
  }

  /* ---------------- 主更新 ---------------- */

  update(pad: PadState, ctx: {
    enemies: Fighter[];
    pickups: { x: number; y: number; id: WeaponId }[];
    playerStart: number;
  }): void {
    this.tickGrabBreak();

    if (this.comboT > 0) {
      this.comboT--;
      if (this.comboT === 0) { this.combo = 0; this.comboNext = 'punch'; }
    }
    if (this.respawnInv > 0) this.respawnInv--;

    const controllable = !this.dead && this.hitstun <= 0 &&
      (this.state === 'idle' || this.state === 'walk' || this.state === 'air' || this.state === 'grab');

    // 抓取中：只能出抓招或挣脱
    if (this.state === 'grab') {
      this.updateGrab(pad);
      this.step();
      return;
    }

    // 奥义优先响应
    if (controllable && pad.pressedSuper && this.chiFull && !this.airborne) {
      this.chi = 0;
      this.startMove('super', true);
      this.step();
      return;
    }

    // 招式状态：只跑计时，不接受新输入（靠收招帧做连段节奏）
    if (this.state === 'attack' || this.state === 'super') {
      this.updateAttackState();
      this.step();
      return;
    }

    if (controllable) {
      this.handleMovement(pad, ctx);
      this.handleAttackInput(pad, ctx);
    }

    this.step();
    // 受击保护：被打后给一小段无敌，避免被 3 个敌人围着连打到死
    if (this.hitstun > 0 && this.hitstun === HITSTUN_MAX) this.invuln = Math.max(this.invuln, 16);
  }

  private handleMovement(pad: PadState, ctx: { enemies: Fighter[]; playerStart: number }): void {
    if (this.state !== 'idle' && this.state !== 'walk' && this.state !== 'air') return;

    // 纵深：上下切档
    if (!this.airborne) {
      if (pad.up && this.band > 0) { this.band--; this.setState(this.state === 'walk' ? 'walk' : 'idle'); }
      if (pad.down && this.band < 2) { this.band++; this.setState(this.state === 'walk' ? 'walk' : 'idle'); }
    }

    // 水平
    if (pad.dx !== 0) {
      this.facing = pad.dx > 0 ? 1 : -1;
      this.vx = PLAYER_SPEED * pad.dx;
      if (this.state !== 'air') this.setState('walk');
    } else if (this.state === 'walk') {
      this.setState('idle');
    }

    // 跳跃
    if (pad.pressedJump && !this.airborne) {
      this.vy = PLAYER_JUMP_V;
      this.y -= 0.1;
      this.inAir = true;
      this.setState('air');
      audio.sfx('jump');
    }

    // 走路撞进敌人身体 = 抓取（原作核心操作）
    if (!this.airborne && this.vx !== 0 && this.atk === null) {
      const tgt = this.findGrabTarget(ctx.enemies);
      if (tgt) this.startGrab(tgt);
    }
  }

  private findGrabTarget(list: Fighter[]): Fighter | null {
    for (const e of list) {
      if (!e.alive || e.outOfPlay) continue;
      if (e.band !== this.band) continue;
      if (e.state === 'down' || e.state === 'getup' || e.state === 'thrown') continue;
      // 必须从正面或背后贴上；这里只要距离够
      if (Math.abs(e.x - this.x) > GRAB_RANGE) continue;
      if (Math.abs(e.y - this.y) > 6) continue;
      return e;
    }
    return null;
  }

  private handleAttackInput(pad: PadState, ctx: {
    enemies: Fighter[];
    pickups: { x: number; y: number; id: WeaponId }[];
  }): void {
    // 捡起地上的武器
    if (pad.pressedPunch || pad.pressedKick) {
      const p = this.nearPickup(ctx.pickups);
      if (p) {
        this.weapon = p.id;
        this.weaponLeft = WEAPONS[p.id].durability;
        p.take = true;
        audio.sfx('weapon');
        return;
      }
    }

    // 扔出手上的武器
    if (this.weapon !== 'fist' && this.weaponLeft > 0 &&
      (WEAPONS[this.weapon].throwable) && pad.pressedKick && pad.down) {
      this.throwWeapon = { id: this.weapon, dir: this.facing };
      this.weapon = 'fist';
      this.weaponLeft = 0;
      audio.sfx('throw');
      return;
    }

    // 敌人绕到背后 → 霸王肩（Lv6）
    if (this.level >= 6 && pad.pressedPunch) {
      const behind = ctx.enemies.find(
        (e) => e.alive && !e.outOfPlay && e.band === this.band &&
          Math.abs(e.x - this.x) < 24 &&
          sign(e.x - this.x) === this.facing,
      );
      if (behind) {
        this.facing = behind.x > this.x ? -1 : 1;
        this.startMove('elbow');
        return;
      }
    }

    // 持械时用武器代替徒手
    if ((pad.pressedPunch || pad.pressedKick) && this.weapon !== 'fist' && this.weaponLeft > 0) {
      const w = WEAPONS[this.weapon];
      this.startWeapon(w);
      return;
    }

    const mv = this.pickMove(pad);
    if (mv) {
      this.startMove(mv);
      // 拳/脚交替，连段收益递增
      if (mv === 'punch') this.comboNext = 'kick';
      else if (mv === 'kick') this.comboNext = 'punch';
    }
  }

  throwWeapon: { id: WeaponId; dir: 1 | -1 } | null = null;

  private nearPickup(list: { x: number; y: number; id: WeaponId; take?: boolean }[]) {
    for (const p of list) {
      if (p.take) continue;
      if (dist2(p.x, p.y, this.x, this.y) < 22 * 22) return p;
    }
    return null;
  }

  /* ---------------- 抓取中的操作 ---------------- */

  private updateGrab(pad: PadState): void {
    const t = this.grabTarget;
    if (!t || !t.alive) { this.releaseGrab(); return; }

    // 挣脱
    if (pad.dx !== 0 && sign(pad.dx) !== this.facing) { this.releaseGrab(); return; }
    if (pad.pressedJump) { this.releaseGrab(); return; }

    // 过肩摔（Lv4）
    if (this.level >= 4 && pad.pressedKick) {
      this.releaseGrab();
      t.hurt(0, this.x, 0);
      t.throwFrom = { vx: this.facing * THROW_VX, vy: THROW_VY };
      t.setState('thrown');
      t.facing = (-this.facing) as 1 | -1;
      audio.sfx('throw');
      return;
    }

    // 膝撞 / 骑马掌掴（Lv4 / Lv5）
    if (pad.pressedPunch) {
      const id: MoveId = this.level >= 5 ? 'pin' : this.level >= 4 ? 'knee' : 'headbutt';
      const def = MOVES[id];
      const dmg = Math.round((def.damage + (this.level - 1) * def.growth) * (1 + this.stats.power / 100));
      t.hurt(dmg, this.x, 0.4);
      this.gainChi(CHI_ON_HIT);
      this.bumpCombo();
      audio.sfx('punch');
      this.setState('attack');
      this.stateT = 0;
    }
  }

  /* ---------------- 招式计时 ---------------- */

  private updateAttackState(): void {
    const a = this.atk;
    if (!a) { this.setState('idle'); return; }
    const d = a.def;
    a.tick++;
    this.updateFx();

    if (a.isSuper) {
      if (this.stateT >= SUPER_FRAMES) {
        this.atk = null;
        this.setState('idle');
      }
      return;
    }

    // 多段招式（骑马掌掴、旋风腿）在 active 期间重复判定
    if (this.stateT >= d.startup + d.active) {
      if (a.def.id === 'pin' && this.state === 'grab') return; // pin 由抓取逻辑驱动
      this.atk = null;
      this.setState('idle');
    }
  }

  /* ---------------- 成长 ---------------- */

  addExp(n: number): { leveled: boolean; newMove: string | null } {
    this.exp += n;
    let leveled = false;
    let newMove: string | null = null;
    while (this.level < MAX_LEVEL && this.exp >= EXP_PER_LEVEL) {
      this.exp -= EXP_PER_LEVEL;
      this.level++;
      leveled = true;
      newMove = null;
      this.hp = this.hpMax;
    }
    if (leveled) {
      audio.sfx('levelup');
      // 按 MOVES 声明顺序取该级第一招（声明顺序即"解锁顺序"）
      for (const m of Object.values(MOVES)) {
        if (m.id !== 'super' && m.lv === this.level) { newMove = m.name; break; }
      }
    }
    return { leveled, newMove };
  }

  gainChi(n: number): void {
    this.chi = clamp(this.chi + n, 0, CHI_MAX);
  }

  onLandedHit(): void {
    this.gainChi(CHI_ON_HIT);
    this.bumpCombo();
  }

  onKill(): void {
    this.gainChi(CHI_ON_KILL);
    this.score += 100 * this.level;
  }

  private bumpCombo(): void {
    this.combo++;
    this.comboT = 60;
  }

  override get comboMult(): number {
    return 1 + Math.min(this.combo, 8) * 0.045;
  }

  consumeWeaponUse(): void {
    if (this.weaponLeft > 0) {
      this.weaponLeft--;
      if (this.weaponLeft <= 0) this.weapon = 'fist';
    }
  }

  /** 复活：回满血、保留等级和经验（原作死亡回退流程，这里改成保留） */
  respawn(x: number, band: number): void {
    this.dead = false;
    this.outOfPlay = false;
    this.hp = this.hpMax;
    this.x = x;
    this.band = band;
    this.y = this.groundY();
    this.vx = 0;
    this.vy = 0;
    this.setState('idle');
    this.inAir = false;
    this.atk = null;
    this.releaseGrab();
    this.invuln = 60;
    this.respawnInv = 60;
    this.combo = 0;
  }
}
