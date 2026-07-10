#!/usr/bin/env python3
"""Dedup the 6 byte-identical ruleset utilities: export them from launch-component, remove queue's copies,
and import them in queue. The 2 functions that DIFFER (createDefaultRuleset, renderRulesetFieldset) stay
local to queue. Verified byte-identical by tasks (see transcript) before running."""
import re, sys
SRC='/Users/jango/Documents/jb/v6/evm/website/src/'
SHARED=['buildSplitGroups','buildFundAccessLimitGroups','getDurationSeconds','createDefaultFundAccessLimitGroup','percentSlider','configRow']
# (buildSplitGroups/buildFundAccessLimitGroups/getDurationSeconds already exported by launch)
TO_EXPORT=['createDefaultFundAccessLimitGroup','percentSlider','configRow']

def func_range(lines, name):
    start=None
    for i,l in enumerate(lines):
        if re.match(r'^(export )?function '+re.escape(name)+r'\b', l): start=i; break
    if start is None: return None
    depth=0
    for i in range(start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if i>start and depth<=0: return (start, i)
    return None

apply='--apply' in sys.argv

# 1) launch: add export to the 3 un-exported shared funcs
lp=SRC+'launch-component.js'; lt=open(lp).read()
for n in TO_EXPORT:
    lt2=re.sub(r'(?m)^function '+re.escape(n)+r'\b', 'export function '+n, lt, count=1)
    if lt2==lt: print('WARN: could not export', n)
    lt=lt2

# 2) queue: remove the 6 local copies (delete by line range, end->start)
qp=SRC+'queue-ruleset-component.js'; ql=open(qp).read().split('\n')
ranges=[]
for n in SHARED:
    r=func_range(ql, n)
    if r is None: print('WARN: not found in queue:', n)
    else: ranges.append((r,n))
removed_lines=0
for (s,e),n in sorted(ranges, key=lambda x:-x[0][0]):
    # also swallow a single trailing blank line for tidiness
    end=e
    if end+1<len(ql) and ql[end+1].strip()=='': end+=1
    print(f'  remove queue {n}: lines {s+1}-{e+1} ({e-s+1} lines)')
    removed_lines += (end-s+1)
    del ql[s:end+1]
qt='\n'.join(ql)

# 3) queue: add import of the 6 from launch (append to the launch-component import if any, else add)
imp='import { '+', '.join(SHARED)+' } from \'./launch-component.js\';'
if "from './launch-component.js'" in qt:
    qt=re.sub(r"(import \{[^}]*\} from '\./launch-component\.js';)", r"\1\n"+imp, qt, count=1)
else:
    # add after the component-base import
    qt=qt.replace("} from './component-base.js';", "} from './component-base.js';\n"+imp, 1)

print(f'\nlaunch: exported {len(TO_EXPORT)} funcs | queue: removed {removed_lines} lines, added import of {len(SHARED)}')
if apply:
    open(lp,'w').write(lt); open(qp,'w').write(qt); print('APPLIED')
else:
    print('(dry-run)')
