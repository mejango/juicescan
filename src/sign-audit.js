// src/sign-audit.js
// The source rule and checklist every "audit before I sign" prompt carries. No imports, so the startup
// bundle (component-base) and the lazy API tab (prompts) share it without a cycle.

export var V6_SOURCE_RULE = 'Verify contract source only against the Juicebox V6 repositories: https://github.com/Bananapus/version-6. Their names end in `-v6`. Same-named repositories without that suffix are older versions and do not match the deployed bytecode.';

export var SIGN_AUDIT_CHECKS = [
  'Decode the `function` and each `arg`. Do they match what I believe I am doing?',
  'Is `value` (native token sent with the call) what I expect? Flag any unexpected non-zero value.',
  'If there is an ERC-20 approval, is the amount bounded and the spender expected? Warn on unlimited approvals.',
  'Are any addresses in the args recipients of funds, tokens, ownership, or operator or permission rights? Are they my address or one I explicitly named?',
  'For cross-chain calls, is the same change applied on every listed chain, with no extra chain?',
  'Any sign of a drain, ownership or operator transfer, or permission grant I did not intend?',
];
