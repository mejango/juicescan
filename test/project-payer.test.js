import { describe, it, expect } from 'vitest';
import { componentReproPrompt } from '../src/component-base.js';
import { buildProjectPayerDeployArgs, buildProjectPayerDeployCall, projectPayerRelayrEntry } from '../src/project-payer.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const OWNER = '0x1111111111111111111111111111111111111111';
const BENEFICIARY = '0x2222222222222222222222222222222222222222';
const BASE_SEPOLIA_PROJECT_PAYER_DEPLOYER = '0x7321740fd0dcf73dd3e2aa8fc060454abfce9517';
const BASE_SEPOLIA_ERC2771_FORWARDER = '0x3ba60b60933916a7c87d0860dcee62a0ce34e3e2';

describe('buildProjectPayerDeployArgs', () => {
  it('defaults safely to pay mode with zero beneficiary and immutable owner preserved', () => {
    const args = buildProjectPayerDeployArgs(8, ZERO, '', '0x', false, ZERO);

    expect(args).toEqual([8n, ZERO, '', '0x', false, ZERO]);
  });

  it('allows a custom beneficiary, metadata, add-to-balance mode, and owner', () => {
    const args = buildProjectPayerDeployArgs('8', BENEFICIARY, 'memo', '0x1234', true, OWNER);

    expect(args).toEqual([8n, BENEFICIARY, 'memo', '0x1234', true, OWNER]);
  });

  it('rejects invalid metadata and malformed owners while allowing the zero owner', () => {
    expect(() => buildProjectPayerDeployArgs(8, ZERO, '', '0x123', false, OWNER)).toThrow(/Metadata/);
    expect(() => buildProjectPayerDeployArgs(8, ZERO, '', '0x', false, ZERO)).not.toThrow();
    expect(() => buildProjectPayerDeployArgs(8, ZERO, '', '0x', false, 'not-an-address')).toThrow(/admin address/);
  });

  it('uses raw Relayr entries for permissionless payer deploys, not ERC-2771 forwarding', () => {
    const call = buildProjectPayerDeployCall(84532, 8, ZERO, 'from x402', '0x', false, OWNER);
    const entry = projectPayerRelayrEntry(call);

    expect(entry).toMatchObject({ chain: 84532, value: '0' });
    expect(entry.target.toLowerCase()).toBe(BASE_SEPOLIA_PROJECT_PAYER_DEPLOYER);
    expect(entry.target.toLowerCase()).not.toBe(BASE_SEPOLIA_ERC2771_FORWARDER);
    expect(entry.data.slice(0, 10)).toBe('0xa396f5e9');
  });
});

describe('project payer build prompt', () => {
  it('uses the project-payer component spec instead of the generic discover prompt', () => {
    const prompt = componentReproPrompt('Project payer address', 'project-payer');

    expect(prompt).toContain('JBProjectPayerDeployer.deployProjectPayer');
    expect(prompt).toContain('defaultAddToBalance=false');
    expect(prompt).toContain('zero address admin');
    expect(prompt).toContain('destination project');
    expect(prompt).toContain('transfer or renounce the admin role');
    expect(prompt).toContain('native token (ETH)');
    expect(prompt).toContain('not supported by direct token transfer');
    expect(prompt).toContain('Bendystraw');
  });
});
