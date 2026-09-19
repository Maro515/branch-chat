# BranCHAT

AIチャットを「直線」ではなく「分岐する平面タイムライン」で行うアプリ。
話題を分岐させ、俯瞰図で全体を見渡し、本線に戻っても **AIが全ブランチの内容を認知した状態** で会話を続けられます。

公開版（claude.ai Artifact・閲覧者自身のアカウントで動作）: https://claude.ai/artifact/HKiAkcZ2stzQDns8J32QpE

## 使い方
- 単一HTML（`index.html`）。ブラウザで開くだけで動きます（データはブラウザの localStorage に保存）。
- 設定（⚙）から接続方式を選択:
  - **ダミー応答**: APIなしで分岐・俯瞰図の操作を試す
  - **Claude API**: APIキーを入力（キーはこのブラウザにのみ保存）
  - **ローカルブリッジ**: `python3 bridge.py` を起動し http://localhost:8991/ を開くと、ログイン済みの `claude` CLI（Claude Pro/Max の定額枠）と `codex` CLI（ChatGPT プランの定額枠、ChatGPT アプリ同梱のものを自動検出）で動作。送信ボタン上のモデル変更ボタンから、会話・ブランチごとに Claude / GPT のモデルと思考量を選べる

`artifact.html` は claude.ai Artifact 版（`sample` capability で閲覧者のアカウントを使用。モデル階層 標準/高度/速い を設定で選択）。
- AIの回答にカーソルを乗せて「⑂ ここから分岐」／迷っているときは「☆ 分岐予定」
- 「俯瞰図」でツリーを一望。ドットの大きさ＝トークン数、波紋＝現在位置と分岐点、黄＝分岐予定

設計の詳細は `PLAN.md` を参照。

開発するとき（AIエージェント含む）は `AGENTS.md` を参照。変更後は `./check.sh` を実行。
