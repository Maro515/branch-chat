// 画面本体は親フォルダの index.html が唯一の正。desktop/app/ へはコピーするだけ（手で編集しない）。
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app');
mkdirSync(appDir, { recursive: true });
copyFileSync(join(here, '..', '..', 'index.html'), join(appDir, 'index.html'));
console.log('synced index.html -> desktop/app/index.html');
