// アプリアイコン（build/icon.png 1024px）を SVG から生成する。electron-builder が icns / ico に変換する。
// 実行: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'); const path = require('node:path');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1f4a"/><stop offset="1" stop-color="#040a17"/></linearGradient>
  <radialGradient id="halo" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#38bdf8" stop-opacity=".35"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient>
  <filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>
<rect x="64" y="64" width="896" height="896" rx="200" fill="url(#halo)"/>
<g stroke="#4cc9ff" stroke-opacity=".10" stroke-width="3">${Array.from({length:9},(_,i)=>`<line x1="${160+i*88}" y1="120" x2="${160+i*88}" y2="904"/><line x1="120" y1="${160+i*88}" x2="904" y2="${160+i*88}"/>`).join('')}</g>
<g filter="url(#g)" fill="none" stroke-linecap="round" stroke-width="44">
  <path d="M512 800 L512 250" stroke="#4cc9ff"/>
  <path d="M512 620 C512 500 700 520 720 380" stroke="#f472b6"/>
  <path d="M512 480 C512 380 330 400 312 290" stroke="#34d399"/>
</g>
<g filter="url(#g)">
  <circle cx="512" cy="800" r="46" fill="#040a17" stroke="#4cc9ff" stroke-width="22"/>
  <circle cx="512" cy="250" r="54" fill="#4cc9ff"/>
  <circle cx="720" cy="380" r="46" fill="#f472b6"/>
  <circle cx="312" cy="290" r="46" fill="#34d399"/>
  <circle cx="512" cy="620" r="26" fill="#ffffff"/>
  <circle cx="512" cy="480" r="26" fill="#ffffff"/>
</g></svg>`;
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const dir = path.join(__dirname, '..', 'build'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'icon.png'), img.resize({ width: 1024, height: 1024 }).toPNG());
  console.log('wrote build/icon.png', img.getSize());
  app.exit(0);
});
