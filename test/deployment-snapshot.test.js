import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { deploymentArtifactFile, deploymentSourceDigest, nextGeneratedAt } = require(
  '../build/sync-deployments.js',
);

describe('deployment snapshot paths', () => {
  it('maps alternate physical roots to the stable logical source', () => {
    const logicalSource = '../deploy-all-v6/deployments';
    const artifactSegments = ['ethereum', 'JBController.json'];
    const physicalRoots = [
      join(tmpdir(), 'workspace', 'deploy-all-v6', 'deployments'),
      join(tmpdir(), 'workspace', 'website', '.contract-source', 'deploy-all-v6', 'deployments'),
    ];

    for (const physicalRoot of physicalRoots) {
      expect(
        deploymentArtifactFile(logicalSource, physicalRoot, join(physicalRoot, ...artifactSegments)),
      ).toBe('../deploy-all-v6/deployments/ethereum/JBController.json');
    }
  });
});

describe('deployment snapshot timestamps', () => {
  let originalSourceDateEpoch;

  beforeEach(() => {
    originalSourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
    delete process.env.SOURCE_DATE_EPOCH;
  });

  afterEach(() => {
    if (originalSourceDateEpoch === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = originalSourceDateEpoch;
  });

  it('preserves the prior timestamp when deployment inputs are unchanged', () => {
    process.env.SOURCE_DATE_EPOCH = '1700000000';
    const previous = { sourceDigest: 'sha256:same', generatedAt: '2026-01-02T03:04:05.000Z' };

    expect(nextGeneratedAt(previous, 'sha256:same')).toBe(previous.generatedAt);
  });

  it('uses SOURCE_DATE_EPOCH for a changed deterministic snapshot', () => {
    process.env.SOURCE_DATE_EPOCH = '1700000000';

    expect(nextGeneratedAt({ sourceDigest: 'sha256:old' }, 'sha256:new')).toBe('2023-11-14T22:13:20.000Z');
  });

  it.each(['-1', '1.5', 'not-a-number', '9999999999999999'])(
    'rejects invalid SOURCE_DATE_EPOCH value %s',
    (value) => {
      process.env.SOURCE_DATE_EPOCH = value;
      expect(() => nextGeneratedAt({}, 'sha256:new')).toThrow(/non-negative integer seconds/);
    },
  );
});

describe('deployment source digest', () => {
  const directories = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('is deterministic and ignores only the generator\'s superseded artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'jb-deployments-'));
    directories.push(root);
    const chain = join(root, 'ethereum');
    mkdirSync(chain);
    writeFileSync(join(chain, 'JBController.json'), '{"address":"0x1"}\n');
    writeFileSync(join(chain, 'Old_deprecated2.json'), '{"address":"0xold"}\n');

    const initial = deploymentSourceDigest(root);
    writeFileSync(join(chain, 'Old_deprecated2.json'), '{"address":"0xchanged"}\n');
    expect(deploymentSourceDigest(root)).toBe(initial);

    writeFileSync(join(chain, 'JBController.json'), '{"address":"0x2"}\n');
    expect(deploymentSourceDigest(root)).not.toBe(initial);
  });
});
