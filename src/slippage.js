// src/slippage.js
// The single minimum-output floor used by every transaction that carries a slippage guard.
//
// Lives in a leaf module because discover.js imports payouts-component.js: the four call sites (cash out, payouts,
// pay, borrow) grew four parallel implementations of the same expression, and a floor policy is exactly the kind of
// rule that must not be changeable in one place only.

function toBigInt(value) {
  if (value === null || value === undefined || value === '') return 0n;
  try { return BigInt(value); } catch (_) { return 0n; }
}

/**
 * The minimum output to accept for a quoted amount, in basis points of that quote (default 9900 = a 1% floor).
 * A positive quote never floors to zero: rounding a real quote down to 0 would encode "any amount is acceptable",
 * so it clamps to 1. A zero/negative/unparseable quote returns 0n — the caller decides whether that is legal.
 */
export function quotedOutputFloor(quoted, bps) {
  quoted = toBigInt(quoted);
  bps = bps == null ? 9900n : BigInt(bps);
  if (quoted <= 0n) return 0n;
  var floor = quoted * bps / 10000n;
  return floor > 0n ? floor : 1n;
}

/** prepareUserPay's own default tolerance on its quote and fallback minimum. */
export var PAY_DEFAULT_SLIPPAGE_BPS = 100;
/** A payer's loosened pay tolerance stays below this percent, so the minimum never nears zero. */
export var PAY_SLIPPAGE_LIMIT_PERCENT = 50;

/**
 * Only the terminal's and the buyback hook's minimums answer to this tolerance; the router's conversion check
 * (ROUTER_SLIPPAGE_EXCEEDED) is not this minimum, so it is never offered.
 * The tolerance that would have let a payment through which fell short of the minimum prepareUserPay set from
 * `currentBps`, rounded up to a half percent, or null when a lower minimum is not the fix (the buyback hook's own
 * TWAP floor, the router's own quote, or another failure). `failure` is decodePayFailure's result.
 */
export function payRetrySlippageBps(failure, currentBps) {
  var reason = failure && failure.reason;
  if (reason !== 'TERMINAL_UNDER_MIN' && reason !== 'BUYBACK_SLIPPAGE_EXCEEDED') return null;
  var received = typeof failure.received === 'bigint' ? failure.received : null;
  var minimum = typeof failure.minimum === 'bigint' ? failure.minimum : null;
  // Nothing would be returned: no tolerance under the limit fixes that, so none is suggested.
  if (received === 0n) return null;
  var shortfallBps = received != null && minimum != null && minimum > 0n && received < minimum
    ? Number(((minimum - received) * 10000n + minimum - 1n) / minimum)
    : 100;
  var suggested = Math.min(Math.ceil((currentBps + shortfallBps) / 50) * 50, PAY_SLIPPAGE_LIMIT_PERCENT * 100 - 50);
  // Already at the limit: a looser minimum is not on offer.
  return suggested > currentBps ? suggested : null;
}
