# テスト

## 解説ボタン E2E（`explain-button.test.cjs`）

「💡 この画面をやさしく解説」ボタンが**実際に反応する**ことを、実 Chromium
（Playwright）でページを開いて検証する回帰テスト。

検証内容:

- ボタン押下で relay（AI）呼び出しが発火する
- `#explain-result` に解説がインライン表示される（エラー表示でない）
- `explainCurrentScreen is not defined` などの JS エラーが出ない
- 送信プロンプトに「いま見ている画面」のコンテキストが含まれる
- **対照**: 修正行（`window.explainCurrentScreen = explainCurrentScreen;`）を
  外した版では、押下時に `ReferenceError` が出てボタンが無反応になることも確認
  （= この1行が効いている証明）

外部依存はすべて遮断/モックして**完全オフライン**で走る:

- D3（cdnjs）→ `test/fixtures/d3.min.js`
- transformers（jsdelivr）→ 空スタブ（`embeddings.json` があるので未使用）
- relay（workers.dev）→ 固定のモック応答（実 AI は呼ばない）

### 実行方法

```bash
npm i -D playwright          # 初回のみ
npx playwright install chromium   # 初回のみ（ブラウザ取得）
node test/explain-button.test.cjs
```

成功すると全アサーションが `PASS` になり、終了コード 0。
