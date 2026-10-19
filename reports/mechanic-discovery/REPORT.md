# Complete mechanic discovery — Atlas 2.1

Implemented locally on October 18, 2026. No deployment. Manual browser/UI testing is reserved for the user.

The app now offers the existing Find section for **296/296 audited display labels**, adding 288 searches. The separate candidate ledger accounts for **312/312 labels**. There are **no unresolved display mappings**. All 296 runtime recipes have verified native keyword searches; 186 are Production-ready and 110 deliberately remain Review. Review coverage explanations are visible before searching. Every search still requires a user action.

## Recalculated baseline

Computed from the current Atlas 2.0 rows, audited display vocabulary and metadata audit, rather than copied from the handoff. These are historical recipe classifications, not new validation claims:

| Atlas 2.0 relationship | 296 display labels | 312 candidates |
|---|---:|---:|
| At least one exact-label Production-ready recipe | 127 | 127 |
| Exact-label Review, without an exact Production-ready recipe | 106 | 114 |
| Explicit alternate name | 3 | 4 |
| Only a broader/partial recipe | 2 | 6 |
| Missing recipe | 57 | 59 |
| Only Do-not-emit | 1 | 2 |

Atlas 2.0 has 1,086 rows; the prior execution registry had eight entries. The exact missing-label lists and all row IDs are generated into [coverage-ledger.json](coverage-ledger.json). The 57 display labels lacking recipes were: Awaken, Backup, Bargain, Blitz, Boast, Casualty, Cleave, Compleated, Decayed, Demonstrate, Dethrone, Disguise, Disturb, Empower Jace, Encore, Enlist, Escalate, Exhaust, Firebending, For Mirrodin!, Freerunning, Fuse, Gift, Harmonize, Hidden Agenda, Impending, Improvise, Increment, Ingest, Job Select, Living Metal, Max Speed, Mayhem, Melee, Mobilize, More Than Meets the Eye, Myriad, Offspring, Outlast, Paradigm, Power-up, Prototype, Read Ahead, Reconfigure, Recruit, Sneak, Solved, Spree, Station, Storied, Teamwork, Tiered, Training, Tribute, Undaunted, Warp, and Web-slinging. Best in show and Space Sculptor are the additional missing candidates.

## Data and semantics

[Atlas 2.1](../../inputs/atlas_v2.1.json) contains **1,155 rows**: 746 Production-ready, 360 Review, 27 Semantic and 22 Do-not-emit. All 1,086 prior IDs survive; all 22 Do-not-emit rows and every row outside the newly validated recipes retain their contents. Keyword_Index is alphabetical. Each recipe retains the existing 20 fields and type/null conventions. New counts/dates come from captured provider responses; counts include extras and are expressly distinct from Commander result counts. The 623-row validity census is unchanged and explicitly historical. Atlas 2.0 is byte-identical to the supplied source.

[mechanic-discovery.v1.json](../../inputs/mechanic-discovery.v1.json) is the explicit server-owned execution registry. Mappings bind an exact audited label, Atlas row ID, query hash, coverage explanation and validation evidence. The app receives catalog metadata for display but cannot submit replacement queries or identity claims. Rules definitions and the eight historical color placements confer no search permission.

Native searches mean **Scryfall-reported mechanic involvement**. They do not certify possession, a usable action, a particular card face, every grant/reference, or pairing eligibility. For example, a card that creates a token with a mechanic may report that label, while equipment granting an ability can omit it. Known text-only grants/references are used as negative witnesses where appropriate. All runtime fallback fields are null. Old fallback proposals remain historical in Atlas 2.0 and are individually recorded as removed in the ledger; they were not OR-combined with primary queries. Native queries formerly suggested as fallbacks were checked independently as primary recipes.

Specific resolutions:

| Label | Resolution |
|---|---|
| Companion | Dedicated native recipe; not proof of satisfying a companion deck restriction. |
| Devoid | Dedicated native recipe; filtering uses color identity even when the card itself is colorless. |
| Partner | Native provider index includes named and restricted variants. Pir is a positive witness; Adric is a negative. The old generic-Partner recipe is not silently treated as equivalent. |
| Escape / Eternalize | Separate native searches; broader self-recursion recipes do not authorize either search. Underworld Breach and The Scarab God are grant/reference negatives for the reported-label scope. |
| Underdog | New `keyword-index-underdog-reported` Review recipe. Ruff, Underdog Champ is a verified positive in the unrestricted pool with extras. Commander filtering correctly returns zero. The original Do-not-emit row remains inaccessible. |
| Descend 4 / Descend 8 | Separate, anchored Oracle headers, with cross-threshold negative witnesses. They are not aliases for generic Descend. |
| Gear up | Explicitly linked to the full sponsored Gear Up wording on Souvenir T-Shirt. |
| Visit | Anchored Visit ability header, distinct from rolling to visit Attractions. Balloon Stand is positive; “Lifetime” Pass Holder is negative. |
| Gotcha! | Explicit punctuation alternate linked to the Gotcha header recipe, not fuzzy matching. |
| Set in Motion | Separate wording recipe; its old Do-not-emit row also stays intact. |

The last six candidate-only entries above, and the other unobserved candidates, are research recipes rather than runtime label aliases. All 16 non-display candidates have validated Oracle-wording recipes and explicit dispositions. They have not been promoted into the unchanged display vocabulary. Future unfamiliar provider labels remain visible with their contributing imported cards and an explicit unavailable-search explanation; an explicit validated mapping is required to enable them.

## Automated and live verification

[automated-tests.txt](automated-tests.txt) records **219 passing tests, zero failures** in the complete deterministic suite. It covers the 20-field schema, ID preservation/uniqueness, tier consistency, registry tampering, placeholders, all 296 rendered Find actions, all 296 HTTP requests, malformed payloads, unknown and Do-not-emit IDs, and exact-printing Clipboard/export provenance. Each mapping is composed across all 32 identity subsets (**9,472 combinations**). An embedded baseline and alternative branches are checked for grouping and constraint duplication; unexpected filters fail closed.

Actual app handlers are tested with mocked transport/DOM boundaries for mechanic, commander, deck and page changes, stale success/error/finally responses, zero results, page caching, errors and retry. Existing importer, printing-resolution, card viewer, pagination, Clipboard and original eight-search regression tests remain in the full suite. Rendering tests do not claim browser layout validation.

[live-recipes.json](live-recipes.json) records **312/312 passing recipes**, including all 296 runtime mappings. It references **624 captured search responses**, with URL, request/response time, provider Date, status, count, byte length and SHA-256. **901 positive and 673 negative assertions** are checked by Oracle identity, not just card name. The first result page of every native query also supplies **11,679 card/label checks**. Unknown/ignored syntax would admit the negative witnesses and fail these checks; nonzero counts alone are not accepted as evidence.

[witness-plan.json](witness-plan.json) derives the exact witness identities from the pinned, hash-verified Oracle corpus. Duplicate token names are disambiguated. Earlier name-based captures were re-evaluated against Oracle IDs without changing their actual request timestamps or inventing new network checks.

[live-context.json](live-context.json) independently confirms the existence and current metadata of **1,182 exact printing witnesses** through the collection endpoint, then records **21 passing context cases** in 38 captured provider responses. Sixteen cases run through the actual local HTTP server: Flying with WUBRG, white and colorless commanders; a provider-page boundary; Proliferate with WUBRG/colorless; Surveil; Warp; First Strike; Escape; Eternalize; Devoid; Partner; Companion; and Underdog. Five targeted membership cases test fewer-color/colorless inclusion and off-identity/nonlegal exclusion. Current live counts include zero for colorless Devoid and Commander Underdog. Counts are observations, not future invariants.

The supplemental checks use current provider legality. An initial negative fixture assumed Lutri remained banned; the provider reports it legal. The final check uses Treizeci, Sun of Serra, whose nonlegal status was confirmed in the captured data. No application rule or legality override was added.

## Maintenance and reproduction

The workspace's generation scripts and neighboring mechanics/source repositories were inspected. The historical Atlas mentions `src/build.py` and `src/run_verify.py`, but neither Atlas generator was available in the inspected `C:\dev` tree. A deterministic local derivation was therefore added instead of inventing an unavailable spreadsheet pipeline. No spreadsheet export was required.

Run from the repository root:

```powershell
node scripts/build-mechanics-vocabulary.mjs --check
node scripts/build-mechanic-witness-plan.mjs --check
node scripts/build-mechanic-discovery.mjs --check
node scripts/check-mechanics-preservation.mjs
node --test
```

To deliberately refresh provider evidence and regenerate the derived artifacts:

```powershell
node scripts/build-mechanic-witness-plan.mjs
node scripts/verify-mechanic-recipes-live.mjs --refresh
node scripts/build-mechanic-discovery.mjs
node scripts/verify-mechanic-context-live.mjs
node --test
```

Recipe validation is resumable without `--refresh`, skipping current successful checks and verifying retained Oracle-ID evidence when necessary. `--labels=Escape|Eternalize` can target specific recipes (quote the entire argument in PowerShell). Failed requests stop on throttling/server errors; successful responses retain original timestamps. Collection/search traffic is paced at least 550 ms apart by the validation tools. The application does no bulk fetch, count prefetch, or background mechanic searches.

## Manual UI checklist

Restart the local Node server and refresh the page first. Use an ordinary complete 100-card import containing the relevant labels; the examples below are optional witnesses, not a recommended deck.

1. **Flying regression:** select Flying, inspect its rules/history and Find section, search, browse Next/Previous/direct pages, and open a result. Check the original layout and behavior.
2. **Proliferate:** use a contributor such as Adaptive Sporesinger. Confirm Find appears without a historical placement and searching respects the selected commander identity.
3. **Surveil:** use a contributor such as A.I.M. Synthoids. Confirm its rules and Review coverage explanation coexist with Find; inspect a result and its Oracle text.
4. **New recipe:** select Warp, for example from All-Fates Stalker. Confirm a working search even if no rules definition is linked.
5. **Multiword label:** search First Strike (or another imported multiword label). Inspect the query disclosure and page controls. A missing rules/history link must not remove Find.
6. **Zero results:** select only Kozilek, the Great Distortion, and an imported Devoid contributor. Confirm one “No compatible Devoid cards found” heading, the color-versus-identity explanation with a green mana glyph, one Scryfall link, no pagination and no broadened retry. Switch to only Adric, Mathematical Genius: Devoid should return blue-identity matches. Underdog with Ruff is another verified zero-result case; expand “Why imported cards are excluded” to inspect confirmed imported-card exclusions. Check the separate card and commander identity labels: Ruff is White; Adric is Blue. This disclosure applies to any mechanic, using legality and identity metadata. A failed request must show an error, not the Devoid explanation.
7. **Commander/switching:** start a search, then change the commander, mechanic or imported deck. Old results/errors must not replace the new context. Re-search with WUBRG and a narrower identity; compatible fewer-color/colorless cards remain eligible.
8. **Save/export:** save from both the result grid and open card viewer, including twice for one printing. Browse pages and switch mechanics; Clipboard stays independent. Export and verify quantity, set and collector number for every saved printing, with the original deck unchanged.

## Limits, blast radius and confidence

No display-label exceptions remain. The fixed registry does not cover every future provider label. The 16 candidate-only dispositions are intentional and separate from the 296 display mappings. The initial delivery changed no rules/color-pie source data, importer behavior, CSS, deck-building feature or deployment. The Devoid follow-up below adds scoped empty-state styles and provider error validation.

Runtime edits are limited to catalog validation/loading, the query authorization/composition step, query provenance, and the existing mechanic/Find rendering and source notes. Pagination, card viewing, request ownership and Clipboard/export implementations are reused. Additional files are derived data, reproducible validation scripts, tests and reports. Historical input/source fingerprints remain verified; only Atlas 2.1 and its registry are authorized additions to the protected input set.

Confidence is high in current mapping coverage, query security, identity filtering and reuse of the existing product flow. The live tests sample known membership and first-page native metadata, not exhaustive semantic precision/recall across all cards. Only representative commander contexts were checked live; the full 32-color matrix is deterministic testing. Browser layout, manual interactions, future provider changes, and every recipe/page/color combination were not manually or exhaustively live-tested. Scryfall is the same provider for metadata and search, so their agreement is consistency evidence rather than independent rules authority.

## Devoid empty-state follow-up — October 18, 2026

The red-team finding identifies a missing explanation, not an incorrect identity ceiling. Wizards' [Modern Horizons 3 release notes, page 8](https://media.wizards.com/2024/downloads/MH3_Release_Notes_9d01wihakukg/EN_MTGMH3_ReleaseNotes_20240515.pdf) explicitly distinguish Devoid's color change from Commander color identity. The query remains unchanged.

Live Scryfall results at 20:42 UTC, retained in [devoid-live.json](devoid-live.json) with raw response files and SHA-256 hashes:

| Query | Distinct cards | Witness |
| --- | ---: | --- |
| `f:commander id<=c kw:devoid` | 0 | Valid Scryfall `not_found` response |
| `f:commander id<=g kw:devoid` | 22 | Eyeless Watcher: colorless card, green identity |
| `f:commander id<=u kw:devoid` | 34 | Eldrazi Skyspawner: colorless card, blue identity |
| `f:commander c:c kw:devoid` | 132 | Eyeless Watcher remains included |
| `f:commander id<=c` | 2,751 | Thought-Knot Seer: colorless card and identity |

The actual local HTTP import/discovery path also verified selected commander identities: Kozilek → `c` → 0; Goreclaw → `g` → 22; Adric → `u` → 34; Kenrith → `wubrg` → 132. This checks provider-resolved identities and server-composed queries, not a caller-supplied identity. Reproduce with `node scripts/verify-devoid-discovery-live.mjs`; counts are a dated observation, not a runtime assumption.

The Devoid explanation requires a completed result with zero total cards and an explicit empty server identity array. It gives Eyeless Watcher as the concrete example and links the unchanged provider query. The empty message spans the result grid so its paragraphs are readable. Other mechanics, unknown identities and nonzero totals with filtered-out cards retain their normal behavior.

Search HTTP 404 handling now requires Scryfall's structured `object: error`, `code: not_found` response on the first provider page. Unreadable/malformed 404s, query errors, network failures, and missing later pages surface as errors. A failed next-page request preserves the previous page. No retry or identity broadening was added.

All 225 tests passed, including six new provider/DOM regression tests; output is in [devoid-automated-tests.txt](devoid-automated-tests.txt). These exercise the actual request handler and renderer without claiming browser layout verification. Registry regeneration and the 250-file historical preservation check also passed.

### Empty-state presentation refinement

User screenshots exposed duplicated Find panels, repeated Review prose and Scryfall links, and a literal mana token. The results no longer repeat the Find panel or its coverage explanation. Review coverage occurs once in the initial disclosure, with its Review status visible in the summary. A single empty-result heading replaces the extra “No matching cards” line; the explanation is followed by a compact exact-query disclosure and one Scryfall link. Positive results use the same compact query controls.

Devoid's explanation is shorter and renders the green mana symbol through the existing accessible `manaSymbols` helper. Following the user's clarification, Underdog has no hardcoded branch: every mechanic uses the same explanation and optional imported-card exclusion disclosure. Confirmed banned/not-legal statuses and out-of-identity cards are explained, including both reasons where applicable. Contributors are deduplicated by Oracle identity; sideboard, unresolved and unrelated cards are excluded from this diagnostic. Missing metadata never becomes an invented diagnosis. The empty message is a status region containing a semantic heading. No provider, identity, pagination or retry behavior changed in this refinement.

Symbol rendering now also covers search coverage, general mechanic explanations, historical placement prose, official rule panels and their previews. The existing renderer supports mana costs, hybrid/Phyrexian costs and game symbols; `{H}` and `{PW}` now use their verified local glyphs. Unrecognized tokens and symbolic rule placeholders retain readable source notation. Source text and query code are not rewritten.

All 232 tests pass, including zero states for all 296 mappings, missing/partial/multiple imported exclusions, symbol font readiness, supported glyphs and rule cross-reference preservation; see [empty-state-automated-tests.txt](empty-state-automated-tests.txt). Actual browser checks on port 4173 used a separate 100-card test import, selected Kozilek alone for Devoid and Adric alone for Underdog, and confirmed the exact queries, single result links and rendered green glyph. Screenshots: [Devoid](devoid-empty-state.png), [Underdog](underdog-empty-state.png). These client files are served immediately; the existing server stays running on port 4173.

### Empty-state visual polish and identity labels

The empty result now uses a tinted panel, a short explanation, and separators around its optional diagnostic and query controls. The printing/save introduction is hidden when there are zero results. A server-confirmed commander identity appears at the top, with both its symbol and color name. Excluded cards show separately labeled Card identity and Commander identity values, so Ruff's White identity cannot be mistaken for Adric's Blue identity. The Devoid explanation is shorter; inline glyph wrappers use centered flex alignment to avoid the nested baseline offset.

All 69 targeted UI, exclusion, symbol and state tests passed; see [empty-state-polish-tests.txt](empty-state-polish-tests.txt). The tests include all 296 mechanic empty states and verify the distinction between Ruff's White identity and the response's Blue commander identity. Browser checks on port 4173 confirmed Adric's Underdog query remains `id<=u`, and Kozilek's Devoid query remains `id<=c`. The expanded diagnostics were visually inspected in both cases: [Underdog](underdog-empty-polished.png), [Devoid](devoid-empty-polished.png). No server restart was needed for these client-only changes.

### Full-suite verification across mechanics

Following the visual polish, the complete suite passed **234 tests, zero failures or skips**; see [full-suite-polish-tests.txt](full-suite-polish-tests.txt). The initial 232-test suite passed before extending the regression coverage. Only tests and this report changed during this verification; no runtime fix was needed.

The actual UI renderer now runs through **all 296 mapped mechanics × all 32 commander color identities (9,472 cases)**. Each case checks the identity label, color names, accessible glyph labels, loaded glyphs and hidden fallbacks, one empty-state heading, unchanged exact query/link, hidden pagination, and absence of invented imported-card exclusions. Devoid's special explanation is restricted to its colorless case. This complements the existing query-composition matrix and HTTP checks for every approved mapping.

Every mechanic also exercises synthetic imported contributors with legality-only, identity-only, combined and unknown exclusions; compatible colored/colorless cards; duplicate printings; and unrelated, sideboard or unresolved entries. Card and commander identities stay distinct, changing to five colors removes color exclusions, missing identity is labeled Unknown, and the imported deck remains unchanged. All mechanics also exercise transitions from zero to a filtered-out page and then positive results, network/query/malformed-404 failures, and failed pagination retaining its prior page.

Vocabulary, witness-plan and discovery-registry reproducibility checks passed, and all 250 historical protected files remained unchanged. The full suite includes symbol support/font fallback checks, request ownership, imports, pagination, Clipboard/export, server boundaries and validation of retained live Scryfall receipts. This run uses deterministic provider fixtures and existing receipts; it does not claim a fresh live provider search or browser layout inspection for every mechanic/identity combination.

### Fresh live audit of all 296 mechanics

**PASS: 296/296 mechanics and 2,072/2,072 application searches**, checked against fresh Scryfall responses from **2026-10-18 21:28–21:51 UTC**. See the [live summary and request receipts](live-all-mechanics/2026-10-18T21-28-25-548Z/summary.json) and [membership verification](live-all-mechanics/2026-10-18T21-28-25-548Z/identity-membership.json). Raw response bodies are retained with SHA-256 hashes, request URLs, timestamps and provider status codes. The run made 2,405 provider requests, including commander resolution, witness checks and corrected audit reruns.

Every mechanic ran through the actual local `/api/resolve` and `/api/discover` contract using seven provider-resolved commanders. The regular server on port 4173 was left running; the verifier used a separate temporary loopback server.

| Commander identity | Commander | Searches with matches | Successful zero results |
| --- | --- | ---: | ---: |
| Colorless | Kozilek, the Great Distortion | 115 | 181 |
| White | Isamaru, Hound of Konda | 242 | 54 |
| Blue | Adric, Mathematical Genius | 234 | 62 |
| Black | Ayara, First of Locthwain | 244 | 52 |
| Red | Krenko, Mob Boss | 246 | 50 |
| Green | Goreclaw, Terror of Qal Sisma | 239 | 57 |
| Five colors | Kenrith, the Returned King | 293 | 3 |
| **Total** | | **1,613** | **459** |

All 459 zero results had a structured Scryfall `not_found` response and an empty application result without pagination. Of these, 438 arose under narrower identities despite a positive five-color search. Frenzy, Hidden Agenda and Underdog had no Commander-legal keyword-index matches in any tested identity; their unrestricted witness searches still succeeded. Devoid returned 132 across all colors, 34 within blue, 22 within green and zero for colorless. These counts are observations at the recorded time, not permanent expectations.

Checks covered exact server-composed identity ceilings and query links, Commander legality, reported keyword membership, printing preference, pagination metadata and agreement between raw provider cards and displayed application cards. The audit inspected 29,743 raw provider card appearances and 15,391 application card appearances; these are not counts of distinct cards across searches. Fresh unrestricted searches passed all 1,528 positive/negative witness assertions by Oracle identity.

For **272 mechanics**, the complete five-color pool fit in the captured provider page, permitting **1,904 exact set-and-count comparisons** across the seven identities. Overall, 2,025 result sets were complete. Larger pools used bounded first-page checks, including 23,824 inclusion and 54,338 exclusion assertions across the captured pools; complete narrowed results also passed 6,019 fresh witness eligibility assertions. All receipt hashes verified.

The first audit incorrectly treated missing top-level Oracle IDs as a shared duplicate identity. Reversible printings exposed this in Crew, Haste and Partner. The verifier now uses an explicit name fallback, consistent with the application's existing handling. All three mechanics were rerun live and passed; original flagged attempts remain in `priorAttempts` alongside their receipts. No application fix was needed, and all 250 protected historical files remained unchanged.

This live audit covers **seven identity contexts**, not all 32 subsets, and the first application/provider page rather than every page of large searches. The existing deterministic suite covers all 32 subsets. It verifies consistency with Scryfall's current keyword index and legality data, not an independent rules interpretation or a complete Commander deck legality check.

Reproduce a fresh run and verify its captured evidence:

```powershell
node scripts/verify-all-mechanics-live.mjs
node scripts/verify-all-mechanics-receipts.mjs reports/mechanic-discovery/live-all-mechanics/<run-directory>
```

Runs are paced at least 550 ms apart and stop on transport failures, HTTP 429 or server errors without automatic retry. An explicitly resumed interrupted/failed run preserves previous attempts. Successful completed runs are immutable; a new invocation without `--resume` creates a new evidence directory.
