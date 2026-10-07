/**
 * 渲染自测 —— 无头 Chromium 跑真游戏，逐屏截图 + 运行期断言。
 *
 * 单测只能证明逻辑对，证明不了"看起来对"。
 * 这个脚本负责后者：真的把游戏跑起来，把每一关、每一个 BOSS 截下来。
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SHOTS = resolve(ROOT, 'shots');
const PORT = 5277;

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

function serve() {
  return new Promise((ok, no) => {
    const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
      cwd: ROOT, stdio: 'ignore',
    });
    setTimeout(() => ok(p), 2500);
    p.on('error', no);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const server = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 820 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const frames = (n) =>
    page.evaluate((k) => {
      for (let i = 0; i < k; i++) window.__dd.game.update();
      window.__dd.game.render();
    }, n);

  const shot = async (name) => {
    await page.locator('#screen').screenshot({ path: resolve(SHOTS, `${name}.png`) });
    const d = await page.evaluate(() => {
      const g = window.__dd.game;
      const w = g.world;
      if (!w) return { state: g.state };
      return {
        state: g.state,
        stage: w.stage.name,
        px: Math.round(w.player.x - w.camX),
        band: w.player.band,
        enemies: w.enemies.filter((e) => !e.dead).length,
        hp: w.player.hp,
        lv: w.player.level,
      };
    });
    console.log(`  📸 ${name}`, JSON.stringify(d));
  };

  console.log('▶ 打开页面');
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  // 清掉存档，保证每次跑都是同一份状态
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#screen');
  await page.keyboard.press('Shift');   // 收掉启动遮罩
  await wait(400);
  await shot('01-title');

  // 标题 → 模式选择
  await page.keyboard.press('Enter');
  await frames(2);
  // 模式顺序：0 单人 / 1 双人 / 2 道场
  await page.keyboard.press('KeyS');
  await frames(2);            // 每次按键之间必须隔一帧，否则会被合并成一次
  await page.keyboard.press('KeyS');
  await frames(2);
  await shot('02-mode');

  await page.keyboard.press('Enter');
  await frames(2);
  await shot('03-dojo');

  // 回模式选单人开局
  await page.keyboard.press('Escape');
  await frames(2);
  await page.keyboard.press('KeyW');
  await frames(2);
  await page.keyboard.press('KeyW');
  await frames(2);
  await page.keyboard.press('Enter');
  await frames(6);
  await shot('04-intro');
  if ((await page.evaluate(() => window.__dd.game.world?.has2P)) !== false) {
    throw new Error('模式导航跑偏了：预期单人，实际进了双人');
  }

  await page.keyboard.press('Enter');
  await frames(20);
  await shot('05-stage1');

  console.log('▶ 打第一波');
  await page.keyboard.down('KeyD');
  await frames(70);
  await page.keyboard.up('KeyD');
  for (let i = 0; i < 5; i++) { await page.keyboard.press('KeyJ'); await frames(10); }
  await shot('06-stage1-fight');

  console.log('▶ 逐关截图');
  for (let s = 0; s < 4; s++) {
    await page.evaluate((i) => window.__dd.game.jumpTo(i, 7), s);
    await frames(10);
    // 走到第一波打起来
    await page.keyboard.down('KeyD');
    await frames(90);
    await page.keyboard.up('KeyD');
    await frames(20);
    for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await frames(8); }
    await shot(`1${s + 1}-stage${s + 1}`);
  }

  console.log('▶ BOSS 战');
  for (const [stage, name] of [[0, 'bolo'], [1, 'chin'], [3, 'willy-jimmy']]) {
    await page.evaluate((i) => window.__dd.game.jumpTo(i, 7), stage);
    await frames(6);
    // 一路推进到关底触发 BOSS
    await page.evaluate(() => {
      const w = window.__dd.game.world;
      w.waveIdx = w.stage.waves.length;
      w.player.x = w.stage.length - 140;
    });
    await frames(90);
    await shot(`2${stage + 1}-boss-${name}`);
  }

  console.log('▶ 气满奥义');
  await page.evaluate(() => window.__dd.game.jumpTo(0, 7));
  await frames(6);
  await page.keyboard.press('KeyQ');
  await frames(16);
  await shot('30-super');

  await browser.close();
  server.kill();

  if (errors.length) {
    console.error('\n❌ 运行期报错：');
    for (const e of errors) console.error('   ', e);
    process.exit(1);
  }
  console.log('\n✅ 渲染自测通过，截图在 shots/');
}

main().catch((e) => { console.error(e); process.exit(1); });
