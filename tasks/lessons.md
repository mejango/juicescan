# Lessons

- **Preserve raw decimal text and focus through form renders.** A number input rebuilt on every keystroke loses its trailing decimal point and focus. Use a text input with a decimal keyboard, central conversion/validation, and scoped focus/caret restoration when dependent controls require a full render. Prove sequential typing, mid-value edits, native unit clicks and one-click navigation in Chromium; retain existing split locks while custom text is incomplete. (2026-10, kmac88 custom ruleset duration feedback.)

- **Never chain two range-based `sed -i` deletes on one file** — the first edit shifts line numbers, so the second range is wrong and silently clips a neighboring function. Use the Edit tool, or one grep-anchored deletion. Catch: build + `vitest` immediately after a structural delete. (2026-06, removing an orphaned fn in discover.js clipped `infoItem`.)
