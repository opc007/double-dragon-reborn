/**
 * Enemy —— 黑武士帮成员。
 *
 * AI 刻意保持"笨"：直线上压、贴脸就出招、偶尔后撤。
 * 清版动作游戏的敌人一旦聪明就不好玩了——原作用几十行代码就能让 80 年代的人玩得爽，
 * 靠的不是聪明，是**压迫感**：永远有一个贴脸，另一个在后面扔东西。
 */

import { Fighter, type ActiveAttack } from './Fighter';
import { ENEMIES, type EnemyDef } from '../data/enemies';
import { WEAPONS, type WeaponId } from '../data/weapons';
import { sign } from '../core/math';
import { audio } from '../core/audio';
import { makeRNG, type RNG } from '../core/rng';

export type ThrowKind = 'rock' | 'barrel' | 'knife' | 'dynamite' | 'bullet';

export interface EnemyThrow {
  kind: ThrowKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  band: number;
  life: number;
}

export class Enemy extends Fighter {
  def: EnemyDef;
  /** 行为随机数发生器，用固定种子保证可复现 */
  private rng: RNG;
  private cd: number;
  /** 当前决策的思考计时 */
  private think = 0;
  /** 状态机意图 */
  private intent: 'idle' | 'approach' | 'retreat' | 'align' | 'wait' = 'idle';
  /** 抓玩家用的计时 */
  private grabCd = 0;
  /** BOSS 阶段 */
  phase = 0;
  /** 被玩家打中后的额外硬直（可被 BOSS 招式延长） */
  private flinch = 0;
  /** 死亡掉落 */
  drop: WeaponId | null = null;
  /** 举枪蓄力提示 */
  charge = 0;

  constructor(id: string, x: number, band: number, seed: number) {
    super();
    const def = ENEMIES[id];
    if (!def) throw new Error(`unknown enemy: ${id}`);
    this.def = def;
    this.rng = makeRNG(seed);
    this.pal = { ...def.pal };
    this.hair = def.hair;
    this.scale = def.scale;
    this.h = Math.round(30 * def.scale);
    this.w = Math.round(15 * def.scale);
    this.hpMax = def.hp;
    this.hp = def.hp;
    this.x = x;
    this.band = band;
    this.y = this.groundY();
    this.facing = -1;
    this.cd = 30 + Math.floor(this.rng() * 40);
    this.drop = def.weapon !== 'fist' ? def.weapon : null;
    // BOSS 不适用"倒地三次就滚"的小兵规则，必须实打实打死
    if (this.isBoss) this.maxKnockdowns = 99;
  }

  get isBoss(): boolean {
    return this.def.ai === 'boss' || this.def.ai === 'gun';
  }

  /* ---------------- AI ---------------- */

  update(player: Fighter): EnemyThrow[] {
    this.tickGrabBreak();
    if (this.flinch > 0) this.flinch--;
    if (this.cd > 0) this.cd--;
    if (this.grabCd > 0) this.grabCd--;

    if (this.dead) { this.step(); return []; }
    if (this.hitstun > 0 || this.state === 'hurt' || this.state === 'down' ||
      this.state === 'getup' || this.state === 'thrown') {
      this.step();
      return [];
    }
    if (this.state === 'grabbed') { this.step(); return []; }

    const throws: EnemyThrow[] = [];
    const dx = player.x - this.x;
    const adx = Math.abs(dx);
    const sameBand = player.band === this.band;

    // 持枪 BOSS：远距离点名
    if (this.def.ai === 'gun') {
      if (adx > 40 && this.cd <= 0 && this.charge === 0) {
        this.charge = 26;
        this.setState('idle');
      }
      if (this.charge > 0) {
        this.charge--;
        this.facing = sign(dx) || this.facing;
        if (this.charge === 0) {
          const dir = sign(dx) || 1;
          throws.push({
            kind: 'bullet', x: this.x + dir * 12, y: this.y - this.h * 0.6,
            vx: dir * 4.6, vy: 0, band: this.band, life: 150,
          });
          audio.sfx('punch');
          this.cd = 40;
        }
        this.step();
        return throws;
      }
    }

    // 对齐纵深：原作里敌人会主动挤到你那一档，先把距离感建立起来
    if (!sameBand && adx < this.def.aggro) {
      if (player.band > this.band) this.band++;
      else if (player.band < this.band) this.band--;
      this.facing = sign(dx) || this.facing;
      this.step();
      return throws;
    }

    if (adx > this.def.aggro + 40) {
      this.intent = 'idle';
      this.step();
      return throws;
    }
    // 刚好卡在索敌边界外：慢慢压上去，别在原地罚站
    const onEdge = adx > this.def.aggro;

    // 决策
    if (--this.think <= 0) {
      this.think = 8 + Math.floor(this.rng() * 14);
      this.decide(adx, sameBand);
    }
    // 边界外也要压上，否则会站桩
    if (onEdge) this.intent = 'approach';

    switch (this.intent) {
      case 'approach': {
        this.facing = sign(dx) || this.facing;
        const spd = this.def.speed * (this.isBoss && this.phase > 0 ? 1.25 : 1);
        this.vx = spd * (sign(dx) || 1);
        if (!onEdge && adx < this.def.reach - 2 && this.cd <= 0) this.doAttack(player, throws);
        break;
      }
      case 'retreat': {
        this.facing = sign(dx) || this.facing;
        this.vx = -this.def.speed * 0.8 * (sign(dx) || 1);
        if (this.cd <= 0) this.doAttack(player, throws);
        break;
      }
      case 'align':
        this.vx = 0;
        if (sameBand && this.cd <= 0) this.doAttack(player, throws);
        break;
      case 'wait':
        this.vx = 0;
        if (this.cd <= 0) this.intent = 'approach';
        break;
      default:
        this.vx = 0;
    }

    this.step();
    return throws;
  }

  private decide(adx: number, sameBand: boolean): void {
    const r = this.rng();
    if (this.isBoss) {
      // BOSS 更有侵略性，会主动贴上来
      this.intent = r < 0.78 ? 'approach' : 'retreat';
      return;
    }
    if (!sameBand) { this.intent = 'align'; return; }
    if (adx > this.def.reach) this.intent = 'approach';
    else if (adx < this.def.reach - 8 && r < 0.22) this.intent = 'retreat';
    else if (r < 0.18) this.intent = 'wait';
    else this.intent = 'approach';
  }

  private doAttack(player: Fighter, throws: EnemyThrow[]): void {
    const dir = sign(player.x - this.x) || this.facing;
    this.facing = dir as 1 | -1;
    const w = this.def.weapon === 'fist' ? null : WEAPONS[this.def.weapon];

    // 扔东西的：优先远程
    if ((this.def.ai === 'thrower' || this.def.ai === 'boss') && this.rng() < 0.34) {
      const kinds: ThrowKind[] = this.def.weapon === 'barrel'
        ? ['barrel', 'rock', 'rock']
        : ['rock', 'barrel'];
      const kind = kinds[Math.floor(this.rng() * kinds.length)]!;
      this.hurtSelf(6);
      throws.push({
        kind, x: this.x + dir * 10, y: this.y - this.h * 0.6,
        vx: dir * (kind === 'barrel' ? 2.1 : 2.9), vy: kind === 'barrel' ? -2.4 : -0.6,
        band: this.band, life: 160,
      });
      this.cd = this.def.cooldown;
      this.setState('attack');
      this.stateT = 0;
      audio.sfx('whiff');
      return;
    }

    const reach = w ? w.range : this.def.reach;
    if (Math.abs(player.x - this.x) > reach) { this.intent = 'approach'; return; }

    // 抓人
    if (this.def.canGrab && this.grabCd <= 0 && this.rng() < 0.28) {
      if (player instanceof Fighter && player.band === this.band && Math.abs(player.x - this.x) < 16) {
        this.grabCd = 150;
        this.startGrab(player);
        return;
      }
    }

    const atk: ActiveAttack = {
      def: w ?? { ...WEAPONS.fist, range: this.def.reach, damage: this.def.damage, startup: 8, active: 4, recover: 14 },
      isMove: false, isSuper: false, hit: new Set(),
      fx: this.x, fy: this.y, dir, tick: 0,
    };
    this.atk = atk;
    this.pendingDamage = w ? w.damage : this.def.damage;
    this.setState('attack');
    this.cd = this.def.cooldown + Math.floor(this.rng() * 22);
    audio.sfx(this.def.ai === 'whip' ? 'whiff' : 'kick');
  }

  /** 扔东西时的自伤演出 */
  private hurtSelf(n: number): void {
    this.hp = Math.max(1, this.hp - n);
    this.flash = 3;
  }

  /** 挥击计时 */
  step(): void {
    if (this.state === 'attack') {
      const a = this.atk;
      this.updateFx();
      if (a) {
        const d = a.def;
        if (this.stateT >= d.startup + d.active) {
          this.atk = null;
          this.setState('idle');
        }
      }
    }
    // BOSS 阶段推进
    if (this.isBoss) {
      const ratio = this.hp / this.hpMax;
      const want = ratio > 0.66 ? 0 : ratio > 0.33 ? 1 : 2;
      if (want > this.phase) {
        this.phase = want;
        this.flinch = 0;
        audio.sfx('boss');
      }
    }
    super.step();
  }

  onLandedHit(): void {
    this.flinch = 6;
  }

  /** 被打倒时掉落武器 */
  onDefeated(): WeaponId | null {
    if (this.drop && this.drop !== 'fist') {
      const d = this.drop;
      this.drop = null;
      return d;
    }
    return null;
  }
}
