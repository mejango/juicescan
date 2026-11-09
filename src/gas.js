/**
 * Give every wallet transaction twice its RPC estimate. Juicebox terminal
 * calls can catch a failed internal fee payment, so the cheaper fallback path
 * may otherwise produce a successful but undersized estimate. Unused gas is
 * not charged.
 */
export function gasWithHeadroom(estimate, cap) {
  if (cap == null) cap = TRANSACTION_GAS_CAP;
  var measured = BigInt(estimate), doubled = measured * 2n;
  return measured <= cap && doubled > cap ? cap : doubled;
}

/** EIP-7825's per-transaction gas limit: a wallet can't send more. */
export var TRANSACTION_GAS_CAP = 2n ** 24n;

export async function contractGasWithHeadroom(publicClient, request) {
  return gasWithHeadroom(await publicClient.estimateContractGas(
    Object.assign({}, request, { gas: undefined })
  ));
}

export async function transactionGasWithHeadroom(publicClient, request) {
  return gasWithHeadroom(await publicClient.estimateGas(
    Object.assign({}, request, { gas: undefined })
  ));
}

/**
 * The gas limit to send for a call that carries a reviewed cap.
 *
 * A cap bounds the eth_call simulation against an authority- or target-controlled
 * contract; it is not what the call costs. A wallet reserves gas * maxFeePerGas up
 * front, so sending the cap itself turns a 1.5M-gas mainnet cap into a ~$4 balance
 * requirement for a call that burns a tenth of that, and rejects accounts that can
 * comfortably afford the transaction. Measurement stays bounded by the cap, so the
 * estimator is never unbounded, and the cap survives when the node cannot measure.
 */
export async function gasWithinCap(publicClient, request, cap) {
  return withinCap(cap, function () {
    return publicClient.estimateGas(Object.assign({}, request, { gas: cap }));
  });
}

export async function contractGasWithinCap(publicClient, request, cap) {
  return withinCap(cap, function () {
    return publicClient.estimateContractGas(Object.assign({}, request, { gas: cap }));
  });
}

async function withinCap(cap, estimate) {
  try {
    var measured = gasWithHeadroom(await estimate());
    return measured < cap ? measured : cap;
  } catch (_) {
    return cap;
  }
}
