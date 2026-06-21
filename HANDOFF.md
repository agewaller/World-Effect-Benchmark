# 「この画面をやさしく解説」統合メモ（このリポジトリ内で完結）

World Effect Benchmark の **いま表示しているグラフ全体**を、統計に不慣れな人向けに
AI がやさしく解説する機能。**全画面の下部に常設のボタン**があり、押すと**同じ画面の下に
インラインで**解説が出る（新しいタブは開かない）。

設計方針: 解説機能・プロンプトはすべてこのフォーク内に持つ。AI の API キーは relay
（Cloudflare Worker）にのみ存在し、このリポジトリにもブラウザにも入らない。

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | ベンチマーク本体（D3 SPA）。全ビュー下部の「💡 この画面をやさしく解説」ボタン＋解説の AI 呼び出し・インライン表示を内蔵 |
| `interpret-prompt.md` | 解説プロンプト全文（文言調整の参照用） |
| `interpret.html` | 単体の解説ページ（`#payload=` で外部から渡す用。アプリ本体からは未使用だが残置） |

## 仕組み（データの流れ）

1. どの画面でも下部に **`#explain-btn`「💡 この画面をやさしく解説」** が出る。
2. 押すと `explainCurrentScreen()` が `collectScreenContext()` で**いま開いている
   ビュー（とサブタブ）に表示されている数値・順位・相関**を読み取る。
   - factor-hub: 選択中の因子の相関・4象限＋アクティブなサブタブ（KGI/相関ランキング/
     国MAP/国別スコアランキング）の表示テキスト。
   - 国プロフィール / 2国比較: 選択中の国名＋結果テーブルの表示テキスト。
   - World Effect Map: ハイライト因子＋4象限の内訳集計。
3. 内蔵プロンプト（`EXPLAIN_SYSTEM` / `buildExplainPrompt`）で
   `cares-relay.agewaller.workers.dev` を**このページから直接**呼び、
   結果を `#explain-result` に**同じ画面の下へインライン表示**する。
   画面を切り替えると前の解説は自動で消える。

## デプロイ前提（重要）

1. **relay の Origin 許可**: 解説の AI 呼び出しはこのフォークの Pages オリジン
   `https://agewaller.github.io` から出る。relay 側（`agewaller/stock-screener` の
   `worker/anthropic-proxy.js` の `DEFAULT_ALLOWED`）にこのオリジンを追加済み・
   本番デプロイ済み。
2. **GitHub Pages**: このリポジトリの Settings → Pages で
   「Deploy from a branch / main / (root)」を有効化済み。`main` へ push すると
   自動で再ビルドされ、`https://agewaller.github.io/World-Effect-Benchmark/` に反映。

## 技術メモ

- AI 呼び出しは relay 経由のみ（ブラウザは鍵を持たない／送らない）。
- レスポンスの `**太字**` だけ簡易整形し、それ以外は `white-space:pre-wrap` で改行を保持。
  挿入前に必ず HTML エスケープ（XSS 対策）。
- モデルは `claude-opus-4-8`（relay 側で API id を解決。ハードコードの datestamp 名は使わない）。
- 4象限のしきい値は ±0.2（`plainQuadrant()` と一致）。
