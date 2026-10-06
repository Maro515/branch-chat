// 画面本体は親フォルダの index.html が唯一の正。desktop/app/ へはコピーするだけ（手で編集しない）。
// vendor/fonts があれば同梱し、フォントの読み込み先を Google Fonts からアプリ内に差し替える（オフライン対応）。
import { mkdirSync, readFileSync, writeFileSync, existsSync, cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app');
const vendorFonts = join(here, '..', 'vendor', 'fonts');
rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
let html = readFileSync(join(here, '..', '..', 'index.html'), 'utf8');
let fonts = 'Google Fonts（オンライン時のみ）';
if (existsSync(join(vendorFonts, 'fonts.css'))) {
  cpSync(vendorFonts, join(appDir, 'fonts'), { recursive: true });
  const before = html;
  html = html.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*/, '')
             .replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">/, '<link href="fonts/fonts.css" rel="stylesheet">');
  if (html === before) throw new Error('index.html のフォント読み込みタグが見つかりません（sync-app.mjs の置換を更新してください）');
  fonts = '同梱フォント';
}
for (const f of ['figure.js', 'figure-stats.js', 'figure-more.js', 'figure-more2.js', 'figure-layout.js', 'figure-image.js', 'figure-schematic.js', 'figure-omics.js', 'figure-more3.js', 'figure-gallery.js']) { const src = join(here, '..', '..', f); if (existsSync(src)) cpSync(src, join(appDir, f)); } // Figure モジュール
{ const assets = join(here, '..', '..', 'assets'); if (existsSync(assets)) cpSync(assets, join(appDir, 'assets'), { recursive: true }); } // 画像などの素材
{ const ic = join(here, '..', 'build', 'icon.png'); if (existsSync(ic)) { mkdirSync(join(appDir, 'assets'), { recursive: true }); cpSync(ic, join(appDir, 'assets', 'icon.png')); } } // 「このアプリについて」のアイコン
{ // ライセンス文の同梱: フォント（SIL OFL、リポジトリの licenses/）と Electron（MIT）、Electron に含まれる Chromium・Node.js などの一覧。「このアプリについて」から読める
  const lic = join(appDir, 'licenses'); mkdirSync(lic, { recursive: true });
  const own = join(here, '..', '..', 'licenses'); if (existsSync(own)) cpSync(own, lic, { recursive: true });
  const el = join(here, '..', 'node_modules', 'electron', 'dist');
  for (const [src, dst] of [['LICENSE', 'Electron-MIT.txt'], ['LICENSES.chromium.html', 'LICENSES.chromium.html']]) { const f = join(el, src); if (existsSync(f)) cpSync(f, join(lic, dst)); else console.warn('ライセンス文が見つかりません: ' + f); }
}
writeFileSync(join(appDir, 'index.html'), html);
console.log(`synced index.html -> desktop/app/index.html（フォント: ${fonts}）`);
