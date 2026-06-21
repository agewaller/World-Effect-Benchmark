#!/usr/bin/env node
/*
 * 「💡 この画面をやさしく解説」ボタンが実際に反応することを検証する E2E テスト。
 *
 * 実 Chromium (Playwright) でページを開き、ボタンを押して
 *   1. relay (AI) 呼び出しが発火するか
 *   2. #explain-result に解説がインライン表示されるか
 *   3. "explainCurrentScreen is not defined" 等の JS エラーが出ないか
 * を検証する。
 *
 * 外部依存はすべて遮断/モックして完全オフラインで動かす:
 *   - D3 (cdnjs)            → ローカルの d3.min.js を返す
 *   - transformers (jsdelivr) → 空スタブ（embeddings.json があるので未使用）
 *   - relay (workers.dev)   → 固定のモック応答を返す（実 AI は呼ばない）
 *
 * さらに「修正版」と「修正行を抜いた版」の両方で実行し、
 * 修正 (window.explainCurrentScreen 登録) が効いていることを対比で証明する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

// Playwright を堅牢に解決（ローカル node_modules → グローバル）
function loadChromium() {
  const candidates = ['playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const c of candidates) { try { return require(c).chromium; } catch {} }
  console.error('FATAL: playwright 未インストール。`npm i -D playwright && npx playwright install chromium` を実行してください。');
  process.exit(2);
}
const chromium = loadChromium();

const REPO = path.resolve(__dirname, '..');
// D3 は test/fixtures に同梱（オフライン実行のため）。無ければ /tmp の取得分を使う。
const D3_LOCAL = [path.join(__dirname, 'fixtures', 'd3.min.js'), '/tmp/pwtest/package/dist/d3.min.js']
  .find(p => fs.existsSync(p)) || path.join(__dirname, 'fixtures', 'd3.min.js');
const RELAY_HOST = 'cares-relay.agewaller.workers.dev';

const MOCK_TEXT =
  '【ひとことで言うと】これはテスト用のモック解説です。\n' +
  '**相関は因果ではありません。** 37か国の傾向にすぎません。\n' +
  '【次の一歩】今日はこのデータを一つだけ眺めてみましょう。';

const MIME = { '.html':'text/html; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.md':'text/markdown; charset=utf-8' };

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(REPO, urlPath === '/' ? '/index.html' : urlPath);
      if (!filePath.startsWith(REPO) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function runVariant(browser, base, file, label) {
  const result = { label, relayCalled: false, relayBody: null, resultVisible: false,
    resultText: '', resultIsError: false, pageErrors: [], consoleErrors: [] };
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
  const page = await ctx.newPage();

  page.on('pageerror', (e) => result.pageErrors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') result.consoleErrors.push(m.text()); });

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('cdnjs.cloudflare.com')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript',
        body: fs.readFileSync(D3_LOCAL) });
    }
    if (url.includes('cdn.jsdelivr.net')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript',
        body: 'export const pipeline=null;export const env={};' });
    }
    if (url.includes(RELAY_HOST)) {
      result.relayCalled = true;
      try { result.relayBody = JSON.parse(route.request().postData() || '{}'); } catch {}
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: MOCK_TEXT }] }) });
    }
    return route.continue();
  });

  await page.goto(`${base}/${file}`, { waitUntil: 'load', timeout: 30000 });
  // データ読込待ち: 既定因子「社員の熱意」が KGI カードに出るまで
  await page.waitForFunction(
    () => document.body.innerText.includes('社員の熱意'), null, { timeout: 20000 }
  ).catch(() => {});

  const btn = page.locator('#explain-btn');
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();

  // 解説結果が見えるか（最大 10s）。出なければそのまま記録。
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('explain-result');
      return el && getComputedStyle(el).display !== 'none' &&
        !el.innerHTML.includes('explain-spin') && el.innerText.trim().length > 0;
    }, null, { timeout: 10000 });
  } catch {}

  const info = await page.evaluate(() => {
    const el = document.getElementById('explain-result');
    return { visible: el ? getComputedStyle(el).display !== 'none' : false,
      text: el ? el.innerText.trim() : '', isErr: el ? el.classList.contains('err') : false };
  });
  result.resultVisible = info.visible;
  result.resultText = info.text;
  result.resultIsError = info.isErr;

  await ctx.close();
  return result;
}

(async () => {
  if (!fs.existsSync(D3_LOCAL)) { console.error('FATAL: local d3 missing at ' + D3_LOCAL); process.exit(2); }

  // 修正行を抜いた対照版を一時生成（相対 fetch を効かせるため repo 直下に置く）
  const fixedSrc = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const NOFIX_LINE = 'window.explainCurrentScreen = explainCurrentScreen;\n';
  if (!fixedSrc.includes(NOFIX_LINE.trim())) { console.error('FATAL: fix line not found in index.html'); process.exit(2); }
  const nofixFile = 'index__nofix__tmp.html';
  fs.writeFileSync(path.join(REPO, nofixFile), fixedSrc.replace(NOFIX_LINE, ''));

  const srv = await startServer();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ headless: true });
  let fixed, nofix;
  try {
    fixed = await runVariant(browser, base, 'index.html', 'FIXED (現行 main)');
    nofix = await runVariant(browser, base, nofixFile, 'NO-FIX (修正行を除去した対照)');
  } finally {
    await browser.close();
    srv.close();
    fs.unlinkSync(path.join(REPO, nofixFile));
  }

  const refErr = (r) => r.pageErrors.some(e => /explainCurrentScreen is not defined/.test(e));
  const checks = [
    ['[FIXED] relay(AI) 呼び出しが発火した',                 fixed.relayCalled === true],
    ['[FIXED] #explain-result が表示された',                 fixed.resultVisible === true],
    ['[FIXED] エラー表示ではなく解説本文が出た',             fixed.resultIsError === false && fixed.resultText.includes('モック解説')],
    ['[FIXED] ReferenceError が出ていない',                  refErr(fixed) === false],
    ['[FIXED] 送信プロンプトに画面コンテキストが含まれる',   !!fixed.relayBody && JSON.stringify(fixed.relayBody).includes('社員の熱意')],
    ['[NO-FIX] 修正なしだと ReferenceError が発生する',      refErr(nofix) === true],
    ['[NO-FIX] 修正なしだと relay は呼ばれない',             nofix.relayCalled === false],
    ['[NO-FIX] 修正なしだと結果は表示されない',              nofix.resultVisible === false],
  ];

  console.log('\n===== 解説ボタン E2E テスト結果 =====\n');
  console.log('FIXED :', JSON.stringify({ relayCalled: fixed.relayCalled, resultVisible: fixed.resultVisible,
    isErr: fixed.resultIsError, pageErrors: fixed.pageErrors }, null, 0));
  console.log('FIXED result text:', JSON.stringify(fixed.resultText.slice(0, 80)));
  console.log('NO-FIX:', JSON.stringify({ relayCalled: nofix.relayCalled, resultVisible: nofix.resultVisible,
    pageErrors: nofix.pageErrors }, null, 0));
  console.log('\n----- assertions -----');
  let allPass = true;
  for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) allPass = false; }
  console.log('\n' + (allPass ? '✅ ALL PASSED — ボタンは実際に反応します' : '❌ SOME FAILED'));
  process.exit(allPass ? 0 : 1);
})().catch((e) => { console.error('TEST CRASHED:', e); process.exit(3); });
