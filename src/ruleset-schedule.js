// JBRulesets.deriveStartFrom: the start a ruleset queued on `base` gets — the base's first cycle boundary at
// or after mustStartAtOrAfter (0 → the contract substitutes block.timestamp → the very next boundary).
export function deriveStartFrom(baseStart, baseDuration, mustStartAtOrAfter) {
  if (!baseDuration) return mustStartAtOrAfter;
  var nextImmediate = baseStart + baseDuration;
  if (nextImmediate >= mustStartAtOrAfter) return nextImmediate;
  var start = mustStartAtOrAfter - ((mustStartAtOrAfter - nextImmediate) % baseDuration);
  while (mustStartAtOrAfter > start) start += baseDuration;
  return start;
}
