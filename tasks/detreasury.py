#!/usr/bin/env python3
"""Replace 'treasury'/'treasuries' in the user-facing docs with natural alternatives.
Exact-string map so ASCII-diagram column widths stay aligned (bordered/columnar lines
keep the same total length)."""
import sys

REPL = {
  # --- learn-build.js : prose ---
  'Juicebox is a programmable treasury for the open internet.':
    'Juicebox is a programmable money engine for the open internet.',
  'If the project has money in its treasury beyond what it needs for payouts,':
    'If the project has money beyond what it needs for payouts,',
  'A Juicebox project is like a treasury with programmable rules.':
    'A Juicebox project is like a bank account with programmable rules.',
  'the held fees can be forwarded to the Juicebox protocol treasury':
    "the held fees can be forwarded to the Juicebox protocol's own project",
  "bridge contracts that connect a project's treasuries across chains. When tokens are bridged from one chain to another, the sucker moves a proportional share of the treasury funds to match.":
    "bridge contracts that connect a project's funds across chains. When tokens are bridged from one chain to another, the sucker moves a proportional share of the funds to match.",
  'The rest flows to the project treasury.':
    "The rest flows to the project's funds.",
  'funds flow to the treasury automatically':
    'funds flow to the project automatically',
  'you receive funds from the treasury':
    'you receive funds from the project',
  'fewer tokens sharing the same treasury':
    'fewer tokens sharing the same funds',
  'without losing their treasury, tokens, or history':
    'without losing their funds, tokens, or history',
  'A project payer is a dedicated deposit address for your treasury.':
    'A project payer is a dedicated deposit address for your project.',
  'funds go straight into the treasury without minting tokens':
    "funds go straight into the project's balance without minting tokens",
  'how much value stays in the treasury vs. goes to the redeemer':
    'how much value stays in the project vs. goes to the redeemer',
  '2.5% protocol fee — taken from the reclaimed value by JBMultiTerminal, sent to the Juicebox treasury':
    "2.5% protocol fee — taken from the reclaimed value by JBMultiTerminal, sent to the Juicebox protocol's project",
  # --- learn-build.js : non-bordered diagram / formula lines (length-flexible) ---
  '  surplus = treasury balance - payout commitments':
    '  surplus = project balance - payout commitments',
  '     └─▶ remaining payment → project treasury':
    '     └─▶ remaining payment → project funds',
  '     └─▶ funds sent to you from the treasury (minus fees)':
    '     └─▶ funds sent to you from the project (minus fees)',
  '        └─▶ adds funds to treasury → no tokens minted':
    '        └─▶ adds funds to balance → no tokens minted',
  '  taxRate = 100%  → value stays in treasury (early holders protected)':
    '  taxRate = 100%  → value stays in project (early holders protected)',
  '  • good for: DAOs, treasuries':
    '  • good for: DAOs, collectives',
  # --- learn-build.js : a diagram label line (end-of-line, safe) ---
  '      \'  treasury balance\',':
    '      \'  project balance\',',
  # --- learn-build.js : width-sensitive bordered/columnar lines (keep total length) ---
  # 'holds a treasury'(16) -> 'holds funds     '(16); rest of line identical.
  '  │  holds a treasury ──▶ distributes payouts      │':
    '  │  holds funds      ──▶ distributes payouts      │',
  # second column must stay aligned: 'treasuries'(10)->'collectives'(11), drop one trailing space (7->6).
  '  good for: DAOs, treasuries       good for: protocols, tokens':
    '  good for: DAOs, collectives      good for: protocols, tokens',
  # symmetric, non-bordered: both sides change equally.
  '  Ethereum treasury ◄──── sucker ────► Optimism treasury':
    '  Ethereum funds ◄──── sucker ────► Optimism funds',
  # --- prompts.js ---
  'an open-source, permissionless programmable treasury system deployed on Ethereum':
    'an open-source, permissionless programmable money system deployed on Ethereum',
  'Juicebox V6 is an open-source programmable treasury protocol.':
    'Juicebox V6 is an open-source programmable money protocol.',
  'Juicebox V6 is an open-source programmable treasury.':
    'Juicebox V6 is an open-source programmable money protocol.',
  'a scorecard assigns cash-out weights after the event, and the treasury is distributed proportionally to winning holders':
    'a scorecard assigns cash-out weights after the event, and the pooled funds are distributed proportionally to winning holders',
}

files = ['src/learn-build.js', 'src/prompts.js']
apply = '--apply' in sys.argv
total = 0
for f in files:
    t = open(f).read()
    n = 0
    for old, new in REPL.items():
        c = t.count(old)
        if c:
            t = t.replace(old, new); n += c
    if apply and n:
        open(f, 'w').write(t)
    print(f'{f}: {n} replacements')
    total += n
# report any leftover treasury in these files
import re
for f in files:
    src = open(f).read()
    left = len(re.findall(r'(?i)treasur(y|ies)', src))
    print(f'  leftover in {f}: {left}')
print('TOTAL:', total, '(applied)' if apply else '(dry-run)')
