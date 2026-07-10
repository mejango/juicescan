#!/usr/bin/env python3
"""Remove 'treasury'/'treasuries' from discover.js / create-flow.js / cashout-component.js
(visible strings + dev comments). Exact-string map; handles curly apostrophes."""
import sys, re

REPL = {
  'src/cashout-component.js': {
    'Token holder burns their own tokens to reclaim treasury assets.':
      "Token holder burns their own tokens to reclaim a share of the project's funds.",
  },
  'src/create-flow.js': {
    '// Hover the bonding-curve graph: show a dot + tooltip with "X% cashed out → Y% of treasury" at the cursor.':
      '// Hover the bonding-curve graph: show a dot + tooltip with "X% cashed out → Y% of funds" at the cursor.',
    "'% of treasury'": "'% of funds'",
    '// % of treasury for cashing out 10% of supply': '// % of funds for cashing out 10% of supply',
    '// Accounting token — what the project HOLDS in its treasury. The router terminal (any-token':
      '// Accounting token — what the project HOLDS as its balance. The router terminal (any-token',
  },
  'src/discover.js': {
    # visible strings
    'Cash out (redeem) project tokens for treasury funds on a holder’s behalf.':
      'Cash out (redeem) project tokens for a share of the project’s funds on a holder’s behalf.',
    'None of these functions can move, mint, burn, or freeze an arbitrary project’s tokens or treasury.':
      'None of these functions can move, mint, burn, or freeze an arbitrary project’s tokens or funds.',
    "it’s not the bridged tokens (those move from the project’s treasury).":
      "it’s not the bridged tokens (those move from the project’s funds).",
    "'Could not read treasury.'": "'Could not read balances.'",
    " (protocol treasury)'": " (protocol project)'",
    "project’s treasury). Once it lands, claim your tokens on ":
      "project’s funds). Once it lands, claim your tokens on ",
    # dev comments
    "// borrowableNow = min(capacity, live treasury surplus);":
      "// borrowableNow = min(capacity, live project surplus);",
    "// The project's primary accounting token (what its treasury balance is denominated in). Reads the":
      "// The project's primary accounting token (what its balance is denominated in). Reads the",
    "// One chain's treasury balances across EVERY accounting token the terminal accepts (a project can hold":
      "// One chain's balances across EVERY accounting token the terminal accepts (a project can hold",
    "// Cross-chain treasury breakdown across ALL accounting tokens + a single USD total. ETH converts via the":
      "// Cross-chain balance breakdown across ALL accounting tokens + a single USD total. ETH converts via the",
    "// project's treasury (accounting-token) balances. Shared by the Cash out + Move modals.":
      "// project's (accounting-token) balances. Shared by the Cash out + Move modals.",
    "// cash-outs are off (100% tax) or there's no surplus (payout limit covers the whole treasury).":
      "// cash-outs are off (100% tax) or there's no surplus (payout limit covers the whole balance).",
  },
}

apply = '--apply' in sys.argv
for f, m in REPL.items():
    t = open(f).read(); n = 0
    for old, new in m.items():
        c = t.count(old)
        if c == 0: print(f'  !! NO MATCH in {f}: {old[:60]}')
        t = t.replace(old, new); n += c
    if apply and n: open(f, 'w').write(t)
    left = len(re.findall(r'(?i)treasur(y|ies)', open(f).read() if not apply else t))
    print(f'{f}: {n} replaced, {left} leftover')
print('(applied)' if apply else '(dry-run)')
