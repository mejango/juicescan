import { describe, it, expect } from 'vitest';
import { componentReproPrompt } from '../src/component-base.js';
import { buildProjectPayerDeployArgs } from '../src/discover.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const OWNER = '0x1111111111111111111111111111111111111111';
const BENEFICIARY = '0x2222222222222222222222222222222222222222';

describe('buildProjectPayerDeployArgs', () => {
  it('defaults safely to pay mode with zero beneficiary preserved', () => {
    const args = buildProjectPayerDeployArgs(8, ZERO, '', '0x', false, OWNER);

    expect(args).toEqual([8n, ZERO, '', '0x', false, OWNER]);
  });

  it('allows a custom beneficiary, metadata, add-to-balance mode, and owner', () => {
    const args = buildProjectPayerDeployArgs('8', BENEFICIARY, 'memo', '0x1234', true, OWNER);

    expect(args).toEqual([8n, BENEFICIARY, 'memo', '0x1234', true, OWNER]);
  });

  it('rejects invalid metadata and zero owner', () => {
    expect(() => buildProjectPayerDeployArgs(8, ZERO, '', '0x123', false, OWNER)).toThrow(/Metadata/);
    expect(() => buildProjectPayerDeployArgs(8, ZERO, '', '0x', false, ZERO)).toThrow(/owner/);
  });
});

describe('project payer build prompt', () => {
  it('uses the project-payer component spec instead of the generic discover prompt', () => {
    const prompt = componentReproPrompt('Project payer address', 'project-payer');

    expect(prompt).toContain('JBProjectPayerDeployer.deployProjectPayer');
    expect(prompt).toContain('defaultAddToBalance=false');
    expect(prompt).toContain('Bendystraw');
  });
});
