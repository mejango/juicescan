// src/permission-ids.js
// Pure data with no imports, so component-base (via tx-pretty-args) and the Permissions widget can share it
// without an import cycle.

// Complete permission IDs from nana-permission-ids-v6
export var PERMISSION_IDS = [
  { id: 1, name: 'ROOT', desc: 'Grants all permissions' },
  { id: 2, name: 'QUEUE_RULESETS', desc: 'Queue new rulesets' },
  { id: 3, name: 'LAUNCH_RULESETS', desc: 'Launch first rulesets' },
  { id: 4, name: 'CASH_OUT_TOKENS', desc: 'Cash out tokens' },
  { id: 5, name: 'SEND_PAYOUTS', desc: 'Send payouts' },
  { id: 6, name: 'MIGRATE_TERMINAL', desc: 'Migrate terminal balance' },
  { id: 7, name: 'SET_PROJECT_URI', desc: 'Set project metadata URI' },
  { id: 8, name: 'DEPLOY_ERC20', desc: 'Deploy ERC-20 token' },
  { id: 9, name: 'SET_TOKEN', desc: 'Set existing ERC-20' },
  { id: 10, name: 'MINT_TOKENS', desc: 'Mint project tokens' },
  { id: 11, name: 'BURN_TOKENS', desc: 'Burn project tokens' },
  { id: 12, name: 'CLAIM_TOKENS', desc: 'Claim credits as ERC-20' },
  { id: 13, name: 'TRANSFER_CREDITS', desc: 'Transfer token credits' },
  { id: 14, name: 'SET_CONTROLLER', desc: 'Set project controller' },
  { id: 15, name: 'SET_TERMINALS', desc: 'Set terminal list' },
  { id: 16, name: 'ADD_TERMINALS', desc: 'Add new terminal' },
  { id: 17, name: 'SET_PRIMARY_TERMINAL', desc: 'Set primary terminal' },
  { id: 18, name: 'USE_ALLOWANCE', desc: 'Spend surplus allowance' },
  { id: 19, name: 'SET_SPLIT_GROUPS', desc: 'Configure splits' },
  { id: 20, name: 'ADD_PRICE_FEED', desc: 'Add price feed' },
  { id: 21, name: 'ADD_ACCOUNTING_CONTEXTS', desc: 'Register token types' },
  { id: 22, name: 'SET_TOKEN_METADATA', desc: 'Update ERC-20 metadata' },
  { id: 23, name: 'SIGN_FOR_ERC20', desc: 'Sign via ERC-1271' },
  { id: 24, name: 'ADJUST_721_TIERS', desc: 'Modify NFT tiers' },
  { id: 25, name: 'SET_721_METADATA', desc: 'Update NFT metadata' },
  { id: 26, name: 'MINT_721', desc: 'Mint NFTs directly' },
  { id: 27, name: 'SET_721_DISCOUNT_PERCENT', desc: 'Set item discount' },
  { id: 28, name: 'SET_BUYBACK_TWAP', desc: 'Set TWAP window' },
  { id: 29, name: 'SET_BUYBACK_POOL', desc: 'Set buyback pool' },
  { id: 30, name: 'SET_BUYBACK_HOOK', desc: 'Configure buyback hook' },
  { id: 31, name: 'SET_ROUTER_TERMINAL', desc: 'Configure router terminal' },
  { id: 32, name: 'MAP_SUCKER_TOKEN', desc: 'Map cross-chain token' },
  { id: 33, name: 'DEPLOY_SUCKERS', desc: 'Deploy cross-chain bridges' },
  // Canonical JBPermissionIds.sol: 34=SET_SUCKER_PEER, 35=SUCKER_SAFETY, 36=SET_SUCKER_DEPRECATION.
  // (Previously shifted — checking "SUCKER_SAFETY" granted SET_SUCKER_PEER, a materially more dangerous role.)
  { id: 34, name: 'SET_SUCKER_PEER', desc: 'Set a sucker’s cross-chain peer' },
  { id: 35, name: 'SUCKER_SAFETY', desc: 'Emergency token recovery' },
  { id: 36, name: 'SET_SUCKER_DEPRECATION', desc: 'Deprecate sucker' },
  { id: 37, name: 'OPEN_LOAN', desc: 'Open loan against tokens' },
  { id: 38, name: 'REALLOCATE_LOAN', desc: 'Move loan collateral' },
  { id: 39, name: 'REPAY_LOAN', desc: 'Repay loan' },
];
