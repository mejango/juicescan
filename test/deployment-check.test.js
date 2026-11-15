// The deployment check is a hand port of the SDK's getProjectDeploymentDiagnostics. The fixture holds that
// checker's own reports for these scenarios (written by its source, with a fake client), so the port must
// produce the same checks, statuses, sentences and values.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ContractFunctionZeroDataError } from 'viem';
import { getAddress } from '../src/abi-registry.js';
import { getProjectDeploymentDiagnostics, openDeploymentCheck, readProjectDiagnostics, readProjectIndexStatus } from '../src/deployment-check.js';

const chainId = 84532;
const vectors = JSON.parse(readFileSync('test/fixtures/deployment-check-vectors.json', 'utf8'));
// "@Name" is that contract's address on the chain, "12n" a bigint.
function decode(value) {
  if (typeof value === 'string' && value.startsWith('@')) return getAddress(value.slice(1), chainId);
  if (typeof value === 'string' && /^[0-9]+n$/.test(value)) return BigInt(value.slice(0, -1));
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    if (value.revert) return new ContractFunctionZeroDataError({ functionName: 'read' });
    if (value.fail) return new Error('transport');
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry)]));
  }
  return value;
}
function clientOf(scenario, calls) {
  const values = { ...scenario.defaults, ...scenario.values };
  return {
    getChainId: async () => scenario.clientChainId ?? chainId,
    getBlockNumber: async () => 123n,
    readContract: async (call) => {
      if (calls) calls.push(call);
      const value = decode(values[call.functionName]);
      if (value instanceof Error) throw value;
      return value;
    },
  };
}
const argsOf = (scenario) => ({ chainId, projectId: decode(scenario.projectId ?? '45n'), ...(scenario.operator ? { operator: decode(scenario.operator) } : {}) });

describe('the deployment check matches the SDK checker', () => {
  for (const scenario of vectors) {
    it(scenario.name, async () => {
      const report = await getProjectDeploymentDiagnostics(clientOf(scenario), argsOf(scenario));
      expect({ ...report, checkedAt: 'T' }).toEqual(scenario.report);
    });
  }

  it('pins every read to the one block it reports', async () => {
    const calls = [];
    const report = await getProjectDeploymentDiagnostics(clientOf(vectors[1], calls), argsOf(vectors[1]));
    expect(report.checkedBlock).toBe('123');
    expect(calls.length).toBeGreaterThan(10);
    expect(calls.every((call) => call.blockNumber === 123n)).toBe(true);
  });
});

describe('the indexer side of the check', () => {
  const row = (extra) => async () => ({ chainId, projectId: 45, ...extra });
  it('reports a missing record, a complete one and an incomplete group', async () => {
    expect((await readProjectIndexStatus(async () => undefined, null, chainId, 45)).status).toBe('missing');
    expect(await readProjectIndexStatus(row({}), null, chainId, 45)).toEqual({ status: 'available', message: 'Indexed project details are available. Individual stats and activity may have separate availability.' });
    expect((await readProjectIndexStatus(row({ suckerGroupId: 'g' }), async () => [{ chainId, projectId: 45 }], chainId, 45)).linkedProjectsStatus).toBe('available');
    expect(await readProjectIndexStatus(row({ suckerGroupId: 'g' }), async () => [{ chainId: 1, projectId: 45 }], chainId, 45)).toMatchObject({ status: 'incomplete', linkedProjectsStatus: 'incomplete' });
    expect(await readProjectIndexStatus(row({ suckerGroupId: 'g' }), async () => { throw new Error('x'); }, chainId, 45)).toMatchObject({ status: 'incomplete', linkedProjectsStatus: 'unavailable' });
  });

  it('keeps a failed indexer request apart from the chain checks, and the reverse', async () => {
    const deps = { clientFor: () => clientOf(vectors[0]), loadRow: async () => { throw new Error('down'); }, groupMembers: null };
    const report = await readProjectDiagnostics(deps, chainId, 45);
    expect(report.indexer).toEqual({ status: 'unavailable', message: 'The indexer request did not complete. Indexing progress is unknown.' });
    expect(report.deployment.checks.length).toBeGreaterThan(5);
    const unread = await readProjectDiagnostics({ clientFor: () => { throw new Error('no client'); }, loadRow: row({}), groupMembers: null }, chainId, 45);
    expect(unread.deployment.checks.map((check) => check.id)).toEqual(['contract-read']);
    expect(unread.indexer.status).toBe('available');
  });
});

describe('the Check deployment dialog', () => {
  function open(extra) {
    let form;
    const copied = [];
    openDeploymentCheck(Object.assign({
      el: (tag, className) => { const node = document.createElement(tag); if (className) node.className = className; return node; },
      openModal: (title, node) => { form = node; form.dataset.title = title; },
      copyText: async (text) => { copied.push(text); },
      clientFor: () => clientOf(vectors[5]),
      loadRow: async () => ({ chainId, projectId: 45 }), groupMembers: null,
      deployments: [{ chainId, projectId: 45, name: 'Base Sepolia' }, { chainId, projectId: 46, name: 'Other' }], selected: 0,
    }, extra));
    return { form, copied };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('lists the checks by section with their status, and copies the report', async () => {
    const { form, copied } = open();
    expect(form.dataset.title).toBe('Check deployment');
    expect(form.querySelector('[role="status"]').textContent).toBe('Checking contracts and project data…');
    await settle();
    expect([...form.querySelectorAll('.deploy-check-title')].map((node) => node.textContent)).toEqual(['Indexer availability', 'Project contracts', 'Hook wiring', 'Shop pricing', 'Permissions']);
    const mismatches = [...form.querySelectorAll('.deploy-check-status.mismatch')];
    expect(mismatches.length).toBe(2);
    expect(mismatches[0].textContent).toBe('Mismatch');
    expect(form.textContent).toContain('Checked ');
    expect(form.textContent).toContain(', Block 123');
    const copy = [...form.querySelectorAll('a')].find((node) => node.textContent === 'Copy diagnostics');
    copy.click(); await settle();
    expect(copy.textContent).toBe('Copied');
    expect(JSON.parse(copied[0]).deployment.kind).toBe('revnet');
  });

  it('refuses an operator that is not an address before reading anything', async () => {
    const { form } = open();
    await settle();
    const check = form.querySelector('input[type="checkbox"]'); check.checked = true; check.dispatchEvent(new Event('change'));
    const input = form.querySelector('[aria-label="Operator address"]'); input.value = 'nope'; input.dispatchEvent(new Event('change'));
    expect(form.querySelector('[role="status"]').textContent).toBe('Enter a valid operator address, or leave it blank.');
    expect(form.querySelector('.deploy-check-results').textContent).toBe('');
  });

  it('drops a result as soon as another operator is typed, and a late clipboard failure for an earlier report', async () => {
    let failCopy;
    const { form } = open({ copyText: () => new Promise((resolve, reject) => { failCopy = reject; }) });
    await settle();
    [...form.querySelectorAll('a')].find((node) => node.textContent === 'Copy diagnostics').click(); await settle();
    const check = form.querySelector('input[type="checkbox"]'); check.checked = true; check.dispatchEvent(new Event('change'));
    const input = form.querySelector('[aria-label="Operator address"]'); input.value = '0x00'; input.dispatchEvent(new Event('input'));
    expect(form.querySelector('.deploy-check-results').textContent).toBe('');
    failCopy(new Error('denied')); await settle();
    expect(form.querySelector('textarea')).toBe(null);
  });

  it('offers the report as text when the clipboard is unavailable', async () => {
    const { form } = open({ copyText: async () => { throw new Error('denied'); } });
    await settle();
    [...form.querySelectorAll('a')].find((node) => node.textContent === 'Copy diagnostics').click(); await settle();
    expect(form.querySelector('textarea[aria-label="Deployment diagnostics"]').value).toContain('"checks"');
  });
});
