#!/usr/bin/env python3
"""Normalize style.css to palette-only colors.
- Strip redundant/off-palette hex fallbacks inside var() (and fix var()s that
  pointed at UNDEFINED names via their fallback: --fg, --accent).
- Convert remaining standalone palette-value hex literals to their var().
- Map genuinely off-palette literals (#fbe9e2, #fff, #000) to palette vars.
- Brand-tint pure-black overlays rgba(0,0,0,a) -> rgba(44,32,24,a) (--c-black).
- Skip the :root palette DEFINITIONS (lines 1-48) — those stay as hex (the source).
- LEAVE: rgba(255,255,255,...) skeleton shimmer (needs a highlight lighter than
  the page bg; no palette color qualifies — single documented exception), and
  rgba()s that already encode brand colors (orange/pink/green/teal/black+alpha).
"""
import re, sys
PATH = '/Users/jango/Documents/jb/v6/evm/website/src/style.css'

# var() with a COLOR fallback -> canonical var (and remap undefined names).
# Non-color fallbacks (--loan-pct, --app-font, --fg-for-font) are NOT listed → untouched.
VAR_FALLBACKS = {
  'var(--c-green, #2e8b57)': 'var(--c-green)',
  'var(--c-orange, #b8602e)': 'var(--c-orange)',
  'var(--c-pink, #c43550)': 'var(--c-pink)',
  'var(--c-black, #2c2018)': 'var(--c-black)',
  'var(--card-bg, #fcd0c2)': 'var(--card-bg)',
  'var(--c-pink-light, #eda3b0)': 'var(--c-pink-light)',
  'var(--muted-2, #7d5a4e)': 'var(--muted-2)',
  'var(--fg, #2c2018)': 'var(--text)',          # --fg undefined → --text (=#2c2018)
  'var(--accent, #1a8a8a)': 'var(--c-teal)',    # --accent undefined → --c-teal
  'var(--pill-bg, rgba(0,0,0,0.04))': 'var(--pill-bg)',
  'var(--pill-border, rgba(0,0,0,0.2))': 'var(--pill-border)',
}
# standalone hex (after fallbacks removed) -> var. Off-palette mapped to nearest neutral.
HEX_TO_VAR = {
  '#fbe9e2': 'var(--card-bg)',   # tooltip text on black → unify with lp-depth-tip
  '#ffffff': 'var(--card-bg)', '#fff': 'var(--card-bg)',
  '#000000': 'var(--c-black)',  '#000': 'var(--c-black)',
  '#2c2018': 'var(--c-black)', '#7d6858': 'var(--c-black-light)',
  '#1a8a8a': 'var(--c-teal)', '#6ec4c4': 'var(--c-teal-light)',
  '#3d7a5a': 'var(--c-green)', '#82b89e': 'var(--c-green-light)',
  '#c43550': 'var(--c-pink)', '#eda3b0': 'var(--c-pink-light)',
  '#b8602e': 'var(--c-orange)', '#cca080': 'var(--c-orange-light)',
  '#f6c9c0': 'var(--bg)', '#fcd0c2': 'var(--card-bg)',
  '#7d5a4e': 'var(--muted-2)', '#a88878': 'var(--muted-3)', '#e8bfae': 'var(--muted-4)',
}
hexword = re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b')

def main():
    lines = open(PATH).read().split('\n')
    changes = []
    for i in range(len(lines)):
        if i < 48:  # :root palette definitions — leave as hex
            continue
        orig = lines[i]
        l = orig
        for a, b in VAR_FALLBACKS.items():
            if a in l: l = l.replace(a, b); changes.append((i+1, 'fallback', a, b))
        # brand-tint pure-black overlays (both spacing styles)
        if 'rgba(0,0,0,' in l: l = l.replace('rgba(0,0,0,', 'rgba(44,32,24,'); changes.append((i+1,'rgba','rgba(0,0,0,','rgba(44,32,24,'))
        if 'rgba(0, 0, 0,' in l: l = l.replace('rgba(0, 0, 0,', 'rgba(44, 32, 24,'); changes.append((i+1,'rgba','rgba(0, 0, 0,','rgba(44, 32, 24,'))
        # standalone hexes -> var (skip shimmer white which is rgba, not hex)
        def repl(m):
            h = m.group(0).lower()
            if len(h) == 4: h = '#'+h[1]*2+h[2]*2+h[3]*2
            if h in HEX_TO_VAR:
                changes.append((i+1,'hex',m.group(0),HEX_TO_VAR[h])); return HEX_TO_VAR[h]
            return m.group(0)
        l = hexword.sub(repl, l)
        lines[i] = l
    out = '\n'.join(lines)
    by = {}
    for _,k,a,b in changes: by[k] = by.get(k,0)+1
    print('Changes:', by, ' total', len(changes))
    # show any remaining non-:root hex/whites for audit
    rem = []
    for i in range(48,len(lines)):
        ls = lines[i].split('/*')[0]
        for m in re.findall(r'#[0-9a-fA-F]{3,8}\b', ls): rem.append((i+1,m))
        for m in re.findall(r'rgba?\(\s*255', ls): rem.append((i+1,'white-rgba'))
    print('Remaining literal colors outside :root:', len(rem))
    for ln,m in rem[:20]: print('  L%d %s' % (ln,m))
    if '--apply' in sys.argv:
        open(PATH,'w').write(out); print('APPLIED')
    else:
        print('(dry-run)')
main()
