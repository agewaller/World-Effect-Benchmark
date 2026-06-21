# 「やさしく解説」統合メモ（このリポジトリ内で完結）

World Effect Benchmark の画面の数値を、統計に不慣れな人向けに AI がやさしく
解説する機能。**設計方針 A**: 解説ページ・プロンプト・ボタンをすべてこの
フォークリポジトリ内に持ち、健康日記リポジトリ（cares / stock-screener）には
一切のベンチマーク用コードを置かない。AI の API キーは relay（Cloudflare
Worker）にのみ存在し、このリポジトリにもブラウザにも入らない。

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | ベンチマーク本体（D3 SPA）。「💡 やさしく解説」ボタンを同梱 |
| `interpret.html` | 解説ページ。`#payload=` を読み、relay 経由で Claude を呼ぶ |
| `interpret-prompt.md` | 解説ページの内蔵プロンプト全文（文言調整はここを参照して編集） |

## 仕組み（データの流れ）

1. `index.html` の `explainWEF()` が、いま見ている World Effect Map の内容
   （選択中の因子の相関・4象限分類、または全体の象限内訳）を `payload`
   （`{view, focus, data}`）に組み立てる。
2. `openInterpreter()` が payload を base64 にして
   `interpret.html#payload=...` を新規タブで開く。
3. `interpret.html` が payload を読み、内蔵プロンプトで
   `cares-relay.agewaller.workers.dev` を呼んで解説を生成する。
   ブラウザは API キーを持たない（鍵は relay/worker 側だけ）。

## デプロイ前提（重要・2つ）

1. **relay の Origin 許可**: 解説ページの AI 呼び出しは、このフォークの
   Pages オリジン `https://agewaller.github.io` から出る。relay 側
   （`agewaller/stock-screener` の `worker/anthropic-proxy.js` の
   `DEFAULT_ALLOWED`）にこのオリジンを追加済み。**worker を本番デプロイ
   （main に反映 → `deploy-worker.yml`）して初めて有効**になる。未反映だと
   解説ページの AI 呼び出しが CORS で弾かれる。
2. **Pages 反映**: このリポジトリの変更は `main` にマージされて
   GitHub Pages（`https://agewaller.github.io/World-Effect-Benchmark/`）に
   デプロイされて初めて公開される。`main` への反映可否はオーナーに確認する。

## 実装済み

- World Effect Map ビューに「💡 やさしく解説」ボタン（`#wef-explain`）。
  因子を選んでいればその因子を、未選択なら表示中の象限内訳を解説に渡す。
- `interpret.html` / `interpret-prompt.md` を同梱（cares 側から移設）。

## 残作業（任意・新スレッドで拡張可）

他ビューにも同じ要領でボタンを足せる（payload を組み立てて
`openInterpreter()` を呼ぶだけ）。実データは `DATA.factors[key]`
（`label/category/selected/corr_growth/corr_happiness/country_scores/
deviation_scores`）と `DATA.country_list` / `DATA.countries`。
`view` に渡せる値は `interpret.html` の `<select id="view">` の option と一致
させること（例: `国別スコアランキング` / `国プロフィール` / `2国比較`）。

- 国別スコアランキング（`renderCountryRank`）: 上位 N 国の偏差値リスト。
- 国プロフィール（`renderProfile`）: 1 か国のトップ/ワースト因子。
- 2国比較（`renderCompare`）: 差の大きい因子の両国スコア。

## 技術メモ

- `btoa` は非 ASCII で例外を出すため `btoa(unescape(encodeURIComponent(...)))`
  で UTF-8 を安全にエンコードしている（日本語の因子名対策）。
- 新規タブは `noopener` 付きで開く。
- 4象限のしきい値は ±0.2（`plainQuadrant()` / `quadrantBadge()` と一致）。
