# Bounded importer implementation — October 18, 2026

Implemented in `C:\dev\mtg-deck-explorer`, retaining the ES-module architecture, dependency-free run path and existing visual design. No applicable `AGENTS.md` was found in the repository or its parent directories. The three prior investigation reports and the pack's START_HERE/AUDIT/manifest were read as evidence. No package installation, build system, deployment, collection manager or legality engine was added.

## Changes

- Added explicit CSV column adapters for TappedOut and the supplied Helvault-compatible schema. Board/Commander and snake_case printing fields now affect the canonical row model. All original text, row order, quantities, annotations and CSV metadata remain available. Unknown meaning-bearing columns, duplicate semantic columns and conflicting role/finish values are flagged. `Foil=pre` is preserved with an unspecified-finish warning, without inventing a physical finish.
- Added name-plus-set identifiers across parser, keys, API validation, collection requests, alias fallback, resolution and provenance. Recognized hints constrain matches. Unrecognized source codes remain visible with warnings and an Assumed name reference; no code mappings are invented. Known but unmatched hints remain unresolved. Exact supplied UUIDs/coordinates never fall back to a name lookup.
- Draft edits and file actions invalidate pending import ownership. Older successes, failures and cleanup cannot commit or change the current draft's UI. File reads also have ownership protection. Busy controls recover when the draft changes.
- Commander search includes source aliases and canonical/printed/flavor names with shared normalization. Designation still comes only from source roles, explicit placement confirmation or user selection. Pair eligibility remains unverified.
- Required deck rows resolve before optional extras. Extra provider/alias failures are disclosed without rejecting a fully resolved deck. Main rows and their discovery context stay pinned when extras finish. If required rows fail, extras are explicitly deferred instead of falsely reported as provider misses.
- Added an accessible native TXT/CSV picker and a drop target with the picker as its keyboard alternative. Both populate the existing paste preview and use the existing Import action. Preview shows format, entries, deck quantity, extras and commander flags. File contents are read locally; no provider call is made until Import.
- Shared collector validation; early 500-row, 8,000-character record, 64-column and 64-text-metadata-marker bounds; unchanged 200,000-character overall limit. Files are checked against 800,000 bytes before reading, then the character limit applies after decoding.
- Preserved sequential requests, 75-item batches, deduplication, timeouts, 120 ms collection spacing, 500 ms search spacing and strict outbound operations. Added a 32-operation budget per resolve phase and a 16 MiB serialized-data cache budget alongside the existing 64-entry/five-minute cap. Retry-After now honors multi-hour numeric and HTTP-date waits in full, without scheduling automatic retries.

The Archive/Mechanics presentation and their computation remain unchanged. Reference-printing correction retains other rows' unknown-set provenance and still verifies the selected card's Oracle identity.

## Deterministic verification

Baseline: **179/179 passed**. Final `node --test`: **205/205 passed, zero failed/skipped/cancelled**. Local HTTP tests required the permitted localhost execution path. See [baseline output](bounded-baseline-tests.txt) and [final output](bounded-tests.txt).

Coverage includes all five existing exports, all eight native TappedOut TXT/CSV pairs, the derived Spanish excerpt, actual app handlers, synthetic provider failures, stale import/file completions, alias search, stable main editions and discovery context across extras, exact-ID no-fallback behavior, fixture hashes, full two-hour waits under a simulated clock, and operation/cache/input limits. Three old assertions were updated because a name with a set hint is now supported.

All 18 copied pack files match their original bytes and recorded hashes. [Fixture provenance](../../tests/fixtures/imports/uncommon/provenance.json) distinguishes native exports, the derived collection excerpt and retained provider data. The native Spanish row has the English source name Breeding Pool, UUID `5a6ff93c-b08e-4cf0-bcd3-d58435fc2dac`, language `es`, and unspecified finish. Its resolver succeeds; its one-card count correctly fails deck construction. The translated-name variant in tests is explicitly synthetic.

All seven positive CSVs preserve two commanders plus 98 other main cards. The negative CSV preserves three flags plus 97 other main cards and is blocked before provider work. Sideboard Jegantha remains Sideboard; the ordinary main-deck Background remains Deck. None of the eight TXT files gains an invented commander designation.

[Offline timing evidence](bounded-performance.json): the 80,010-character / 20,000-tag attack was rejected in approximately **0.10 ms** on this run. Normal fixture parser p95 values were **0.77–1.04 ms**. These are local parser measurements, not browser/network timings or production load tests.

## Live Scryfall verification

Used the updated local server on **127.0.0.1:4175**. [Structured live evidence](bounded-live.json) records 15 cases, separating original exports, native pack exports, the derived excerpt and a synthetic diagnostic. [Export-run output](bounded-live-output.txt) and [remaining-diagnostic output](bounded-live-diagnostic-output.txt) are retained.

- All five original exports resolve with no problematic entries; Hakbal and Veyran are automatically designated, and both Obeka exports work after explicit confirmation.
- Five of the seven structurally positive CSVs fully resolve their required deck rows. Live discovery succeeds with the preserved required-deck context and expected color union for each. Wilson's MYSTOR extra resolves with an unknown-set warning.
- Two structurally positive CSVs correctly remain blocked by unmatched recognized source hints: **Rhystic Study / CMA** in Thrasios/Tymna; **Bloodspore Thrinax / CM1, Mycoloth / CM1, Sol Ring / CM1** in Pir/Toothy. These are observed provider results for the supplied source combinations, not parser failures or claims about overall deck legality. No replacement set or missing card was invented.
- Live resolver checks preserve the Spanish printing and language. Live synthetic diagnostics verify Godzilla → Zilortha, recognized RNA hints, unknown 000/MYSTOR/UN3/MBP warnings and a missing optional extra without losing resolved main rows.
- The final diagnostic encountered a real **429 / Retry-After: 60**. The app displayed the wait, sent no automatic retry and preserved the loaded state. Only the remaining diagnostic was explicitly retried after the full interval; it passed. Two-hour behavior is tested offline with an injected clock, not by waiting two real hours.

## Browser verification

Used one isolated in-app browser tab. The user's existing 4174 server and browser session were left untouched. The final tab is reset to the empty updated importer on 4175.

[Browser observations](bounded-browser.json) verify the actual native file chooser and local preview, two designated commanders, Obeka confirmation, a pending Hakbal import edited to Veyran with the loaded Obeka deck preserved, Godzilla alias search, visible unknown-set/extra diagnostics, negative-import preservation, and live Assumed/Supplied/User-selected labels. Changing RNA Forest to an explicitly selected MDD printing leaves the other RNA/unknown-source row pinned. No console warnings/errors were captured in the final check.

Screenshots: [file preview](bounded-file-preview.png), [two commanders](bounded-commanders.png), [stale draft preserved](bounded-stale-draft.png), [alias search](bounded-alias-search.png), [supplied labels](bounded-supplied-printings.png). Browser diagnostic text that uses repeated basic lands is synthetic and does not assert complete legality. Drag-and-drop is exercised through the actual DOM handler with synthetic file/drop events in the regression suite; native OS file dragging and screen-reader operation were not separately replayed.

## Remaining boundaries and running servers

The 100-card construction check is unchanged; 500 entries is a separate resource limit. Commander pairing, singleton/color legality, complete exporter coverage and collection management remain outside scope. Non-English name-only inputs still require an exact printing UUID. Unsupported nonempty Helvault Extras values require correction. Source set hints that cannot be verified remain warnings or unresolved rows as described above.

The cache's 16 MiB limit measures serialized responses; JavaScript objects, clones, in-flight responses and application state add memory overhead. Rate limits, contexts and quotas are process-local. Public hosting would require separate authentication, cross-process quota decisions, sustained-abuse/load testing and operational memory sizing. This work is not a security certification, a zero-vulnerability claim or production-scale readiness evidence.

At the end of the implementation run, the updated verification server was on 4175 and the original 4174 process was untouched. On the user's subsequent restart request, **4174 was restarted with the updated modules and verified**, and **4175 was stopped**. The original browser tab (ID 1) was retained and moved to [127.0.0.1:4174](http://127.0.0.1:4174/); its latest empty draft was preserved. A separate temporary verification tab was closed after a successful live CSV import with two designated commanders, 100 deck cards, a separate extra and honored set-hint labels. Five served files matched disk exactly, the catalog API returned 200, and 4174 returned 200 after confirming no listener remained on 4175. See [restart evidence](restart-4174.json) and [live browser screenshot](restart-4174.png). Current process/log files are `app-4174.pid` and `app-4174*.log`; `bounded-server.pid` records the stopped historical verification process.

Implementation snapshots and a reviewable diff are retained in [bounded-before](bounded-before/), [change hashes](bounded-changes.json) and [candidate diff](bounded-candidate.diff). This workspace has no Git repository, so no commit or PR was created.
