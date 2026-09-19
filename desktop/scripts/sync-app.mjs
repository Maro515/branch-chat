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
writeFileSync(join(appDir, 'index.html'), html);
console.log(`synced index.html -> desktop/app/index.html（フォント: ${fonts}）`);
