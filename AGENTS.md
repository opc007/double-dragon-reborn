# AGENTS.md

给在这个仓库里改代码的人 / AI agent。先读完这一份再动手，能省掉一整轮返工。

---

## 这是什么

**双截龙 · 重生**——跑在浏览器里的 FC 清版动作游戏。
复刻 Technos Japan 1988 年那版《双截龙》：纵深走位、抓投、缴械夺武器、
7 级成长解锁招式、四关、最终 BOSS 是亲哥哥。

没有后端。打开网址就能玩。

---

## 技术栈

| | |
|---|---|
| 渲染 | Canvas 2D，逻辑分辨率 256×240（NES 原生），整数倍放大 |
| 语言 | TypeScript（`strict`） |
| 构建 | Vite 5 |
| 测试 | Vitest（89 个单测） |
| 渲染自测 | Playwright + headless Chromium |
| 美术 | 100% 程序化生成，**没有任何图片 / 音频文件** |

**依赖只有 4 个**：`vite`、`typescript`、`vitest`、`playwright`。
不要引入美术资源管线（图片加载、精灵图压缩等）——这是刻意的设计：
整个游戏没有二进制资源，`npm install && npm run dev` 就能跑，仓库永远只有几十 KB。

**中文是硬要求。** 界面、提示、关卡文案一律中文；只有游戏内的英文装饰
（MISSION 1、BOSS 登场）保留英文，那是刻意的复古风。

---

## 目录

```
src/
  main.ts             入口：画布装配 + 固定 60Hz 主循环
  core/
    constants.ts      所有可调数值。改平衡先改这里。
    math.ts           clamp / AABB / 缓动
    rng.ts            带种子的 PRANK。关卡装饰必须用它，不能用 Math.random
    input.ts          键盘 + 虚拟手柄（触摸层走同一份状态）
    audio.ts          WebAudio 合成的 chiptune。仓库里没有音频文件
  data/               纯数据：招式表 / 武器表 / 敌人图鉴 / 关卡
  entities/
    Fighter.ts        战斗基类：硬直、击退、倒地、起身、抓取
    Player.ts         玩家：等级成长、气、抓投、连段
    Enemy.ts          敌人 AI：brawler / thrower / whip / heavy / gun / boss
    Projectile.ts     石头、油桶、飞刀、炸药、子弹
  systems/
    world.ts          ★ 一关之内的完整模拟。波次、战斗判定、镜头
    dojo.ts           局外元进度（localStorage）
    aiPad.ts          师弟 AI：用假输入驱动一个真正的 Player
    bot.ts            试玩机器人 + 平衡统计
  render/
    sprite.ts         程序化像素角色（骨架 + 关节角度）
    backgrounds.ts    程序化背景（四关 + 视差）
    hud.ts            HUD / 横幅 / 对话框
  game/Game.ts        顶层状态机 + 各个画面
scripts/
  smoke.mjs           无头浏览器跑真游戏 + 逐关截图
  balance.ts          机器人试玩平衡报告
```

---

## 改完必须跑

```bash
npx tsc --noEmit      # 必须干净
npx vitest run        # 89 个单测必须全过
npx vite build        # 必须能构建
```

**渲染回归**（这个容易忘，但它才是真正的验收——单测证明不了"看起来对"）：

```bash
npx vite build && node scripts/smoke.mjs   # 截图落在 shots/
```

**平衡回归**（改过任何数值就必须跑）：

```bash
npx vite-node scripts/balance.ts 200
```

看三件事：全通率、各关用时、各关死亡次数。
全通率 100% 说明太简单，0% 说明有墙。全流程平均 5 分钟上下算合理。

---

## 这个项目最容易被改坏的地方

以下五条**每一条都对应一个真实修过的 bug**，而且全都是
"不报错、不崩溃、就是卡住不动"——靠肉眼试玩发现不了，只能靠测试和机器人。

1. **波次不能每帧重算触发条件。**
   一旦触发就进入"该波进行中"状态，直到真的清空为止。
   否则玩家被击退到触发点后面时，整波会永远卡住：锁着镜头，又不再刷怪。

2. **清场判定必须确认真的刷出过敌人。**
   空数组 `every()` 恒为 `true`，会把刚触发的波次直接判成清空，玩家一路跳波。

3. **受击状态必须有出口。**
   `Fighter.step()` 里 `hitstun` 归零后要把状态改回 `idle`。
   少了这一行，任何被打中的敌人都永久卡在 `hurt`，那一波永远清不掉。

4. **伤害结算必须多态。**
   `pendingDamage` / `comboMult` 要放在 `Fighter` 基类上。
   之前只放在 `Player` 上，敌人打玩家时读到 `undefined` → 伤害变 `NaN` →
   血量永远是 `NaN` → 整局游戏死锁。

5. **镜头锁死不能把玩家挤出画面。**
   锁镜头只限制"往前推进"。算完之后必须再钳一次，保证玩家始终在画面内。

改这几块之前，先去看 `src/test/regression.test.ts`，那里面每一条都钉死了一个。

---

## 约定

- **数值不要散落。** 可调的东西放 `core/constants.ts` 或 `data/` 下的纯数据表，
  不要硬编码在逻辑里。平衡要能被 `scripts/balance.ts` 量出来。
- **关卡装饰必须用 `makeRNG(seed)`。** 用 `Math.random` 会导致同一关两次进入
  长得不一样，截图回归也就没有意义了。
- **`World` 持有关卡数据的副本**，不要直接引用 `STAGES` 里的对象。
  World 会往 stage 上挂运行时状态，引用共享对象会污染全局数据。
- **不要用 `constructor.name` 判断类型**，生产构建会混淆类名。用显式的 `isPlayer` 标记。
- **新增招式**：在 `data/moves.ts` 加一条 `MoveDef`，在 `Player.pickMove` 里接输入，
  在 `sprite.ts` 的 `poseOf` 里给出姿态。不需要补任何美术资源。
- **新增敌人**：在 `data/enemies.ts` 加一条 `EnemyDef`，想清楚 AI 类型
  （`brawler` / `thrower` / `whip` / `heavy` / `gun` / `boss`）和索敌范围。
  BOSS 必须设 `maxKnockdowns`，否则会被"倒地三次"的规则误判退场。
