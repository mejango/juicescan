// src/encoding.js
// ABI encoding/decoding — thin wrappers around viem
// All blockchain data transformation in one place for auditability

import { encodeFunctionData, decodeFunctionResult, decodeErrorResult, parseEther, parseUnits, formatEther, formatUnits } from 'viem';

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
