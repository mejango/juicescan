// src/encoding.js
// ABI encoding/decoding — thin wrappers around viem
// All blockchain data transformation in one place for auditability

import { encodeFunctionData, encodeAbiParameters, encodePacked, getContractAddress, decodeErrorResult, parseEther, parseUnits, formatEther, formatUnits, keccak256, stringToHex, BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError } from 'viem';

export function encodeCalldata(abi, functionName, args) {
  return encodeFunctionData({ abi, functionName, args });
}

export function decodeError(abi, data) {
  try {
    return decodeErrorResult({ abi, data });
  } catch (_) {
    return null;
  }
}

export function parseAmount(value, decimals) {
  if (decimals === 18) return parseEther(value);
  return parseUnits(value, decimals);
}

export function formatAmount(value, decimals) {
  if (decimals === 18) return formatEther(value);
  return formatUnits(value, decimals);
}

// A cash out tax rate out of JBConstants.MAX_CASH_OUT_TAX_RATE (10,000) as the 0 to 1 value people read:
// 1000 becomes "0.1", 9999 becomes "0.9999". juicebox.money shows the same value.
export function cashOutTaxValue(rate) {
  return String(Number((Number(rate) / 10000).toFixed(4)));
}

// The CREATE2 salt every deployERC20For of one token shares, so the token lands on the same address on every chain.
// juicebox.money derives the same salt, so a token started in one client continues at the same address in the other.
// A zero salt would deploy a nonce-keyed clone at a different address per chain.
export function omnichainTokenSalt(name, symbol) {
  return keccak256(stringToHex('jb-erc20:' + String(name).trim() + ':' + String(symbol).trim()));
}

// The salt Juicescan used before it shared juicebox.money's: the viewed chain's project ID and the symbol.
export function legacyTokenSalt(projectId, symbol) {
  return keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'string' }], [BigInt(projectId), symbol]));
}

// Where deployERC20For puts a token: JBController hashes the sender into the salt, JBTokens hashes the
// controller in, then clones its TOKEN implementation with CREATE2 (an ERC-1167 minimal proxy).
export function predictTokenAddress(o) {
  var saltHash = keccak256(encodePacked(['address', 'bytes32'], [o.sender, o.salt]));
  var cloneSalt = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [o.controller, saltHash]));
  var initCode = '0x3d602d80600a3d3981f3363d3d373d3d3d363d73' + o.implementation.slice(2).toLowerCase() + '5af43d82803e903d91602b57fd5bf3';
  return getContractAddress({ opcode: 'CREATE2', from: o.tokens, salt: cloneSalt, bytecodeHash: keccak256(initCode) });
}

// The salt that puts the token at `existing` for this sender on this chain, or null when none of them can.
export function matchingTokenSalt(existing, salts, o) {
  for (var i = 0; i < salts.length; i++) {
    if (predictTokenAddress({ sender: o.sender, controller: o.controller, tokens: o.tokens, implementation: o.implementation, salt: salts[i] }).toLowerCase() === String(existing).toLowerCase()) return salts[i];
  }
  return null;
}

// A proven revert or empty return says what the contract did. A transport failure proves nothing, so a caller must
// not read it as "the contract refused".
export function contractReverted(error) {
  return error instanceof BaseError && error.walk((cause) => cause instanceof ContractFunctionRevertedError || cause instanceof ContractFunctionZeroDataError) !== null;
}
