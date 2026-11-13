// Canonical USDC over an OP-stack/Arbitrum NATIVE sucker locks funds in bridge escrow (the on-chain
// mapping guards are bridge-infra-blind, so nothing stops it there) — the website must only ever build
// USDC token mappings for CCIP suckers. See JBOptimismSucker._sendRootOverAMB / JBArbitrumSucker gateway
// asymmetry: canonical USDC is not a mintable-pair token, so the delivery leg can never settle.
import { describe, expect, it } from 'vitest';
import { __test } from '../src/create-flow.js';

const { suckerConfigFor, tokenMappingsFor } = __test;
const SALT = '0x' + '0'.repeat(64);
const NATIVE = '0x000000000000000000000000000000000000eeee';
const USDC_MAINNET = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

describe('USDC sucker mappings are CCIP-only', () => {
  it('tokenMappingFor refuses a USDC mapping for a native bridge', () => {
    expect(tokenMappingsFor(1, 10, ['usdc'], 'native')).toBeNull();
    const ccip = tokenMappingsFor(1, 10, ['usdc'], 'ccip');
    expect(ccip.map((m) => m.localToken.toLowerCase())).toEqual([USDC_MAINNET]);
  });

  it('ETH projects still map native over native bridges', () => {
    const m = tokenMappingsFor(1, 10, ['eth'], 'native');
    expect(m.map((x) => x.localToken.toLowerCase())).toEqual([NATIVE]);
  });

  it('a project accepting ETH and USDC maps both over CCIP and ETH alone over a native bridge', () => {
    expect(tokenMappingsFor(1, 10, ['eth', 'usdc'], 'ccip').map((x) => x.localToken.toLowerCase())).toEqual([NATIVE, USDC_MAINNET]);
    expect(tokenMappingsFor(1, 10, ['eth', 'usdc'], 'native').map((x) => x.localToken.toLowerCase())).toEqual([NATIVE]);
  });

  it('a custom token maps nothing: CCIP still links the chains, a native bridge does not', () => {
    expect(tokenMappingsFor(1, 10, ['custom'], 'ccip')).toEqual([]);
    expect(tokenMappingsFor(1, 10, ['custom'], 'native')).toBeNull();
  });

  it('a USDC project with Native and CCIP gets only CCIP deployer configs', () => {
    const both = suckerConfigFor(1, [10], SALT, 'both', ['usdc']);
    expect(both.deployerConfigurations.length).toBeGreaterThan(0);
    both.deployerConfigurations.forEach((config) => {
      expect(config.mappings[0].localToken.toLowerCase()).toBe(USDC_MAINNET);
    });
    // The same pair under ETH accounting yields MORE configs (native + CCIP) than USDC (CCIP only).
    const ethBoth = suckerConfigFor(1, [10], SALT, 'both', ['eth']);
    expect(ethBoth.deployerConfigurations.length).toBeGreaterThan(both.deployerConfigurations.length);
  });

  it('a USDC project under native-only bridges links nothing (pair reported missing)', () => {
    const nativeOnly = suckerConfigFor(1, [10], SALT, 'native', ['usdc']);
    expect(nativeOnly.deployerConfigurations).toEqual([]);
    expect(nativeOnly.missing).toEqual([10]);
  });
});
