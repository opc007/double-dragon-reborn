/**
 * World —— 一关之内的完整模拟。
 *
 * 包含：刷怪波次、战斗判定、抓投、缴械、扔出屏幕、镜头锁死、过关。
 * 清版动作游戏的手感几乎全在这里：什么时候能往前、什么时候必须停下来清场。
 */

import {
  VIEW_W, VIEW_H, PLAYER_START_LIVES, TIME_START, TIME_FLOW,
  THROW_DAMAGE, CAM_LERP,
} from '../core/constants';
import { clamp, sign, boxOf, rectHit } from '../core/math';
import { audio } from '../core/audio';
import type { PadState } from '../core/input';
import { makeRNG, rint, type RNG } from '../core/rng';
import { Fighter } from '../entities/Fighter';
import { Player } from '../entities/Player';
import { Enemy, type EnemyThrow } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import type { WeaponId } from '../data/weapons';
import { getStage, type Stage } from '../data/levels';
import { buildBg, type Bg } from '../render/backgrounds';
import { statsOf, type DojoSave } from './dojo';

/**
 * 深度带可达性 —— 双截龙最核心的一条规则，抽成纯函数方便单测。
 *
 * 同一档才打得到；腾空或大范围招式（旋风腿/奥义）可以够到相邻一档。
 * 这条规则让"走位"和"输出"互相牵制，是清版动作游戏的灵魂。
 */
export function canReach(
  attackerBand: number,
  targetBand: number,
  range: number,
  airborne: boolean,
): boolean {
  const gap = Math.abs(targetBand - attackerBand);
  const longReach = airborne || range > 30;
  return gap <= (longReach ? 1 : 0.01);
}

export interface Pickup {
  x: number;
  y: number;
  id: WeaponId;
  /** 已被捡走，等下一帧清理 */
  take?: boolean;
  /** 下落速度 */
  vy: number;
  life: number;
}

export type WorldResult = 'running' | 'clear' | 'dead' | 'stageClear';

export class World {
  stage: Stage;
  bg: Bg;
  frame = 0;
  timer = TIME_START;
  result: WorldResult = 'running';
  /** 玩家剩余命（全局） */
  lives = PLAYER_START_LIVES;
  score = 0;
  coins = 0;

  players: Player[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  /** 命中特效 */
  sparks: { x: number; y: number; t: number; dir: number; size: number }[] = [];

  camX = 0;
  /** 镜头是否被锁住（清场中） */
  locked = false;
  twoPlayer = false;
  waveIdx = 0;
  /** 本波每个敌人 id 已经刷了几个，防止无限刷怪 */
  private waveSpawned = new Map<string, number>();
  /** 刷怪间隔（帧）。原作同屏只有 2 个敌人，靠分批进场制造压迫感 */
  private spawnCd = 0;
  /** 当前波次是否已触发（触发后必须打到清空，不看玩家位置） */
  private waveActive = false;
  /** BOSS 战是否已开始 */
  private bossActive = false;
  /** 本关要打的 BOSS 队列，按顺序一个个来 */
  private bossQueue: string[] = [];
  private bossIdx = 0; // 0=未打 1=第一个 2=第二个 3=完成
  private rng: RNG;
  private seedCounter = 0;
  /** 玩家死亡等待 */
  private deadT = 0;
  /** 过关庆祝计时 */
  private clearT = 0;
  /** 本关打出的最高等级 */
  reachedLevel = 1;

  constructor(stageIdx: number, save: DojoSave, p2: boolean) {
    this.twoPlayer = p2;
    // 拷贝一份：World 会往 stage 上挂 bg/坑等运行时状态，不能直接引用全局常量
    const src = getStage(stageIdx);
    this.stage = {
      ...src,
      waves: src.waves.map((w) => ({ ...w })),
      pits: src.pits.map((p) => ({ ...p })),
      intro: [...src.intro],
      outro: [...src.outro],
    };
    this.bg = buildBg(this.stage.bg, this.stage.seed);
    this.bg.pits = this.stage.pits;
    this.rng = makeRNG(this.stage.seed ^ 0x9e37);
    this.bossQueue = [this.stage.boss, this.stage.boss2].filter((b): b is string => !!b);
    this.coins = save.coins;
    this.score = save.bestScore;

    const st = statsOf(save);
    const p1 = new Player(st, this.lives);
    p1.x = 40;
    p1.band = 1;
    p1.y = p1.groundY();
    p1.score = this.score;
    this.players.push(p1);

    if (p2) {
      const p2p = new Player(st, this.lives, { ...p1.pal, top: '#e8413a' });
      p2p.x = 24;
      p2p.band = 1;
      p2p.y = p2p.groundY();
      this.players.push(p2p);
    }
  }

  get player(): Player {
    return this.players[0]!;
  }

  /** 是否真正的双人模式（AI 师弟不算） */
  get has2P(): boolean {
    return this.twoPlayer;
  }

  get alivePlayers(): Player[] {
    return this.players.filter((p) => !p.dead);
  }

  get livingEnemies(): Enemy[] {
    return this.enemies.filter((e) => !e.dead && !e.outOfPlay);
  }

  get alive(): boolean {
    return this.alivePlayers.length > 0;
  }

  /* ---------------- 主更新 ---------------- */

  update(pad1: PadState, pad2: PadState): void {
    this.frame++;
    if (this.spawnCd > 0) this.spawnCd--;
    if (this.result === 'running') {
      this.timer -= TIME_FLOW;
      if (this.timer <= 0) {
        this.timer = 0;
        this.killAllPlayers();
      }
    }

    // 玩家
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!;
      const pad = i === 0 ? pad1 : pad2;
      p.update(pad, { enemies: this.enemies, pickups: this.pickups, playerStart: 40 });
      // 道场轻功
      if (p.stats.speed > 0) p.vx *= 1 + p.stats.speed / 100 * 0.02;
      // 围栏：不能走出关卡范围
      p.x = clamp(p.x, 8, this.stage.length - 8);
      this.reachedLevel = Math.max(this.reachedLevel, p.level);
    }

    // 敌人
    const throws: EnemyThrow[] = [];
    for (const e of this.enemies) {
      const target = this.nearestPlayer(e.x);
      if (!target) { e.step(); continue; }
      const out = e.update(target);
      for (const t of out) throws.push(t);
      e.x = clamp(e.x, 4, this.stage.length - 4);
    }
    for (const t of throws) {
      this.projectiles.push(new Projectile(t.kind, t.x, t.y, t.vx, t.vy, t.band));
    }

    // 投射物
    for (const p of this.projectiles) {
      p.update();
      const hitSomething = this.resolveProjectile(p);
      if (!hitSomething) {
        // 打在地上
        if (p.y >= 218) { p.onImpact(); audio.sfx('break'); }
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    // 掉落物
    for (const p of this.pickups) {
      p.vy += 0.3;
      p.y += p.vy;
      if (p.y > 214) { p.y = 214; p.vy = 0; }
      if (--p.life <= 0) p.take = true;
    }
    this.pickups = this.pickups.filter((p) => !p.take);

    this.resolveCombat();
    this.handleGrab();
    this.checkPits();
    this.handleThrows();
    this.cleanup();
    this.updateWaves();
    this.updateCamera();
    this.updateSparks();

    // 死亡 / 过关结算
    if (this.result === 'running' && !this.alive) {
      this.deadT++;
      if (this.deadT > 90) this.result = 'dead';
    }
    if (this.result === 'stageClear') {
      this.clearT++;
    }
  }

  private nearestPlayer(x: number): Player | null {
    let best: Player | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.dead) continue;
      const d = Math.abs(p.x - x);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private killAllPlayers(): void {
    for (const p of this.players) {
      if (!p.dead) p.hurt(p.hp, p.x + 10, 3);
    }
  }

  /* ---------------- 战斗判定 ---------------- */

  private resolveCombat(): void {
    for (const a of this.allFighters()) {
      const atk = a.atk;
      if (!atk) continue;
      const d = atk.def;
      // active 帧才判定
      if (a.stateT < d.startup || a.stateT > d.startup + d.active) continue;

      const box = a.attackBox();
      if (!box) continue;

      for (const b of this.allFighters()) {
        if (b === a) continue;
        if (b.dead) continue;
        if (atk.hit.has(b)) continue;
        if (b.invuln > 0 && !(a instanceof Player)) continue;
        if (b.state === 'down' || b.state === 'getup') continue;

        // 跨深度带打不到 —— 双截龙的核心规则
        if (!canReach(a.band, b.band, d.range, a.airborne)) continue;

        if (!rectHit(box, boxOf(b))) continue;

        atk.hit.add(b);
        this.applyHit(a, b, atk.isSuper ? 1.5 : 1, atk);
      }
    }
  }

  private applyHit(
    attacker: Fighter,
    target: Fighter,
    mult: number,
    atk: NonNullable<Fighter['atk']>,
  ): void {
    const dmg = Math.max(1, Math.round(attacker.pendingDamage * mult * attacker.comboMult));
    const d = atk.def as { knock: number; knockdown?: boolean; launch?: boolean };
    const heavy = d.knock >= 2.4;
    target.hurt(dmg, attacker.x, d.knock, {
      knockdown: d.knockdown ?? heavy,
      launch: d.launch ?? false,
    });

    this.sparks.push({
      x: target.x - target.facing * 3, y: target.y - target.h * 0.5,
      t: 8, dir: attacker.facing, size: 6 + dmg * 0.4,
    });

    if (attacker instanceof Player) {
      attacker.onLandedHit();
      attacker.score += dmg;
      if (target.dead) this.onKill(attacker, target);
      // 徒手招式不消耗武器
    } else {
      (attacker as Enemy).onLandedHit();
    }

    if (target.dead) this.onKill(attacker, target);

    // 徒手重击有硬直收益，武器攻击消耗耐久
    if (attacker instanceof Player && atk.isMove === false) {
      attacker.consumeWeaponUse();
    }
  }

  private onKill(attacker: Fighter, victim: Fighter): void {
    const v = victim as Enemy;
    const drop = v.onDefeated?.() ?? null;
    if (drop && drop !== 'fist') {
      this.pickups.push({ x: v.x, y: v.y - 8, id: drop, vy: -1.4, life: 600 });
    }
    if (attacker instanceof Player) {
      const gain = Math.round((v.def?.exp ?? 30) * (1 + attacker.level * 0.08));
      const r = attacker.addExp(gain);
      attacker.coins += 6 + rint(this.rng, 0, 6);
      attacker.onKill();
      if (r.leveled) this.bump('升级！新招式解锁') ;
    }
    if (victim instanceof Player) {
      audio.sfx('ko');
    }
  }

  private bannerMsg = '';
  bannerT = 0;
  private bump(s: string): void {
    this.bannerMsg = s;
    this.bannerT = 110;
  }
  get bannerText(): string { return this.bannerT > 0 ? this.bannerMsg : ''; }

  /* ---------------- 抓取 ---------------- */

  private handleGrab(): void {
    for (const e of this.enemies) {
      const gb = e.grabbedBy;
      if (gb instanceof Player && e.state === 'grabbed') {
        // 抓住的敌人也会挣扎反击
        if (e.grabT === 70) {
          e.grabbedBy = null;
          gb.releaseGrab();
          e.facing = (-gb.facing) as 1 | -1;
          e.hurt(0, e.x, 0);
          gb.hurt(Math.round(e.def.damage * 0.8), e.x, 1.4);
        }
      }
      // 敌人抓住玩家：抓够时间后挣脱并反击
      const holder = e.grabbedBy;
      if (holder instanceof Enemy && e.state === 'grabbed' && e.grabT === 60) {
        e.grabbedBy = null;
        holder.releaseGrab();
        holder.hurt(Math.round(holder.def.damage * 0.9), e.x, 1.8);
        audio.sfx('hitHeavy');
      }
    }
  }

  /* ---------------- 投掷 / 扔出屏幕 ---------------- */

  private handleThrows(): void {
    for (const e of this.enemies) {
      if (e.state !== 'thrown' || e.dead === false) {
        // 非投掷态
      }
      if (e.state === 'thrown' && e.throwFrom) {
        e.vx = e.throwFrom.vx;
        e.vy = e.throwFrom.vy;
        e.throwFrom = null;
        audio.sfx('throw');
      }
      // 被扔飞时撞到别的敌人
      if (e.state === 'thrown' && !e.dead) {
        for (const o of this.enemies) {
          if (o === e || o.dead) continue;
          if (Math.abs(o.band - e.band) > 0.01) continue;
          if (!rectHit(boxOf(e), boxOf(o))) continue;
          const d = THROW_DAMAGE;
          o.hurt(d, e.x, 3.2, { knockdown: true });
          e.hurt(d, o.x, 2.0, { knockdown: true });
          this.sparks.push({ x: o.x, y: o.y - 14, t: 8, dir: sign(e.vx) || 1, size: 12 });
          audio.sfx('hitHeavy');
          if (o.dead) this.onKill(e, o);
          if (e.dead) this.onKill(o, e);
          break;
        }
      }
      // 扔出画面 = 直接退场（原作经典操作）
      if (e.state === 'thrown' && e.outOfPlay) {
        const left = e.x - this.camX;
        if (left < -40 || left > VIEW_W + 40) {
          if (!e.dead) {
            e.hurt(e.hp, e.x + sign(e.vx) * 10, 2);
            this.onKill(this.nearestPlayerOrDummy(), e);
          }
        }
      }
    }
  }

  private nearestPlayerOrDummy(): Fighter {
    return this.players[0] ?? ({} as Fighter);
  }

  /* ---------------- 投射物命中 ---------------- */

  private resolveProjectile(p: Projectile): boolean {
    // 炸药碰到任何东西都炸
    if (p.kind === 'dynamite') {
      for (const pl of this.players) {
        if (pl.dead) continue;
        if (pl.band !== p.band) continue;
        if (rectHit(p.box(), boxOf(pl))) {
          pl.hurt(p.damage, p.x, 3.4, { knockdown: true });
          audio.sfx('explode');
          this.sparks.push({ x: pl.x, y: pl.y - 12, t: 14, dir: 1, size: 22 });
          return true;
        }
      }
      return false;
    }

    for (const pl of this.players) {
      if (pl.dead) continue;
      if (pl.band !== p.band) continue;
      if (!rectHit(p.box(), boxOf(pl))) continue;
      pl.hurt(p.damage, p.x, p.heavy ? 3.6 : 1.6, { knockdown: p.heavy });
      audio.sfx(p.heavy ? 'hitHeavy' : 'punch');
      this.sparks.push({ x: pl.x, y: pl.y - 14, t: 8, dir: sign(p.vx) || 1, size: p.heavy ? 14 : 8 });
      return true;
    }
    return false;
  }

  /* ---------------- 清理 ---------------- */

  private allFighters(): Fighter[] {
    return [...this.players, ...this.enemies];
  }

  /** 深坑判定：踩上去就掉下去（原作里这招能一次送走好几个） */
  private checkPits(): void {
    const pits = this.stage.pits;
    if (!pits || pits.length === 0) return;
    for (const f of this.allFighters()) {
      if (f.dead) continue;
      if (f.inAir) continue;                 // 滞空时不算踩空
      for (const p of pits) {
        if (f.x > p.x && f.x < p.x + p.w) {
          f.inAir = true;
          f.vy = -1.2;
          f.vx = 0;
          f.setState('thrown');
          if (f instanceof Player) {
            f.hurt(f.hp, f.x, 0);           // 掉坑直接算死
          } else {
            f.dead = true;
            f.outOfPlay = true;
            f.hurt(f.hp, f.x, 0);
          }
          break;
        }
      }
    }
  }

  private cleanup(): void {
    for (const p of this.players) {
      if (!p.dead) continue;
      // 掉出画面底部 = 彻底退场（深坑里就是靠这个判定）
      if (p.y > VIEW_H + 20) p.outOfPlay = true;
    }
    this.enemies = this.enemies.filter((e) => {
      if (e.state === 'dead') return false;
      if (e.outOfPlay && e.y > VIEW_H + 30) return false;
      if (e.outOfPlay && e.x - this.camX < -60) return false;
      // 尸体飞一会儿再清掉，留够倒地动画但不让数组无限涨
      if (e.dead && e.anim > 200) return false;
      return true;
    });
  }

  /* ---------------- 波次 ---------------- */

  /**
   * 波次管理。
   *
   * 关键：一旦某波被触发，就进入"该波进行中"的显式状态，直到真的清空为止。
   * 之前每帧重算"玩家是否越过触发点"，结果玩家被击退到触发点后面时，
   * 整波会永远卡住——锁着镜头、又不再刷怪，玩家只能等计时器归零。
   */
  private updateWaves(): void {
    if (this.result !== 'running') return;
    const lead = this.alivePlayers[0];
    if (!lead) return;
    if (this.bannerT > 0) this.bannerT--;

    /* ---------- 普通波次 ---------- */
    if (this.waveIdx < this.stage.waves.length) {
      const wave = this.stage.waves[this.waveIdx]!;
      if (!this.waveActive && lead.x >= wave.x) {
        this.waveActive = true;
        this.locked = true;
        this.waveSpawned.clear();
        this.spawnCd = 26;
        audio.sfx('select');
        if (wave.loot) {
          for (const id of wave.loot) {
            this.pickups.push({
              x: clamp(lead.x + this.rint(-30, 60), 20, this.stage.length - 20),
              y: 190, id, vy: 0, life: 900,
            });
          }
        }
      }

      if (this.waveActive) {
        // 补人：按名册分批进场，同屏不超过这一波的上限
        const living = this.enemies.filter((e) => !e.dead).length;
        if (living < wave.max && this.spawnCd <= 0) {
          const quota = new Map<string, number>();
          for (const id of wave.enemies) quota.set(id, (quota.get(id) ?? 0) + 1);
          const pool = wave.enemies.filter(
            (id) => (this.waveSpawned.get(id) ?? 0) < (quota.get(id) ?? 0),
          );
          if (pool.length) {
            const id = pool[this.rint(0, pool.length - 1)]!;
            this.waveSpawned.set(id, (this.waveSpawned.get(id) ?? 0) + 1);
            this.spawnEnemy(id, lead.x + 74 + this.rint(0, 34), this.rint(0, 2));
            this.spawnCd = 24;
          }
        }
        // 名额刷完且全部倒下 = 真的清场了
        // 注意 waveSpawned.size > 0：空数组 every() 恒为 true，会把刚触发的波直接判成清空
        if (this.waveSpawned.size > 0 && this.enemies.every((e) => e.dead)) {
          this.waveIdx++;
          this.waveActive = false;
          this.locked = false;
          this.waveSpawned.clear();
          this.spawnCd = 0;
          this.timer = TIME_START;      // 每清一波补满计时（原作行为）
          this.bump('清场！');
        }
        return;
      }
    }

    /* ---------- BOSS ---------- */
    if (this.bossQueue.length > 0) {
      const allDown = this.enemies.every((e) => e.dead);
      if (this.bossActive && allDown) {
        this.bossActive = false;
        this.locked = false;
        if (this.bossIdx >= this.bossQueue.length) {
          this.result = 'stageClear';
          this.lives = Math.min(5, this.lives + 1);   // 通关补一条命
          this.bump('关卡通过！');
          return;
        }
      }
      if (
        !this.bossActive &&
        this.bossIdx < this.bossQueue.length &&
        lead.x >= this.stage.length - 130
      ) {
        this.bossActive = true;
        this.locked = true;
        this.spawnEnemy(this.bossQueue[this.bossIdx]!, lead.x + 80, 1, true);
        this.bump('BOSS 登场');
        audio.sfx('boss');
        this.bossIdx++;
      }
    } else if (this.waveIdx >= this.stage.waves.length) {
      this.result = 'stageClear';
      this.lives = Math.min(5, this.lives + 1);
      this.bump('关卡通过！');
    }
  }

  private spawnEnemy(id: string, x: number, band: number, isBoss = false): void {
    const e = new Enemy(id, clamp(x, 20, this.stage.length - 20), band, this.stage.seed + this.seedCounter++);
    if (isBoss) {
      e.hpMax = Math.round(e.hpMax * 1.0);
      e.hp = e.hpMax;
    }
    this.enemies.push(e);
  }

  /* ---------------- 镜头 ---------------- */

  private updateCamera(): void {
    const lead = this.alivePlayers[0];
    if (!lead) return;
    const target = lead.x - VIEW_W * 0.42 + lead.facing * 20;
    const maxX = Math.max(0, this.stage.length - VIEW_W);
    let want = clamp(target, 0, maxX);

    if (this.locked) {
      // 锁镜头只限制"往前推进"，绝不把玩家甩出画面
      const gate = this.stage.waves[this.waveIdx]?.x ?? this.stage.length + 400;
      want = Math.min(want, clamp(gate - VIEW_W + 30, 0, maxX));
    }
    // 无论怎么锁，玩家必须始终留在画面内
    want = clamp(want, lead.x - VIEW_W + 34, lead.x - 34);
    want = clamp(want, 0, maxX);
    this.camX += (want - this.camX) * CAM_LERP;
    this.camX = clamp(this.camX, 0, maxX);
  }

  private updateSparks(): void {
    for (const s of this.sparks) s.t--;
    this.sparks = this.sparks.filter((s) => s.t > 0);
  }

  /* ---------------- 死亡处理 ---------------- */

  /** 全部玩家阵亡：扣一条命，重的从关卡头再来（原作行为） */
  consumeLife(): boolean {
    this.lives--;
    if (this.lives <= 0) return false;
    for (const p of this.players) {
      p.lives = this.lives;
      p.respawn(40, 1);
      p.score = this.score;
    }
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.waveIdx = 0;
    this.waveSpawned.clear();
    this.waveActive = false;
    this.bossIdx = 0;
    this.bossActive = false;
    this.spawnCd = 0;
    this.locked = false;
    this.camX = 0;
    this.timer = TIME_START;
    this.result = 'running';
    this.deadT = 0;
    this.bump('再来！');
    return true;
  }

  get clearTimer(): number {
    return this.clearT;
  }

  get deadTimer(): number {
    return this.deadT;
  }

  rint(a: number, b: number): number {
    return rint(this.rng, a, b);
  }
}
