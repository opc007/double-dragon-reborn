/**
 * 入口：画布装配 + 固定步长主循环。
 *
 * 逻辑固定 60Hz（清版动作游戏的判定不能飘），渲染跟着 rAF 走。
 */

import { VIEW_W, VIEW_H, RENDER_SCALE } from './core/constants';
import { audio } from './core/audio';
import { Game } from './game/Game';
import { drawFighter } from './render/sprite';
import { MOVES } from './data/moves';
import { Fighter } from './entities/Fighter';
import { Enemy } from './entities/Enemy';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const app = document.getElementById('app') as HTMLDivElement;
const boot = document.getElementById('boot');

canvas.width = VIEW_W * RENDER_SCALE;
canvas.height = VIEW_H * RENDER_SCALE;
canvas.style.aspectRatio = `${VIEW_W} / ${VIEW_H}`;

function fit(): void {
  const pad = 24;
  const availW = window.innerWidth - pad;
  const availH = window.innerHeight - pad;
  // 高清画布直接按可用空间缩放，不需要整数倍对齐
  const s = Math.min(availW / canvas.width, availH / canvas.height);
  canvas.style.width = `${Math.round(canvas.width * s)}px`;
  canvas.style.height = `${Math.round(canvas.height * s)}px`;
}
fit();
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 120));

const game = new Game(canvas);

/* ---- 触摸控制：只在有触摸的设备上挂载 ---- */
if (matchMedia('(hover: none) and (pointer: coarse)').matches) {
  mountTouchControls(app);
}

function mountTouchControls(root: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.id = 'touch';
  wrap.innerHTML = `
    <style>
      #touch{position:fixed;inset:0;pointer-events:none;z-index:5;
        font:11px ui-monospace,Menlo,monospace;color:#e8dcc8}
      #touch .pad{position:absolute;left:10px;bottom:10px;width:132px;height:132px;pointer-events:auto}
      #touch .btn{position:absolute;right:10px;width:54px;height:54px;border-radius:50%;
        background:rgba(40,32,44,.72);border:1px solid #6a5a4a;display:grid;place-items:center;
        pointer-events:auto;user-select:none}
      #touch .btn:active{background:rgba(232,65,58,.8)}
      #touch .d{position:absolute;width:42px;height:42px;display:grid;place-items:center;
        background:rgba(40,32,44,.6);border:1px solid #5a4a44;border-radius:8px;pointer-events:auto}
      #touch .d:active{background:rgba(232,65,58,.7)}
    </style>
    <div class="pad">
      <div class="d" data-k="up"    style="left:45px;top:0">▲</div>
      <div class="d" data-k="left"  style="left:0;top:45px">◀</div>
      <div class="d" data-k="right" style="left:90px;top:45px">▶</div>
      <div class="d" data-k="down"  style="left:45px;top:90px">▼</div>
    </div>
    <div class="btn" data-k="punch"  style="bottom:14px">拳</div>
    <div class="btn" data-k="kick"   style="bottom:74px;right:70px">脚</div>
    <div class="btn" data-k="jump"   style="bottom:74px;right:4px">跳</div>
    <div class="btn" data-k="superBtn" style="bottom:134px;right:38px;width:44px;height:44px;font-size:10px">奥义</div>
  `;
  root.appendChild(wrap);

  // 用 pointer 事件统一鼠标/触摸，并且做"防滑出"处理：
  // 手指按住后滑出按钮、或被系统打断，pointerup 不在按钮上，
  // 就会留下一个永远按着的幽灵键 —— 表现为"人物一直在走但按任何键都没用"。
  const bind = (el: HTMLElement, key: string): void => {
    const on = (e: PointerEvent): void => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      input.setVirtual(false, key as never, true);
    };
    const off = (e: PointerEvent): void => {
      e.preventDefault();
      input.setVirtual(false, key as never, false);
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  // 兜底：任何一根手指抬起 / 窗口失焦，虚拟键全部松开
  const panicRelease = (): void => input.releaseVirtual();
  window.addEventListener('pointerup', panicRelease);
  window.addEventListener('pointercancel', panicRelease);
  window.addEventListener('blur', panicRelease);
  document.addEventListener('visibilitychange', () => { if (document.hidden) panicRelease(); });

  wrap.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => {
    const k = el.dataset.k!;
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right' || k === 'punch' || k === 'kick' || k === 'jump' || k === 'superBtn') {
      bind(el, k);
    }
  });
}

// main.ts 需要自己持有一份 Input 引用给触摸层用
import { Input } from './core/input';
const input = new Input();
// Game 内部已自建一份；这里把触摸事件同时喂给两份
void input;

/* ---- 主循环：固定 60Hz 逻辑步 ---- */
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();

/** 人物设定图会接管渲染，此时主循环让位 */
let halted = false;

function loop(now: number): void {
  requestAnimationFrame(loop);
  if (halted) { last = now; return; }
  let dt = now - last;
  last = now;
  // 切标签页回来时 dt 会爆掉，钳一下
  if (dt > 250) dt = STEP;
  acc += dt;

  let steps = 0;
  while (acc >= STEP && steps < 5) {
    game.update();
    acc -= STEP;
    steps++;
  }
  game.render();
}
requestAnimationFrame(loop);

/* ---- 首次交互解锁音频 + 收起启动遮罩 ---- */
const dismiss = (): void => {
  audio.unlock();          // 必须先解锁，否则 playBgm 拿不到 ctx
  game.primeAudio();       // 再挂标题曲
  boot?.remove();
  window.removeEventListener('keydown', dismiss);
  window.removeEventListener('touchstart', dismiss);
  window.removeEventListener('mousedown', dismiss);
};
window.addEventListener('keydown', dismiss);
window.addEventListener('touchstart', dismiss);
window.addEventListener('mousedown', dismiss);

// 调试钩子：截图脚本、单测会用到
(window as unknown as { __dd: unknown }).__dd = {
  game,
  press(k: string) { input.setVirtual(false, k as never, true); },
  release(k: string) { input.setVirtual(false, k as never, false); },
  /** 让主循环恢复（退出设定图） */
  resume() { halted = false; },

  /**
   * 人物设定图：把所有角色按几种姿态并排画在放大后的画布上。
   * 调美术的时候这是唯一可靠的办法——游戏里那点像素根本看不清细节。
   */
  sheet(scale = 3, states: string[] = ['idle', 'walk', 'attack', 'hurt', 'grab', 'down']): void {
    halted = true;
    const cols = states.length;
    const CELL_H = 54;      // 每个角色一格
    const w = 150 * cols, h = CELL_H * 6 + 14;
    canvas.width = w * scale;
    canvas.height = h * scale;
    canvas.style.width = `${w * scale}px`;
    canvas.style.height = `${h * scale}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#201a28');
    g.addColorStop(1, '#0e0b12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const defs = [
      { id: 'billy', pal: { skin: '#f0c090', skin2: '#c09060', top: '#f2f2f5', bottom: '#3868f8', hair: '#1c1208' }, hair: 'short', scale: 1 },
      { id: 'jimmy', pal: { skin: '#f0c090', skin2: '#c09060', top: '#e8413a', bottom: '#3868f8', hair: '#1c1208' }, hair: 'short', scale: 1 },
      { id: 'williams', pal: { skin: '#e8a878', skin2: '#b87a50', top: '#3a8a3a', bottom: '#c8a058', hair: '#402818' }, hair: 'short', scale: 1 },
      { id: 'abobo', pal: { skin: '#d09060', skin2: '#9a6038', top: '#d09060', bottom: '#8a6a3a', hair: '#d09060' }, hair: 'bald', scale: 1.22 },
      { id: 'linda', pal: { skin: '#f0bc90', skin2: '#c09068', top: '#8a3ac8', bottom: '#5a2088', hair: '#e0b040' }, hair: 'long', scale: 0.94 },
      { id: 'bolo', pal: { skin: '#c88050', skin2: '#8a542c', top: '#c88050', bottom: '#6a4a2a', hair: '#2a1a10' }, hair: 'mohawk', scale: 1.38 },
    ];

    states.forEach((st, col) => {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(col * 150 + 2, 2, 146, h - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(col * 150 + 2, 2, 146, 1);
      defs.forEach((d, row) => {
        const f = new Enemy('williams', 0, 1, 1);
        f.pal = { ...d.pal };
        f.hair = d.hair;
        f.scale = d.scale;
        f.band = 1;
        f.facing = 1;
        f.x = 0;
        f.y = 0;
        f.h = Math.round(40 * d.scale);
        f.w = Math.round(19 * d.scale);
        f.state = st as Fighter['state'];
        f.stateT = st === 'attack' ? 6 : 0;
        f.anim = 10 + row * 3;
        // 摆出招的姿态必须挂 atk，poseOf 靠它取招式参数
        f.atk = { def: MOVES.punch, isMove: true, isSuper: false, hit: new Set(), fx: 0, fy: 0, dir: 1, tick: 0, maxHits: 1 };
        ctx.save();
        ctx.translate(col * 150 + 34, row * CELL_H + CELL_H - 6);
        drawFighter(ctx, f, { camX: 0 });
        ctx.restore();
      });
    });
  },
};
