# Lessons

- **Never chain two range-based `sed -i` deletes on one file** — the first edit shifts line numbers, so the second range is wrong and silently clips a neighboring function. Use the Edit tool, or one grep-anchored deletion. Catch: build + `vitest` immediately after a structural delete. (2026-06, removing an orphaned fn in discover.js clipped `infoItem`.)
