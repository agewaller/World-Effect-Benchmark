# 「この画面をやさしく解説」統合メモ

World Effect Benchmark の **いま表示しているグラフ全体**を、統計に不慣れな人向けに
AI がやさしく解説する機能。**全画面の下部に常設のボタン**があり、押すと**同じ画面の下に
インラインで**解説が出る（新しいタブは開かない）。

設計方針: AI の API キーもプロンプトも **cares のサーバ側だけ**にあり、このリポジトリにも
ブラウザにも入らない（ADR-0006: AI 鍵はサーバ側のみ）。ブラウザは「いま表示している
画面のコンテキスト（view/focus/data）」だけをサーバへ送る。

> 旧構成（Cloudflare Worker `cares-relay.agewaller.workers.dev` をブラウザから直叩き）は
> relay が廃止・故障したため使わない。cares のサーバ側公開エンドポイントに切替済み。

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | ベンチマーク本体（D3 SPA）。全ビュー下部の「💡 この画面をやさしく解説」ボタン＋解説 API 呼び出し・インライン表示を内蔵 |
| `interpret-prompt.md` | 解説プロンプト全文（**参照用**。実体は cares 側 `apps/api/src/lib/explain.ts`） |
| `interpret.html` | 単体の解説ページ（旧構成の名残。アプリ本体からは未使用だが残置） |
| `test/explain-button.test.cjs` | 解説ボタンが実際に反応することを検証する Playwright E2E |

## 仕組み（データの流れ）

1. どの画面でも下部に **`#explain-btn`「💡 この画面をやさしく解説」** が出る。
2. 押すと `explainCurrentScreen()` が `collectScreenContext()` で**いま開いている
   ビュー（とサブタブ）に表示されている数値・順位・相関**を読み取る。
   - factor-hub: 選択中の因子の相関・4象限＋アクティブなサブタブ（KGI/相関ランキング/
     国MAP/国別スコアランキング）の表示テキスト。
   - 国プロフィール / 2国比較: 選択中の国名＋結果テーブルの表示テキスト。
   - World Effect Map: ハイライト因子＋4象限の内訳集計。
3. `{ view, focus, data }` を **cares の公開エンドポイント
   `POST https://cares-api-xj6szhutkq-an.a.run.app/api/trial/explain`**（`EXPLAIN_API_URL`）
   へ送る。サーバ側で system プロンプト（`lib/explain.ts`）を組み立て AI（Haiku）を呼び、
   `{ comment }` を返す。結果を `#explain-result` に**同じ画面の下へインライン表示**する。
   画面を切り替えると前の解説は自動で消える。

## デプロイ前提（重要）

1. **cares-api 側**（`agewaller/cares`）:
   - 公開エンドポイント `POST /api/trial/explain`（未ログイン可。お試し分析とは別枠の
     IP レート制限＝30回/日・月次コストキャップ＝既定2000円）。
   - **CORS**: `ALLOWED_ORIGINS`（`infra/scripts/_env.sh` の `PROD_ALLOWED_ORIGINS`）に
     `https://agewaller.github.io` を追加済み。**反映には cares-api の再デプロイが必要**
     （`07-deploy-cloud-run.sh`。2 ゲート手順は cares の CLAUDE.md 参照）。
   - 再デプロイ後、CORS 実測:
     `curl -X OPTIONS <api>/api/trial/explain -H "Origin: https://agewaller.github.io" -H "Access-Control-Request-Method: POST"`
     で `access-control-allow-origin` が返ること。
2. **GitHub Pages**: このリポジトリの Settings → Pages で
   「Deploy from a branch / main / (root)」を有効化済み。`main` へ push すると
   自動で再ビルドされ、`https://agewaller.github.io/World-Effect-Benchmark/` に反映。

> 注意: ベンチマークを `main` に反映しても、**cares-api が新エンドポイント＋CORS 付きで
> デプロイされるまでは「Load failed」/「接続できませんでした」になる**。cares-api の
> デプロイを先に（または同時に）行うこと。

## 技術メモ

- AI 呼び出しは cares サーバ経由のみ（ブラウザは鍵もプロンプトも持たない／送らない）。
- レスポンス（`comment`）の `**太字**` だけ簡易整形し、それ以外は `white-space:pre-wrap`
  で改行を保持。挿入前に必ず HTML エスケープ（XSS 対策）。
- モデルは cares 側で `DEFAULT_MODEL_ID`（= Haiku）を使用。コスト都合で変更する場合は
  cares 側 `app.post("/api/trial/explain")` を編集。
- 4象限のしきい値は ±0.2（`plainQuadrant()` と一致）。
