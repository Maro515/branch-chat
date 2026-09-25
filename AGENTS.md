# AGENTS.md — BranCHAT

AIコーディングエージェント（Claude Code など）向けの作業ガイド。人間向けの概要は `README.md`、設計の背景は `PLAN.md`。

## 1. これは何か

BranCHAT（旧称 Branch Chat）は、AIとの会話を直線ではなく**分岐するツリー**で行うチャットアプリ。
話題を分岐させ、俯瞰図で全体を見渡し、本線に戻っても **AIが全ブランチの内容を認知した状態** で答える。
既存の分岐型チャットは「祖先パスだけ」をAIに渡す。全ブランチの要約（会話マップ）を毎回渡すことが本アプリの存在理由。

利用者は腫瘍内科の臨床医で、UIと文言はすべて日本語。

## 2. 構成

```
branch-chat/
├── index.html      ローカル版の本体（単一HTML）。接続: ダミー / ローカルブリッジ / Claude API
├── artifact.html   claude.ai Artifact 版。接続: Claude（閲覧者のアカウント） / ダミー
├── bridge.py       静的配信 + POST /api/chat → `claude -p`（engine=claude）か `codex exec`（engine=codex）を起動してSSEで返す。どちらも各CLIのログイン＝定額枠で動く
├── desktop/        デスクトップ版（Electron）。main.js / engines.js / package.json / scripts/sync-app.mjs
│                   desktop/app/ は index.html の自動コピー（git管理外・手で編集しない）
├── check.sh        静的チェック（変更後に必ず実行）
├── PLAN.md         設計書（3層コンテキスト、フェーズ、検証シナリオ S1〜S4）
├── README.md       利用者向け説明
├── AGENTS.md       このファイル
└── CLAUDE.md       Claude Code 用。`@AGENTS.md` を読み込むだけ
```

ビルド工程・依存パッケージ・`node_modules` は無い。作らない。

### 2つのHTMLの関係（最重要）

`artifact.html` は `index.html` から派生した**別ファイル**で、自動生成の仕組みは無い。
**機能やUIを変えるときは、必ず両方に同じ変更を入れる。** 片方だけ直すと `check.sh` の関数一致チェックで検出される。

意図的に違えてある箇所は次だけ。ここ以外の差分は不具合とみなす。

| 箇所 | index.html | artifact.html |
|---|---|---|
| 骨格 | `<!DOCTYPE>`〜`<body>` あり | 無し（Artifact側が付与）。先頭は `<meta charset>` と `<title>` |
| 接続方式 | `streamAPI` `streamBridge` `streamOpenAI` `streamDummy`、`probeBridge` | `streamClaude`（`claude.use('sample')`）`streamDummy`、`probeClaude`、`ERR_JA`/`errCopy` |
| 設定ダイアログ | APIキー、モデル名、要約モデル | モデル階層（標準/高度/速い）のみ |
| 既定値 | provider `dummy`、予算 60000 | provider `claude`、予算 40000（入力上限64KBのため） |
| 書き出し（`saveTextFile`） | `<a download>` | `downloads` capability（無ければ `<a download>`） |
| モデル選択肢 | `MODEL_OPTS`=Claude 4種＋（ブリッジ接続かつ Codex CLI がある場合）ブリッジが報告する GPT モデル。`refreshModelCatalog` が組み立てる。各モデルは `engine` と対応する思考量 `efforts` を持つ | `MODEL_OPTS`=階層3種、`EFFORT_OPTS`=空。`refreshModelCatalog` 等は関数の対を保つための空実装 |
| 応答後の表示 | 実トークン数（usage） | 実際に応答した階層（`modelTierApplied`） |

両方に同じ変更を入れる定石は、Pythonで2ファイルをループし、置換前の文字列を `assert a in s` で確認してから置換すること（過去のコミットはすべてこの方式）。

### デスクトップ版（`desktop/`）

- 画面は `index.html` をそのまま使う。**デスクトップ専用のUI分岐は `IS_DESKTOP`（`location.protocol==='app:'`）で最小限に。** 別のHTMLを作らない。
- `engines.js` は `bridge.py` の Node 版。**両者の挙動（イベント形式 `{text}{usage}{rate_limit}{error}{done}`、CLI の安全側フラグ、Codex のモデル一覧の取り方）は常に揃える。** 片方を変えたらもう片方も変える。
- `main.js` は独自スキーム `app://branchat/` で `app/` を配信し、`/api/status` `/api/chat` を処理する。オリジンを変えると利用者の会話（localStorage）が見えなくなるので、スキーム名とホスト名は変更禁止。
- `/api/status` は `auth`（各CLIの `installed` / `loggedIn` / プラン種別）を返す。判定は公式コマンド（`claude auth status`、`codex login status`）で行い、メールアドレス等は画面へ渡さない。`bridge.py` も同じ形で返す。
- `/api/login`（デスクトップのみ）は利用者のターミナルで**固定の**ログインコマンドを開始するだけ。任意のコマンドを受け取る作りにしない。
- **チュートリアル**（`TUT_PAGES`、ヘッダーの「？ 使い方」、初回は自動表示）は両HTML共通。3ページ目「トークンと費用」で、トークンがふつうのチャットの約1.5倍になることと、Jev の判定料の目安（1日1会話・10回分岐で年間およそ900円）を最初に伝える（利用者の指示）。コンテキストの作りや Jev の判定条件を変えたら、この数字も `PLAN.md` の前提で計算し直して更新する。接続ページの番号は 1 のまま（`openTut(1)`）。接続ページだけ `IS_ARTIFACT` / `IS_DESKTOP` で内容が変わる。インストールやログインのコマンドを書き換えるときは、必ず公式ドキュメントか実機の `--help` で確かめる。
- **Web検索**（`settings.web`、既定オン、送信ボタン上の「🌐 Web検索」。プロンプトは「外部情報が不要な場合だけ省く」）: 送信の `web` フラグで、Claude は WebSearch/WebFetch のみ許可、Codex は `--search`（`exec` の前に置くトップレベル指定）、API は `web_search` サーバーツール。エンジンは `{tool:{name,q}}` イベントを流し、画面は `node.tools` としてチップ表示する。Artifact版は非対応（sample は外部通信不可）。
- **MCP**（`settings.mcp`、送信ボタン上の「🔌 MCP」、Claude のみ）: `/api/mcp` が `claude mcp list` を読んで一覧を返す（接続確認に約10秒かかるので60秒キャッシュ、`?force=1` で更新）。送信の `mcp` に選んだサーバー名を渡すと、エンジンは**その定義だけ** `--mcp-config` に入れて `--strict-mcp-config` のまま起動し、`--allowedTools mcp__<slug>` で自動許可する（`--strict-mcp-config` を外して全部読み込むと約9万トークン・10秒かかるので禁止）。claude.ai 連携のうち OAuth が必要なもの（Gmail / Notion / Drive / Calendar 等）は `--mcp-config` では `needs-auth` になり使えない。init の `mcp_servers` を `{mcp_status}` として流し、画面は失敗したものを `settings.mcpUnavailable` に記録して選べなくする。公開サーバー（PubMed）とローカル stdio サーバーは動作確認済み。書き込み系の抑止は system プロンプトの指示のみ（ツール単位の許可制御は未実装）。
- **生成中の表示**: `.spin4`（2×2の箱が回る）。本文が空の間は `.waiting`、見出し行には `.spin4.mini`。`prefers-reduced-motion` で停止。
- **＋メニュー**（入力欄の左、`#plusPop`）に Web検索・MCP・画像添付をまとめる。送信列は「モデル変更」と「送信」だけ。
- **画像添付**（`pendingImgs`、＋メニュー / 貼り付け / ドロップ、最大4枚）: `prepImage` が長辺1600のJPEGを送信用、長辺256を表示用に作る。**保存するのは表示用の縮小版だけ**（`node.images`）。原寸は送信時に `opts.images` で渡し、履歴の再送では「画像n枚が添付されていた」という文だけになる。エンジン: Claude は `--input-format stream-json` で content blocks（動作確認済み）、Codex は一時ファイル＋`-i`（終了時に削除）、API は image ブロック、Artifact は `sample` の `images`（`limits().images` があるときだけボタンを出す）。
- 追加API（デスクトップのみ）: `/api/backup`（POST で会話を `userData/backups/` に保存、GET で最新を返す）。画面側は `persist()` から `scheduleBackup()`、起動時に `restoreFromBackup()`。ブラウザ版では `IS_DESKTOP` が偽なので何もしない。
- フォントは `npm run vendor` で `desktop/vendor/fonts/`（git管理外）に取得し、`sync-app.mjs` が同梱して読み込み先を差し替える。`index.html` のフォント `<link>` の書式を変えたら `sync-app.mjs` の置換も直す（合わないと sync がエラーで止まる）。アイコンは `npm run icon` で `build/icon.png` を再生成。
- スモークテストは `userData` を一時フォルダに分けている。利用者の実データ（`~/Library/Application Support/BranCHAT`）をテストで汚さない。
- 確認は `cd desktop && npm run smoke`（画面表示・エンジン検出・ダミー送信・スクリーンショット）。`SMOKE_KNOW=1` で会話一覧・知識マップ・会話記録のファイル保存も通す（`SMOKE_JEV=1` と `BRANCHAT_JEV_URL=模擬サーバー` で Jev 連携の配線も確認）（`SMOKE_KNOW_LIVE=1` を足すと関連度の AI 判定を Haiku で1回だけ実行）。実モデルも1回試すときだけ `SMOKE_LIVE=1 npm run smoke`。
- 計画とフェーズ（D0〜D3）は `PLAN.md` 末尾。

### ほかの LLM の API（`settings.provider==='openai'`、index.html のみ）

Claude 以外の LLM を API で使うための接続。多くの LLM が備える **OpenAI 互換の `/chat/completions`** を画面から直接呼ぶ（`streamOpenAI`）。設定は接続先 URL（`OA_PRESETS`: OpenAI / Gemini / xAI / DeepSeek / Mistral / Groq / OpenRouter / Ollama / LM Studio / その他）、キー、モデル名（カンマ区切り、`/models` から取得もできる）、要約用モデル名。`refreshModelCatalog` がモデル名をそのまま `MODEL_OPTS`（`engine:'openai'`、思考量なし）にするので、枝ごとのモデル切り替えはそのまま働く。要約・関連度判定など `raw` の呼び出しは `oaSum`（無ければ1つ目）を使う。Web検索・MCP・思考量は送らない。`stream_options` を拒否する API には付けずに送り直す。キーは `settings.oaKey`（端末内のみ、バックアップに入らない）。**実物の各社 API では未検証**で、確認は OpenAI 互換の模擬サーバー（`SMOKE_OA=1`）。ブラウザからの直接接続を許可していない API（CORS）は使えない。Artifact 版は外部通信ができないので対象外（`check.sh` の index 専用関数に登録済み）。

### スクリプトの区画（両ファイル共通、`/* ========== 名前 ========== */` で区切る）

基本ユーティリティ → 設定 → データモデル → **コンテキスト組み立て** → プロバイダ → 要約 → 送信 → 描画(チャット) → トークン数・分岐予定 → 質問の編集 → 分岐 → 俯瞰図 → イベント → 選択テキストから質問 → デモ会話 → 起動

### データモデル（localStorage に JSON で保存）

```js
conv = { id, title, createdAt, order:[nodeId...], activeNodeId,
  nodes:    { [id]: { id, parentId, role:'user'|'assistant', content, branchId, ts, seq,
                      gist?, planned?, usage?, tier?, model?, effort?, mergedFrom?, streaming? } },
  branches: { [id]: { id, name, color, forkFromNodeId, headNodeId, summary, pinned,
                      status:'open'|'closed', createdAt, autoNamed, seq, model?, effort? } },
  _pendingBranch?, _pendingQuote?, _returnNode?, _anchor? }   // 一時状態（保存されるが消えても良い）
```

- ノードは `parentId` だけのツリー。ブランチは「ツリー上の名前付きパス」。本線の id は固定で `'main'`。
- **チャット画面は現在のブランチを末尾まで描く**（`ancestors(B(cur).headNodeId)`）。`activeNodeId` が末尾より前なら、それより後ろの発言を薄く表示し、区切り線で「ここから送信すると新しい枝になる」と示す。`send()` は `parentId` がその枝の末尾でなければ自動で新しい枝を作る（枝の途中で二股にしない）。俯瞰図や「ここから続ける」で発言を選ぶと、その枝全体を表示して当該発言へスクロールする。
- 未開始の分岐 = `headNodeId === forkFromNodeId`（`isEmptyBranch`）。同じ回答からの未開始分岐は1つまで。
- **Claude のモデル一覧（`CLAUDE_MODELS`）には別名 `opus` / `sonnet` を含める（`alias:true`）。** Claude CLI がその時点の最新モデルに解決するので、モデルが更新されてもアプリを直さなくてよい（既定は `opus`）。エンジンは `assistant` イベントの `message.model` を `{model_used}` として流し、画面は `node.modelUsed` として見出しに「(claude-opus-5-5)」のように添える。API 接続（`streamAPI`）には別名を送れないので `refreshModelCatalog` が除外する。新モデルを明示の項目として足すときは、実機の CLI で `--model <id>` が通ることを確認してから（Opus 5.5 は CLI 2.1.282 以降で `claude-opus-5-5`。それより古い CLI は unrecognized_model になる）。
- **モデルと思考量はブランチの系譜で継承する:** 自分のブランチの `model`/`effort` → 分岐元のブランチ → … → 本線 → 全体の既定（`settings`）。`resolveUp` が解決する。本線の指定が会話全体の指定として働くので、会話単位の指定は廃止（旧データの `conv.model`/`conv.effort` は `migrateConvModel` が本線へ移す）。UIの「従う先」の表示は、本線なら「全体の既定」、本線から分かれたブランチなら「本線の設定」、それより深ければ「分岐元「X」の設定」。選択肢は版ごとの `MODEL_OPTS` / `EFFORT_OPTS`。index.html はモデルID＋思考量5段階、artifact.html は階層3種で思考量の指定なし。別の版の値が入った会話を読み込んでも `validModel` が無視して上位に従うので壊れない。モデルが対応しない思考量は `effEffort` がその段階以下の最大へ丸める（例: GPT-5.5 で max → xhigh）。対応段階が空のモデル（Haiku）には思考量を送らない。ブリッジへはモデルから引いた `engine` を一緒に送るので、**ブランチごとに Claude と GPT を混在**できる。会話マップはただの文章なのでどのモデルにも同じものを渡す。
- 保存キー: `bc.convs.v1`（全会話）、`bc.active.v1`、`bc.settings.v1`（`knowThr` `knowScope` `sideHidden` `judge` `jevVia` `jevKey` `jevCfAccount` `jevCfToken` もここ）、`bc.links.v1`（AI が判定したブランチ間の関連度 `{"会話id/枝id|会話id/枝id":{s,by:'ai',ts}}`）。デスクトップ版のバックアップには会話に加えて `links` も入る。
- 状態を変えたら `persist()`、画面は `renderAll()`。

### 会話一覧・知識マップ・会話記録のファイル保存

- 「記憶の引き継ぎ」（他のAIのメモリを貼り付けて全会話の前提にする機能）は**利用者の指示で不採用**。再導入しない。以前の版で保存された `settings.memory` は起動時に破棄する。
- **会話一覧は左のサイドバー**（`#side`、`renderConvSel()` が描く。関数名は以前のプルダウンのまま）。最終発言の新しい順、「今日／昨日／過去7日間／それ以前」で区切る。名前変更と削除は各行のボタン。生成中（`busy`）は会話の切り替え・削除・新規作成をしない（`send()` が途中で別の会話に書き込むのを防ぐ）。ヘッダーの ☰ で開閉、幅760px以下は重ねて表示。幅は境目（`#sideGrip`）のドラッグで180〜520pxに変えられ（`settings.sideW`、CSS変数 `--sideW`、ダブルクリックで248pxに戻る）、細くしすぎるか一覧上部の「«」で完全に隠れる。
- **知識マップ**（View の3つ目、`#know`、`renderKnow()`）: 全会話の「発言のあるブランチ」を点、関連度を**直線**で結ぶ（Obsidian のグラフ風）。線の太さと濃さ＝関連度。しきい値（30/50/65/80%以上）を変えると線を選び直し、ばねモデルで**配置からやり直す**。関連度は `kbScore()` が「保存済みの判定（`bc.links.v1`、`by:'jev'|'ai'`）→ 無ければ簡易判定（文字2連の TF-IDF コサイン、`kbLocalScores`）」の順で返す。**判定役は `judgeMode()`**: デスクトップ版の既定は **Jev**（TypeSafe AI の判定専用モデル。利用者の指示）、ほかに要約モデル・簡易判定のみ。Jev は `scoreByJev()` が `/api/judge`（`engines.judge`、デスクトップ版のみ）へ要点と `score` 型の質問（5段階の基準、候補10本ずつ）を送り、点数÷4×100 を％にする。宛先は TypeSafe（`api.typesafe.ai/v1/systemone`、`jev-latest`）か Cloudflare Workers AI（`typesafe/jev`）の固定2つ。キーは `settings.jevKey` / `jevCfAccount` / `jevCfToken`（この端末の中だけ）。未設定の間は簡易判定で表示し、ボタンが「Jev の接続を設定」になる。**`bridge.py` には Jev の中継を入れない**（ブラウザ版・Artifact 版は要約モデルか簡易判定）。実物の Jev では未検証で、確認は `BRANCHAT_JEV_URL` を模擬サーバーへ向けて行った。判定の実行は `updateLinks()`: 要約の更新後に裏で1回、**そのブランチの発言が6件増えるまでは再判定しない**（`branch.linkN`。定額枠の節約）。候補は簡易判定の上位30本に絞り、要約用モデルへ1回で採点させる。「AIで関連度を判定」ボタンは全ブランチを順に判定（確認あり）。ダミー接続では簡易判定のみ。点の色＝会話、塗り＝本線、中抜き＝分岐。クリックで要点と関連一覧、ダブルクリックか「このブランチを開く」で移動。
- **整理**（知識マップの「整理」、`#tidyDlg`、`renderTidy()`）: 関連度 90%（または 80%）以上の組を並べ、片方を「開く／削除」できる。空の会話のまとめて削除もここ。ブランチの削除は `deleteBranchDeep()`: そのブランチから先に分かれた枝（`branchSubtree`）ごと消し、現在位置は分岐元へ戻す。本線の削除＝会話の削除。消す前にデスクトップ版は会話の写しを `conversations/trash/` に残す。想定規模は「1会話10〜20ブランチ・会話は数年で約500」で、整理の主な効果は知識マップの見やすさ（ほかの会話は AI に渡していないので、消してもチャットのトークンは減らない）。しきい値に 90% を追加。
- **会話記録のファイル保存（デスクトップ版）**: `persist()` → `scheduleStore()` が変更のあった会話だけを1.5秒まとめて `/api/store` へ送り、`userData/conversations/` に会話ごとの `<id>.json`（写し）と `<id>.md`（人が読める記録、`convMarkdown`）、関連度 `_links.json` を書く。画面で削除した会話は `trash/` へ移す（消さない）。起動時は `syncStoreAtStart()` が、ファイルにあって画面に無い会話を取り込み、食い違う会話を書き出し直す。設定に「保存フォルダを開く」。AI 側には履歴を残さない（`--no-session-persistence`、`--ephemeral`）ので、記録はこの端末だけにある。
- 要点（`branch.summary`）は会話データの中にあるものが唯一の正本。知識マップ用に写しを別保存しない。「利用者のアカウントに紐づく保存」は、デスクトップ版では OS ユーザーごとのデータフォルダ（localStorage＋`backups/`）、Artifact 版では閲覧者のブラウザ保存。サーバー側のアカウント保存は無い。

### コンテキスト組み立て（`buildContext`）

1. **Layer 1** 現在ノードまでの祖先パス全文 → `messages`
2. **Layer 2** 全ブランチの要約カード「会話マップ」→ system。要約は回答完了ごとに安いモデルで非同期更新（`updateSummary`）
3. **Layer 3** ピン留めブランチの全文 → system

予算超過時は古い往復から省略。Artifact版には system が無いので、同じ文字列を先頭の user ターンとして渡す。

## 3. 動かし方・テスト方法

### 起動

プレビューは**親フォルダ**の `~/Applications/.claude/launch.json` にある `branch-chat`（port 8991、`bridge.py` を起動）を使う。
Claude Code では `preview_start {name:"branch-chat"}`。Bash で直接サーバーを立てない。手動なら:

```bash
python3 bridge.py
```

`http://localhost:8991/` が index.html、`/artifact.html` が Artifact 版（ローカルでは `window.claude` が無いのでダミー応答になる）。

### 変更後に必ずやること

1. 静的チェック（構文、Artifact禁止パターン、2ファイルの関数一致、bridge.py構文）

   ```bash
   ./check.sh
   ```

2. ブラウザで確認。ヘッダーの「デモ会話」か、コンソールで `settings.provider='dummy'; saveSettings(); loadDemo()` を実行すると、本線＋分岐3本＋分岐予定＋要約入りの会話ができる。見た目の変更はスクリーンショットで確認し、コンソールエラーが無いことを見る。
3. コンテキストに関わる変更は `PLAN.md` の検証シナリオを通す。
   - S1: 分岐で決めた事を本線で聞くと引用して答える
   - S2: 孫ブランチの内容も本線から参照できる
   - S3: 過去の回答から分岐したとき、祖先パスが分岐点で切れている（`ancestors(id).map(label)` で確認）
   - S4: 無関係なブランチの話題が本線の回答に混ざらない
4. 実モデルでの確認が必要なときだけ、ブリッジ＋`claude-haiku-4-5`（Codex 側は `gpt-5.5` の low）で最小回数にする（利用者の定額枠を消費する）。ループやテストスクリプトから実モデルを連打しない。

自動テストは無い。ロジックの確認はブラウザのコンソールからアプリの関数（`send` `createBranch` `openFork` `buildContext` `editQuestion` など、すべてグローバル）を直接呼ぶ。

### Artifact 版の公開

公開先は固定: `https://claude.ai/artifact/HKiAkcZ2stzQDns8J32QpE`（capabilities: `sample`, `downloads`）。
別セッションから更新するときは Artifact ツールに `url` を渡す。渡さないと別のArtifactが新規に出来てしまう。`favicon` と `capabilities` は渡さない（既存が引き継がれる）。
claude.ai にサインインしていないブラウザでは Claude 呼び出しを検証できない。未検証ならそう報告する。

## 4. コーディング規約

- **単一HTML・依存ゼロ・ビルド無し。** フレームワーク、npm、CDNスクリプトを入れない。外部読み込みは Google Fonts の2書体だけ。
- 素の JavaScript。関数と状態はグローバル。区画コメントの並びを保ち、新機能は該当区画か「起動」の直前に新区画として足す。
- **画面に出す可変文字列は必ず `esc()` を通す。** AI本文は `md()`（内部で `esc` 済み）。`md()` は `mdBlocks()`（行・表・コードのブロック配列）を結合したもので、表（GFM）、見出し、箇条書き、番号付き、引用、区切り線、リンクに対応。生成中は `renderStream()` が前回との差分ブロックだけを描き足し、新しい行は `.reveal` で滑らかに現れる（複数行が一度に届いたときは1行ごとに約70msずつ遅らせる）。書きかけの行は要素を作り直さず中身だけ更新する（フェードを途切れさせないため）。
- **`confirm()` `prompt()` `alert()` は使わない。** Artifact のサンドボックスで黙って無効になる。`askConfirm(msg, okLabel)` と `askPrompt(title, default)` を `await` する。
- `localStorage` を直接触らない。`lsGetSafe` / `lsSetSafe`（try/catch 付き）か既存の `persist()` / `saveSettings()` を使う。**一括置換でヘルパー自身の中身まで書き換えないこと**（過去に `lsGet` が自分を呼ぶ形になり、Artifact版で保存が全く効いていなかった。`check.sh` が検出する）。
- 文言は日本語、利用者目線で具体的に。ボタンは起きることをそのまま書く（「分岐を取り消す」）。

### デザインの決まり（利用者の指示で確定したもの）

- ヘッダーとブランチ帯はサイバー風のダーク。**チャット領域と俯瞰図は白背景・藍色（`--indigo: #1e3a6e`）の文字・太めの線。** 暗くて見にくいという指摘で決まった。戻さない。
- **チャット本文（`.msg .body`）は黒（#111）・13px。** 見出し・メタ情報・ボタン・ブランチ名は藍のまま。利用者の指示（藍の本文は読みにくい、文字はやや小さく）。
- **フォント:** 既定は Noto Sans JP（チャット本文、ブランチ名、要約など可変の文字すべて）。**全員に共通の固定UI文言だけ DotGothic16**（タイトル、ボタン、項目名、凡例、ダイアログのラベル）。固定文言は `.ui` クラス、その中の可変部分は `.var` で Noto に戻す。
- **配置:** 他のLLMチャットと同じ。自分の発言は右寄せの吹き出し、**AIの回答は枠・背景なしで列幅いっぱい**（ブランチは見出しの色付きラベルで示す）。操作ボタンは各発言の本文の下（AI: 分岐 / 分岐予定 / ここから続ける、自分: 質問を編集する）。
- **演出は控えめ・機能的に。** 全画面エフェクト（ワープ演出）は「うるさい」と却下され撤去済み。分岐開始時は分岐元を画面上端へスムーズスクロール＋枠を短く光らせるだけ。俯瞰図の波紋も小さく淡く（半径+14px、線1.2px、不透明度.45、2重）。`prefers-reduced-motion` を尊重する。
- 色は `:root` のトークン（`--c0`〜`--c7` がブランチ色、`--yellow`/`--ystroke` は「分岐予定」専用）。ブランチ色に黄色を使わない。
- 俯瞰図: ドットの大きさ＝トークン数、ラベルは `node.gist`（20字以内の要約）を白帯つきで表示、レーン幅300px、見出しは17px太字に白帯。
- **本文は少し左寄り**: `#focus` の `--gutR`（右の余白。ミニ俯瞰図のぶん最大170px）と `--gutL` で、発言・区切り・入力欄をそろえて配置する。右上のミニ俯瞰図と重ねないための指定なので、左右対称に戻さない。狭い画面では左右16px。
- 俯瞰図の右欄（`#cards`）は、先頭に固定の見出し「各ブランチの要約」と説明（AI に毎回渡る要約であること）、「ボタンの説明」の折りたたみ、区切り見出し（分岐予定／ブランチごとの要約）を出す。何の一覧か分からないという指摘で追加したので外さない。
- **ミニ俯瞰図**（`#miniMap`、`renderMini()`）: チャット右上に常時表示。文字は出さず、枝の線と現在位置（藍の二重丸）、下に枝の本数だけ。今いる道筋は濃く、ほかの枝は淡く。縦130px・横120px以内に収まるよう間隔を自動で詰める。クリックで俯瞰図へ。
- **生成中のスクロール**: `followTail` が真のときだけ末尾へ追従。利用者が上へ動かしたら止め、末尾まで戻すか「↓ 最新へ」（`#jumpBtn`）で再開。距離で判定して引き戻す方式には戻さない。
- View の項目名は「チャット」「俯瞰図」「知識マップ」。ブラウザ標準の `<select>` ではなく自前メニュー。

## 5. 変更してはいけないもの

- **localStorage のキー名（`bc.*.v1`）とデータモデルの既存フィールド。** 利用者の会話が消える。どうしても変えるなら読み込み時の移行処理を同時に入れ、書き出しJSONの後方互換を保つ。本線の id `'main'` も固定。
- **「全ブランチをAIが認知する」仕組み**（`buildContext` の3層と会話マップの注入、`updateSummary`）。軽量化のために要約カードを外す・現在ブランチだけにする、は不可。
- **Artifact の公開URL・favicon・capabilities。** 新しいArtifactを作らない。`mcp` など共有範囲を狭める capability を勝手に足さない。
- **Claude もブランチごとに常駐（デスクトップ版、`desktop/claude-session.js`）:** `claude -p --input-format stream-json` は1プロセスで複数ターンを保持できる。セッションの同一性はブランチ＋（モデル・思考量・Web検索・MCP）。直前の返答の続きなら「会話マップ＋新しい発言」だけを送り（2ターン目 約3秒）、続きでなければプロセスを作り直して会話全体を送る。固定の指示は起動時の `--system-prompt`（`systemStatic`＝会話マップの手前まで）、会話マップは毎ターン発言に添える。停止はプロセス終了。同時4本まで、10分放置で終了。失敗時は単発起動に切り替え。
- **Codex は app-server 経由（デスクトップ版）:** `desktop/codex-server.js` が `codex app-server --stdio` を常駐させ JSON-RPC で会話する（`initialize`→`thread/start`→`turn/start`、`item/agentMessage/delta` で逐次配信、`turn/interrupt` で停止、`thread/tokenUsage/updated` で使用量）。**ブランチごとにスレッドを保ち**、直前の返答（`lastMessageId`）の続き（`parentId`）なら会話マップ＋新しい発言だけを送る（2回目以降は約2秒、前の内容はキャッシュ）。続きでなければ新スレッドを作って会話全体を送る。Web検索は `thread/start` の `config:{web_search:'live'}`、画像は `input` の `{type:'image',url:'data:...'}`。サーバーからの承認要求は常に拒否。失敗時は従来の `codex exec` に自動で切り替える。`bridge.py`（ブラウザ版）は exec のまま。
- **DOCX / PPTX 書き出しと「送信コンテキストを見る」は利用者の指示で廃止**（`desktop/export.js`、`/api/export`、`docx`/`pptxgenjs` の依存も削除）。再導入しない。
- **バックアップ・引継ぎ**（ヘッダーの1ボタン、`#bkDlg`）: 旧「書き出し／読み込み」を統合。`exportAllConvs()` が全会話＋関連度を `{app:'BranCHAT',kind:'backup',format:1,convs,links}` の1ファイルに書き出す（設定とキーは入れない）。`importBackupText()` はこの形式と旧来の会話1件のファイルの両方を受け、**足し合わせ**で読み込む（同じ id は最終発言が新しい方を残す。適用前に件数を確認）。保存は `saveTextFile()`（index は `<a download>`、artifact は `downloads` capability）。
- **Codex の完了判定:** `turn.completed` を受けたら即 `done` にしてプロセスを kill する（終了処理に約6秒かかり、その間「生成中」に見えていた）。GPT モデルの思考量は、どこにも指定が無ければモデル既定（`defEffort`、ChatGPT と同じ）を使う。`high` を強制しない。
- **起動の固定費対策（両エンジン層共通）:** Claude 起動時は環境変数 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` `DISABLE_AUTOUPDATER=1` と `--setting-sources ""` を必ず付ける（1回あたり約2.7秒→0.3秒。実測済み）。`--bare` は OAuth を読まなくなるので使えない。
- **`bridge.py` の安全側の設定:** `127.0.0.1` バインド。Claude 側は `--tools ""`（Web検索オン時だけ `--tools WebSearch WebFetch --allowedTools WebSearch WebFetch`。ファイルやコマンド系のツールは決して足さない）、`--strict-mcp-config`、`--no-session-persistence`。Codex 側は `-s read-only`、`--ephemeral`、`--ignore-user-config`、`--ignore-rules`、空の作業フォルダ。`~/.codex/auth.json` は存在確認だけで中身を読まない。外部公開（`0.0.0.0`）にしない。ツールやMCPを有効にする変更は利用者の明示的な依頼があるときだけ。
- **秘密情報をリポジトリに入れない。** APIキーはブラウザの localStorage にのみ保存される設計。`check.sh` が `sk-ant-` を検出する。
- **GitHub Pages を再有効化しない**（利用者の指示で停止済み。公開先は Artifact に一本化）。リポジトリ `Maro515/branch-chat` はソース管理専用。
- 親フォルダの `launch.json` の他プロジェクトの設定、および `branch-chat` の port 8991。
- デスクトップ版の配信オリジン `app://branchat`、`appId`（`jp.maro515.branchat`）、レンダラの `contextIsolation` / `sandbox` / `nodeIntegration:false`。
- デモ会話は**架空の薬剤「ゾルミン」**を使う。実在薬の用量など、医学的助言に見える内容をデモやサンプルに入れない。
- 第4節の「デザインの決まり」。変えるのは利用者が頼んだときだけ。

## 6. 作業の進め方

- 変更は小さく。1つの依頼につき1コミット、メッセージは日本語で要点を1行。`main` に直接コミットしてよい（個人リポジトリ）。push まで行う。
- 流れ: 両HTMLに変更 → `./check.sh` → ブラウザ確認 → commit & push → Artifact を再公開 → 何を確認できて何が未確認かを報告。
- 表示確認ができなかった場合（ブラウザが使えない等）は、その旨を必ず伝える。
- 既知の制約: Artifact版はモデル名・思考量を指定できない（階層のみ）。トークン数は概算。外部通信不可。

## 7. 今後の予定（参考）

Artifact版で使用感を固めた後、**デスクトップアプリ化**（ブリッジ同梱、各利用者の Claude Code ログインで定額利用）。そこでモデル名・思考量の選択と、MCP接続（設定で選んだサーバーだけ `--mcp-config` で渡す、読み取り系のみ自動許可、ツール実行をUIに表示）を入れる構想。

アプリ名「BranCHAT」は同綴りの既存アプリ（branchat.app、GitHub の GzqHerry/branchat）と、旧名に近い BranchChat（branch-chat.com）がある。商標は未調査。一般公開・商用化の前に名称の再検討が必要。
