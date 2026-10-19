# Dynamic mechanics, clear card evidence, and stale search fixes

Date: October 17, 2026  
Status: Revised implementation plan. The application has not been changed for this work.

The mechanic list must describe the deck that was imported. Selecting a mechanic should immediately help a player recognize the relevant cards, understand why they match, and deliberately search for additions. An older search must never replace the player's current selection or results.

## 1. Scope and preserved behavior

Deliver three changes together:

1. A deck-derived mechanic index and list, independent of the current eight-entry catalog.
2. Clear, visual card evidence, including a bounded set of tested granted-ability recognizers.
3. Request ownership that prevents stale imports, searches, and page responses from changing current state.

Preserve:

- Exact imported printings, quantities, source lines, sections, and flavor text. Use current Oracle text for mechanical evidence. Never substitute a newer printing in the imported deck.
- The separate, manually managed Discovery Clipboard. Importing, browsing, or selecting mechanics never adds cards to it or modifies the deck.
- The existing typography, palette, compact layouts, dark rounded dialogs, Mana/Keyrune symbols, and responsive navigation.
- Hover/focus previews, click/tap detail dialogs, face switching, Escape, and focus restoration. Essential information remains accessible without hovering.
- Discovery's `id<=` color-identity ceiling, Commander-legality filtering, `unique=cards`, `prefer:newest`, 24-card pages, and access to all result pages.
- Save below discovery images and Save inside discovery detail dialogs; saving keeps the viewer open and updates the saved quantity.
- Clipboard search, 12-printing pages, quantity editing, and export of every collected printing regardless of the visible page or filter.
- Frozen source files in `inputs/`, `fixtures/`, and `references/`. Add derived mappings outside the frozen source layer.

Before UI implementation, read the complete [personal standards package](C:/WIP/Website_Design_Interaction_Standard_2026-10-16/README.md) and visually inspect all seven non-Art-Trail PNGs in `C:\dev\mtg-deck-explorer\references`. Compare the affected states against the current application; this work is not a redesign.

Out of scope: automatic strategic-theme inference, a universal Oracle-language parser, relevance or deck-strength scores, new imported-category views, arbitrary mechanic browsing, new discovery filters, light/dark mode, deployment, and changes to deck legality policy. Imported role tags remain preserved but are not promoted to verified mechanics.

## 2. Verified baseline and current defect

| Deck | Entries | Physical copies | Printing identifiers | Commander |
|---|---:|---:|---:|---|
| `C:\Users\obake\Downloads\carelf.txt` | 64 | 100 | 64 | Dionus, Elvish Archdruid |
| `C:\dev\mtg-deck-explorer\fixtures\cosmicspiderman.txt` | 84 | 100 | 84 | Cosmic Spider-Man |

The current [sidebar renderer](C:/dev/mtg-deck-explorer/public/app.mjs:261) displays every catalog entry. The [detector](C:/dev/mtg-deck-explorer/public/core.mjs:295) checks only catalog-listed keyword abilities. [Catalog validation](C:/dev/mtg-deck-explorer/lib/catalog.mjs:74) requires exactly eight mappings. Filtering the sidebar alone would therefore leave valid mechanics undiscovered.

The importer already retains returned keywords, Oracle text, faces, and printing identities. The approved live check resolved all 64 `carelf.txt` entries and reported this baseline:

| Reported label | Distinct cards | Reported label | Distinct cards |
|---|---:|---|---:|
| Crew | 16 | Flying | 9 |
| Mill | 4 | Station | 3 |
| Trample | 3 | Adapt | 2 |
| Equip | 2 | Vigilance | 2 |
| Evolve | 1 | Eternity Gate | 1 |
| Food | 1 | Indestructible | 1 |
| Menace | 1 | Proliferate | 1 |
| Ward | 1 | | |

These are **reported-keyword counts**, not the expected final counts after enrichment. Gaea's Gift, for example, can add Trample evidence beyond the three reported matches. A card found through both channels must still count once.

Provider keywords do not prove inherent possession or a specific face. Lightning Greaves reports Equip while granting haste and shroud in Oracle text; Swiftfoot Boots grants hexproof and haste; Gaea's Gift reports no keywords while granting reach, trample, hexproof, and indestructible.

## 3. Player interaction

The intended flow is:

**Import a deck → choose a mechanic → recognize the matching cards → inspect evidence/rules → deliberately search → save a discovery.**

- On a different imported deck, show a compact overview and the deck-derived list. Do not automatically present the most frequent mechanic as the deck's main strategy.
- Keep the user's selection during normal browsing of the same deck. A changed import begins a new overview; commander-only changes retain the mechanic selection when valid.
- Use one primary mechanic selector. Any retained summary or shortcut must use the same index and selection state, not a second catalog-driven list.
- Sort the list alphabetically for predictable navigation. Display matching-card counts; do not use historical color placement as an indicator that a mechanic exists in the deck.
- Never include an absent mechanic solely because rules or a search recipe exist for it.
- Selecting a mechanic immediately presents the relevant card pictures with nearby rules. Long rules can expand within the established layout; they must not push all cards out of view. Retain cross-reference previews without adding a duplicate popup for rules already visible.
- Use relationship-neutral headings such as **Cards involving Haste** when results can include grantors. Display a stronger relationship only when supported, such as **Grants haste** or **Creates Food**.
- Preserve every observed label in the index. Standard abilities/actions form the main list; token concepts and unmapped or card-specific labels remain reachable in a clearly labeled secondary group. Do not label Food or Eternity Gate as a formal keyword ability merely because the provider reports them.
- Missing rules or a search recipe affects that optional feature only. The matching cards and their actual text stay available.

## 4. Deck-derived evidence model

Build one immutable evidence index after resolving the imported deck. It must work before catalog/rules enrichment arrives and remain usable if those optional sources fail.

For each canonical mechanic identity, retain:

- Display name and optional reviewed classification.
- Reported-keyword evidence and separately identified grant evidence.
- Supporting gameplay-card identities, imported row references, exact printing IDs, quantities, and faces.
- Exact Oracle excerpts and their locations when a recognizer supplies them.
- Independently optional rules references, historical color placement, and validated discovery recipe.

Mechanic identity must not depend on an Atlas row ID. Use reviewed aliases for known terms and stable, collision-safe identities for unmapped labels; do not fuzzy-merge unrelated mechanics.

Counting and scope:

- Count distinct gameplay cards by Oracle ID, falling back to normalized complete card name when needed.
- Preserve all imported printing records beneath that count. A representative thumbnail must be an imported printing, with other imported editions accessible.
- Repeated copies, multiple matching faces, and multiple evidence channels do not inflate the distinct-card total.
- Only resolved Commander/Deck entries contribute evidence, consistent with existing analysis. Sideboard/Considering entries remain excluded.
- Imported off-identity or nonlegal cards remain evidence; they are not silently removed because discovery has stricter filters.
- Unresolved entries are unknown. Say that results are based on the resolved portion instead of asserting that the entire deck lacks a mechanic.
- If no evidence is available, show an honest empty state. Do not fall back to the static catalog or synthetic demo data.

## 5. Bounded grant recognition and clear evidence

Implement deterministic recognizers for explicitly supported Oracle constructions, retaining the exact sentence and any condition. This is a reviewed recognition layer, not general language understanding.

Initial required positive cases:

| Card | Required evidence |
|---|---|
| Lightning Greaves | Equip remains reported evidence; haste and shroud are supported grants. |
| Swiftfoot Boots | Equip remains reported evidence; hexproof and haste are supported grants. |
| Gaea's Gift | Preserve the whole list: reach, trample, hexproof, and indestructible; retain its duration. |
| A conditional-grant fixture | Preserve the condition in the excerpt; never describe the ability as unconditional. |
| A card both using and granting an ability | Keep both supported relationships while counting one card. |

Required negative cases:

- Reminder text mentioning reach does not establish that the card provides Reach.
- “Destroy target creature with flying” does not establish possession or a grant of Flying.
- “This creature loses flying” and “Creatures can't gain flying” are not grants.
- Rules quotes, targets, and incidental mentions do not enter the same count as confirmed grant evidence.

Do not infer a face from card-level keywords. When exact face text supports a match, show that face first and preserve flip controls. Otherwise preserve card-level evidence and allow inspection of all actual faces without guessing.

Unknown or unmatched language remains inspectable on the card. The UI must not claim to have found every possible way the deck can produce an ability.

## 6. Rules and discovery enrichment

Use the existing local rules index and a derived, versioned mapping registry. Classification, rules, historical placement, and search support must be independent capabilities.

- Crew and other standardized mechanics with reviewed production-ready Atlas recipes can become searchable without extending a hardcoded eight-item UI list.
- Station keeps its available official rules and matching cards even though the frozen Atlas lacks its row. A new application-owned recipe requires separate verification and documentation; do not borrow an unrelated row.
- Food can use its verified token rule. Eternity Gate should lead to its card text rather than a fabricated universal rule.
- Preserve Atlas tier distinctions. Review-tier recipes require conscious review and clear scope; Do-not-emit entries remain blocked.
- Validate complete stored recipes on the server, including legitimate quoted multiword or hyphenated keywords. Do not interpolate arbitrary client labels into executable queries.
- Explain search coverage in plain language. A keyword search must not promise to find all cards that grant that ability. A dedicated grant-effect search is outside this change unless separately scoped and verified.
- Search only when the player requests it. Do not fetch results or counts for every observed mechanic.

Keep the current identity boundary, printing preference, page size, pagination, legality postfilter, and separate Clipboard behavior unchanged.

## 7. Stale import and search protection

Correctness must come from request ownership, not from assuming abort always stops a response.

Give each import/search a monotonically increasing request ID and a captured context. Discovery context includes deck revision, server import-context token, commander selection/identity, canonical mechanic, recipe identity, and requested page.

Only the current owner may change results, errors, loading indicators, navigation, scroll, focus, or current page state. Apply this check to success, failure, and `finally` handling. An older request with the same query also loses ownership when a newer request starts.

| Event | Required transition |
|---|---|
| Import starts | Invalidate discovery ownership; clear stale discovery presentation; mark the retained deck as being replaced; disable commander editing and discovery until resolution finishes. |
| Import succeeds | Atomically commit the new deck, commander context, index, and overview. Never carry old positional row IDs into the replacement deck. |
| Import fails | Show the failure and restore the previous deck's usable state if one exists. Reuse a prior server context only if it remains valid. Do not present partial replacement state as a successful import. |
| Mechanic changes | Invalidate the active search/page request and clear the prior mechanic's result presentation. Show the new local evidence immediately. |
| Commander changes | Keep deck evidence unchanged; invalidate discovery context and results. |
| Page changes | Associate the page request with its full context and request ID. Reuse only correctly scoped cached data. |
| An old response settles | Ignore its UI effects, including errors, busy-state cleanup, focus, and navigation. |
| The player navigates elsewhere | A completed search must not pull them back or steal focus. Keep any valid result associated with its original context. |

Use AbortController where useful to reduce unnecessary work, while retaining guards for unabortable or already-completed requests. Keep request caches separated by the effective query/context. Do not mix cached pages whose provider totals have changed.

## 8. Network and performance budget

| Activity | Expected provider work |
|---|---|
| Resolve `carelf.txt` | One collection batch for 64 unique printings, unless cached. |
| Resolve the Spider-Man deck | Two collection batches for 84 unique printings, unless cached. |
| Build/rebuild the mechanic index | Zero additional Scryfall API calls. |
| Select a mechanic or inspect bundled rules | Zero additional Scryfall API calls. |
| Display card art | Existing trusted image requests, loaded as needed; distinguish these from API calls. |
| Deliberate discovery or result pagination | Existing bounded search/page requests and cache behavior. |

Recheck the [collection endpoint documentation](https://scryfall.com/docs/api/cards/collection) during implementation and apply its documented spacing to collection requests. Reconnaissance found a 500 ms requirement while current collection code uses 120 ms. Preserve existing Retry-After/error behavior and avoid retry storms.

Index once per deck/evidence-version revision, not on every click. Late metadata arrival should enrich the index without re-resolving cards. Update selection and request controls without repeatedly rebuilding unaffected card images or flavor analysis.

Profile indexing separately from DOM rendering, rules data, and image loading. The earlier approximately 0.48-second resolve and sub-millisecond basic grouping were limited observations, not guarantees for full browser performance. Test both real decks and a bounded 500-entry synthetic case. No new whole-page wait or automatic search fan-out is acceptable.

## 9. Implementation order and expected touchpoints

1. **Capture the baseline:** record current visuals and interactions; preserve source hashes and the existing test result.
2. **Implement the pure index:** replace catalog-driven detection in `public/core.mjs`, retain exact evidence, and add focused core tests.
3. **Add reviewed enrichment and grants:** separate detection from `lib/catalog.mjs`/`crosswalk.json`; update recipe validation in `lib/scryfall.mjs` where required. Keep source datasets frozen.
4. **Implement request ownership:** update `public/app.mjs` and the API helper as needed; cover import, mechanic, commander, pagination, navigation, and cleanup transitions.
5. **Connect the existing UI:** use the new index in the mechanic list/gallery, with minimal changes to `public/index.html`, the existing stylesheets (`public/style.css`, `public/polish.css`, `public/refinement.css`, `public/card-preview.css`), and card-viewer helpers only where evidence or face selection requires them.
6. **Verify both journeys:** run focused tests, the complete suite, live imports, and browser interaction checks; document exact results and remaining limits in `PROTOTYPE_REPORT.md` and update `README.md` to remove the eight-mechanic limitation.

Existing tests that intentionally enforce eight mappings or prohibit all Oracle recognition must be revised to the new contract. Preserve their useful guarantees against unsupported possession/face inference, query injection, source mutation, and imported-deck mutation. Do not delete regression coverage merely to get a passing run.

## 10. Acceptance matrix

All rows below are required implementation checks, not claims that the new behavior already exists.

| Area | Scenario | Pass condition |
|---|---|---|
| Dynamic index | Import `carelf.txt` | All 15 reported labels survive indexing; the reported channel retains Crew 16, Mill 4, Station 3, Adapt 2, Equip 2. No Deathtouch entry appears without actual evidence. |
| Enriched counts | Add recognized grants | New mechanics and increased counts are allowed; reported baseline remains independently testable; dual-channel matches count once. |
| Replacement | Spider-Man → carelf → Spider-Man | Only the current deck's evidence, counts, and valid selection appear; the new-deck overview clears stale context. |
| Spider-Man coverage | Resolve the 84-entry fixture | Build expectations from its actual returned records rather than the old eight-item whitelist; retain exact printings and commander identity. |
| Clear grants | Greaves, Boots, Gaea's Gift | The player can see the relevant cards, grant wording, exact excerpt, and preserved duration/condition. |
| False positives | Reminder, destruction, loss, and prevention examples | No false possession/grant labels and no inflated confirmed-grant counts. |
| Faces | Spider-Man double-faced cards | Select a matching face only when supported; retain all face controls and truthful missing-art behavior. |
| Deduplication | Multiple copies/printings/faces/channels | One gameplay-card count; all exact printing evidence remains accessible. |
| Metadata independence | Station, Food, Eternity Gate; delayed/failed catalog | Card evidence remains usable; no invented classification, rules, or query. |
| Partial/empty states | Unresolved cards or no observed terms | Scope and uncertainty are clear; no static or synthetic fallback. |
| Commander change | Change selected commander without importing | Mechanic evidence stays unchanged; discovery context/results reset. |
| Mechanic race | Start A, choose B, let A resolve or fail | A cannot replace B, navigate back, display a stale error, steal focus, or change B's loading state. |
| Import race | Search, start another import, settle old search | Old success/error/finally handlers cannot alter the replacement state or commander selection. |
| Same-context race | Start two requests for the same context | Only the newest request owns UI updates and cleanup. |
| Page/cache race | Change page, mechanic, or commander while fetching | Responses and cached pages remain correctly scoped; no mixed grid or totals. |
| Navigation race | Leave discovery before its request finishes | No forced route change or focus theft. |
| Request cost | Record both complete deck journeys | Indexing and mechanic selection add zero API calls; discovery remains explicit. |
| Discovery preservation | Green and WUBRG searches | `id<=`, distinct results, newest preference, legality filtering, 24-card pages, boundary pages, and final page remain correct. |
| Clipboard preservation | Save, change decks, browse, edit quantities, export | Saved printings survive independently; both save surfaces work; export includes all entries; imported decks remain unchanged. |
| Interaction/design | Pointer, keyboard, touch-sized viewport | Familiar layout and symbols, visible focus, Escape, dialog focus return, face switching, and card evidence work without hover dependence. |
| Source integrity | Before/after source audit | All supplied frozen source files remain byte-identical. |

Use deterministic deferred responses for race tests rather than timing-dependent sleeps. Use reproducible provider fixtures for exact count assertions; live provider data can change and must be dated separately. Do not modify the original deck files to construct edge cases.

For browser QA, cover desktop around 1440×900 and a narrow viewport around 390×844 in the available browser. Inspect rest, hover/focus, selection, loading, errors, open dialogs, and reduced motion. Record the actual browser/version and tested sizes; do not imply an unrun cross-browser or screen-reader certification.

## 11. Validation performed while preparing this plan

Fresh checks on October 17, 2026:

- Both actual deck files passed parser assertions: 64/84 entries, 100 copies each, correct commander tags, no invalid rows, and preserved original source text.
- The existing full suite passed **86 tests, 0 failures, 0 skipped** with `node --test --test-reporter=spec`.
- Its source-integrity check confirmed all 18 originally supplied files remain byte-identical.
- The first sandboxed suite run encountered `EACCES` connecting to its temporary localhost test servers. The rerun with loopback access passed; this was an execution-environment restriction, not a new application regression.

The carelf live metadata/counts above come from the earlier approved Scryfall check. No new live provider requests or browser QA were performed for this Markdown-only deliverable. Dynamic indexing, grant recognition, and frontend race acceptance tests remain planned work.

## 12. Completion criteria

The change is ready for review when both real decks build their own mechanic lists, every displayed match has inspectable evidence, unsupported metadata does not erase cards, stale requests cannot change current state, and the acceptance matrix passes with recorded evidence.

The final report must distinguish automated checks, live provider checks, visual inspection, and untested conditions. Preserve the existing design, discovery, and Clipboard experience throughout.
