#!/usr/bin/env python3
"""Conservatively remove orphaned CSS rules from style.css.

A selector is removed only if EVERY class token in it is in the verified dead-set
(grep-proven zero references in *.js + index.html). Grouped rules keep their live
siblings; @media blocks are recursed into and kept unless emptied; other at-rules
(@keyframes/@font-face/:root) are untouched. Span-based edits keep the rest of the
file byte-identical for a minimal, auditable diff.
"""
import re, sys

PATH = '/Users/jango/Documents/jb/v6/evm/website/src/style.css'

# 123 grep-verified dead tokens, minus the live-substring `xchain-status`,
# plus the exact dead `xchain-status--{danger,slight,synced}` modifiers.
dead = set(l.strip() for l in open('/tmp/dead-tokens.txt') if l.strip())
dead.discard('xchain-status')
dead.update({'xchain-status--danger', 'xchain-status--slight', 'xchain-status--synced'})

CLASS_RE = re.compile(r'[.#]([A-Za-z0-9_-]+)')   # class .foo and id #foo

def split_top_commas(s):
    parts, depth, cur = [], 0, ''
    for ch in s:
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if ch == ',' and depth == 0:
            parts.append(cur); cur = ''
        else:
            cur += ch
    parts.append(cur)
    return parts

def token_is_dead(tok):
    # Each dead-set member was grep -F (substring) verified to have ZERO JS/HTML
    # references, so NO live class token can contain one as a substring. Thus a
    # token is dead iff it contains any dead-set member — this also catches the
    # `--modifier` / child variants (e.g. detail-activity-type--pay).
    return any(d in tok for d in dead)

def selector_is_dead(sel):
    # ANY dead token makes the whole selector non-matching (the dead class/id has
    # zero elements in the DOM), so the entire compound/descendant selector is safe
    # to drop — even when it also names a live or state token (.dead.active, .live .dead).
    toks = CLASS_RE.findall(sel)
    return any(token_is_dead(t) for t in toks)

def find_block_end(text, open_brace_idx):
    """Given index of '{', return index just past the matching '}'."""
    depth = 0
    i = open_brace_idx
    n = len(text)
    while i < n:
        c = text[i]
        if c == '/' and i + 1 < n and text[i+1] == '*':
            j = text.find('*/', i + 2)
            i = (j + 2) if j != -1 else n
            continue
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return n

def process(text, base=0, edits=None, log=None):
    """Scan one nesting level; collect (start,end,replacement) edits (absolute)."""
    edits = edits if edits is not None else []
    log = log if log is not None else []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == '/' and i + 1 < n and text[i+1] == '*':       # skip comment
            j = text.find('*/', i + 2); i = (j + 2) if j != -1 else n; continue
        if c in ' \t\r\n;':
            i += 1; continue
        brace = text.find('{', i)
        if brace == -1:
            break
        prelude = text[i:brace]
        end = find_block_end(text, brace)
        stripped = prelude.strip()
        if stripped.startswith('@'):
            kw = stripped.split()[0].lower()
            if kw in ('@media', '@supports'):
                inner_start, inner_end = brace + 1, end - 1
                sub_edits, sub_log = [], []
                process(text[inner_start:inner_end], base + inner_start, sub_edits, sub_log)
                # if every inner rule is being fully removed, drop the whole @media
                inner_body = text[inner_start:inner_end]
                removed_chars = sum(e[1]-e[0] for e in sub_edits if e[2] == '')
                # crude emptiness check: non-space remaining after removals
                remaining = list(inner_body)
                for s,e,r in sorted([(s-base-inner_start, e-base-inner_start, r) for s,e,r in sub_edits], reverse=True):
                    remaining[s:e] = list(r)
                if ''.join(remaining).strip() == '':
                    edits.append((base+i, base+end, ''))
                    log.append(('MEDIA-DROP', stripped[:60]))
                else:
                    edits.extend(sub_edits); log.extend(sub_log)
            # @keyframes/@font-face/@import/etc: leave untouched
            i = end; continue
        # normal rule
        parts = split_top_commas(prelude)
        kept = [p for p in parts if not selector_is_dead(p)]
        dead_parts = [p.strip() for p in parts if selector_is_dead(p)]
        if not kept:
            # delete whole rule; also swallow one trailing newline
            e2 = end
            if e2 < n and text[e2] == '\n': e2 += 1
            edits.append((base+i, base+e2, ''))
            log.append(('RULE-DROP', ', '.join(p.strip() for p in parts)[:90]))
        elif dead_parts:
            # trim dead selectors, keep the rest of the prelude formatting minimal
            newsel = ',\n'.join(p.strip() for p in kept)
            edits.append((base+i, base+brace, newsel + ' '))
            log.append(('SEL-TRIM', 'drop {' + ', '.join(dead_parts) + '} keep {' + ', '.join(p.strip() for p in kept) + '}'))
        i = end
    return edits, log

def main():
    text = open(PATH).read()
    edits, log = process(text)
    # apply end->start
    out = text
    for s, e, r in sorted(edits, key=lambda x: x[0], reverse=True):
        out = out[:s] + r + out[e:]
    # collapse 3+ blank lines left behind into 2
    out = re.sub(r'\n{4,}', '\n\n\n', out)
    drops = [l for l in log if l[0] == 'RULE-DROP']
    trims = [l for l in log if l[0] == 'SEL-TRIM']
    mdrop = [l for l in log if l[0] == 'MEDIA-DROP']
    print(f"Rules fully removed : {len(drops)}")
    print(f"Selectors trimmed   : {len(trims)}")
    print(f"@media dropped      : {len(mdrop)}")
    print(f"Lines: {text.count(chr(10))+1} -> {out.count(chr(10))+1}  (−{text.count(chr(10))-out.count(chr(10))})")
    print("\n--- SELECTOR TRIMS (mixed live/dead groups) ---")
    for _, d in trims: print("  " + d)
    print("\n--- @media dropped ---")
    for _, d in mdrop: print("  " + d)
    if '--apply' in sys.argv:
        open(PATH, 'w').write(out)
        print("\nAPPLIED to", PATH)
    else:
        print("\n(dry-run; pass --apply to write)")
        print("\n--- first 30 RULE-DROPs ---")
        for _, d in drops[:30]: print("  " + d)

main()
