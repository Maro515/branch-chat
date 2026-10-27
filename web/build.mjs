// BranCHAT Web 版のビルド: 親フォルダの index.html と figure*.js をそのまま使い、Web 版の印（meta）と cloud.js を足して dist/ に写す。
// 画面の正本は親フォルダの index.html（ここで手は入れない。違いは IS_CLOUD で切り替える）。フォントは desktop/vendor/fonts を同梱し、外部へ読みに行かない。
import { mkdirSync, readFileSync, writeFileSync, existsSync, cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let html = readFileSync(join(root, 'index.html'), 'utf8');
const mark = '<meta name="branchat-mode" content="cloud">';
html = html.replace(/<meta charset="[^"]*">/i, (m) => m + '\n' + mark);
if (!html.includes(mark)) throw new Error('index.html の <meta charset> が見つかりません');
const before = html;
html = html.replace('<script src="figure-list.js"></script>', '<script src="figure-list.js"></script>\n<script src="cloud.js"></script>');
if (html === before) throw new Error('index.html の figure-list.js の読み込みが見つかりません');
const fonts = join(root, 'desktop', 'vendor', 'fonts');
if (existsSync(join(fonts, 'fonts.css'))) {
  cpSync(fonts, join(out, 'fonts'), { recursive: true });
  const b2 = html;
  html = html.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*/, '').replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*>\s*/, '')
             .replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">/, '<link href="fonts/fonts.css" rel="stylesheet">');
  if (html === b2) throw new Error('index.html のフォントの読み込みタグが見つかりません');
} else throw new Error('desktop/vendor/fonts/fonts.css がありません（Web 版はフォントを同梱する）');
const files = ['figure.js', 'figure-stats.js', 'figure-more.js', 'figure-more2.js', 'figure-layout.js', 'figure-image.js', 'figure-schematic.js', 'figure-omics.js', 'figure-more3.js', 'figure-gallery.js', 'figure-ga-art.js', 'figure-ga.js', 'figure-list.js', 'cloud.js'];
for (const f of files) { const src = join(root, f); if (!existsSync(src)) throw new Error(f + ' がありません'); cpSync(src, join(out, f)); }
for (const d of ['assets', 'licenses']) { const src = join(root, d); if (existsSync(src)) cpSync(src, join(out, d), { recursive: true }); }
{ const ic = join(root, 'desktop', 'build', 'icon.png'); if (existsSync(ic)) { mkdirSync(join(out, 'assets'), { recursive: true }); cpSync(ic, join(out, 'assets', 'icon.png')); } }
if (!/rel="icon"/.test(html)) html = html.replace(mark, mark + '\n<link rel="icon" href="assets/icon.png">');
writeFileSync(join(out, 'index.html'), html);
console.log('dist/ を作りました（Web 版。フォント同梱、cloud.js を追加）');
