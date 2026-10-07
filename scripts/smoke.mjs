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

  const assertPlayable = async (tag) => {
    const before = await page.evaluate(() => Math.round(window.__dd.game.world?.player.x ?? -1));
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyD');
    const after = await page.evaluate(() => Math.round(window.__dd.game.world?.player.x ?? -1));
    if (!(after > before + 10)) {
      throw new Error(`${tag}: 玩家按 D 走不动（${before} -> ${after}）`);
    }
  };

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
  await frames(3);
  await shot('02-intro');
  if ((await page.evaluate(() => window.__dd.game.state)) !== 'intro') {
    throw new Error('标题按一次 ENTER 应该直接进入开场卡');
  }

  // 按任意键进战斗
  await page.keyboard.press('KeyJ');
  await frames(20);
  await shot('03-stage1');
  if ((await page.evaluate(() => window.__dd.game.state)) !== 'play') {
    throw new Error('开场卡按任意键应该进入战斗');
  }

  console.log('▶ 打第一波');
  await page.keyboard.down('KeyD');
  await frames(70);
  await page.keyboard.up('KeyD');
  for (let i = 0; i < 5; i++) { await page.keyboard.press('KeyJ'); await frames(10); }
  await shot('06-stage1-fight');

  console.log('▶ 操作说明页');
  await page.evaluate(() => window.__dd.game.go('controls'));
  await frames(4);
  await shot('05-controls');

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

  console.log('▶ 真人式操作回归：走 / 换档 / 出招');
  await page.evaluate(() => window.__dd.game.jumpTo(0, 3));
  await page.waitForTimeout(300);
  await assertPlayable('移动');
  const b0 = await page.evaluate(() => window.__dd.game.world.player.band);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyS');
  const b1 = await page.evaluate(() => window.__dd.game.world.player.band);
  if (b1 === b0) throw new Error(`换纵深失败（band 一直是 ${b0}）`);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(80);
  const atk = await page.evaluate(() => window.__dd.game.world.player.atk?.def?.id ?? null);
  if (!atk) throw new Error('按 J 没有出招');
  console.log(`  ✅ 移动 / 换档(${b0}→${b1}) / 出招(${atk})`);

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
