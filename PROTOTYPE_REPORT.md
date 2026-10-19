# Deck Explorer — bounded implementation report

Original run: **October 16, 2026, America/Denver**. Latest refinement: **October 17, 2026**. Node **v24.14.0**. Standalone local prototype; no installation, build, commit, push, deployment or other-project modification.

## Latest refinement — distinct-card discovery and complete pagination

Archive entries now place compact printing details beside the flavor text, removing redundant mana costs and the separate passage-evidence action. Repeated-language evidence remains available in its dark dialog. Mechanics show their rules once, with interactive cross-references retained. Discovery presents image-only tiles with a small Save control beneath the artwork and an additional Save action inside the card viewer. Previous/Next controls and direct page selection expose the complete result set; saved quantities remain consistent between these surfaces.

**Latest automated result: 86 tests passed, 0 failed, 0 skipped.** The final complete `node --test` run is saved in [evidence/compact-pagination-tests.txt](evidence/compact-pagination-tests.txt). All 18 supplied source files remain byte-identical. The browser record and screenshots for this refinement are maintained separately in [evidence/compact-pagination-qa.md](evidence/compact-pagination-qa.md). Earlier implementation, polish and 76-test refinement records below remain historical evidence.

Discovery retains the user's final **`id<=` color-identity ceiling** and the original frozen Atlas recipe. The server adds the presentation directive `prefer:newest` and requests `unique=cards`, ordered by name. This returns one gameplay card rather than every reprint, preferring its newest matching printing. The unchanged governed expression remains in `query`; `providerQuery` records the actual expression sent, and provenance identifies the printing preference and rollup mode. Exact imported printings and Clipboard entries remain separate from discovery rollup.

The [official Scryfall search API](https://scryfall.com/docs/api/cards/search) documents `unique=cards` and 175 records per provider page; the [official syntax guide](https://scryfall.com/docs/syntax) documents `prefer:newest`. Both were read directly. A bounded live Lightning Bolt comparison confirmed the selected printing matched the newest release date in the all-printing result. This preference follows the provider's available records, including any announced upcoming printing; it does not add a release-date cutoff or select the cheapest printing.

`POST /api/discover` accepts an optional integer `page`, defaulting to 1, with a fixed **24-card UI page**. Responses include `page`, `pageSize`, `totalPages`, `hasPrevious` and `hasMore`; empty searches have zero result pages. Numeric provider-page construction reaches any requested page with at most two upstream calls. Returned `next_page` URLs are never followed. Validated pages, cached responses and concurrent-request sharing keep requests bounded; normal searches observe Scryfall's documented **500 ms** spacing, while collection resolution retains its **120 ms** spacing. Within-identity and Commander-legality postfilters remain active. Unexpected duplicate Oracle IDs or names are collapsed defensively, preferring the newest returned printing, and skipped-record diagnostics describe only the requested UI page.

Provider count changes reject mixed cached pages with HTTP 409 and clear that search's cache for a fresh attempt. Invalid page values, client-supplied URLs/queries and commanders outside the resolved import are rejected. A context that expires while a provider request is running cannot return its results as a valid current search.

**Live backend verification:** `(f:commander id<=wubrg) (kw:Flying) prefer:newest`, with `unique=cards`, returned **3,164 distinct cards across 132 UI pages**. Page 1 returned 24, page 8 crossed the 175-record provider boundary and returned 24, and page 132 returned the final 20 with `hasMore:false`. All 68 sampled Oracle IDs were distinct; none were skipped or collapsed. These are observed provider results, not fixed product totals. The deterministic pagination tests separately traverse all 416 synthetic distinct records across 18 UI pages, test arbitrary jumps and cache reuse, and cover latest-printing selection, page-scoped diagnostics, malformed provider metadata and stale contexts.

## Prior refinement — commander, evidence, rules and collections

This section records the preceding interface refinement and its verification. The latest discovery behavior and test count are recorded above; this section preserves the earlier evidence.

The commander now has visible exact-printing art. Mana symbols communicate identity without duplicate WUBRG text or a repeated cost/identity presentation. Passage and repeated-language evidence share a dark dialog with set symbols, highlighted matching text, plain-language explanations and optional printing details. Mechanics lead with official rules and a visual gallery of matching imported printings; historical color placement remains separately available. Discovery uses compact card images with a distinct **Save** action. Clipboard collections are searchable and show **12 printings per page**, while copy/export includes every collected printing regardless of the visible page or search.

**Final discovery behavior remains `id<=`, as clarified by the user.** The original frozen `f:commander id<=[COLORS]` baseline is used for both query generation and server postfiltering. WUBRG allows every color subset, including colorless; WU allows W, U, WU and colorless. Search provenance identifies the within-identity policy and original Atlas row. No exact-five-color restriction is part of the delivered behavior.

The official [Comprehensive Rules effective September 25, 2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt), linked from [Wizards' rules page](https://magic.wizards.com/en/rules), now supply the local inline reference. All **3,322 numbered entries** are indexed in **1,331 grouped sections**, including subrules and examples, with no invented rule prose. Hover/focus previews, click/tap persistence and recognized cross-reference navigation use this data. The glossary and credits are outside the numbered index. The unchanged 977,752-byte source is retained in `evidence/MagicCompRules-20260925.txt`, SHA-256 `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca`. `scripts/extract-rules.mjs` reproducibly generates `public/rules-data.json` and rejects changed source bytes; the derived file carries date, source URL, hash and source-line locations. This adds reference coverage without expanding the eight-mechanic detector or discovery whitelist.

**Prior refinement automated result: 76 tests passed, 0 failed, 0 skipped.** That complete run is retained in [evidence/refinement-tests.txt](evidence/refinement-tests.txt). It includes frozen-source preservation, within-identity query/postfilter cases, reproducible official-rule extraction, and collection search/pagination/full-export regressions. All 18 originally supplied files remained byte-identical.

Browser findings and screenshots from that refinement are recorded in [evidence/refinement-qa.md](evidence/refinement-qa.md):

- Live WUBRG searches used `id<=`: **2,043 Haste matches** and **9,963 Flying matches**. These are observed provider totals from this run, not fixed product claims.
- The mechanic view displayed **12 matching imported printings** in its visual gallery.
- A **16-printing / 17-card** Clipboard collection was browsed as **12 + 4** printings. Export retained all **16 lines** across paging and search, and last-page navigation restored focus to the search field.
- An ordinary collected entry set to quantity **2** was verified through actual browser clipboard readback.

The historical native-Clear automation limitation and untested exhaustive screen-reader/reduced-motion conditions are not converted into passes by this refinement. Current bounded browser results are recorded separately from deterministic test evidence.

## Original implementation handoff assessment

**GO to show a real player as a local, supervised prototype.** The real import → archive → mechanics → discovery → manual collection → print-aware copy journey ran against Scryfall. This is not production sign-off or a full accessibility certification. The native Clear confirmation stalled the browser automation and its click-through remains **BLOCKED**. Reduced-motion emulation and an exhaustive keyboard/screen-reader audit remain **NOT TESTED**. These limits are not counted as passes.

## Approved polish update — October 16, 2026

The five approved priorities are implemented: exact-printing hover/focus previews and detail dialogs; locally bundled Mana/Keyrune symbols; working readable workflow navigation; a visible commander panel and searchable chooser; and clearer typography with technical identifiers moved into contextual details. The owner's full `C:\WIP\Website_Design_Interaction_Standard_2026-10-16` package was read before this pass. All seven non-Art-Trail PNGs were opened and visually inspected: `color-wheel.png`, `color-wheel-selection.png`, `color-wheel-conflict.png`, `mechanical-color-pie.png`, `mechanical-color-pie-details.png`, `personal-blog-mtg.png`, and `personal-blog-mtg-article.png`. Their dark ink, restrained gold, real MTG symbols, contextual inspection and readable editorial hierarchy inform the masthead, card viewer, navigation and commander treatment; the archive retains its warm paper reading surface.

**First-polish result: 66 deterministic tests passed**, including the original source-preservation checks plus 16 symbol, image and interaction regressions. That stage's browser findings and screenshots are in [evidence/polish-qa.md](evidence/polish-qa.md); the earlier browser section below is retained as the original implementation record. The latest refinement section above records the current 86-test result. The local server was running on port 4173 at that handoff, as requested.

The update preserves immutable imports, exact printing resolution, provenance, governed discovery, Clipboard storage and print-aware export. It adds no deck editing, recommendation engine, new search recipe, image-by-name lookup, package installation or deployment. Fonts load locally; exact returned card images load directly from Scryfall on inspection. Attribution and pinned asset provenance are in [public/vendor/SOURCES.md](public/vendor/SOURCES.md).

## Run and implementation boundary

From this directory, run `node server.mjs`, then open `http://127.0.0.1:4173`. Run the deterministic suites with `node --test`. See [README.md](README.md) for formats, privacy, source distinctions, limitations and operation details.

The starting directory contained the owner's brief and `inputs/`, `fixtures/`, and `references/`; there was no implementation, Git repository or target `AGENTS.md`. The supplied filename inventory was inspected once. All four pinned files were present at their specified paths. Their complete bytes were read and hashed; the large JSON files were fully parsed and their structures, invariants and chosen records inspected before implementation. The full Markdown taxonomy and contract were read. No substitute corpus or other repository was used.

All **18 files under the three supplied folders remain byte-identical**, confirmed by the acceptance suite against the initial SHA-256/byte-count inventory in [evidence/source-audit.json](evidence/source-audit.json). The original brief file is also untouched. The owner's private example deck is not in `public/`.

## Pinned source hashes

| Read-only source | Bytes | SHA-256 |
|---|---:|---|
| `inputs/mtg-mechanics-master-list.md` | 18,644 | `da2ee08ffc531202cadb25e3db94ed0a959798bc8d0df7085c1cfe6bb76c27d6` |
| `inputs/atlas_v2.0.json` | 809,648 | `6baa0058902db3732192e87a3002a0b5890a17d8f24fb5edac734b7fc09b1b2f` |
| `inputs/mechanical-color-pie.runtime.json` | 180,187 | `1b251f778e87d8c58a23bff0b8a15e342c3b3db21c6edf99475d9515738d2241` |
| `inputs/MECHANICS-CONTRACT.md` | 22,023 | `5c49d4ad3247998fbc0a5ef2bf312ab180b388f29199bba297820fe20d188ebb` |

The inventory contains **524 concrete listed entries**, including 194 keyword abilities, 70 keyword actions and 64 ability words. Three playtest category-index bullets are tracked separately, not counted as three additional verified mechanics. Repeated spellings retain separate category memberships. The parser's 510 normalized spelling buckets are not a claim of 510 adjudicated canonical mechanics.

Atlas verification: **1,086 records**, with **684 Production-ready / 353 Review / 27 Semantic / 22 Do-not-emit**. `auto_execute` is true only for the 684 Production-ready records. The **623-row historical validity census is distinct** from the total; it is not current validation of all 1,086. Historical `live_count` is not shown as a current result count.

Frozen color pie: **216 runtime projection mechanics**, snapshot **2021-10-18**. The contract separately records 217 source identities, including one structural-only identity. No source record, alias, caveat or conflict was edited or re-adjudicated.

## Deliberately small supported crosswalk

`crosswalk.json`, version **1.0.0**, explicitly supports eight keyword abilities:

| Master label | Wizards reference | Exact Atlas ID | Reviewed frozen Rosewater ID |
|---|---|---|---|
| Flying | CR 702.9 | `keyword-index-flying` | `flying` |
| Trample | CR 702.19 | `keyword-index-trample` | `trample` |
| Deathtouch | CR 702.2 | `keyword-index-deathtouch` | `deathtouch` |
| Vigilance | CR 702.20 | `keyword-index-vigilance` | `vigilance` |
| Haste | CR 702.10 | `keyword-index-haste` | `haste` |
| Menace | CR 702.111 | `keyword-index-menace` | `menace` |
| Reach | CR 702.17 | `keyword-index-reach` | `reach` |
| Lifelink | CR 702.15 | `keyword-index-lifelink` | `lifelink` |

**8 supported / 0 query-only / 516 unmapped listed entries.** Every chosen row was inspected on disk, has no unbound keyword parameters, and uses its exact Production-ready `kw:` recipe. The baseline is the exact Atlas `baseline-contract-commander-deck-card-pool-the-default-baseline` recipe, `f:commander id<=[COLORS]`. No Ward mapping, Super trample substitution, keyword-action shortcut, ability-word detector, Oracle regex detector, archetype classifier or invented query was added.

All eight official references were verified against the [Wizards Comprehensive Rules effective September 25, 2026](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt), reached through the [official rules page](https://magic.wizards.com/en/rules). Their category and rule numbers agree with the frozen inventory. WU's Azorius label was separately checked against [Wizards' Ravnica reference](https://magic.wizards.com/en/story/ravnica-plane). Other multicolor names were intentionally omitted in favor of WUBRG codes.

The interface distinguishes `Wizards rules (2026-09-25)`, `MTG Wiki-derived inventory`, `Rosewater 2021 placement`, `Scryfall card data`, `Computed from imported cards`, and `Site-authored search/analysis rule`. Color-pie tiers remain per-color historical placements, never an aggregate score. Search results never become imported-card evidence. Detector evidence explicitly disclaims inference of inherent possession or a particular face from card-level `keywords`.

## Actual visual references inspected

Before writing UI CSS, these supplied images were opened and visually inspected:

- `references/art-trail-desktop.png`: pale green paper, narrow rules, compact navigation, current-artwork/context split, exact-printing links and a bounded exploration collection. Used for restraint, spatial relationships and provenance placement, not copied artwork or code.
- `references/art-trail-card-detail.png`: centered detail panel, clear close action, edition/artist/rules context and an exact-printing link. Used as a behavioral reference for evidence inspection.
- `references/mechanical-color-pie-details.png`: dark ink/gold field-guide treatment, small WUBRG marks, per-color placement rows, serif explanation and visibly dated provenance. The new interface uses its source discipline, with a distinct light journal palette.
- `references/personal-blog-mtg-article.png`: the supplied image actually shows the Robboles Table log index—dark background, readable article titles, muted supporting text and fine category markers. It does not show a full long-form article page; no claim of inspecting one is made.

The supplied GDD is located at **`inputs/PROBABLY_PARADISE_GDD_VISUAL_ATLAS_V3_1.html`**, not in `references/`. A targeted source read inspected its CSS and structural markup: warm paper, yellow/coral accents, strong outlined shapes, handwritten headings, a sidebar, numbered sections and margin notes. Rendering its `file:` URL was blocked by browser URL policy; no alternate server exposed it. Thus GDD **source inspection PASS / rendered reference inspection BLOCKED**. No absent Vox Mana screenshot or Clipboard source code was invented or sought. Its behavior follows the owner's written brief.

At the original implementation stage, the remaining supplied screenshots were only inventoried and preserved. The approved polish update above records the subsequent complete inspection of the seven non-Art-Trail references and the separately requested design-standard directory. No AI image generation or stock illustration was used.

The resulting concept uses a paper-and-ink reading surface, an offset numbered spine, a hand-built CSS identity dial, serif quotations, monospaced source coordinates, fine rules, rust notes and compact source-driven controls. Real content governs the layout. There are no ratings, curves, slot counters, recommended cuts or additions.

## Original implementation functional results and real provider evidence

**PASS — actual owner fixture**, `fixtures/cosmicspiderman.txt` (SHA-256 in the source audit):

- **84 input entries / 100 physical cards / 84 distinct resolved printings**.
- **0 unresolved, 0 ambiguous, 0 identifier/name mismatches** in this run.
- **27 resolved entries without flavor text**, treated as normal.
- **58 exact flavor passages**, including face-specific content.
- The explicit `[Commander{top}]` tag selected **Cosmic Spider-Man**, SPM 127, UUID `f82f4013-7308-4917-9042-19a5909f2134`, with returned **WUBRG** identity.
- The real collection calls used batches of **75 + 9**. A separate deterministic test uses **75 + 25** for 100 distinct identifiers; the 84-row owner fixture is never mislabeled as 100 distinct printings.
- The browser independently pasted and imported this same fixture and displayed the same counts. Its original text and coordinates remain unchanged in the input ledger.

**PASS — actual governed discovery.** The provider smoke ran `(f:commander id<=wubrg) (kw:Flying)`: **9,963 provider matches**, 175 first-page records, 12 displayed, 0 skipped. The three call start gaps were 576 ms and 127 ms. No second page or bulk endpoint was fetched. See [evidence/provider-smoke.json](evidence/provider-smoke.json).

**PASS — different real editions and Azorius in the browser.** A second small real import used:

```text
Commander
1 Aang, Swift Savior // Aang and La, Ocean's Fury (TLA) 204

Deck
1 Aang, Swift Savior // Aang and La, Ocean's Fury (TLA) 298
1 Aang, Air Nomad (TLE) 210
```

TLA 204, UUID `82866a0e-485a-4f7e-8c49-f7d9ff3f4ad4`, contains a flavor passage on the Aang and La face. TLA 298, UUID `de89fec4-f5c8-4513-8504-ac9bafb44054`, has no flavor. Both resolve independently without backfill. The explicit commander gives **WU / Azorius**. The No flavor filter showed **1 of 3 entries**; the sparse two-passage analysis abstained. This fragment is a printing test, not a proposed legal deck.

The browser executed `(f:commander id<=wu) (kw:Flying)`: **5,286 provider matches / 175 first-page records / 12 displayed / 0 skipped**. Counts are observations from this run, not promises of future totals. Actual single-color candidates were visible, demonstrating why the subset ceiling matters.

**PASS — actual manual collection and browser clipboard.** The selected real result Aang, Air Nomad, TLE 210, UUID `f369827d-e4cd-4bc7-8c5e-72882eff0908`, was manually added. The archive's DOM text was compared before and after collection/copy and was unchanged. Session restore survived a refresh. A discovered quantity-event defect was corrected; retesting read input `2`, header count `2`, textarea `2 Aang, Air Nomad (TLE) 210`, and the actual browser clipboard returned exactly that text. The module integration test separately proves quantity changes/export do not mutate the frozen imported object. Imported decks intentionally do not survive refresh; Clipboard entries do.

Initial sandbox-local network attempts failed before reaching Scryfall (`EACCES` / DNS failure). The authorized network execution succeeded. Those initial failures are not reported as Scryfall downtime or hidden behind demo data.

## Automated verification

**Latest refinement PASS: `node --test` — 86 tests, 86 pass, 0 fail, 0 skip**; see [evidence/compact-pagination-tests.txt](evidence/compact-pagination-tests.txt). The chronology is retained: the original implementation passed 50 tests, the first polish passed 66, and the commander/rules/collection refinement passed 76; see [evidence/polish-tests.txt](evidence/polish-tests.txt) and [evidence/refinement-tests.txt](evidence/refinement-tests.txt). Runs used Node v24.14.0 and authorized localhost access for HTTP tests. No test requires external internet or packages. The table below describes the original 50-test suite; the latest total additionally includes the polish suites, six collection-refinement cases, three rules-extraction cases, the identity-subset regression and ten distinct-discovery pagination tests.

| Suite | Tests | Coverage |
|---|---:|---|
| `tests/core.test.mjs` and `tests/core-clipboard.test.mjs` | 25 | Plain/CSV/quoted/multiline parsing; original text, sections and suffixes; language UUIDs; conflicts and ambiguity; reordered results; distinct editions/faces/no backfill; commander identity and provisional unions; Unicode boundaries; exact evidence spans; duplicate suppression; generic-only abstention; keyword grants; immutable Clipboard, storage restore and export |
| `tests/server.test.mjs` | 14 | Actual source classifications and Atlas invariants; crosswalk/placement consistency; whitelist grammar/parentheses; 75+25 batches/dedupe; provider mismatches; cache/spacing; failure/429/no retry; subset/legality/counts; opaque import contexts; host/origin/size/path limits; missing catalogs; context expiry |
| `tests/acceptance.test.mjs` | 11 | All 18 supplied-file hashes; eight named positive/negative/query crosswalk fixture sets; complete deterministic import/discover/export independence; malformed provider-face classification |

The eight crosswalk `test_fixture_ids` have actual matching test cases. Stubbed provider tests do not masquerade as live Scryfall results. No browser, image license, clipboard permission or OS accessibility claim is inferred from the unit count.

## Original implementation browser verification and screenshot record

Browser: Codex in-app Chromium surface. Tested viewport overrides: **1440×900** and **390×844**. The browser was exercised through actual visible controls and its supported DOM interface. Screenshots are of this new app, not the reference images.

| Check | Result | Actual observation |
|---|---|---|
| Desktop first-run layout, empty import | PASS | Focused workbench, complete controls, visible empty-input error |
| Owner fixture browser import | PASS | 84 entries / 100 cards / 58 passages, WUBRG commander |
| Exact flavor, normal absence, two real editions | PASS | TLA 204 face passage kept separate from TLA 298 no-flavor state |
| Literal observation and span evidence | PASS | Synthetic river observation opened three exact highlights; distinct-card/printing/copy denominators visible; Escape returned to originating term |
| Mechanic evidence / historical placement / query separation | PASS | Eight actual owner-deck keyword detections; per-color Flying table, original caveat, source link, exact bound query |
| Live search and manual Add | PASS | Real WU subset results and distinct printing UUIDs; archive text unchanged |
| Quantity edit and actual Copy | PASS after fix | Browser readback exactly `2 Aang, Air Nomad (TLE) 210` |
| Session restore | PASS | Collected real printing survived same-tab refresh |
| Drawer open/close, focus return | PASS | Close control initially focused; Escape returned to persistent Clipboard trigger |
| Desktop horizontal overflow | PASS | innerWidth 1440; document scrollWidth 1425 (scrollbar space), no horizontal overflow |
| Mobile horizontal overflow and drawer sizing | PASS | innerWidth 390; document scrollWidth 375; drawer x=0, width=375, height=844, entirely within viewport |
| Mobile long passage and controls | PASS | Long multiface title/quotation wrap; search, native select and Clipboard export remain readable and usable |
| Native Clear confirmation click-through | BLOCKED | Clicking Clear stalled the browser tool's input/focus commands; `getJsDialog`, Escape and close recovery did not complete. No clear result is claimed. New test tab could load, but subsequent input clicks were also unreliable |
| Exhaustive Tab cycle / screen reader | NOT TESTED | Initial modal focus and Escape return verified; attempted final Tab sequence did not establish full confinement |
| Reduced-motion OS emulation | NOT TESTED | Animations/transitions exist only under `prefers-reduced-motion:no-preference`; CSS inspected, runtime emulation unavailable in the exposed browser API |
| Clipboard-denied fallback | NOT TESTED in browser | Selectable readonly export visibly available; actual API copy passed. Permission-denied branch was not forced |
| Storage-blocked condition | PASS in unit fixtures; NOT TESTED in browser | Memory-only result/message verified by fixture |
| XSS-like literal text | PASS in data tests and DOM code inspection; NOT TESTED end-to-end in browser | `textContent`/text nodes only; final mobile CSV attempt occurred after native-dialog automation stall and is not a pass |
| Network error / 429 UI conditions | PASS adapters/tests; NOT TESTED with real failing provider | No fake outage or intentional rate-limit storm was generated |
| Final post-polish full browser rerun | BLOCKED | Native confirmation tool stall prevented rerunning all screens after final wording/spacing corrections; primary journey and the quantity fix were already observed |

Screenshots, retained as chronological evidence:

- [Desktop first run](evidence/desktop-empty.jpg): 1440×900.
- [Owner deck Flavor Archive](evidence/desktop-owner-archive.jpg): 1440×900. Captured before the final generic-word suppression and printing-ID line polish; top summary/counts are real. It is not a claim that every visible lower-ranked token survived the final exclusions.
- [Desktop live discovery results](evidence/desktop-mechanics.jpg): 1440×900, scrolled to actual WU result cards.
- [Desktop Clipboard defect capture](evidence/desktop-clipboard.jpg): **pre-fix evidence**, input 2 with stale export 1. Retained to document the found defect, not as final PASS proof. Subsequent browser DOM and clipboard readbacks confirmed the correction.
- [Mobile reading](evidence/mobile-archive.jpg): 390×844. A missing word-space in the compact heading was noticed and corrected; the final heading-space change was not re-screenshotted after the native-dialog stall.
- [Mobile Clipboard](evidence/mobile-clipboard.jpg): 390×844, real selected printing and working readable export. Captured at quantity 1 before the later successful quantity-2 copy test.

## Defects found and resolved in this pass

1. Category spelling disagreement initially hid genuine keyword detections. Detector now uses `keyword_ability`; all eight source-to-detector tests pass.
2. Frontend and server initially differed on collector zero-padding/case. They now match equivalent provider coordinates while keeping the original string intact.
3. A null provider face initially threw an unclassified TypeError. It now yields the expected bounded provider error; regression passes.
4. A pending search could overwrite results after a commander/import change. A context-generation guard prevents stale responses from entering the new context; inspected in code, no additional browser race PASS claimed.
5. Generic-only repeated terms could summarize “always/can/one.” A small explicit auxiliary/quantifier exclusion list and positive/negative regression now force abstention for that counterexample while retaining concrete literal evidence. It is an exact list, not a universal semantic classifier.
6. Clipboard quantity depended only on `change`; browser fill/copy exposed a stale exported quantity. Both `input` and `change` now update the independently stored selection. Actual quantity-2 clipboard readback passed.
7. Passage-evidence link DOM construction, resolved UUID-only metadata display, mobile heading spacing and preservation of provider counts after Add were corrected during integration.

No known failing automated tests remain. Native-confirm browser verification is incomplete as described above, rather than labeled an application success or silently removed.

## Source, legal and scope limitations

- Scryfall collection/search documentation requests through the web tool returned **403**. The actual API adapter succeeded and is separately tested against bounded schema fixtures. Provider documentation availability is not conflated with API availability.
- **Image/hotlink terms: unverified.** Scryfall imagery documentation remained inaccessible. Commander art, galleries and previews load provider-supplied exact-printing images, restricted to `cards.scryfall.io`, with attribution and honest missing-image states. Successful loading is not a verification of imagery terms or a comprehensive legal review.
- The source inventory remains partly Wiki-derived, not an official publication as a whole. Official rule existence does not certify every carrying card as Commander legal. Current Oracle text is labeled distinctly from printing-specific flavor and historic printed rules.
- All eight enabled searches use the server whitelist and known import context; identity is derived on the server from selected resolved printing IDs. Commander eligibility and pair eligibility are unverified. Candidate subset and legal status are bounded pool checks only.
- Multiface keyword detection stays at card-record level. Missing or unsupported mechanics are “Not detected by this prototype,” not claims of absence.
- Plain/CSV import covers the documented formats, not every deckbuilder's export dialect. UUID foreign-language support is exact; arbitrary language lookups are not synthesized. Unsupported rows remain in the ledger.
- Literal analysis excludes non-English passages, suppresses identical passage text as independent evidence, and applies documented exact stopwords/generic terms. It does not establish sentiment, lore, intent or a theme score. There are **zero motif groups**.
- Discovery now pages through the complete provider matching set in 24-card UI pages and prefers the newest matching printing for each distinct gameplay card. The earlier first-provider-page / 12-candidate limitation is historical. Discovery does not select the cheapest printing, recommend cards or edit the imported deck. Native Clear uses confirmation; the historical automation click-through remains unverified.
- Session Clipboard export is a simple list. Compatibility with any third-party deckbuilder is **NOT TESTED**. No names-only UI, account, saved-deck management or integration was added.
- The API serves only `public/`; API source metadata is intentionally projected, never the source files or private fixture. Outbound API origin/path checks, redirects rejected, strict input validation, timeout/size limits, minimum request spacing of 120 ms for collections and 500 ms for searches, and a small in-memory cache are implemented. Imported deck text is not persisted.

Cuts remain intentional: **8 rather than 16 mechanics**, no motif groups, no non-keyword Oracle detectors, no broad color-name catalog and no names-only UI. The complete numbered-rules reference does not expand the detection whitelist. Clipboard pagination remains 12 exact printings per page with full-collection export; discovery independently uses 24 distinct cards per page and can reach the full matching set.

## Changed-file inventory and final scope check

New implementation files:

- `server.mjs`
- `lib/catalog.mjs`, `lib/scryfall.mjs`
- `crosswalk.json`
- `public/index.html`, `public/style.css`, `public/app.mjs`, `public/core.mjs`, `public/clipboard.mjs`, `public/demo.mjs`
- Polish additions: `public/polish.css`, `public/card-preview.mjs`, `public/card-preview.css`, `public/symbols.mjs`, and the pinned font/CSS/license/provenance files under `public/vendor/`
- Refinement additions: `public/refinement.css`, `public/rules-ui.mjs`, `public/rules-data.json`, `public/collection-view.mjs`, and `scripts/extract-rules.mjs`
- `tests/core.test.mjs`, `tests/core-clipboard.test.mjs`, `tests/server.test.mjs`, `tests/acceptance.test.mjs`
- Polish regressions: `tests/polish.test.mjs`, `tests/symbols.test.mjs`, `tests/image-safety.test.mjs`
- Refinement regressions: `tests/refinement.test.mjs`, `tests/rules.test.mjs`, plus updated subset/provenance cases in the server and acceptance suites
- `README.md`, `PROTOTYPE_REPORT.md`
- `evidence/source-audit.json`, `evidence/provider-smoke.json`, `evidence/qa-notes.md`, `evidence/browser-qa.json`, and the six JPEG screenshots listed above
- Polish verification: `evidence/polish-qa.md`, `evidence/polish-tests.txt`, and `evidence/polish-*.png`
- Refinement verification: `evidence/refinement-qa.md`, `evidence/refinement-tests.txt`, refinement screenshots listed in that QA record, and the official source `evidence/MagicCompRules-20260925.txt`

Final scope review used the target file list and source-preservation tests; no Git diff exists because the target was not a Git repository. No package manifest, lockfile, installation, database, telemetry, AI service, generated imagery, public URL or deployment was introduced. Only this target directory was written. The local server was restarted for the new font MIME/image CSP configuration and remains running at `http://127.0.0.1:4173/`, as requested.
