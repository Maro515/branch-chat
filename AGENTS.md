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
| 接続方式 | `streamAPI` `streamBridge` `streamDummy`、`probeBridge` | `streamClaude`（`claude.use('sample')`）`streamDummy`、`probeClaude`、`ERR_JA`/`errCopy` |
| 設定ダイアログ | APIキー、モデル名、要約モデル | モデル階層（標準/高度/速い）のみ |
| 既定値 | provider `dummy`、予算 60000 | provider `claude`、予算 40000（入力上限64KBのため） |
| 書き出し | `<a download>` | `downloads` capability（無ければ `<a download>`） |
| モデル選択肢 | `MODEL_OPTS`=Claude 4種＋（ブリッジ接続かつ Codex CLI がある場合）ブリッジが報告する GPT モデル。`refreshModelCatalog` が組み立てる。各モデルは `engine` と対応する思考量 `efforts` を持つ | `MODEL_OPTS`=階層3種、`EFFORT_OPTS`=空。`refreshModelCatalog` 等は関数の対を保つための空実装 |
| 応答後の表示 | 実トークン数（usage） | 実際に応答した階層（`modelTierApplied`） |

両方に同じ変更を入れる定石は、Pythonで2ファイルをループし、置換前の文字列を `assert a in s` で確認してから置換すること（過去のコミットはすべてこの方式）。

### デスクトップ版（`desktop/`）

- 画面は `index.html` をそのまま使う。**デスクトップ専用のUI分岐は `IS_DESKTOP`（`location.protocol==='app:'`）で最小限に。** 別のHTMLを作らない。
- `engines.js` は `bridge.py` の Node 版。**両者の挙動（イベント形式 `{text}{usage}{rate_limit}{error}{done}`、CLI の安全側フラグ、Codex のモデル一覧の取り方）は常に揃える。** 片方を変えたらもう片方も変える。
- `main.js` は独自スキーム `app://branchat/` で `app/` を配信し、`/api/status` `/api/chat` を処理する。オリジンを変えると利用者の会話（localStorage）が見えなくなるので、スキーム名とホスト名は変更禁止。
- `/api/status` は `auth`（各CLIの `installed` / `loggedIn` / プラン種別）を返す。判定は公式コマンド（`claude auth status`、`codex login status`）で行い、メールアドレス等は画面へ渡さない。`bridge.py` も同じ形で返す。
- `/api/login`（デスクトップのみ）は利用者のターミナルで**固定の**ログインコマンドを開始するだけ。任意のコマンドを受け取る作りにしない。
- **チュートリアル**（`TUT_PAGES`、ヘッダーの「？ 使い方」、初回は自動表示）は両HTML共通。接続ページだけ `IS_ARTIFACT` / `IS_DESKTOP` で内容が変わる。インストールやログインのコマンドを書き換えるときは、必ず公式ドキュメントか実機の `--help` で確かめる。
- 追加API（デスクトップのみ）: `/api/backup`（POST で会話を `userData/backups/` に保存、GET で最新を返す）。画面側は `persist()` から `scheduleBackup()`、起動時に `restoreFromBackup()`。ブラウザ版では `IS_DESKTOP` が偽なので何もしない。
- フォントは `npm run vendor` で `desktop/vendor/fonts/`（git管理外）に取得し、`sync-app.mjs` が同梱して読み込み先を差し替える。`index.html` のフォント `<link>` の書式を変えたら `sync-app.mjs` の置換も直す（合わないと sync がエラーで止まる）。アイコンは `npm run icon` で `build/icon.png` を再生成。
- スモークテストは `userData` を一時フォルダに分けている。利用者の実データ（`~/Library/Application Support/BranCHAT`）をテストで汚さない。
- 確認は `cd desktop && npm run smoke`（画面表示・エンジン検出・ダミー送信・スクリーンショット）。実モデルも1回試すときだけ `SMOKE_LIVE=1 npm run smoke`。
- 計画とフェーズ（D0〜D3）は `PLAN.md` 末尾。

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
- 未開始の分岐 = `headNodeId === forkFromNodeId`（`isEmptyBranch`）。同じ回答からの未開始分岐は1つまで。
- **モデルと思考量はブランチの系譜で継承する:** 自分のブランチの `model`/`effort` → 分岐元のブランチ → … → 本線 → 全体の既定（`settings`）。`resolveUp` が解決する。本線の指定が会話全体の指定として働くので、会話単位の指定は廃止（旧データの `conv.model`/`conv.effort` は `migrateConvModel` が本線へ移す）。UIの「従う先」の表示は、本線なら「全体の既定」、本線から分かれたブランチなら「本線の設定」、それより深ければ「分岐元「X」の設定」。選択肢は版ごとの `MODEL_OPTS` / `EFFORT_OPTS`。index.html はモデルID＋思考量5段階、artifact.html は階層3種で思考量の指定なし。別の版の値が入った会話を読み込んでも `validModel` が無視して上位に従うので壊れない。モデルが対応しない思考量は `effEffort` がその段階以下の最大へ丸める（例: GPT-5.5 で max → xhigh）。対応段階が空のモデル（Haiku）には思考量を送らない。ブリッジへはモデルから引いた `engine` を一緒に送るので、**ブランチごとに Claude と GPT を混在**できる。会話マップはただの文章なのでどのモデルにも同じものを渡す。
- 保存キー: `bc.convs.v1`（全会話）、`bc.active.v1`、`bc.settings.v1`。
- 状態を変えたら `persist()`、画面は `renderAll()`。

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
- **画面に出す可変文字列は必ず `esc()` を通す。** AI本文は `md()`（内部で `esc` 済み）。
- **`confirm()` `prompt()` `alert()` は使わない。** Artifact のサンドボックスで黙って無効になる。`askConfirm(msg, okLabel)` と `askPrompt(title, default)` を `await` する。
- `localStorage` を直接触らない。`lsGetSafe` / `lsSetSafe`（try/catch 付き）か既存の `persist()` / `saveSettings()` を使う。**一括置換でヘルパー自身の中身まで書き換えないこと**（過去に `lsGet` が自分を呼ぶ形になり、Artifact版で保存が全く効いていなかった。`check.sh` が検出する）。
- 文言は日本語、利用者目線で具体的に。ボタンは起きることをそのまま書く（「分岐を取り消す」）。

### デザインの決まり（利用者の指示で確定したもの）

- ヘッダーとブランチ帯はサイバー風のダーク。**チャット領域と俯瞰図は白背景・藍色（`--indigo: #1e3a6e`）の文字・太めの線。** 暗くて見にくいという指摘で決まった。戻さない。
- **フォント:** 既定は Noto Sans JP（チャット本文、ブランチ名、要約など可変の文字すべて）。**全員に共通の固定UI文言だけ DotGothic16**（タイトル、ボタン、項目名、凡例、ダイアログのラベル）。固定文言は `.ui` クラス、その中の可変部分は `.var` で Noto に戻す。
- **配置:** 他のLLMチャットと同じ。自分の発言は右寄せの吹き出し、**AIの回答は枠・背景なしで列幅いっぱい**（ブランチは見出しの色付きラベルで示す）。操作ボタンは各発言の本文の下（AI: 分岐 / 分岐予定 / ここから続ける、自分: 質問を編集する）。
- **演出は控えめ・機能的に。** 全画面エフェクト（ワープ演出）は「うるさい」と却下され撤去済み。分岐開始時は分岐元を画面上端へスムーズスクロール＋枠を短く光らせるだけ。俯瞰図の波紋も小さく淡く（半径+14px、線1.2px、不透明度.45、2重）。`prefers-reduced-motion` を尊重する。
- 色は `:root` のトークン（`--c0`〜`--c7` がブランチ色、`--yellow`/`--ystroke` は「分岐予定」専用）。ブランチ色に黄色を使わない。
- 俯瞰図: ドットの大きさ＝トークン数、ラベルは `node.gist`（20字以内の要約）を白帯つきで表示、レーン幅300px、見出しは17px太字に白帯。
- View の項目名は「チャット」「俯瞰図」。ブラウザ標準の `<select>` ではなく自前メニュー。

## 5. 変更してはいけないもの

- **localStorage のキー名（`bc.*.v1`）とデータモデルの既存フィールド。** 利用者の会話が消える。どうしても変えるなら読み込み時の移行処理を同時に入れ、書き出しJSONの後方互換を保つ。本線の id `'main'` も固定。
- **「全ブランチをAIが認知する」仕組み**（`buildContext` の3層と会話マップの注入、`updateSummary`）。軽量化のために要約カードを外す・現在ブランチだけにする、は不可。
- **Artifact の公開URL・favicon・capabilities。** 新しいArtifactを作らない。`mcp` など共有範囲を狭める capability を勝手に足さない。
- **`bridge.py` の安全側の設定:** `127.0.0.1` バインド。Claude 側は `--tools ""`、`--strict-mcp-config`、`--no-session-persistence`。Codex 側は `-s read-only`、`--ephemeral`、`--ignore-user-config`、`--ignore-rules`、空の作業フォルダ。`~/.codex/auth.json` は存在確認だけで中身を読まない。外部公開（`0.0.0.0`）にしない。ツールやMCPを有効にする変更は利用者の明示的な依頼があるときだけ。
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
