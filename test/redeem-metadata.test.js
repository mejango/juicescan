// The 721 redemption metadata envelope must decode on-chain to the exact token IDs, or cashOutTokensOf
// burns the wrong NFTs / reverts. This locks the format to bytes VALIDATED live against basesep:13's hook
// (previewCashOutFrom accepted it and returned the project's live ruleset — the hook decoded the IDs).
import { describe, expect, it } from 'vitest';
import { buildTierCashOutMetadata } from '../src/discover.js';

const ID_TARGET = '0xf4a5887170E4d7efb1C874ad88fc82EBF076b5Ab'; // basesep:13 hook METADATA_ID_TARGET

describe('721 redemption metadata', () => {
  it('matches the on-chain-validated envelope for the owned token IDs', () => {
    const meta = buildTierCashOutMetadata(ID_TARGET, ['1000000002', '2000000001', '1000000001']);
    // reserved word (32B) + [id(4B)=7214c785][offset 0x02][pad 27B] + abi.encode(uint256[]).
    expect(meta).toBe(
      '0x' + '00'.repeat(32)
      + '7214c785' + '02' + '00'.repeat(27)
      + '0000000000000000000000000000000000000000000000000000000000000020' // offset
      + '0000000000000000000000000000000000000000000000000000000000000003' // length
      + '000000000000000000000000000000000000000000000000000000003b9aca02' // 1000000002
      + '0000000000000000000000000000000000000000000000000000000077359401' // 2000000001
      + '000000000000000000000000000000000000000000000000000000003b9aca01' // 1000000001
    );
  });

  it('accepts number and bigint token IDs', () => {
    const a = buildTierCashOutMetadata(ID_TARGET, [1000000002, 2000000001, 1000000001]);
    const b = buildTierCashOutMetadata(ID_TARGET, [1000000002n, 2000000001n, 1000000001n]);
    expect(a).toBe(b);
  });
});
