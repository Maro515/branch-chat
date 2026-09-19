// Google Fonts の Noto Sans JP / DotGothic16（どちらも SIL OFL）を取得して同梱用に保存する。
// 出力: desktop/vendor/fonts/fonts.css と woff2 群。sync-app.mjs がこれを見つけると index.html の読み込み先を差し替える。
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'vendor', 'fonts');
mkdirSync(out, { recursive: true });
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=DotGothic16&display=swap';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
let css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text();
const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
console.log(`fonts: ${urls.length} files`);
let done = 0, bytes = 0;
const queue = [...urls];
async function worker() {
  for (;;) {
    const u = queue.shift(); if (!u) return;
    const name = createHash('sha1').update(u).digest('hex').slice(0, 16) + '.woff2';
    const file = join(out, name);
    if (!existsSync(file)) { const buf = Buffer.from(await (await fetch(u)).arrayBuffer()); writeFileSync(file, buf); bytes += buf.length; }
    css = css.split(u).join(name);
    if (++done % 60 === 0) console.log(`  ${done}/${urls.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
writeFileSync(join(out, 'fonts.css'), css);
console.log(`done: ${done} files, downloaded ${(bytes / 1048576).toFixed(1)} MB -> ${out}`);
