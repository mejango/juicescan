import * as esbuild from 'esbuild';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, keccak256, multicall3Abi } from 'viem';
import gatewayDeployment from '../../data/abis/JBRouterTerminalGateway.json' with { type: 'json' };

// Render the actual Activity component and pending-payment adapter from the production sources.
// Only network responses are fixtures: commitments, failure tuples and multicalls are ABI encoded.
const HARNESS_URL = '/e2e-pending-payments-harness.js';
const ABI = gatewayDeployment.abi;
const CALL_TYPE = ABI.find(entry => entry.name === 'processPendingCall').inputs[1];
const GATEWAY = '0x4a56aef5b6a5b9742abb02ca67c5a85ba183d901';
const SOURCE_PROJECT_ID = 7;
const NOW = 1800000000n;
const ZERO_HASH = '0x' + '0'.repeat(64);
const FAILURE_HASH = '0x' + '12'.repeat(32);
const CHAIN_IDS = [1, 10, 8453, 42161, 11155111, 11155420, 84532, 421614];
let harness;

function harnessSource() {
  if (!harness) harness = esbuild.build({
    stdin: {
      contents: `import { renderActivityCard } from './src/discover.js';
        window.__renderPendingActivity = function () {
          const project = { id: 7, idByChain: { 8453: 7 }, chainId: 8453, chains: [{ id: 8453, name: 'Base' }], name: 'Routing example', version: 6 };
          const content = document.createElement('div'); content.className = 'tab-content active';
          const detail = document.createElement('section'); detail.className = 'project-detail detail-spacious';
          const heading = document.createElement('h1'); heading.textContent = 'Routing example'; detail.appendChild(heading);
          const columns = document.createElement('div'); columns.className = 'project-detail-columns';
          const left = document.createElement('div'); left.className = 'project-detail-left';
          const right = document.createElement('div'); right.className = 'project-detail-right';
          const activity = renderActivityCard(project);
          if (matchMedia('(max-width: 600px)').matches) {
            const tabs = document.createElement('div'); tabs.className = 'project-detail-tabs';
            const label = document.createElement('span'); label.className = 'project-detail-tab active'; label.textContent = 'Latest'; tabs.appendChild(label);
            right.appendChild(tabs); right.appendChild(activity);
          } else {
            left.appendChild(activity);
            const overview = document.createElement('div'); overview.className = 'detail-card';
            const title = document.createElement('h2'); title.className = 'detail-card-title'; title.textContent = 'Overview';
            overview.appendChild(title); right.appendChild(overview);
          }
          columns.append(left, right); detail.appendChild(columns); content.appendChild(detail);
          document.querySelector('main').replaceChildren(content);
          return activity.querySelector('.pending-payments')._ready;
        };`,
      resolveDir: process.cwd(), sourcefile: 'e2e-pending-payments-harness.js', loader: 'js',
    },
    bundle: true, format: 'esm', write: false,
    define: { __BENDYSTRAW_API_KEY__: '""', __PINATA_JWT__: '""' },
  }).then(result => result.outputFiles[0].text);
  return harness;
}

function pendingRows() {
  return [
    { amount: 25000000000000000n, token: '0x000000000000000000000000000000000000eeee' },
    { amount: 5000000n, token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
    { amount: 1200000000000000000n, token: '0x000000000000000000000000000000000000eeee' },
  ].map((input, index) => {
    const call = { ...input, preferAddToBalance: false, shouldReturnHeldFees: false,
      beneficiary: '0x1111111111111111111111111111111111111111', projectId: 1n,
      refundTo: '0x2222222222222222222222222222222222222222', sourceProjectId: BigInt(SOURCE_PROJECT_ID) };
    const memo = 'Original payment ' + (index + 1), metadata = '0x' + SOURCE_PROJECT_ID.toString(16).padStart(64, '0');
    return { ...call, amount: call.amount.toString(), projectId: Number(call.projectId), sourceProjectId: SOURCE_PROJECT_ID,
      chainId: 8453, version: 6, gateway: GATEWAY, pendingCallId: '0x' + (index + 1).toString(16).padStart(64, '0'),
      retainedAmount: call.amount.toString(), memo, metadata, status: index ? 'retried' : 'queued',
      callCommitment: keccak256(encodeAbiParameters([CALL_TYPE, { type: 'string' }, { type: 'bytes' }], [call, memo, metadata])) };
  });
}

async function openPendingActivity(page) {
  const rows = pendingRows(), unexpected = [], rpcMethods = [];
  const source = await harnessSource();
  await page.addInitScript(chainIds => {
    for (const chainId of chainIds) localStorage.setItem(`jb-rpc-${chainId}`, `${location.origin}/__pending_rpc__`);
  }, CHAIN_IDS);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    unexpected.push(route.request().url()); return route.abort('blockedbyclient');
  });
  await page.route(`**${HARNESS_URL}`, route => route.fulfill({ contentType: 'text/javascript', body: source }));
  await page.route('**/graphql', route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': '*' } });
    const request = route.request().postDataJSON();
    const data = /\bPendingPayments\b/.test(request.query)
      ? { routerPendingCalls: { items: rows, totalCount: rows.length } }
      : { suckerPairs: { items: [], totalCount: 0 }, activityEvents: { items: [], totalCount: 0 } };
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data }) });
  });
  function callResult(target, data) {
    if (target.toLowerCase() === '0xca11bde05977b3631167028862be2a173976ca11') {
      const decoded = decodeFunctionData({ abi: multicall3Abi, data });
      if (decoded.functionName !== 'aggregate3') throw new Error('Unrecognized multicall fixture');
      const result = decoded.args[0].map(call => {
        try { return { success: true, returnData: callResult(call.target, call.callData) }; }
        catch (_) { return { success: false, returnData: '0x' }; }
      });
      return encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result });
    }
    if (target.toLowerCase() !== GATEWAY) throw new Error('Other project reads are outside this fixture');
    const decoded = decodeFunctionData({ abi: ABI, data });
    const index = decoded.args?.[0] ? rows.findIndex(row => row.pendingCallId === decoded.args[0]) : -1;
    const result = {
      pendingCallCommitmentOf: rows[index]?.callCommitment,
      pendingCallFailureOf: index === 0 ? { errorHash: ZERO_HASH, count: 0, lastFailureAt: 0n, highestGasLimit: 0n }
        : { errorHash: FAILURE_HASH, count: index === 1 ? 1 : 3, lastFailureAt: index === 1 ? NOW : NOW - 90000n, highestGasLimit: 5000000n },
      QUALIFIED_CALL_GAS: 5000000n, maximumQualifiedCallGas: (16777216n - 1500000n) * 63n / 64n,
      RETRY_DELAY: 86400n, FINALIZATION_FAILURE_COUNT: 3n,
    }[decoded.functionName];
    if (result === undefined) throw new Error('Unrecognized gateway read');
    return encodeFunctionResult({ abi: ABI, functionName: decoded.functionName, result });
  }
  await page.route('**/__pending_rpc__', route => {
    const request = route.request().postDataJSON();
    function answer(payload) {
      rpcMethods.push(payload.method);
      try {
        let result;
        if (payload.method === 'eth_chainId') result = '0x2105';
        else if (payload.method === 'eth_blockNumber') result = '0x100';
        else if (payload.method === 'eth_getBlockByNumber') result = { number: '0x100', hash: '0x' + '11'.repeat(32), parentHash: ZERO_HASH,
          timestamp: '0x' + NOW.toString(16), gasLimit: '0x3938700', gasUsed: '0x0', baseFeePerGas: '0x1', transactions: [] };
        else if (payload.method === 'eth_call') result = callResult(payload.params[0].to, payload.params[0].data);
        else throw new Error('No writes or other RPC methods in the pending-payment fixture');
        return { jsonrpc: '2.0', id: payload.id, result };
      } catch (error) { return { jsonrpc: '2.0', id: payload.id, error: { code: -32000, message: error.message } }; }
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(request) ? request.map(answer) : answer(request)) });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/index.html#learn', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ url: HARNESS_URL, type: 'module' });
  await page.waitForFunction(() => !!window.__renderPendingActivity);
  await page.evaluate(() => window.__renderPendingActivity());
  return { unexpected, rpcMethods, errors };
}

test('pending payments appear above Activity with verified eligibility and no horizontal overflow', async ({ page }, testInfo) => {
  const observed = await openPendingActivity(page);
  const card = page.locator('.pending-payments');
  await expect(card.getByRole('heading', { name: 'Payments awaiting routing' })).toBeVisible();
  await expect(card.locator('form')).toHaveCount(3);
  await expect(card.locator('form').nth(0).getByRole('button', { name: 'Review payment' })).toBeEnabled();
  await expect(card.locator('form').nth(1).getByRole('button', { name: 'Review payment' })).toBeDisabled();
  await expect(card.locator('form').nth(1)).toContainText('Available');
  await expect(card.locator('form').nth(2).getByRole('button', { name: 'Review final attempt' })).toBeEnabled();
  await expect(card).toContainText('may return this payment to its source project');
  await expect(card.getByRole('button', { name: 'Batch 2 ready' })).toBeEnabled();
  const activity = page.locator('.activity-head');
  await expect(activity).toBeVisible();
  const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth, pendingBottom: document.querySelector('.pending-payments').getBoundingClientRect().bottom,
    activityTop: document.querySelector('.activity-head').getBoundingClientRect().top,
    outside: [...document.querySelectorAll('.pending-payments *')].filter(node => {
      const rect = node.getBoundingClientRect(); return rect.width && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
    }).map(node => node.tagName),
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.outside).toEqual([]);
  expect(geometry.pendingBottom).toBeLessThanOrEqual(geometry.activityTop);
  const accessibility = await new AxeBuilder({ page }).include('.pending-payments').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(observed.errors).toEqual([]);
  expect(observed.unexpected).toEqual([]);
  expect(observed.rpcMethods.some(method => /send|sign/i.test(method))).toBe(false);
  if (['mobile', 'desktop'].includes(testInfo.project.name)) {
    const artifactRoot = process.platform === 'darwin' ? '/private/tmp' : '/tmp';
    await page.screenshot({ path: `${artifactRoot}/juicescan-pending-${testInfo.project.name}.png`, fullPage: true });
  }
});
