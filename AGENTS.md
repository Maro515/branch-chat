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
├── index.html      画面の本体（単一HTML）。デスクトップ版はこれをそのまま使う。接続: ダミー / ローカルブリッジ / Claude API / OpenAI互換API
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

### Artifact 版は廃止（2026-09-25、利用者の指示）

`artifact.html`（claude.ai Artifact 版）は削除した。**開発はデスクトップ版のみ。** `index.html` は1ファイルで、`check.sh` の「2ファイルの関数一致」チェックも廃止。コード中の `IS_ARTIFACT` は常に `false` の定数として残してあり、分岐は無害（順次整理してよいが必須ではない）。公開済みの Artifact（https://claude.ai/artifact/HKiAkcZ2stzQDns8J32QpE、Version 46 で停止）は更新しない。`bridge.py`＋ブラウザは開発時のプレビュー用としてのみ残す。

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
                      status:'open'（「終了」は廃止。旧データの 'closed' は読み込み時に 'open' へ戻す）, createdAt, autoNamed, seq, model?, effort? } },
  _pendingBranch?, _pendingQuote?, _returnNode?, _anchor? }   // 一時状態（保存されるが消えても良い）
```

- ノードは `parentId` だけのツリー。ブランチは「ツリー上の名前付きパス」。本線の id は固定で `'main'`。
- **チャット画面は、分岐元の回答1件＋現在のブランチの発言だけを描く**（`ancestors(B(cur).headNodeId)` を `forkFromNodeId` から切る。本線は全部）。祖先の会話全体は AI には渡るが画面には出さない（利用者の指示）。分岐元の回答や現在位置より後ろの発言（`.msg.outside`）は**文字を薄くせず、薄い灰色の網掛け**（背景 #f1f1f1）で示す（利用者の指示。`--dim` の不透明度は使わない）。先頭の区切りに「分岐元を開く」リンク。`#focus` は `--curbc`（現在ブランチの色）で縁取り。自分の発言はメタ情報なし・ホバーで ✎ だけ、AI の回答の見出し行はブランチ名・「AI」・モデル名だけ（「#n」の連番と「tok」は利用者の指示で外した。俯瞰図の title には残る）、AI の回答のボタンは記号（⧉ 全文コピー → ⑂ ☆/★）＋ `data-tip` の自前ツールチップで説明。コードブロックは `.codewrap` で包み、右上に ⧉「この部分だけをコピー」（クリックは `#msgs` で委譲）。「ここから続ける」は「ここから分岐」と同じ結果になるので廃止（`gotoNode` 自体は俯瞰図から使う）。`activeNodeId` が末尾より前なら、それより後ろの発言を薄く表示し、区切り線で「ここから送信すると新しい枝になる」と示す。`send()` は `parentId` がその枝の末尾でなければ自動で新しい枝を作る（枝の途中で二股にしない）。俯瞰図や「ここから続ける」で発言を選ぶと、その枝全体を表示して当該発言へスクロールする。
- 未開始の分岐 = `headNodeId === forkFromNodeId`（`isEmptyBranch`）。同じ回答からの未開始分岐は1つまで。
- **Claude のモデル一覧（`CLAUDE_MODELS`）は名指しのモデル ID だけ。** 別名（`opus` / `sonnet`、CLI が最新に自動解決する）は一度入れたが**利用者の指示で撤去**。新モデルが出たら一覧に1行足し、既定モデル・要約モデルの候補も見直して、アプリを更新する方針。追加前に実機の CLI で `--model <id>` が通ることを確認する（Opus 5.5 は CLI 2.1.282 以降で `claude-opus-5-5`）。エンジンは `assistant` イベントの `message.model` を `{model_used}` として流し、画面は要求したモデルと違うときだけ `node.modelUsed` を見出しに添える。
- **モデルと思考量はブランチの系譜で継承する:** 自分のブランチの `model`/`effort` → 分岐元のブランチ → … → 本線 → 全体の既定（`settings`）。`resolveUp` が解決する。本線の指定が会話全体の指定として働くので、会話単位の指定は廃止（旧データの `conv.model`/`conv.effort` は `migrateConvModel` が本線へ移す）。UIの「従う先」の表示は、本線なら「全体の既定」、本線から分かれたブランチなら「本線の設定」、それより深ければ「分岐元「X」の設定」。選択肢は版ごとの `MODEL_OPTS` / `EFFORT_OPTS`。index.html はモデルID＋思考量5段階、artifact.html は階層3種で思考量の指定なし。別の版の値が入った会話を読み込んでも `validModel` が無視して上位に従うので壊れない。モデルが対応しない思考量は `effEffort` がその段階以下の最大へ丸める（例: GPT-5.5 で max → xhigh）。対応段階が空のモデル（Haiku）には思考量を送らない。ブリッジへはモデルから引いた `engine` を一緒に送るので、**ブランチごとに Claude と GPT を混在**できる。会話マップはただの文章なのでどのモデルにも同じものを渡す。
- 保存キー: `bc.convs.v1`（全会話）、`bc.active.v1`、`bc.settings.v1`（`knowThr` `knowScope` `sideHidden` `judge` `jevVia` `jevKey` `jevCfAccount` `jevCfToken` もここ）、`bc.links.v1`（AI が判定したブランチ間の関連度 `{"会話id/枝id|会話id/枝id":{s,by:'ai',ts}}`）。デスクトップ版のバックアップには会話に加えて `links` も入る。
- **チャット外で質問・説明（`conv.notes`、`#noteWin`、`markNotes()`）:** 回答の一部を選ぶと「これについて質問する」（→ この線で質問／分岐して質問／チャット外で質問）と「説明してもらう」（→ 簡単な説明／一般的な説明／詳細な説明。文面は `EXPLAIN` に固定、利用者指定）が出る。チャット外と説明は小窓で応答し、**発言（nodes）には足さない**が、**要点は会話マップの末尾「### サイドチャット」として AI に渡す**（`sideChatCards()`、直近20件。回答が終わるたびに `updateNoteSummary()` が要約用モデルで要点 `note.summary` を作る。要約がまだ無ければ最後の回答の先頭160字）。画面上の呼び名は「サイドチャット」（旧「チャット外」）。`conv.notes[id]={nodeId,text,items:[{role,content}]}` に保存し（**選択メニューから始めた質問1つにつきチャット1つ**。同じ言葉でも別のチャットになり、小窓の中で続けた質問だけが同じチャットに入る。利用者の指示）、その言葉に黄色のマーカー（`mark.note`）。マーカーにカーソルで、その言葉のチャットごとに最初の質問（Q）を列挙（`#notePop`。回答は出さない。押すとそのチャットを開く）、クリックで小窓を開いて続きを質問。小窓は左上の角・左辺・上辺のドラッグで大きさを変えられる（`settings.noteW` / `noteH`、ダブルクリックで元に戻る）。選択が装飾をまたいで本文から見つからないときは、回答の末尾に小さな札を出す。
- **会話の題名は自動。** 最初の発言で仮の題名（先頭20字、`conv.titleAuto=true`）、本線の要約ができるたびに AI の `title`（15字以内の名詞句）で付け直す。利用者が名前を変えたら `titleAuto=false` にして以後は触らない。
- 状態を変えたら `persist()`、画面は `renderAll()`。

### アジェンダ・進捗表（右側パネル）とテンプレート

- **アジェンダ**（`#agenda`、`conv.agenda={items:[{id,n,text,status:'open'|'done',by,src,doneSrc}],memo:[]}`、`renderAgenda()`）: チャット画面の右側に常時表示（ヘッダー「📋 進捗」で開閉、`settings.agendaOff`）。区分は 進行中（青）／未解決項目（橙）／解決済み（緑）の3つで色分け（議事録は利用者の指示で廃止。`conv.agenda.memo` は空のまま残る）。未解決項目は `updateSummary` の JSON に足した `resolved_ids`（番号 `n`）と `new_open` で AI が出し入れし（`applyAgendaFromSummary`）、手でも追加・編集・解決・削除できる。各項目は出どころの枝（`src`）を持ち、押すとその発言へ移動。`agendaCards()` が会話マップの末尾に「## アジェンダ」として AI に渡す（番号で指示できる）。⧉ で Markdown をコピー。
- **テンプレート**（`TEMPLATES`、`applyTemplate`、`#tplDlg`）: 「＋ 新しい会話」はテンプレート選択から。本線＝全体の設計と仕上げ、分岐＝部品の作り込み。適用すると、本線に骨組みの説明の発言（`model:'template'` の assistant ノード。要約の対象外）を1つ置き、そこから各分岐を空のまま作る（`branch.instr` に役割）。`B('main').instr` と `B(cur).instr` は `templateInstr()` が system の先頭に入れる。空の枝のタブを押すとその枝が「次の送信先」になる（`gotoBranch` が `_pendingBranch` をその枝に設定、タブは `effectiveBranchForSend()` を選択中として表示）。テンプレート由来の空の枝には「✕ 取り消す」を出さない。収録: 論文（本線＋Introduction/Methods/Results/Discussion）、学会抄録、学会発表、試験勉強、アプリ開発。初期の未解決項目は `t.agenda`。

### Figure 作成（`figure.js` + `figure-stats.js` + `figure-more.js` + `figure-more2.js` + `figure-layout.js` + `figure-image.js` + `figure-schematic.js` + `figure-omics.js`）

- 画面上の名称は「Figure 作成」「Figure を作る」（「Prism 9 風」「Prism 風のグラフ」の表記は利用者の指示で外した。説明文は「統計グラフ・作図」）。仕様の出典は `~/Applications/prism9-figure-spec/03_Prism9同等Figure作成アプリ_要件定義書.md`（§6 描画エンジン、付録B 既定値、§15 ロードマップ）。現状は P1（統計グラフの核）の最小版: データ表 Column / Grouped / XY、グラフ 散布ドット・棒・箱ひげ・バイオリン・集合棒・集合散布・XY 折れ線・XY 散布、誤差 SD/SEM/95%CI、有意差（2群 Welch t、3群以上 一元配置分散分析＋Tukey 全比較、または Dunnett 対照群比較）の自動ブラケット（GP 書式）、SVG/PNG（300 dpi）、画像コピー、チャットへの添付。
- **チャットからの作図**: `FIG_PROMPT` を system に入れ、AI は ```` ```figure ```` の JSON（`{title,kind,type,err,compare,ctrl,ytitle,xtitle,ymin,ymax,data(TSV),style}`）を出す。`mdBlocks` がこのブロックを `figBlockHTML()` で SVG に描く（JSON が途中なら「図を作成中…」）。`figHydrate()` が描画後に発言 id を付け、ブロックのボタン（✎ 編集 / PNG / SVG / ⧉）は `#msgs` のクリック委譲。**✎ 編集**は `figOpenFromBlock()` で作成画面を開き（`figState.src={nodeId,index}`）、「回答の図を更新」（`figUpdateSource()`）で元の発言の ```figure ブロックを書き換える。「チャットに添付」は PNG を画像添付し、入力欄に ```figure の JSON を入れる（AI にも指定が伝わる）。
- **要素ごとの設定**: `figRender()` は SVG を `data-sel`（`axes` / `series:i` / `brackets` / `legend` / `title` / `ytitle` / `xtitle`）のグループで出し、プレビューのクリックで `figState.sel` を選ぶと右の欄（`figInspector()`）がその要素の設定になる。系列ごとは `opts.series[i]={color,symbol,symPt,fill,lineW}`（`figSeriesOpt()` が既定と合成）、全体は配色セット（`FIG_SCHEMES`: prism / colorblind / nature / gray）・文字と記号の大きさ・軸の太さ・図の幅と高さ・棒の塗り、軸は目盛の長さ・太字・Y の範囲、ブラケットは形・P の表示・ns。記号は ● ■ ▲ ▼ ◆ ＋ ×。
- **ツールメニュー**（`FIG_TOOLS`、`#figToolbar`、Prism のリボンにならった編集ボタン）: グラフ（種類・誤差・誤差棒の向き・キャップ幅・棒に点を重ねる・塗り・濃さ・縁の色・記号と線の太さ）／軸（枠 L字・四方・なし、太さ、色、目盛の向き 外・内、長さ、グリッド、Y 対数、Y 範囲、基準線、X ラベルの回転）／文字（書体 Arial・Helvetica・Times・IBM Plex Sans JP、大きさ、太字、題名、軸の題）／配色（セットと系列ごとの色・記号・塗り）／注釈（有意差、ブラケットの形、P の表示、ns、凡例の位置 右・下・なし）／大きさ（形のプリセットと幅・高さ）。元に戻す・やり直す（⌘Z / ⌘⇧Z、`figUndo`、`figSync` のたびに 400ms まとめて履歴に積む）、コピー・PNG 300/600 dpi・SVG。メニューの値は `figApplyTool()` が `opts` に書き、右の「選んだ要素」欄と同じ状態を共有する。Grouped の有意差は **カテゴリごとに**群同士を比較（`figCompareGrouped`。2元配置分散分析ではない、と表に明記）。
- `figure-stats.js` は PrismLab（`~/Applications/prism-lab/build/00_base.html` の数学コア）からの流用で、scipy と照合済み。描画の既定値は要件書の付録B（Arial 太字 12pt、軸 1pt の L 字、目盛は外向きで数字の高さ×0.7、棒の間隔 隣接50%/群間100%/端50%、誤差棒キャップ＝棒幅×0.5、散布の平均線はキャップ幅×2・太さ2倍、ブラケットは脚＝データ上端＋0.75h・段間隔 2h、上の余白は段数に応じて広げる）。SVG は XML なので属性値に二重引用符を入れない。
- **P2 の図種（`figure-more.js`）**: figure.js のフック（`figAutoKindMore` / `figBuildDataMore` / `figRenderMore` / `figStatsMore`）から呼ばれる別ファイル。既存の表の型に足した type: column の `before-after`（行＝同じ個体。対応のある t 検定＋Holm、`raw` で行の対応を保つ）・`histogram`（ビンは log₂n＋1 を切りの良い幅に、境界は大きい側、ガウス重ね描き）、grouped の `stacked-bar` / `stacked-100`、xy の `xy-regression`（直線回帰、95% 信頼帯/予測帯、r・R²・P）・`xy-dose`（4PL、X が濃度なら log10 に変換して 10 のべき乗で目盛、EC50/IC50 の補助線）・`xy-mm`（Michaelis–Menten）。新しい kind: `survival`（Time, Event, Group → Kaplan–Meier、Greenwood＋log-log の 95% CI、打ち切り印、中央値の補助線、log-rank と Mantel–Haenszel の HR、Number at risk 表）、`roc`（マーカー列＋Class → 感度/特異度、AUC と DeLong の CI、Youden のカットオフ、2 曲線は DeLong 検定。AUC<0.5 なら自動で向きを反転）、`heatmap`（行列。type `heatmap` / `corr`。z スコア、セル値、階層的クラスタリング＝ユークリッド距離・平均連結の樹形図、カラーバー）、`forest`（Study, Estimate, Lower, Upper, Weight, n。Estimate が空の行は小見出し、Overall は菱形、OR/HR/RR は自動で対数軸、四角は重みに比例）、`waterfall`（Patient, Change, Response。降順、CR/PR/SD/PD の色、+20%/−30% の線）。表の型は `figAutoKind()` が生存・ROC・フォレストを見出しから自動判定する。非線形あてはめは Nelder–Mead（`figNM`、点推定のみ・SE なし）。4PL / MM / 回帰 / log-rank / AUC は scipy と照合済み。
- 図種ごとの固有設定は「図種の設定」メニュー（`FIG_TOOLS_MORE`、type → kind の順で引く）。既定値は `FIG_DEF_MORE` で `FIG_DEF` に合成し、保存するキーは `FIG_STYLE_KEYS` に push する。描画結果の数値は `figRender` の戻り値 `res` に入れ、`figState.res` 経由で左下の結果表（`figStatsMore`）が使う。共通の枠は `figFrame()`（軸線は目盛の端で止める。目盛を 40% 以上はみ出すときだけ目盛を 1 つ延ばす）。
- **P3 の図種（`figure-more2.js`）**: figure-more.js の各ディスパッチの先頭から `figAutoKindP3` / `figBuildDataP3` / `figRenderP3` / `figStatsP3` として呼ばれる。既存の型に足した type: column の `estimation`（推定プロット。対照＝`ctrl` との平均差を右軸に、Welch の t の 95% CI。右軸の 0 は対照の平均の高さ、目盛幅は左軸と同じ）・`qq`（X＝実測、Y＝正規予測。Blom の順位統計量、Shapiro–Wilk）・`bland-altman`（2 列、バイアスと 95% 一致限界とその CI）、grouped の `grouped-line`、xy の `xy-band`（平均の線＋平均±誤差の帯。学習曲線）、heatmap の `confusion`（行＝実際・列＝予測、正確度・κ・クラスごとの再現率/精度/特異度/F1）。新しい kind: `multi`（行＝個体・列＝変数。`bubble`（面積比例、大きさ凡例は 最小・幾何平均・最大）、`pca-scores`（群の 95% データ楕円は ggplot2 stat_ellipse と同じ半径）・`pca-biplot`（ローディングをスコアの 90% に縮尺）・`pca-scree`（固定シードの乱数で Parallel analysis、帯＝5–95 パーセンタイル）・`pca-variance`。PCA は Jacobi の固有値分解 `figEigSym`、numpy と一致）、`nested`（Group, Subject, Value → `superplot`。小さな点＝反復、記号＝個体平均、検定は個体平均で `figCompare`）、`swimmer`（Patient, Duration または Start/End, Response, Ongoing, ほかの数値列＝イベント。Start 列は列名が start で始まるときだけ）、`spider`（長い形式 Patient, Time, Change, Group／横長 Time＋患者列）、`feature`（Gene, log2FC, P/padj, baseMean → `volcano` / `ma`。q が無ければ BH で算出、上位 n のラベルは重なりを縦にずらす）、`importance`（横棒、降順）。
- **レイアウト（`figure-layout.js`）**: ```figure の JSON が `{"kind":"layout","title","cols","labels":"A|a|none","page":"none|1col|1.5col|2col","gap","align","panels":[図の指定,…]}` のとき `figRenderSpec` → `figRenderLayout`。各パネルを `figRenderSpec` で描き、入れ子の `<svg x y>` として並べる。**軸の位置揃え**は各描画関数が返す `plot:{x0,y0,w,h}`（figure.js の `figRender` と figure-more.js の `figFrame().wrap` が付ける。フォレスト・混同行列など独自 SVG は無し）を使い、列ごとに左の軸線、行ごとにプロット上端を揃える。パネル記号は太字 14 pt でセルの左上。`page` は Nature 系の誌面幅（89/120/183 mm）に全体を縮尺（viewBox はそのまま、width/height だけ変える）し、文字が 6 pt 未満なら警告。チャットのブロック（`figLayoutBlockHTML`）には パネルごとの「✎ A」「✎ B」…（`figOpenFromBlock(el,panel)` → `figState.src.panel`、`figUpdateSource` が `panels[k]` を差し替えて書き戻す）と、列・記号・誌面・軸揃えのセレクト（`figLayoutSet`、`#msgs` の change で書き戻し）。同じ発言に ```figure が 2 つ以上あれば `figHydrate` が最後のブロックに「⊞ 1 枚にまとめる」（`figCombineBlocks`）を足す。
- **画像パネル（`figure-image.js`）**: ```figure の `kind:"image"`。`type:"grid"`（顕微鏡・IHC の画像グリッド: 列数・セル幅・行/列見出し（列見出しは疑似カラーの色）・セル左上の文字・スケールバー・注釈）と `type:"blot"`（短冊を縦に並べ、左に kDa、右に抗体名、上にレーン番号・＋/− の条件行列・楔・上線つきの群見出し）。**専用の作成画面 `#figImgDlg`**（0.7.1、Figure 作成と同じ構成: 左＝型・題名・列数・セル幅・行/列見出し・スケールバー・画像リスト（並べ替え・外す・文字・疑似カラー・LUT・表示範囲・γ・回転・反転・切り抜き、チェックして「合成セルを足す」）、上＝注釈ツール（プレビューのセルをクリックで置く、ドラッグで移動、プロファイルは線と xy の図を `figImgState.profiles` に積む）、右＝プレビューと「チャットに添付して質問する」「回答の図を更新」「画像をコピー」「PNG」「SVG」「{} JSON」）。＋メニュー「🔬 画像パネルを作る」（`#figImgBtn` → `figImgOpenWithFiles`）はファイルを取り込んでこの画面を開く。チャットの画像ブロックの「✎ 編集」は `figOpenFromBlock` → `figImgOpen(j,src)` でこの画面に来る（レイアウトのパネルでも可）。色はすべてパレット `figSwatches(ik,i,cur,{none,names})`（`FIG_PAL` の 10 色＋好きな色の入力。`.sws .sw` のクリックを `swPick` で拾う）: セルの文字の色 `labelColor`、疑似カラー `channel`（names モードで色名を値に）、合成の層、列見出しの色 `colColors`（列見出しを入れると列ごとに出る `figImgFillColColors`）、スケールバーの色、注釈の色（ツール行、`figImgState.annotColor`）。**注意**: index.html の全体 CSS `svg text{fill:var(--indigo)…}` は図の SVG を壊すので `:not(.figblock text,.figPreview text,#figJsonPrev text)` で除外してある（図の文字色・フォントは SVG の属性どおりに出る）。状態は `figImgState={spec,src,tool,pts,profiles,r}`、フォーム→spec は `figImgReadForm`、描画は `figImgSync`。CSS は `#figDlg` の規則を `#figImgDlg` にも適用（入れ子 svg を壊さないよう `.figblock > svg` / `.figPreview > svg` と直接の子だけに当てる）。**画像本体は本文に入れない**: 画像を長辺 2000 px に縮めてデスクトップ版は `/api/img`（`userData/conversations/images/<id>.png|jpg`、main.js）、ブラウザ版は `localStorage` の `fimg:<id>` に保存し、寸法 `{w,h,name}` を `conv.imgs[id]` に持つ。本文の JSON は `{"img":"im…"}` の id だけ。入力欄に指定を入れ、AI に見せるため縮小版も添付する（AI は id を使って並べ方・見出し・注釈を指定できるが、新しい画像は作れない）。SVG は `<image href="/api/img/id">`、PNG 書き出し・添付は `figToPng` が `figInlineImages` で data URL に埋め込む（`<img>` として読む SVG は外部参照を読めないため）。スケールバーは `scale:{umPerPx,len,unit,pos,color,labelOn}` から 画像 px → セル px（`xMidYMid slice` の倍率）で長さを出す。注釈 `annots:[{t:'arrow'|'head'|'star'|'text'|'roi',cell,x,y,…}]` はセル内の割合座標で、ブロックのツール（矢印・矢頭・＊・文字・ROI 枠 → セルをクリック、`figImageCellClick`）で足し、⌫ で最後を消す。列・セル幅・スケールバー・レーン名の向きはブロックのセレクト／入力（`figImageSet`）で書き戻す。バックアップ（`bkExport`）は会話が参照する画像を `imgs:{id:dataURL}` で同梱し、読み込みで `figImgsImport` が保存し直す。レイアウトの panels にも入る（`plot` は画像グリッドの範囲）。**高度機能**（0.7.0）: 各 image（または `merge:[…]` の各層）に `channel`（gray/red/green/blue/cyan/magenta/yellow/#RRGGBB の疑似カラー。輝度に揃えてから色をかける feColorMatrix）、`range:[lo,hi]`（0–1 の表示範囲、feComponentTransfer linear）、`gamma`、`lut`（fire/viridis/inferno/jet/grays、feComponentTransfer table。グリッドの右に `FIG_LUTS` のカラーバー）、`rot`（90/180/270 は viewBox を入れ替え）、`flip`（h/v/both）、`crop:[x,y,w,h]`（割合）。合成は `merge` の 2 層目以降を `mix-blend-mode:screen`（加算に近い）。すべて SVG のフィルタで元画像は変えず、調整内容は JSON に残る（`res.adjust` に一覧。画像の完全性の方針）。セルの描画は `figImgCellSVG` が入れ子 svg（viewBox＝切り抜き範囲、slice）で行い、`cell.view`（表示中の画像 px 範囲）と `cell.scalePx`（画像 px → セル px）を返すのでスケールバーと拡大図が正しく出る。注釈 `inset`（ROI を四隅に拡大、引き出し線）と `line`（計測線）。ブロックのツール「拡大図」「プロファイル」: プロファイルは 2 点クリック → `figImageProfile` が canvas で輝度を 200 点サンプリングし、線の注釈と xy の ```figure（Distance µm/px × Intensity）を同じ発言に足す。**TIFF**: `figTiffDecode`（非圧縮・LZW・PackBits、8/16 bit・float、グレー/RGB、複数ページ、横差分予測）。16 bit は 0.05–99.95 パーセンタイルで 8 bit に写像し `meta.srcRange`/`bits` に残す。複数ページは `name_p1…` として最大 8 枚。タイル形式は未対応。**ドラッグ**: 注釈（`[data-annot=k]`）は index.html の pointer ハンドラで動かし、離すと `figImgDragEnd` が割合座標を書き戻す。
- **模式図（`figure-schematic.js`）**: ```figure の `kind:"schematic"`。type `diagram`（模式図・パスウェイ・フローチャート: nodes（rect/round/ellipse/circle/diamond/text/icon、icon は `FIG_ICONS` の自作 SVG 20 種）と edges（arrow/inhibit ⊣/line/double、label、dash）、groups（囲み）。位置は矢印の向きから最長経路で層を決める自動配置（`dir` LR/TB、col/row で手直し、x/y で固定）。矢印は図形の縁から縁へ、同じ層どうしは曲線、ラベルは線の上か右に置く）、`pedigree`（家系図の標準記法: □○◇、罹患＝塗り、保因者＝中点、死亡＝斜線、発端者＝矢印＋P、近親婚＝二重線。unions から世代と位置を再帰で決める）、`gene`（ドメイン付きのバー＋エクソン列＋変異のロリポップ。高さ∝n、種類で色 `FIG_VAR_COLORS`、ラベルは 60° 回転で重なりをずらす）、`venn`（2〜3 集合、領域の数は包除で計算）、`timeline`（投与・観察スケジュール: 時点の記号とラベル上下、期間の帯）、`table`（学術形式: 上下太線・見出し下細線、数値列は右揃え、1 列だけの行は小見出し、先頭の空白は字下げ）。描画結果は `schematic:true` と `plot` を返すのでレイアウトに入る。ブロックの「{} 編集」（`figJsonEdit`、`#figJsonDlg` を JS で生成）は JSON を直して描画を確認しながら書き戻す。同じボタンをレイアウト・画像パネルのブロックにも付けた。**ドラッグ**: diagram のノード（`[data-node]`）を index.html の pointer ハンドラで動かし、離すと `figSchDragEnd` が全ノードの位置を x/y（文字高さ単位。`nodeLayout` の offX/offY/fs から逆算）として書き戻し、以後は固定配置になる（col/row は消す）。未着手: コネクタの直角ルーティング、イデオグラム・系統樹・ネットワーク・サンキーのテンプレート、化学構造式の取り込み。
- **あてはめの SE/CI（figure-more.js）**: 4PL・3PL・Michaelis–Menten は Nelder–Mead のあと `figLM`（Levenberg–Marquardt、対角スケーリング）で詰め、`figNLSStats` が漸近共分散 s²(JᵀJ)⁻¹（J は中心差分）から SE・t 分布の 95% CI・曲線の 95% 信頼帯（デルタ法 `band(x)`）を返す（scipy `curve_fit` と 5 桁一致）。3PL は Hill を固定（`fixed=[3]`、df は自由パラメータ数で）。結果表はパラメータごとに 推定値・SE・95% CI（EC50 は logEC50 の CI を 10^ で変換）、図の設定に「EC50 の 95% CI も書く」「曲線の 95% 信頼帯」（`doseCI`/`doseBand`/`mmBand`）。
- **オミクス（`figure-omics.js`、kind "omics"）**: figure-more2.js の P4 フック（`figAutoKindP4` / `figBuildDataP4` / `figRenderP4` / `figStatsP4`）。type は `auto`（列の見出しから `figOmicsType` が判定）か明示: `manhattan`（CHR/BP/P、染色体ごとの交互色、5×10⁻⁸・1×10⁻⁵ の線、上位 n にラベル）、`embedding`（UMAP/t-SNE/PC: cluster 列なら 20 色＋図中にクラスタ名、数値列なら 灰→赤 の連続色＋カラーバー）、`gsea`（Rank/Metric/Hit から重み p=1 のランニング ES を計算して 3 段に描く。NES・P・FDR は順列検定が要るので JSON の `nes`/`pval`/`fdr` を書く）、`enrich-bar`/`enrich-dot`（Term/Count/q/GeneRatio。棒＝−log10 q、点＝大きさ遺伝子数・色 q）、`dotplot`（Seurat 型、Gene/Cluster/Pct/Avg の長い形式、遺伝子ごとの z 化）、`sbs96`（A[C>A]G 形式を 96 本、6 色の帯）、`oncoprint`（1 列目＝遺伝子・見出し＝検体、memo sort、変異率）、`logo`（配列の列か A/C/G/T の PFM。bits＝2−H、文字を scale で伸ばす）、`sankey`（From/To/Value、最長経路の層＋重心順、三次曲線の帯）、`rank`（Gene/Score、上位・下位のラベル列と引き出し線、`rankHi` で強調）、`network`（Fruchterman–Reingold、固定シード `figRng`、点の大きさ＝次数）、`tree`（Newick を `figParseNewick` で読み矩形樹、枝長の目盛）。図種固有の追加項目（GSEA の nes 等）は `figStateFromSpec` が `opts.x` に保ち `figSpecFromState` が書き戻す（他の図種でも使える）。未着手: ゲノムトラック・Hi-C・Circos・プロファイルヒートマップ・UMAP の軌跡/velocity、大量点の Canvas 描画。
- 8つの JS は `sync-app.mjs` が `app/` へ写し、`check.sh` が構文を検査する。確認は `SMOKE_FIG=1` / `SMOKE_FIG2=1` / `SMOKE_FIG3=1` / `SMOKE_FIG4=1 npm run smoke`（FIG2 は生存ブロックの描画→編集→書き戻しと P2 全図種の `figRenderSpec`、FIG3 はスイマーのブロック→「図種の設定」で並べ方を変えて書き戻しと P3 全図種、FIG4 はレイアウトのブロック→パネル編集→列・誌面の変更→PNG（`SMOKE_OUT/branchat-fig4png.png`）→「1 枚にまとめる」、`SMOKE_FIG5=1` は画像の保存→グリッドのブロック→注釈のクリック→書き戻し→画像入り PNG→ブロット→レイアウト内、`SMOKE_FIG6=1` は模式図 6 種の描画と PNG（`SMOKE_OUT/branchat-fig6-*.png`）→ブロック→「{} 編集」で書き戻し、`SMOKE_FIG7=1` はオミクス 13 種の描画→GSEA のブロック→編集で nes/fdr が残ること、`SMOKE_FIG9=1` は画像パネル作成画面（取り込み→列数・見出し・スケールバー→疑似カラー→合成→注釈→プロファイル→添付→ブロックの ✎ で開いて更新。`SMOKE_SHOT=1` を足すと画面を開いた状態で撮る）、`SMOKE_FIG8=1` は 16 bit TIFF の読み込み→疑似カラー合成・LUT・回転・切り抜きの描画と PNG（`SMOKE_OUT/branchat-fig8.png`）→拡大図・プロファイルのツール→注釈とノードのドラッグ。`SMOKE_LOG=1` を足すと描画側の console エラーを出す）。未着手: あてはめの SE/CI、ボルケーノの手動ラベル指定、ドットプロット（Seurat 型）・UMAP など F3 の残り、レイアウトのパネル幅の統一（現状は各図の原寸を並べる）。

### 会話一覧・知識マップ・会話記録のファイル保存

- 「記憶の引き継ぎ」（他のAIのメモリを貼り付けて全会話の前提にする機能）は**利用者の指示で不採用**。再導入しない。以前の版で保存された `settings.memory` は起動時に破棄する。
- **会話一覧は左のサイドバー**（`#side`、`renderConvSel()` が描く。関数名は以前のプルダウンのまま）。最終発言の新しい順、「今日／昨日／過去7日間／それ以前」で区切る。名前変更と削除は各行のボタン。生成中（`busy`）は会話の切り替え・削除・新規作成をしない（`send()` が途中で別の会話に書き込むのを防ぐ）。ヘッダーの ☰ で開閉、幅760px以下は重ねて表示。幅は境目（`#sideGrip`）のドラッグで180〜520pxに変えられ（`settings.sideW`、CSS変数 `--sideW`、ダブルクリックで248pxに戻る）、細くしすぎるか一覧上部の「«」で完全に隠れる。
- **知識マップ**（View の3つ目、`#know`、`renderKnow()`）: 全会話の「発言のあるブランチ」を点、関連度を**直線**で結ぶ（Obsidian のグラフ風）。線の太さと濃さ＝関連度。しきい値（30/50/65/80%以上）を変えると線を選び直し、ばねモデルで**配置からやり直す**。関連度は `kbScore()` が「保存済みの判定（`bc.links.v1`、`by:'jev'|'ai'`）→ 無ければ簡易判定（文字2連の TF-IDF コサイン、`kbLocalScores`）」の順で返す。**判定役は `judgeMode()`**: デスクトップ版の既定は **Jev**（TypeSafe AI の判定専用モデル。利用者の指示）、ほかに要約モデル・簡易判定のみ。Jev は `scoreByJev()` が `/api/judge`（`engines.judge`、デスクトップ版のみ）へ要点と `score` 型の質問（5段階の基準、候補10本ずつ）を送り、点数÷4×100 を％にする。宛先は TypeSafe（`api.typesafe.ai/v1/systemone`、`jev-latest`）か Cloudflare Workers AI（`typesafe/jev`）の固定2つ。キーは `settings.jevKey` / `jevCfAccount` / `jevCfToken`（この端末の中だけ）。未設定の間は簡易判定で表示し、ボタンが「Jev の接続を設定」になる。**`bridge.py` には Jev の中継を入れない**（ブラウザ版・Artifact 版は要約モデルか簡易判定）。実物の Jev では未検証で、確認は `BRANCHAT_JEV_URL` を模擬サーバーへ向けて行った。判定の実行は `updateLinks()`: 要約の更新後に裏で1回、**そのブランチの発言が6件増えるまでは再判定しない**（`branch.linkN`。定額枠の節約）。候補は簡易判定の上位30本に絞り、要約用モデルへ1回で採点させる。「AIで関連度を判定」ボタンは全ブランチを順に判定（確認あり）。ダミー接続では簡易判定のみ。点の色＝会話、塗り＝本線、中抜き＝分岐。クリックで要点と関連一覧、ダブルクリックか「このブランチを開く」で移動。
- **整理**（知識マップの「整理」、`#tidyDlg`、`renderTidy()`）: 関連度 90%（または 80%）以上の組を並べ、片方を「開く／削除」できる。空の会話のまとめて削除もここ。ブランチの削除は `deleteBranchDeep()`: そのブランチから先に分かれた枝（`branchSubtree`）ごと消し、現在位置は分岐元へ戻す。本線の削除＝会話の削除。消す前にデスクトップ版は会話の写しを `conversations/trash/` に残す。想定規模は「1会話10〜20ブランチ・会話は数年で約500」で、整理の主な効果は知識マップの見やすさ（ほかの会話は AI に渡していないので、消してもチャットのトークンは減らない）。しきい値に 90% を追加。
- **会話記録のファイル保存（デスクトップ版）**: `persist()` → `scheduleStore()` が変更のあった会話だけを1.5秒まとめて `/api/store` へ送り、`userData/conversations/` に会話ごとの `<id>.json`（写し）と `<id>.md`（人が読める記録、`convMarkdown`）、関連度 `_links.json` を書く。画面で削除した会話は `trash/` へ移す（消さない）。起動時は `syncStoreAtStart()` が、ファイルにあって画面に無い会話を取り込み、食い違う会話を書き出し直す。設定に「保存フォルダを開く」。AI 側には履歴を残さない（`--no-session-persistence`、`--ephemeral`）ので、記録はこの端末だけにある。
- 要点（`branch.summary`）は会話データの中にあるものが唯一の正本。知識マップ用に写しを別保存しない。「利用者のアカウントに紐づく保存」は、デスクトップ版では OS ユーザーごとのデータフォルダ（localStorage＋`backups/`）、Artifact 版では閲覧者のブラウザ保存。サーバー側のアカウント保存は無い。

### コンテキスト組み立て（`buildContext`）

1. **Layer 1** 現在ノードまでの祖先パス全文 → `messages`
2. **Layer 2** 全ブランチの要約カード「会話マップ」→ system。要約は回答完了ごとに安いモデルで非同期更新（`updateSummary`）。**差分方式**: `summary.upto`（要約に含めた最後の発言 id）より後の発言だけを「前回の要約」と一緒に渡し、送る量は36,000字まで（長いブランチで要約が失敗していた対処）。「要約更新」ボタンは `upto` を捨てて全文から作り直す
3. **Layer 3** ピン留めブランチの全文 → system

予算超過時は古い往復から省略。

## 3. 動かし方・テスト方法

### 起動

プレビューは**親フォルダ**の `~/Applications/.claude/launch.json` にある `branch-chat`（port 8991、`bridge.py` を起動）を使う。
Claude Code では `preview_start {name:"branch-chat"}`。Bash で直接サーバーを立てない。手動なら:

```bash
python3 bridge.py
```

`http://localhost:8991/` が index.html（ブラウザでの開発用プレビュー）。

### 変更後に必ずやること

1. 静的チェック（構文、禁止パターン、bridge.py / desktop の構文、安全フラグの一致）

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

## 4. コーディング規約

- **単一HTML・依存ゼロ・ビルド無し。** フレームワーク、npm、CDNスクリプトを入れない。外部読み込みは Google Fonts の2書体だけ。
- 素の JavaScript。関数と状態はグローバル。区画コメントの並びを保ち、新機能は該当区画か「起動」の直前に新区画として足す。
- **画面に出す可変文字列は必ず `esc()` を通す。** AI本文は `md()`（内部で `esc` 済み）。`md()` は `mdBlocks()`（行・表・コードのブロック配列）を結合したもので、表（GFM）、見出し、箇条書き、番号付き、引用、区切り線、リンクに対応。生成中は `scheduleStreamRender()` が描画を1フレーム1回にまとめ、`renderStream()` が前回との差分ブロックだけを描き足し（書きかけのコードブロックは文字だけ差し替える）、`#msgs` は `overflow-anchor:none`（2026-10-01、コードブロック生成中に画面が上下に揺れる報告への対処。`.reveal` も透明度だけにした）、新しい行は `.reveal` で滑らかに現れる（複数行が一度に届いたときは1行ごとに約70msずつ遅らせる）。書きかけの行は要素を作り直さず中身だけ更新する（フェードを途切れさせないため）。
- **`confirm()` `prompt()` `alert()` は使わない。** 見た目が揃わず、環境によっては黙って無効になる。`askConfirm(msg, okLabel)` と `askPrompt(title, default)` を `await` する。
- `localStorage` を直接触らない。`lsGetSafe` / `lsSetSafe`（try/catch 付き）か既存の `persist()` / `saveSettings()` を使う。**一括置換でヘルパー自身の中身まで書き換えないこと**（過去に `lsGet` が自分を呼ぶ形になり、Artifact版で保存が全く効いていなかった。`check.sh` が検出する）。
- 文言は日本語、利用者目線で具体的に。ボタンは起きることをそのまま書く（「分岐を取り消す」）。

### デザインの決まり（利用者の指示で確定したもの）

- **配色は「自然・木漏れ日」の緑系**（2026-10-01、利用者の指示で青・黒・サイバー風から変更）。ヘッダーとサイドバーは深い緑（`--bg #173a22`）、チャット領域と俯瞰図は白背景に濃い深緑の文字（変数名は歴史的に `--indigo` のままだが値は `#0f2f18`、補助の文字 `--indigo2` は `#2c5236`。利用者の指示で二度濃くした。回答の見出しの枝色は `filter:brightness(.72)` で濃く見せる）。格子やスキャン線の演出は廃止。ヘッダーのロゴの横に `assets/tree.jpg`（利用者提供のイラスト、`.hero`。縁を radial の mask でぼかして背景に馴染ませる。900px 以下では非表示）。素材は `assets/` に置き、`sync-app.mjs` が `app/assets/` へ写す。
- **チャット本文（`.msg .body`）は黒（#111）・13.5px。本文以外（区切り線の文言・分岐バッジ・回答の見出し行・位置表示・ツールのチップ）は 10.5〜11px と一段小さくして本文と区別する（利用者の指示）。** 見出し・メタ情報・ボタン・ブランチ名は藍のまま。利用者の指示（藍の本文は読みにくい、文字はやや小さく）。
- **フォント:** すべて IBM Plex Sans JP（本文も UI も。ドットフォント DotGothic16 は利用者の指示で廃止。`.ui` / `.var` のクラスは残っているが書体は同じ）。太字は 600。
- **配置:** 他のLLMチャットと同じ。自分の発言は右寄せの吹き出し、**AIの回答は枠・背景なしで列幅いっぱい**（ブランチは見出しの色付きラベルで示す）。操作ボタンは各発言の本文の下（AI: 分岐 / 分岐予定 / ここから続ける、自分: 質問を編集する）。
- **演出は控えめ・機能的に。** 全画面エフェクト（ワープ演出）は「うるさい」と却下され撤去済み。分岐開始時は分岐元を画面上端へスムーズスクロール＋枠を短く光らせるだけ。俯瞰図の波紋も小さく淡く（半径+14px、線1.2px、不透明度.45、2重）。`prefers-reduced-motion` を尊重する。
- 色は `:root` のトークン（`--c0`〜`--c7` がブランチ色。本線は `--c1` の緑 `#2e7d32`、`--yellow`/`--ystroke` は「分岐予定」専用）。ブランチ色に黄色を使わない。
- 俯瞰図: ドットの大きさ＝トークン数、ラベルは `node.gist`（20字以内の要約）を白帯つきで表示、レーン幅300px、見出しは17px太字に白帯。
- **本文は少し左寄り**: `#focus` の `--gutR`（右の余白。ミニ俯瞰図のぶん最大170px）と `--gutL` で、発言・区切り・入力欄をそろえて配置する。右上のミニ俯瞰図と重ねないための指定なので、左右対称に戻さない。狭い画面では左右16px。
- **ブランチの帯（`#branchBar`）はブラウザのページタブ風。** 選択中のタブは白く前面に出て下の白い画面とつながり、上端にブランチ色の線が付く（「◀ 表示中」の文字は利用者の指示で外した）。ほかのタブは暗い色で下に沈む。丸い chip には戻さない（利用者の指示）。
- 俯瞰図のカードは見出しの ▾/▸ で小さく畳める（`conv._foldCards[branchId]`、畳むと名前だけ。見出しクリックで開く。先頭に「すべて畳む／すべて開く」）。
- 俯瞰図の右欄（`#cards`）は、先頭に固定の見出し「各ブランチの要約」と説明（AI に毎回渡る要約であること）、「ボタンの説明」の折りたたみ、区切り見出し（分岐予定／ブランチごとの要約）を出す。何の一覧か分からないという指摘で追加したので外さない。
- **ミニ俯瞰図**（`#miniMap`、`renderMini()`）: チャット右上に常時表示。文字は出さず、枝の線と現在位置（藍の二重丸）、下に枝の本数だけ。今いる道筋は濃く、ほかの枝は淡く。縦130px・横120px以内に収まるよう間隔を自動で詰める。クリックで俯瞰図へ。
- **生成中のスクロール**: `followTail` が真のときだけ末尾へ追従。利用者が上へ動かしたら止め、末尾まで戻すか「↓ 最新へ」（`#jumpBtn`）で再開。距離で判定して引き戻す方式には戻さない。
- View の項目名は「チャット」「俯瞰図」「知識マップ」。ブラウザ標準の `<select>` ではなく自前メニュー。

## 5. 変更してはいけないもの

- **localStorage のキー名（`bc.*.v1`）とデータモデルの既存フィールド。** 利用者の会話が消える。どうしても変えるなら読み込み時の移行処理を同時に入れ、書き出しJSONの後方互換を保つ。本線の id `'main'` も固定。
- **「全ブランチをAIが認知する」仕組み**（`buildContext` の3層と会話マップの注入、`updateSummary`）。軽量化のために要約カードを外す・現在ブランチだけにする、は不可。
- **Artifact 版を復活させない**（利用者の指示でデスクトップ版に一本化）。
- **Claude もブランチごとに常駐（デスクトップ版、`desktop/claude-session.js`）:** `claude -p --input-format stream-json` は1プロセスで複数ターンを保持できる。セッションの同一性はブランチ＋（モデル・思考量・Web検索・MCP）。直前の返答の続きなら「会話マップ＋新しい発言」だけを送り（2ターン目 約3秒）、続きでなければプロセスを作り直して会話全体を送る。固定の指示は起動時の `--system-prompt`（`systemStatic`＝会話マップの手前まで）、会話マップは毎ターン発言に添える。停止はプロセス終了。同時4本まで、10分放置で終了。失敗時は単発起動に切り替え。
- **Codex の実行ファイルの場所は ChatGPT.app の版で変わる。** 26.9 以降は `Contents/Resources/codex-cli/bin/codex`、それ以前は `Contents/Resources/codex`。`engines.js` と `bridge.py` は新しい場所から順に探す。設定に「Codex CLI ×」と出てモデルが Claude だけになったら、まずここを疑う（2026-09-30 に実際に起きた）。
- **Codex は app-server 経由（デスクトップ版）:** `desktop/codex-server.js` が `codex app-server --stdio` を常駐させ JSON-RPC で会話する（`initialize`→`thread/start`→`turn/start`、`item/agentMessage/delta` で逐次配信、`turn/interrupt` で停止、`thread/tokenUsage/updated` で使用量）。**ブランチごとにスレッドを保ち**、直前の返答（`lastMessageId`）の続き（`parentId`）なら会話マップ＋新しい発言だけを送る（2回目以降は約2秒、前の内容はキャッシュ）。続きでなければ新スレッドを作って会話全体を送る。Web検索は `thread/start` の `config:{web_search:'live'}`、画像は `input` の `{type:'image',url:'data:...'}`。サーバーからの承認要求は常に拒否。失敗時は従来の `codex exec` に自動で切り替える。`bridge.py`（ブラウザ版）は exec のまま。
- **DOCX / PPTX 書き出しと「送信コンテキストを見る」は利用者の指示で廃止**（`desktop/export.js`、`/api/export`、`docx`/`pptxgenjs` の依存も削除）。再導入しない。
- **バックアップ・引継ぎ**（ヘッダーの1ボタン、`#bkDlg`）: 旧「書き出し／読み込み」を統合。`exportAllConvs()` が全会話＋関連度を `{app:'BranCHAT',kind:'backup',format:1,convs,links}` の1ファイルに書き出す（設定とキーは入れない）。`importBackupText()` はこの形式と旧来の会話1件のファイルの両方を受け、**足し合わせ**で読み込む（同じ id は最終発言が新しい方を残す。適用前に件数を確認）。保存は `saveTextFile()`（`<a download>`）。
- **Codex の完了判定:** `turn.completed` を受けたら即 `done` にしてプロセスを kill する（終了処理に約6秒かかり、その間「生成中」に見えていた）。GPT モデルの思考量は、どこにも指定が無ければモデル既定（`defEffort`、ChatGPT と同じ）を使う。`high` を強制しない。
- **起動の固定費対策（両エンジン層共通）:** Claude 起動時は環境変数 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` `DISABLE_AUTOUPDATER=1` と `--setting-sources ""` を必ず付ける（1回あたり約2.7秒→0.3秒。実測済み）。`--bare` は OAuth を読まなくなるので使えない。
- **`bridge.py` の安全側の設定:** `127.0.0.1` バインド。Claude 側は `--tools ""`（Web検索オン時だけ `--tools WebSearch WebFetch --allowedTools WebSearch WebFetch`。ファイルやコマンド系のツールは決して足さない）、`--strict-mcp-config`、`--no-session-persistence`。Codex 側は `-s read-only`、`--ephemeral`、`--ignore-user-config`、`--ignore-rules`、空の作業フォルダ。`~/.codex/auth.json` は存在確認だけで中身を読まない。外部公開（`0.0.0.0`）にしない。ツールやMCPを有効にする変更は利用者の明示的な依頼があるときだけ。
- **秘密情報をリポジトリに入れない。** APIキーはブラウザの localStorage にのみ保存される設計。`check.sh` が `sk-ant-` を検出する。
- **GitHub Pages を再有効化しない**（利用者の指示で停止済み。配布はデスクトップ版のビルドのみ）。リポジトリ `Maro515/branch-chat` はソース管理専用。
- 親フォルダの `launch.json` の他プロジェクトの設定、および `branch-chat` の port 8991。
- デスクトップ版の配信オリジン `app://branchat`、`appId`（`jp.maro515.branchat`）、レンダラの `contextIsolation` / `sandbox` / `nodeIntegration:false`。
- デモ会話は**架空の薬剤「ゾルミン」**を使う。実在薬の用量など、医学的助言に見える内容をデモやサンプルに入れない。
- 第4節の「デザインの決まり」。変えるのは利用者が頼んだときだけ。

## 6. 作業の進め方

- 変更は小さく。1つの依頼につき1コミット、メッセージは日本語で要点を1行。`main` に直接コミットしてよい（個人リポジトリ）。push まで行う。
- 流れ: index.html（と必要なら desktop/）に変更 → `./check.sh` → `npm run sync` → `npm run smoke`（必要な SMOKE_* を付けて）→ commit & push → `npm run build:mac` して `dist` を `dist-<version>` に改名 → 何を確認できて何が未確認かを報告。古い `dist-*` は利用者が消してと言ったときだけ削除する。
- 表示確認ができなかった場合（ブラウザが使えない等）は、その旨を必ず伝える。
- 既知の制約: トークン数は概算。

## 7. 今後の予定（参考）

デスクトップ版のみを育てる。未着手: 署名・公証（Apple Developer Program）、Windows ビルド、自動更新、チュートリアルの「インストールを開始」ボタン。Claude の新モデルが出たら `CLAUDE_MODELS` に足してアプリを更新する。

アプリ名「BranCHAT」は同綴りの既存アプリ（branchat.app、GitHub の GzqHerry/branchat）と、旧名に近い BranchChat（branch-chat.com）がある。商標は未調査。一般公開・商用化の前に名称の再検討が必要。
