/** 平衡报告入口：npx vite-node scripts/balance.ts [局数] */
import { playMany } from '../src/systems/bot';
import { defaultSave } from '../src/systems/dojo';

const n = Number(process.argv[2]) || 200;
const t0 = Date.now();
const s = playMany(n, defaultSave());
const names = ['贫民窟', '工厂', '林道', '基地'];
console.log(`\n═══ 平衡试玩 · ${n} 局全流程（白手，无道场强化）═══`);
console.log(`  全通率         ${(s.clearRate * 100).toFixed(1)}%`);
console.log(`  平均时长       ${s.avgMinutes} 分钟`);
console.log(`  平均打到第     ${s.avgStage} / 4 关`);
console.log(`  平均等级       ${s.avgLevel}`);
console.log(`  平均剩余命     ${s.avgLives}`);
console.log(`  平均得分       ${s.avgScore}`);
console.log(`  ── 各关平均用时 / 平均死亡 ──`);
names.forEach((nm, i) => {
  console.log(`  ${nm.padEnd(4)} ${String(s.stageTimes[i]).padStart(4)}s   死 ${s.deathsPerStage[i]}`);
});
console.log(`  ── 卡关分布（未通关的局）──`);
s.stuckAt.forEach((c, i) => {
  if (c) console.log(`  倒在第 ${i + 1} 关之后: ${c} 局 (${((c / n) * 100).toFixed(1)}%)`);
});
console.log(`  耗时           ${Date.now() - t0}ms\n`);
