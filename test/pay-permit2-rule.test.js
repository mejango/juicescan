// How an ERC-20 payment is authorized, by the rule juicebox.money and revnet.money take from their SDK
// (planErc20PayAuthorization): nothing when the pay entry is already approved, an exact approval of the entry for
// any account with code, and a free Permit2 signature (after one approval of Permit2) for a plain wallet.
// Runs the actual source of buildPayPermit2Metadata.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const discover = readFileSync('src/discover.js', 'utf8');
const start = discover.indexOf('async function buildPayPermit2Metadata(');
const permit = discover.slice(start, discover.indexOf('\n// JBMetadataResolver.addToMetadata:', start));

const OWNER = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const ENTRY = '0x3333333333333333333333333333333333333333';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

function run({ entryAllowance = 0n, permit2Allowance = 0n, hasCode = false, multisig = false } = {}) {
  const sent = [], signed = [];
  const client = {
    readContract: async ({ address, args }) => {
      if (address === PERMIT2) return [0n, 0, 7];
      return args[1] === ENTRY ? entryAllowance : permit2Allowance;
    },
    simulateContract: async request => ({ request }),
  };
  const wallet = { getChainId: async () => 1, writeContract: async request => { sent.push(request); return '0xhash'; }, signTypedData: async request => { signed.push(request); return '0xsig'; } };
  const context = vm.createContext({ BigInt, Number, Error, Object,
    getViewAs: () => null, VIEW_AS_TX_ERROR: 'View as', clientFor: () => client, getWalletClient: () => wallet, getAccount: () => OWNER,
    isSafeConnected: () => multisig, lpIsSmartWallet: async () => multisig, accountHasCode: async () => hasCode || multisig,
    lpErc20Abi: [], lpPermit2Abi: [], LP_PERMIT2_TYPES: {}, PERMIT2_ADDRESS: PERMIT2, CHAINS: { 1: { id: 1 } }, chainNameOf: () => 'Ethereum', switchChain: async () => {},
    lpSendTx: async (_chainId, tx) => { sent.push(tx); return '0xhash'; },
    contractGasWithHeadroom: async () => 1n, invokeWallet: (_chainId, _owner, _safe, call) => call(wallet), waitForErc20Approval: async () => {},
    latestChainTimestamp: async () => 1_000, encodeAbiParameters: (_types, values) => values, permit2MetadataId: () => 'aabbccdd',
    addToHookMetadata: (metadata, id, data) => ({ metadata, id, data }),
  });
  vm.runInContext(permit, context);
  return context.buildPayPermit2Metadata(1, TOKEN, OWNER, ENTRY, 500n, null, '0x').then(result => ({ result, sent, signed }));
}

describe('buildPayPermit2Metadata', () => {
  it('asks for nothing when the pay entry is already approved for the amount', async () => {
    for (const setup of [{ entryAllowance: 500n }, { entryAllowance: 500n, hasCode: true }, { entryAllowance: 500n, multisig: true }]) {
      expect(await run(setup)).toEqual({ result: null, sent: [], signed: [] });
    }
  });

  it('has any account with code approve the entry for the exact amount, and never sign', async () => {
    for (const setup of [{ hasCode: true }, { multisig: true }]) {
      const { result, sent, signed } = await run(setup);
      expect(result).toBeNull();
      expect(signed).toEqual([]);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ address: TOKEN, functionName: 'approve', args: [ENTRY, 500n], smartWallet: !!setup.multisig });
    }
  });

  it('has a plain wallet approve Permit2 once, then sign the exact payment for the entry alone', async () => {
    const first = await run();
    expect(first.sent).toHaveLength(1);
    expect(first.sent[0]).toMatchObject({ address: TOKEN, functionName: 'approve', args: [PERMIT2, (1n << 256n) - 1n] });
    const later = await run({ permit2Allowance: 500n });
    expect(later.sent).toEqual([]);
    for (const { signed, result } of [first, later]) {
      expect(signed).toHaveLength(1);
      expect(signed[0].message).toEqual({ details: { token: TOKEN, amount: 500n, expiration: 2_800, nonce: 7 }, spender: ENTRY, sigDeadline: 2_800n });
      // sigDeadline, amount, expiration, nonce, signature: the JBSingleAllowance the entry decodes.
      expect(result).toEqual({ metadata: '0x', id: '0xaabbccdd', data: [[2_800n, 500n, 2_800, 7, '0xsig']] });
    }
  });

  it('authorizes every ERC-20 payment this way, direct or routed, except a contract wallet paying the terminal directly', () => {
    expect(discover).toContain("if (isNative) { sendPay(txParams");
    expect(discover).toContain('(viaRouter ? Promise.resolve(false) : (isSafeConnected() ? Promise.resolve(true) : accountHasCode(reviewedChainId, beneficiary)))');
    expect(discover).toContain('buildPayPermit2Metadata(reviewedChainId, reviewedToken.address, beneficiary, terminal, amt, statusCb, metadata).then(payAuthorized)');
  });
});
