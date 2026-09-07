import { describe, expect, it } from 'vitest';
import { encodeFunctionData, parseAbi } from 'viem';
import { readFileSync } from 'node:fs';
import { reviewableContractCall } from '../src/discover.js';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

describe('reviewable setter contract calls', () => {
  it.each([
    ['function transferFrom(address from, address to, uint256 tokenId)', 'transferFrom', [ADDRESS, OTHER, 42n]],
    ['function setOperatorOf(uint256 revnetId, address operator)', 'setOperatorOf', [42n, OTHER]],
    ['function setControllerOf(uint256 projectId, address controller)', 'setControllerOf', [42n, OTHER]],
    ['function setPermissionsFor(address account, (address operator, uint256 projectId, uint8[] permissionIds) permissions)', 'setPermissionsFor', [ADDRESS, { operator: OTHER, projectId: 42n, permissionIds: [1, 2, 255] }]],
  ])('keeps the exact bytes and structured Safe App arguments for %s', (definition, functionName, args) => {
    const abi = parseAbi([definition]);
    const call = reviewableContractCall(ADDRESS, abi, functionName, args);
    expect(call).toEqual({ to: ADDRESS, abi, functionName, args,
      data: encodeFunctionData({ abi, functionName, args }) });
  });

  it('routes each existing generic management builder through the structured encoder', () => {
    const source = readFileSync('src/discover.js', 'utf8');
    expect(source).toContain("reviewableContractCall(revOwner, setOperatorOfAbi, 'setOperatorOf'");
    expect(source).toContain("reviewableContractCall(jbp, jbProjectsTransferAbi, 'transferFrom'");
    expect(source).toContain("reviewableContractCall(to, jbSetPermissionsAbi, 'setPermissionsFor'");
    expect(source.match(/reviewableContractCall\(to, action\.abi, action\.fn/g)).toHaveLength(2);
  });
});
