/**
 * 入口：画布装配 + 固定步长主循环。
 *
 * 逻辑固定 60Hz（清版动作游戏的判定不能飘），渲染跟着 rAF 走。
 */

import { VIEW_W, VIEW_H, RENDER_SCALE } from './core/constants';
import { audio } from './core/audio';
import { Game } from './game/Game';

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

  const bind = (el: HTMLElement, key: string): void => {
    const on = (e: Event): void => { e.preventDefault(); input.setVirtual(false, key as never, true); };
    const off = (e: Event): void => { e.preventDefault(); input.setVirtual(false, key as never, false); };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  };
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

function loop(now: number): void {
  requestAnimationFrame(loop);
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
  audio.unlock();
  boot?.remove();
  window.removeEventListener('keydown', dismiss);
  window.removeEventListener('touchstart', dismiss);
  window.removeEventListener('mousedown', dismiss);
};
window.addEventListener('keydown', dismiss);
window.addEventListener('touchstart', dismiss);
window.addEventListener('mousedown', dismiss);

// 调试钩子：截图脚本和单测会用到
(window as unknown as { __dd: unknown }).__dd = {
  game,
  get frame() { return game; },
  press(k: string) { input.setVirtual(false, k as never, true); },
  release(k: string) { input.setVirtual(false, k as never, false); },
};
