/**
 * 打成单文件 HTML。
 * Vite 产物是 index.html + 一个 js chunk，这里把 js 内联进去，
 * 这样双击就能玩，不需要起服务器——分享给朋友最方便。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const OUT = resolve(ROOT, '双截龙-重生-单文件.html');

let html = readFileSync(resolve(DIST, 'index.html'), 'utf8');
const jsDir = resolve(DIST, 'assets');
const jsFile = readdirSync(jsDir).find((f) => f.endsWith('.js'));
if (!jsFile) throw new Error('找不到构建产物 js');
const js = readFileSync(resolve(jsDir, jsFile), 'utf8');

html = html.replace(
  /<script type="module" crossorigin src="\.\/assets\/[^"]+"><\/script>/,
  `<script type="module">\n${js}\n</script>`,
);
if (html.includes('assets/')) throw new Error('还有没内联的 asset 引用');

writeFileSync(OUT, html, 'utf8');
console.log(`单文件构建完成：${OUT}  (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
