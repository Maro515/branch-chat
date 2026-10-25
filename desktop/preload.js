// 画面（レンダラ）からドロップ・選択したファイルの場所（パス）を知るためだけの最小の橋渡し（改善計画 3.3・4.3: 図の元データの来歴と更新の検知）。
// contextIsolation・sandbox は有効のまま。Node の機能は渡さない
'use strict';
const { contextBridge, webUtils } = require('electron');
contextBridge.exposeInMainWorld('branchatNative', {
  pathForFile: (f) => { try { return (webUtils && webUtils.getPathForFile(f)) || ''; } catch (e) { return ''; } },
});
