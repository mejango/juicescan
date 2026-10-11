# Lessons

- **Preserve raw decimal text and focus through form renders.** A number input rebuilt on every keystroke loses its trailing decimal point and focus. Use a text input with a decimal keyboard, central conversion/validation, and scoped focus/caret restoration when dependent controls require a full render. Prove sequential typing, mid-value edits, native unit clicks and one-click navigation in Chromium; retain existing split locks while custom text is incomplete. (2026-10, kmac88 custom ruleset duration feedback.)

- **Never chain two range-based `sed -i` deletes on one file** — the first edit shifts line numbers, so the second range is wrong and silently clips a neighboring function. Use the Edit tool, or one grep-anchored deletion. Catch: build + `vitest` immediately after a structural delete. (2026-06, removing an orphaned fn in discover.js clipped `infoItem`.)

- **Validate API numeric fields against their display domain.** Safe integers can still exceed ECMAScript Date bounds; reject unsupported timestamps before pagination state changes. Preserve tiny positive chart densities rather than imposing a visual floor, and explicitly label missing stake/recipient attribution. Receipt count coherence and partial-record rendering are enforced by the Entries parser/render regressions. (2026-10-11, Defifa Entries review.)

- **Keep market copy plain and keep audit identity in audit details.** Do not use middot separators in visible copy; native ranges captions stay concise, without snapshot blocks. Remove redundant header glossary links rather than adding presentation switches. Native-caption and visible-copy regressions enforce this preference. (2026-10-11, user presentation correction.)

- **Protocol identity is not application identity.** A verified Defifa hook supplies tier names, per-tier prices, supply and lifecycle state; it does not prove Metalog numeric ranges or justify Metalog navigation. Keep generic NFT displays free of curve information and API clients. Mixed-price/nonnumeric-name and consumer-independence regressions enforce this boundary. (2026-10-11, user scope correction.)
