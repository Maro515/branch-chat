#!/bin/bash
# BranCHAT 静的チェック。変更後は必ず実行する:  ./check.sh
# 1) 両HTMLのインラインJS構文  2) Artifact版の禁止パターン  3) 2ファイル間の関数の取りこぼし
cd "$(dirname "$0")" || exit 1
fail=0
for f in index.html artifact.html; do
  node -e "const fs=require('fs');const h=fs.readFileSync('$f','utf8');const m=h.match(/<script>([\s\S]*)<\/script>/);try{new Function(m[1]);console.log('OK   JS構文 $f')}catch(e){console.log('FAIL JS構文 $f: '+e.message);process.exit(1)}" || fail=1
done
python3 - <<'PY' || fail=1
import re,sys
bad=0
idx=open('index.html',encoding='utf-8').read(); art=open('artifact.html',encoding='utf-8').read()
def no(pattern,text,label,allow=0):
    global bad
    n=len(re.findall(pattern,text))
    if n>allow: print(f'FAIL {label}: {n}件 (許容 {allow})'); bad=1
    else: print(f'OK   {label}')
# Artifact のサンドボックスで動かない/禁止のもの
no(r'(?<![A-Za-z])confirm\(',art,'artifact.html に confirm() が無い')
no(r'(?<![A-Za-z])prompt\(',art,'artifact.html に prompt() が無い')
no(r'(?<![A-Za-z])confirm\(|(?<![A-Za-z])prompt\(',idx,'index.html にも confirm()/prompt() が無い')
no(r'<!DOCTYPE|<html|<body',art,'artifact.html に骨格タグが無い')
no(r'api\.anthropic\.com|/api/chat',art,'artifact.html に外部API/ブリッジ呼び出しが無い')
no(r'localStorage\.',art,'artifact.html の localStorage 直接参照は lsGetSafe/lsSetSafe の2箇所だけ',allow=2)
no(r'sk-ant-[A-Za-z0-9]',idx+art,'APIキーらしき文字列が無い')
no(r'ls(Get|Set)=[^;]*\{try\{(return )?ls(Get|Set)\(',idx+art,'保存ヘルパーが自分自身を呼んでいない（過去に一括置換で壊れた）')
# 関数の取りこぼし（片方にだけある関数）
fn=lambda t:set(re.findall(r'(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)\s*\(',t))
only_idx=fn(idx)-fn(art)-{'streamAPI','streamBridge','probeBridge','scheduleBackup','restoreFromBackup'}
only_art=fn(art)-fn(idx)-{'streamClaude','probeClaude'}
if only_idx: print('FAIL index.html にだけある関数:',sorted(only_idx)); bad=1
if only_art: print('FAIL artifact.html にだけある関数:',sorted(only_art)); bad=1
if not only_idx and not only_art: print('OK   2ファイルの関数一覧が一致（接続方式の差分を除く）')
sys.exit(bad)
PY
python3 -c "import ast,sys;ast.parse(open('bridge.py').read());print('OK   bridge.py 構文')" || fail=1
for f in desktop/main.js desktop/engines.js; do
  if node --check "$f" 2>/dev/null; then echo "OK   $f 構文"; else echo "FAIL $f 構文"; fail=1; fi
done
# bridge.py と engines.js の安全側フラグが揃っているか
for flag in -- '--strict-mcp-config' '--no-session-persistence' '--ephemeral' '--ignore-user-config' '--ignore-rules' 'read-only'; do
  [ "$flag" = "--" ] && continue
  if grep -q -- "$flag" bridge.py && grep -q -- "$flag" desktop/engines.js; then echo "OK   安全フラグ $flag が両方にある"; else echo "FAIL 安全フラグ $flag が bridge.py か engines.js に無い"; fail=1; fi
done
[ $fail -eq 0 ] && echo "=== すべて合格 ===" || { echo "=== 失敗あり ==="; exit 1; }
