// src/encoding.js
// ABI encoding/decoding — thin wrappers around viem
// All blockchain data transformation in one place for auditability

import { encodeFunctionData, decodeErrorResult, parseEther, parseUnits, formatEther, formatUnits, keccak256, stringToHex, BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError } from 'viem';

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

// A proven revert or empty return says what the contract did. A transport failure proves nothing, so a caller must
// not read it as "the contract refused".
export function contractReverted(error) {
  return error instanceof BaseError && error.walk((cause) => cause instanceof ContractFunctionRevertedError || cause instanceof ContractFunctionZeroDataError) !== null;
}
