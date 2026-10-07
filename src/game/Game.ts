/**
 * Game —— 顶层状态机 + 主循环 + 各个画面。
 *
 * 状态：title → mode → dojo → intro → play → (stageClear | gameOver | victory)
 */

import { VIEW_W, VIEW_H, PLAYER_START_LIVES, CHI_MAX } from '../core/constants';
import { clamp } from '../core/math';
import { Input } from '../core/input';
import { audio } from '../core/audio';
import { World } from '../systems/world';
import { driveDisciple } from '../systems/aiPad';
import {
  loadDojo, saveDojo, defaultSave, statsOf, UPGRADES, upgradeCost, type DojoSave,
} from '../systems/dojo';
import { STAGES, stageCount } from '../data/levels';
import { drawBg, drawVignette } from '../render/backgrounds';
import { drawFighter, drawHitFlash } from '../render/sprite';
import { drawHud, drawBanner, drawDialogue, drawCombo, text, FONT, FONT_S, FONT_L, FONT_XL } from '../render/hud';
import { Player } from '../entities/Player';
import { JIMMY_PAL } from '../data/enemies';

type S = 'title' | 'mode' | 'dojo' | 'intro' | 'play' | 'stageClear' | 'gameOver' | 'victory' | 'pause';

export class Game {
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  save: DojoSave = defaultSave();
  state: S = 'title';

  private world: World | null = null;
  private stageIdx = 0;
  private twoPlayer = false;
  private frame = 0;
  private stateT = 0;
  private modeSel = 0;
  private dojoSel = 0;
  private dojoT = 0;
  private titleBlink = 0;
  /** 结算滚动 */
  private tally = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.input = new Input();
    this.save = loadDojo();
  }

  /* ---------------- 状态切换 ---------------- */

  private go(s: S): void {
    this.state = s;
    this.stateT = 0;
  }

  private startGame(): void {
    this.stageIdx = 0;
    this.tally = 0;
    audio.playBgm('stage1');
    this.beginStage();
  }

  /** 调试 / 截图用：直接跳到某一关 */
  jumpTo(stageIdx: number, level = 7): void {
    this.stageIdx = Math.max(0, Math.min(stageCount - 1, stageIdx));
    this.beginStage();
    const p = this.world?.player;
    if (p) { p.level = level; p.chi = CHI_MAX; }
    this.go('play');
  }

  private beginStage(): void {
    const st = statsOf(this.save);
    const useDisciple = st.disciple && !this.twoPlayer;
    this.world = new World(this.stageIdx, this.save, this.twoPlayer);
    if (useDisciple) {
      const d = new Player(st, 99, JIMMY_PAL);
      d.x = 30;
      d.band = 1;
      d.y = d.groundY();
      d.hpMax = 60;
      d.hp = 60;
      this.world.players.push(d);
    }
    this.world.stage = STAGES[this.stageIdx]!;
    this.go('intro');
    audio.playBgm(this.stageIdx === 3 ? 'boss' : `stage${this.stageIdx + 1}`);
  }

  /* ---------------- 主循环 ---------------- */

  update(): void {
    this.frame++;
    this.stateT++;
    this.input.update();

    switch (this.state) {
      case 'title': this.updateTitle(); break;
      case 'mode': this.updateMode(); break;
      case 'dojo': this.updateDojo(); break;
      case 'intro': this.updateIntro(); break;
      case 'play': this.updatePlay(); break;
      case 'pause': this.updatePause(); break;
      case 'stageClear': this.updateStageClear(); break;
      case 'gameOver': this.updateGameOver(); break;
      case 'victory': this.updateVictory(); break;
    }

    this.input.endFrame();
  }

  private updateTitle(): void {
    this.titleBlink++;
    if (this.input.sysPressed('Enter') || this.input.sysPressed('Space')) {
      audio.sfx('select');
      this.go('mode');
    }
  }

  private updateMode(): void {
    const up = this.input.sysPressed('KeyW') || this.input.sysPressed('ArrowUp');
    const dn = this.input.sysPressed('KeyS') || this.input.sysPressed('ArrowDown');
    if (up) { this.modeSel = (this.modeSel + 2) % 3; audio.sfx('select'); }
    if (dn) { this.modeSel = (this.modeSel + 1) % 3; audio.sfx('select'); }
    if (this.input.sysPressed('Enter') || this.input.sysPressed('Space')) {
      audio.sfx('select');
      if (this.modeSel === 0) { this.twoPlayer = false; this.startGame(); }
      else if (this.modeSel === 1) { this.twoPlayer = true; this.startGame(); }
      else { this.go('dojo'); }
    }
    if (this.input.sysPressed('Escape')) this.go('title');
  }

  private updateDojo(): void {
    this.dojoT++;
    const up = this.input.sysPressed('KeyW');
    const dn = this.input.sysPressed('KeyS');
    if (up) { this.dojoSel = (this.dojoSel + UPGRADES.length - 1) % UPGRADES.length; audio.sfx('select'); }
    if (dn) { this.dojoSel = (this.dojoSel + 1) % UPGRADES.length; audio.sfx('select'); }
    const sel = UPGRADES[this.dojoSel]!;
    if ((this.input.sysPressed('Enter') || this.input.sysPressed('Space')) && this.save.coins > 0) {
      const cost = upgradeCost(this.save, sel.id);
      if (cost !== null && this.save.coins >= cost) {
        this.save.coins -= cost;
        this.save.lv[sel.id]++;
        saveDojo(this.save);
        audio.sfx('levelup');
      } else {
        audio.sfx('whiff');
      }
    }
    if (this.input.sysPressed('Escape')) this.go('mode');
  }

  private updateIntro(): void {
    if (this.stateT > 40 && (this.input.sysPressed('Enter') || this.input.sysPressed('Space'))) {
      this.go('play');
    }
    if (this.stateT > 260) this.go('play');
  }

  private disciplePrev = this.emptyPad();

  private emptyPad() {
    return {
      up: false, down: false, left: false, right: false,
      punch: false, kick: false, jump: false, superBtn: false,
      pressedPunch: false, pressedKick: false, pressedJump: false, pressedSuper: false,
      dx: 0, dy: 0,
    };
  }

  private updatePlay(): void {
    const w = this.world;
    if (!w) return;

    if (this.input.sysPressed('Escape') || this.input.sysPressed('KeyP')) {
      this.go('pause');
      return;
    }

    const p1 = this.input.pad1;
    let p2 = this.input.pad2;
    // 师弟 / 第二玩家用 AI 驱动
    if (w.players.length > 1) {
      const d = w.players[1]!;
      p2 = driveDisciple(d, w.players[0]!, w.enemies, this.disciplePrev);
      this.disciplePrev = p2;
    }

    w.update(p1, p2);
    audio.playBgm(w.enemies.some((e) => e.isBoss) ? 'boss' : `stage${this.stageIdx + 1}`);

    if (w.result === 'dead') {
      const ok = w.consumeLife();
      if (!ok) {
        this.save.bestScore = Math.max(this.save.bestScore, w.score);
        saveDojo(this.save);
        audio.stopBgm();
        this.go('gameOver');
      }
    } else if (w.result === 'stageClear') {
      this.save.coins = w.player.coins;
      this.save.bestScore = Math.max(this.save.bestScore, w.score);
      this.save.cleared = Math.max(this.save.cleared, this.stageIdx + 1);
      saveDojo(this.save);
      this.tally = 0;
      audio.stopBgm();
      this.go('stageClear');
    }
  }

  private updatePause(): void {
    if (this.input.sysPressed('Escape') || this.input.sysPressed('KeyP')) this.go('play');
  }

  private updateStageClear(): void {
    this.tally++;
    if (this.tally > 40 && (this.input.sysPressed('Enter') || this.input.sysPressed('Space'))) {
      if (this.stageIdx + 1 >= stageCount) {
        this.save.clears++;
        saveDojo(this.save);
        this.go('victory');
      } else {
        this.stageIdx++;
        this.beginStage();
      }
    }
    if (this.tally > 300) {
      if (this.stageIdx + 1 >= stageCount) this.go('victory');
      else { this.stageIdx++; this.beginStage(); }
    }
  }

  private updateGameOver(): void {
    if (this.stateT > 40 && (this.input.sysPressed('Enter') || this.input.sysPressed('Space'))) {
      this.go('title');
    }
  }

  private updateVictory(): void {
    if (this.stateT > 40 && (this.input.sysPressed('Enter') || this.input.sysPressed('Space'))) {
      this.go('title');
    }
  }

  /* ---------------- 渲染 ---------------- */

  render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a0908';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    switch (this.state) {
      case 'title': this.renderTitle(); break;
      case 'mode': this.renderMode(); break;
      case 'dojo': this.renderDojo(); break;
      case 'intro': this.renderIntro(); break;
      case 'play':
      case 'pause': this.renderPlay(); break;
      case 'stageClear': this.renderStageClear(); break;
      case 'gameOver': this.renderGameOver(); break;
      case 'victory': this.renderVictory(); break;
    }
    void ctx;
  }

  private renderTitle(): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#1a0e10');
    g.addColorStop(1, '#08060a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 背景装饰：斜向速度线
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 22; i++) {
      const y = ((i * 37 + this.frame * 1.6) % (VIEW_H + 40)) - 20;
      ctx.fillStyle = i % 3 === 0 ? '#e8413a' : '#3a2a30';
      ctx.fillRect(0, y, VIEW_W, 1);
    }
    ctx.restore();

    // 标题
    text(ctx, 'DOUBLE', VIEW_W / 2, 44, { font: FONT_XL, align: 'center', color: '#f0e0c0' });
    text(ctx, 'DRAGON', VIEW_W / 2, 72, { font: FONT_XL, align: 'center', color: '#e8413a' });
    text(ctx, '双 截 龙 · 重 生', VIEW_W / 2, 104, { font: FONT_L, align: 'center', color: '#ffd24a' });
    text(ctx, 'REBORN', VIEW_W / 2, 124, { font: FONT_S, align: 'center', color: '#8a7a6a' });

    // 两个主角剪影
    const fake: Player = Object.assign(new Player({ vit: 0, power: 0, speed: 0, chiGain: 0, disciple: false }, 3), {
      x: 104, y: 200, band: 2, facing: 1, state: 'idle', anim: this.frame, stateT: 0, scale: 1.25,
    });
    drawFighter(ctx, fake, { camX: 0 });
    const fake2: Player = Object.assign(new Player({ vit: 0, power: 0, speed: 0, chiGain: 0, disciple: false }, 3, JIMMY_PAL), {
      x: 152, y: 200, band: 2, facing: -1, state: 'idle', anim: this.frame + 9, stateT: 0, scale: 1.25,
    });
    drawFighter(ctx, fake2, { camX: 0 });

    if (this.titleBlink % 70 < 44) {
      text(ctx, 'PRESS ENTER', VIEW_W / 2, 216, { font: FONT, align: 'center', color: '#f0e8d8' });
    }
    text(ctx, 'WASD 移动  J 拳  K 脚  L 跳  Q 奥义', VIEW_W / 2, 230, { font: FONT_S, align: 'center', color: '#7a6a5a' });
  }

  private renderMode(): void {
    this.drawDimBackdrop();
    const ctx = this.ctx;
    text(ctx, '选择模式', VIEW_W / 2, 54, { font: FONT_L, align: 'center', color: '#ffd24a' });

    const items = ['单人游戏', '双人同屏 (P2: 方向键 + . / ,)', '道场 (养成 / 商店)'];
    items.forEach((s, i) => {
      const on = i === this.modeSel;
      text(ctx, s, VIEW_W / 2, 100 + i * 26, {
        font: on ? FONT_L : FONT, align: 'center', color: on ? '#ffffff' : '#8a7a6a',
      });
    });
    text(ctx, `铜钱 $${this.save.coins}    通关 ${this.save.clears} 次`, VIEW_W / 2, 196, {
      font: FONT_S, align: 'center', color: '#a89880',
    });
    text(ctx, 'W/S 选择  ENTER 确认  ESC 返回', VIEW_W / 2, 224, { font: FONT_S, align: 'center', color: '#6a5a4a' });
  }

  private renderDojo(): void {
    this.drawDimBackdrop();
    const ctx = this.ctx;
    text(ctx, '道 场', VIEW_W / 2, 18, { font: FONT_L, align: 'center', color: '#ffd24a' });
    text(ctx, `铜钱 $${this.save.coins}`, VIEW_W - 6, 22, { font: FONT_S, align: 'right', color: '#ffd24a' });

    UPGRADES.forEach((u, i) => {
      const y = 52 + i * 26;
      const on = i === this.dojoSel;
      const lv = this.save.lv[u.id];
      const cost = upgradeCost(this.save, u.id);
      const afford = cost !== null && this.save.coins >= cost;
      if (on) {
        ctx.fillStyle = 'rgba(232,65,58,0.16)';
        ctx.fillRect(10, y - 3, VIEW_W - 20, 22);
        ctx.fillStyle = '#e8413a';
        ctx.fillRect(10, y - 3, 2, 22);
      }
      text(ctx, u.name, 20, y, { font: on ? FONT : FONT_S, color: on ? '#ffffff' : '#b0a08c' });
      text(ctx, u.desc, 20, y + 11, { font: FONT_S, color: '#8a7a68' });
      // 等级点
      for (let k = 0; k < u.max; k++) {
        ctx.fillStyle = k < lv ? '#5ad2a0' : '#3a3238';
        ctx.fillRect(150 + k * 8, y + 4, 6, 6);
      }
      if (cost === null) {
        text(ctx, 'MAX', VIEW_W - 20, y + 4, { font: FONT_S, align: 'right', color: '#5ad2a0' });
      } else {
        text(ctx, `$${cost}`, VIEW_W - 20, y + 4, {
          font: FONT_S, align: 'right', color: afford ? '#ffd24a' : '#8a5050',
        });
      }
    });

    if (this.dojoT % 60 < 40) {
      text(ctx, 'ENTER 购买   ESC 返回', VIEW_W / 2, 210, { font: FONT_S, align: 'center', color: '#8a7a6a' });
    }
    text(ctx, '铜钱在打倒敌人时获得，击杀越多钱越多。', VIEW_W / 2, 228, {
      font: FONT_S, align: 'center', color: '#5a4a3a',
    });
  }

  private renderIntro(): void {
    const w = this.world;
    if (!w) return;
    drawBg(this.ctx, w.bg, 0, this.frame);
    drawVignette(this.ctx);
    const alpha = clamp(this.stateT / 18, 0, 1);
    drawBanner(this.ctx, w.stage.name, w.stage.en, alpha);
    drawDialogue(this.ctx, w.stage.intro, clamp((this.stateT - 20) / 20, 0, 1));
    if (this.stateT > 40 && this.stateT % 60 < 40) {
      text(this.ctx, 'ENTER 继续', VIEW_W / 2, 158, { font: FONT_S, align: 'center', color: '#cfc0a8' });
    }
  }

  private renderPlay(): void {
    const ctx = this.ctx;
    const w = this.world;
    if (!w) return;

    drawBg(ctx, w.bg, w.camX, w.frame);

    // 深度排序：远的先画
    const drawables = [...w.enemies, ...w.players].sort((a, b) => a.band - b.band);
    for (const f of drawables) {
      if (f.isPlayer && f.invuln > 0 && Math.floor(this.frame / 3) % 2 === 0) continue;
      drawFighter(ctx, f, {
        camX: w.camX,
        weapon: f instanceof Player && f.weapon !== 'fist' ? f.weapon : undefined,
        isPlayer: f instanceof Player,
        glow: f instanceof Player && f.chi >= CHI_MAX,
      });
    }

    // 地面武器
    for (const p of w.pickups) {
      const sx = Math.round(p.x - w.camX);
      const c = p.id === 'bat' ? '#c88a4a' : p.id === 'knife' ? '#d8d8e0' : p.id === 'whip' ? '#8a4a2a'
        : p.id === 'barrel' ? '#3a7a4a' : p.id === 'dynamite' ? '#c83a2a' : '#9a9a92';
      ctx.fillStyle = '#0e0b10';
      ctx.fillRect(sx - 6, p.y - 10, 12, 10);
      ctx.fillStyle = c;
      ctx.fillRect(sx - 5, p.y - 9, 10, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(sx - 5, p.y - 9, 10, 1.5);
    }

    // 投射物
    for (const p of w.projectiles) {
      const sx = Math.round(p.x - w.camX);
      const sy = Math.round(p.y);
      switch (p.kind) {
        case 'bullet':
          ctx.fillStyle = '#ffd24a'; ctx.fillRect(sx - 4, sy - 1, 8, 2);
          ctx.fillStyle = '#ff8a3a'; ctx.fillRect(sx - 7, sy - 1, 3, 2);
          break;
        case 'rock':
          ctx.fillStyle = '#0e0b10'; ctx.fillRect(sx - 4, sy - 4, 8, 8);
          ctx.fillStyle = '#9a9a92'; ctx.fillRect(sx - 3, sy - 3, 6, 6);
          break;
        case 'barrel':
          ctx.fillStyle = '#0e0b10'; ctx.fillRect(sx - 5, sy - 7, 10, 14);
          ctx.fillStyle = '#3a7a4a'; ctx.fillRect(sx - 4, sy - 6, 8, 12);
          break;
        case 'knife':
          ctx.fillStyle = '#d8d8e0'; ctx.fillRect(sx - 5, sy - 1, 9, 2);
          break;
        case 'dynamite': {
          ctx.fillStyle = '#0e0b10'; ctx.fillRect(sx - 3, sy - 6, 6, 11);
          ctx.fillStyle = '#c83a2a'; ctx.fillRect(sx - 2, sy - 5, 4, 9);
          if (p.fuse > 0 && (this.frame >> 1) % 2 === 0) {
            ctx.fillStyle = '#fff0a0'; ctx.fillRect(sx - 1, sy - 8, 2, 2);
          }
          break;
        }
      }
    }

    // 打击特效
    for (const s of w.sparks) {
      drawHitFlash(ctx, Math.round(s.x - w.camX), Math.round(s.y), s.size, s.dir);
    }

    // 抓取连线提示
    for (const e of w.enemies) {
      if (e.grabbedBy) {
        ctx.fillStyle = 'rgba(255,210,74,0.5)';
        ctx.fillRect(Math.round(e.x - w.camX) - 1, Math.round(e.y - 20), 2, 2);
      }
    }

    drawVignette(ctx);

    const lead = w.players[0]!;
    drawHud(ctx, {
      players: w.players,
      lives: w.lives,
      score: lead.score,
      coins: lead.coins,
      timer: w.timer,
      stageName: w.stage.name,
      p2: w.has2P,
    });

    if (lead.combo >= 2) {
      drawCombo(ctx, lead.x - w.camX, lead.y - 54, lead.combo);
    }

    const bt = w.bannerText;
    if (bt) {
      const a = clamp(w.bannerT / 30, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      text(ctx, bt, VIEW_W / 2, 62, { font: FONT_L, align: 'center', color: '#ffd24a' });
      ctx.restore();
    }

    if (this.state === 'pause') {
      ctx.fillStyle = 'rgba(6,5,8,0.72)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      text(ctx, '暂 停', VIEW_W / 2, 104, { font: FONT_L, align: 'center', color: '#ffd24a' });
      text(ctx, 'ESC 继续', VIEW_W / 2, 130, { font: FONT_S, align: 'center', color: '#8a7a6a' });
    }
  }

  private renderStageClear(): void {
    const w = this.world;
    this.drawDimBackdrop();
    const ctx = this.ctx;
    text(ctx, '关卡通过', VIEW_W / 2, 40, { font: FONT_L, align: 'center', color: '#5ad2a0' });
    if (!w) return;

    const rows: [string, number][] = [
      ['本关得分', w.player.score],
      ['铜钱收入', w.player.coins],
      ['到达等级', w.player.level],
    ];
    rows.forEach((r, i) => {
      const show = this.tally > i * 24;
      if (!show) return;
      const a = clamp((this.tally - i * 24) / 20, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      text(ctx, r[0], 56, 84 + i * 20, { font: FONT_S, color: '#a89880' });
      text(ctx, String(r[1]), VIEW_W - 56, 82 + i * 20, { font: FONT, align: 'right', color: '#ffd24a' });
      ctx.restore();
    });

    if (this.tally > 90) {
      text(ctx, this.stageIdx + 1 >= stageCount ? '这是最后一关' : '下一关', VIEW_W / 2, 176, {
        font: FONT, align: 'center', color: '#e8dcc8',
      });
    }
    if (this.tally > 110 && this.tally % 60 < 40) {
      text(ctx, 'ENTER 继续', VIEW_W / 2, 200, { font: FONT_S, align: 'center', color: '#8a7a6a' });
    }
  }

  private renderGameOver(): void {
    this.drawDimBackdrop();
    const ctx = this.ctx;
    text(ctx, 'GAME OVER', VIEW_W / 2, 92, { font: FONT_L, align: 'center', color: '#e8413a' });
    text(ctx, `最高分 ${this.save.bestScore}`, VIEW_W / 2, 124, { font: FONT_S, align: 'center', color: '#a89880' });
    text(ctx, `铜钱 $${this.save.coins}`, VIEW_W / 2, 138, { font: FONT_S, align: 'center', color: '#ffd24a' });
    if (this.stateT > 40 && this.stateT % 60 < 40) {
      text(ctx, 'ENTER 返回标题', VIEW_W / 2, 178, { font: FONT_S, align: 'center', color: '#8a7a6a' });
    }
  }

  private renderVictory(): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#241a10');
    g.addColorStop(1, '#0a0808');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    for (let i = 0; i < 30; i++) {
      const y = ((i * 31 + this.frame * 0.9) % (VIEW_H + 20)) - 10;
      ctx.fillStyle = i % 4 === 0 ? 'rgba(255,210,74,0.20)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect((i * 53) % VIEW_W, y, 2, 2);
    }

    text(ctx, 'MISSION', VIEW_W / 2, 52, { font: FONT_L, align: 'center', color: '#ffd24a' });
    text(ctx, 'COMPLETE', VIEW_W / 2, 76, { font: FONT_L, align: 'center', color: '#ffd24a' });
    text(ctx, '通关', VIEW_W / 2, 104, { font: FONT_XL, align: 'center', color: '#f0e0c0' });
    text(ctx, '玛丽亚得救了。', VIEW_W / 2, 148, { font: FONT, align: 'center', color: '#d8cbb8' });
    text(ctx, '黑武士帮散了。', VIEW_W / 2, 164, { font: FONT, align: 'center', color: '#d8cbb8' });
    text(ctx, '你和解了——这次是真的。', VIEW_W / 2, 180, { font: FONT, align: 'center', color: '#d8cbb8' });

    const w = this.world;
    if (w) {
      text(ctx, `得分 ${w.player.score}    铜钱 $${w.player.coins}`, VIEW_W / 2, 204, {
        font: FONT_S, align: 'center', color: '#a89880',
      });
    }
    if (this.stateT > 40 && this.stateT % 60 < 40) {
      text(ctx, 'ENTER 返回标题', VIEW_W / 2, 224, { font: FONT_S, align: 'center', color: '#8a7a6a' });
    }
  }

  private drawDimBackdrop(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#0d0b10';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.strokeStyle = 'rgba(232,65,58,0.25)';
    ctx.lineWidth = 1;
    for (let i = -VIEW_H; i < VIEW_W; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + VIEW_H, VIEW_H);
      ctx.stroke();
    }
  }
}

export { PLAYER_START_LIVES };
