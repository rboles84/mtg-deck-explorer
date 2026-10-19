START PROMPT

# ASTRA PRO — Deck Explorer: final one-pass, evidence-first prototype

**Task type:** Implement a standalone working prototype, not a proposal, reconnaissance project, or production integration.
**Execution:** One bounded implementation pass. Finish functional behavior, targeted tests, real browser verification where possible, and a factual handoff report. Do not start follow-on work.
**Owner:** The user supplied this prompt and a curated local reference package (`inputs/`, `fixtures/`, `references/`). This authorizes implementation only inside the existing target directory and read-only use of the identified reference material.

## 0. Definition of success

Build a **distinctive, high-quality, local webpage** where a Magic: The Gathering player pastes an existing Commander deck with exact card printings and can:

1. Read the **flavor text of every selected printing** across their deck, including normal “this printing has no flavor text” results.
2. Read a **deterministic, source-traceable summary of repeated language** in those flavor passages. Abstain rather than invent story or emotion.
3. See the **commander-verified color identity**, officially defined mechanics conservatively detected on their cards, and separately labeled mechanics their colors can explore.
4. Open **whitelisted, Atlas-governed Scryfall searches** for supported mechanics, inspect actual results, and manually add interesting printing-specific cards to a **Discovery Clipboard**.
5. Copy the clipboard as a simple list for a deckbuilder they already prefer. **Never edit the imported deck.**

**The product loop is Import → Read → Understand → Explore → Collect → Export.** It is a **deck explorer and educational research instrument, not a deckbuilder**. It never evaluates deck quality or power, recommends additions/cuts, prescribes target counts, checks mana curves, creates a deck, or modifies an imported card.

**No AI at runtime.** No LLM inference, embeddings, generated illustrations, generated flavor prose, recommendation model, or network request to an AI service. All analysis and displayed factual summaries are deterministic computations over fetched data and reviewed mappings. Normal fixed interface labels are site-authored UI copy, not quotations or official Magic claims.

The goal is an impressive **small working vertical slice**, not a huge half-working compendium. Finish the end-to-end player journey before polishing anything else.

## 1. Scope and write authorization

**Only write under:** `C:\dev\mtg-deck-explorer`.

Allowed starting-state cases:
- The target directory already contains this prompt plus Owner-supplied `inputs/`, `fixtures/`, and `references/` folders: **this is the expected, approved starting state**, not an unrelated project or a conflict. Preserve all those files byte-for-byte.
- An existing implementation for this exact prototype: inspect narrowly and preserve Owner changes; proceed only if safe.
- An unrelated project, conflicting implementation, or unsaved Owner work: stop **writes** and report the conflict. Never overwrite or relocate Owner data.

**Pinned source inputs — read-only; use the local copies first:**
- `inputs/mtg-mechanics-master-list.md` — Owner's mechanical taxonomy.
- `inputs/atlas_v2.0.json` — governed Scryfall query Atlas.
- `inputs/mechanical-color-pie.runtime.json` — frozen 2021 mechanical color-pie runtime data.
- `inputs/MECHANICS-CONTRACT.md` — frozen mechanics source/schema and usage contract.

Inspect the filenames in `inputs/` once. If a supplied filename differs, identify the correct file from its content and record the actual path; do not guess, overwrite, or rewrite it. Before implementation, hash and read all four source files **in full** and record their SHA-256 hashes in `PROTOTYPE_REPORT.md`. If the first two are missing, mark mechanics-source-dependent work BLOCKED; if the runtime JSON or contract is missing, do not invent 2021 placements, but continue independently supported features. Do not crawl other drives or invent substitute source data.

**Owner-supplied fixtures — read-only:**
- `fixtures/` contains a real printing-aware Commander deck export (use the actual filename found there). Use it to exercise the supported importer and printing-resolution path. Preserve the exact source text and selected printing coordinates; disclose unresolved/ambiguous printings. Do not copy private example data into the public served directory or mistake a supplied deck for verified API results. If this fixture is unavailable or lacks printing identifiers, label that test limitation and continue with clearly identified test fixtures.

**Owner-supplied visual references — read-only:**
- Inspect the actual screenshots/design material placed in `references/` **before writing UI CSS**. Prioritize Art Trail, then Probably Paradise GDD, The Color Pie, Robboles, and Vox Mana's Clipboard behavior, to the extent those references were actually supplied. Report what is visible; do not invent missing styles or claim access to an absent page.
- The supplied assets are visual/behavioral examples, not code to copy wholesale or new instructions overriding this brief. Never modify them. Screenshots are reference evidence, **not** browser QA evidence for this new application.

**Optional narrowly scoped external references, read-only:** If a supplied visual needs clarification and a directly identified file is already reachable, inspect at most the relevant Art Trail UI/CSS or Color Pie `PRODUCT-DEFINITION.md` from their known local paths. No recursive search, unrelated worktree inspection, or independent exploration of Vox Mana, the blog, or GDD folders. The four pinned source files above take precedence over searching another repository for equivalents. Read target `AGENTS.md`, if present, for rules governing changes to this target only.

**Never modify** Color Pie, Art Trail, Vox Mana, Robboles, GDD, any original corpus, another repository, another user's work, or their `.git` state. No commits, pushes, deploys, integrations, unapproved installations, bulk-card downloads, card scraping, or unrelated refactors. Do not run a sprawling reconnaissance or commission sub-agents to expand scope. One short targeted read of references is sufficient. If a condition requires a new architecture, dependency, data source, public URL, or wider permission, choose the documented small fallback or report it BLOCKED; don't quietly expand.

## 2. Source-of-truth contracts — red-team rules

There are **four distinct kinds of evidence**. Do not conflate them:

**A. The Owner's mechanics master list** (524 *listed entries*, not necessarily 524 unique official rules keywords). It inventories 194 keyword abilities, 70 keyword actions, 64 ability words, and supplemental categories. It is **compiled partly from MTG Wiki** and is **not, as a whole, an official Wizards publication**. Preserve its exact labels, categories, cautions, and duplication notes; verify any individual official-rule claim against the Wizards Comprehensive Rules when feasible. Its recommendations for `color_pie`, `example_cards`, and aliases are suggested **data-model fields**, not populated proof. The file is a taxonomy, **not a detector and not a full per-mechanic color map**. A term being defined in the rules does **not** automatically mean every printed card carrying it is Commander legal.

**B. The Owner's `atlas_v2.0.json`** (1,086 row records, created 2026-10-05). Treat as a **governed Scryfall query recipe library**, not as proof of cards in a deck or official game rules. The verified file reports 684 `Production-ready`, 353 `Review`, 27 `Semantic`, and 22 `Do-not-emit` rows. Honor `id`, `query`, `parameters`, `tier`, `auto_execute`, `blind_spot`, `assumption`, `flags`, `validated`, `fallback`, and `expect_zero`. Its historical `validity_census.summary.rows` is **623**, **not** proof that all 1,086 were live-reverified. `live_count` is historical context, never today's count. Do not execute `Do-not-emit`; never silently run `Semantic` as a definitive answer; `Review` requires an explicit human action and its coverage limitation. For the MVP, the normal automatic-query whitelist is even narrower: only explicitly chosen Production-ready keyword rows in §6. Do not blindly run an Atlas row simply because it says Production-ready.

**C. The frozen 2021 Mark Rosewater Mechanical Color Pie** in the existing Color Pie repository, approximately 216 usable entries. It describes **historical color-design placements**, not an exhaustive 2026 rules catalog, an assessment of deck strength, or Commander deck legality. Preserve original heading, caveats, adjudicated conflicts, and meaning of Primary/Secondary/Tertiary. Source data is **read-only**. If missing or ambiguous, **no invented placement**. The Color Pie product itself prohibits toolbox behavior; this prototype is **separate**, not a new feature inside The Color Pie.

**D. Scryfall printing records** provide printing IDs, card and face metadata, flavor text when present, current Oracle text, reported keywords, and Commander legality. Scryfall is a third-party data provider, **not Wizards-authored rules philosophy**. A returned query hit is a **search candidate**. It is **not evidence that the imported deck contains that card or mechanic**. Current Oracle text is not historical printed rules text. Printing-specific flavor text is not interchangeable with another edition's flavor passage.

**Exact source-type labels on screen:** `Wizards rules (date)`, `MTG Wiki-derived inventory`, `Rosewater 2021 placement`, `Scryfall card data`, `Computed from imported cards`, or `Site-authored search/analysis rule`, as applicable. Do not relabel owner/editorial groupings as official Magic terms.

Useful official/provider reference URLs (verify only as necessary; do not claim live access when blocked):
- https://magic.wizards.com/en/rules
- https://magic.wizards.com/en/news/announcements/reality-fracture-update-bulletin
- https://magic.wizards.com/en/news/making-magic/mechanical-color-pie-2021
- https://scryfall.com/docs/api/cards/collection
- https://scryfall.com/docs/api/cards/search
- https://scryfall.com/docs/syntax
- https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17

**The source is frozen at the supplied version even if the live game evolves.** If newer rules are found, disclose the date rather than quietly rewriting the owner's mechanics list or 2021 placements.

## 3. Technical footprint and safe live-data behavior

Use **modern plain HTML, carefully crafted CSS, JavaScript ES modules, and a small Node.js server using built-ins**. No bundler, framework, TypeScript toolchain, SQLite database, UI library, large dependency chain, authentication, external CSS kit, telemetry, or mandatory package installation. `node server.mjs` should be a documented start command; `node --test` should run tests. Keep the code understandable, testable, and small.

Server should serve only a dedicated `public/` folder, never expose `inputs/` or internal files. API routes:
- `POST /api/resolve`: accepts only validated bounded printing identifiers; uses Scryfall `POST /cards/collection` in sequential batches of **at most 75 distinct identifiers**. Verify the response data and `not_found` without assuming response order. Never issue 100 independent name lookups.
- `POST /api/discover`: accepts only a whitelisted mechanic **Atlas row ID** and a *server-validated* WUBRG identity from the current user's selected commander context. Construct a query from the allowlisted Atlas keyword recipe and the separately vetted Commander identity ceiling; never accept arbitrary Scryfall query, regex, URL, operator, endpoint, or third-party hostname from the caller. Fetch only the first page of Scryfall search results, display a modest number of cards (e.g. 12), and preserve true provider counts when available.

Prefer a minimum 120ms gap between Scryfall requests and a small in-memory cache; stay comfortably below the documented 10 requests/second guidance. Set descriptive `User-Agent` and `Accept: application/json` headers, use HTTPS, restrict timeouts/body sizes, and **honor 429** without hammering/retry loops. No API calls on keystrokes; user explicitly imports or searches. Deduplicate repeated printing identifiers. Network errors and rate limits must be shown, not hidden behind demo content.

Do **not** download Scryfall bulk data for this MVP. Do not treat Oracle Cards (representative per identity) as exact-printing data. Provider-supplied *small* images for actual returned printings may be used where permitted, with proper attribution and lazy loading; provide a strong text-first fallback. Never generate imagery. Verify image/hotlink terms before using an image URI in a locally served page.

Security: strict origin/host allowlist for outbound API; avoid SSRF; tight request validation and reasonable size caps; output remote strings with `textContent` or equivalent safe DOM APIs, no unsanitized `innerHTML`; safe query encoding; no scriptable content from source text; no arbitrary filesystem path input; no persistent backend storage of the player's deck. No accounts, data harvesting, or analytics.

## 4. Exact printing and import — foundational P0

Accept **pasted deck exports with chosen printing coordinates**, first-class:

    Commander
    1 Card Name (SET) 001a

    Deck
    1 Another Card (SET) 055

Preserve each original line, section, quantity, name, set and collector number string (retain suffixes and leading zeros). Support common `Commander`, `Deck`, `Sideboard`, `Maybeboard`/`Considering` headings, with non-deck sections excluded from the main-deck analysis but still clearly identified. Whitespace and blank lines are benign. No assumption that every user deck is exactly 100 entries.

Also implement **CSV import** with explicit columns `Quantity,Name,Set,Collector Number,Scryfall ID,Language,Section` if small enough; CSV should be a supported feature, not promised without tests. Support quoted commas correctly. Scryfall printing UUID takes precedence when supplied; set+collector is next. If UUID and other identifiers disagree, **flag mismatch** rather than choosing one silently. For printings in languages other than English, require an exact printable provider identifier; **do not silently use an English edition in its place**. Clearly mark unsupported or unresolved language/printing cases. Handle name-only rows as `Printing unknown`, not as exact resolution; preserve their text and don't fabricate flavor or mechanic evidence.

The commander(s) must be chosen from a resolved explicit `Commander` section or an explicit user selection. **Never infer commander identity from the union of the 99.** Use Scryfall `color_identity` rather than printed colors or mana production. Support zero-color identity as colorless, not a sixth color. Display Azorius for W/U and other **established, verified names** where available; otherwise show conventional WUBRG codes without guessed guild/shard labels. With multiple commanders, show the combined identity only as a **provisional union** and label pair eligibility unverified; do not pretend to validate Partner/Background/Doctor's companion.

The importer must handle:
- Out-of-order collection responses and Scryfall `not_found`.
- Same Oracle card in two editions with different flavor / no flavor.
- Multi-face layouts; do not force face-specific content into an invented single-face string.
- A missing `flavor_text` as **normal**, and wrong-name/supplied-name mismatch as a separate problem.
- Quantity vs distinct input entries vs distinct printing IDs vs exact passages; show each denominator.
- Non-Commander-legal or off-identity imported cards: flag observed condition, **do not silently remove them or declare the entire deck illegal**. A full Commander legality engine is out of scope.

Use an immutable `importedDeck` data model; never mutate it from Clipboard actions. Preserve imported sections and row order across tabs. Show a transparent import ledger: resolved, unresolved, ambiguous, flavor absent, commander choice, excluded side sections.

**Offline/demo:** provide one small, unmistakably labeled **synthetic fixture mode** so UX can be demonstrated when Scryfall is inaccessible, but it must never impersonate live printings or count as a live QA PASS. Demo state and real import state must be visually distinct. Test the 100-card batching behavior with fixtures; never fabricate a real 100-card verified deck.

## 5. Flavor Archive and truthful deterministic summary — P0/P1

**Archive:** every playable imported entry appears even if its exact printing has no flavor text or failed resolution. For each, show card name, set, collector number, language/printing ID, section and quantity, and a link to the **actual Scryfall printing** when resolved. Display every available flavor passage for the relevant face(s), verbatim as returned. Keep the raw source text untouched; do not substitute Oracle text, flavor from another edition, inferred lore, or AI paraphrases. Provide fast search and `All / Has flavor / No flavor / Unresolved` filters. Make long passages pleasant to read rather than dumping JSON.

**Deterministic analysis:** use English-only normalized *working copies* of authentic flavor passages. Build a deliberately conservative small engine:
- Find repeated **whole words**, short literal phrases, and optionally a **small explicitly site-authored** lexicon of up to six reviewed motif groups only if every match has traceable rules and no semantic overclaim.
- Exclude a documented tiny set of stopwords; Unicode/word-boundary correctness (`war` must not match `ward`); deterministic tie-break ordering.
- A repeated result needs evidence from at least **two distinct card identities / independent passages**. De-duplicate identical passage content for motif evidence; separately report physical copies, raw hits, printings, and distinct supporting cards.
- Each observation opens its exact matching span, original passage, printing ID, card face, and analyzer rule ID. A literal hit is not evidence of intent, sentiment, metaphor, causality, shared timeline, named-person identity, or canonical Magic lore.
- Summary templates may say, for example: `Of N exact-printing flavor passages, the recurring literal terms are X, Y and Z, found across A, B and C distinct cards.` A motif grouping, if added, must be labeled `site-authored vocabulary grouping`, never “Wizards says this deck is about...”.
- If evidence is insufficient or generic terms dominate, display `Not enough distinct repeated language for a reliable summary` and still show the archive. No grandiose fantasy narrative. No arbitrary numerical theme score. If the summary does not differentiate two fixture decks, remove misleading groups rather than embellish.

Do not download 5,000 unrelated passages, train a classifier, compute embeddings, claim a deck “tells the story of X”, or add a separate lore browser.

## 6. Mechanics Explorer + Atlas-governed discovery — P1/P2

Keep **three clearly separated panels**, not a blended “power report”:

**I. What was detected in this imported deck:** enumerate genuinely present, Scryfall-reported keyword abilities on the resolved imported card records, normalized against the owner's mechanics categories. A source-proven mechanic and a keyword on a card are different claims; support each detected label with exact printing ID, returned card data, and (where possible) the literal Oracle or keywords evidence. Scryfall `keywords` can describe a keyword on the card record; do **not infer the specific face** unless face-level evidence actually supports it. A keyword *granted to another permanent* is different from the card inherently possessing it. Say `Detected via Scryfall keywords` or `Detected via reviewed Oracle text pattern` rather than overstating card behavior. For the first pass, **do not attempt a universal free-text rules interpreter**. At most three non-keyword examples with separately reviewed positive/negative fixtures may be added only after the core journey works. Unsupported means `Not detected by this prototype`, not `your deck lacks it`.

**II. Mechanics to explore in these colors:** show a small curated group of independently verifiable official rules mechanics and, where unambiguously linked, historic Rosewater 2021 placements. The label means “explore related effects supported by the color-pie source/search pool,” **not “you should add this to improve the deck.”** Never claim a Rosewater Primary placement for a rules keyword unless an exact, hand-reviewed crosswalk with source IDs proves it. For mechanics with no verified 2021 counterpart, show the rulebook category and `No verified 2021 color-pie placement linked` instead of fabricating one. Absent Rosewater data = no tier, never no-color-availability. Watch especially for a false join of generic **Ward** to Rosewater’s distinct `Ward (for mana)` versus `Ward (for life)` entries, or generic Trample to `Super trample`. Do not aggregate Primary/Secondary/Tertiary across mixed abilities or assign “Azorius is 8/12 complete.” Search visibility is not proof of strategic fit.

**III. Scryfall discovery:** display one user's selected verified query, its original Atlas row ID/tier/date, final bound query, the row's full `blind_spot` (especially any truncation or coverage limits), an `Open on Scryfall` link, and real first-page results. The user may manually add a printing to the Clipboard. Results do not count as members of the imported deck.

**MVP keyword whitelist: these exact Atlas records, if present and validated on disk (no name-to-query guessing):**
- `keyword-index-flying`
- `keyword-index-trample`
- `keyword-index-deathtouch`
- `keyword-index-vigilance`
- `keyword-index-haste`
- `keyword-index-menace`
- `keyword-index-reach`
- `keyword-index-lifelink`
- `keyword-index-hexproof`
- `keyword-index-ward`
- `keyword-index-prowess`
- `keyword-index-cascade`
- `keyword-index-flash`
- `keyword-index-indestructible`
- `keyword-index-first-strike`
- `keyword-index-double-strike`

Start with **8 verified working rows** drawn from this list; expand to **up to 16 only after** import, flavor summary, clipboard and real search work. Do not enable unverified/incompatible rows just to hit a number. The Atlas row `baseline-contract-commander-deck-card-pool-the-default-baseline` supplies `f:commander id<=[COLORS]`. Compose its verified identity ceiling with the *exact* whitelisted keyword query using safe grammar and explicit encoding. E.g. an Azorius Flying search should have the semantic equivalent of `f:commander id<=wu kw:Flying`; do **not** use `id=wu`, which wrongly excludes mono-white, mono-blue, and colorless. Validate returned `color_identity` is a subset of the chosen identity and `legalities.commander` is `legal` before showing a candidate as Commander-compatible. Even then, this is a bounded card-pool filter, **not** a comprehensive Commander-legal-deck guarantee.

**Specific prohibited automatic shortcuts:**
- `kw:Scry`, `kw:Proliferate`, `kw:Goad`, `kw:Adapt`, or `kw:Investigate` merely because the term occurs in the mechanics list; in the Atlas their `Keyword_Index` entries are `Review` and may mishandle keyword actions. Do not quietly promote them to Production-ready.
- `kw:Landfall`: ability word is not a keyword ability; use only an explicitly approved Oracle-text lens later.
- `otag:*` values not present in a governed allowlist; no invented Scryfall operator.
- `Control`, `Combo`, `Stax`, `Aristocrats`, `Reanimator`, `Ramp` or `Removal` as if each were a single rulebook mechanic or automatically detectable deck strategy.
- A broad Atlas query labeled Production-ready used as a card recommendation, complete mechanic coverage, or a verified detector against imported cards.

If no defensible row exists for a mechanic, leave a descriptive source link and `No verified discovery query in this prototype`—do not synthesize one. No auto-execution of `Review`/`Semantic`/`Do-not-emit` in MVP. Don't display historical Atlas `live_count` as a live result count.

**Crosswalk format:** make a **small versioned file with explicit records** containing `master_name`, `master_category`, `rules_reference` (if verified), `atlas_row_id`, `detection_method`, optional `rosewater_id`, `link_review_status`, `blind_spot`, `source_dates`, and `test_fixture_ids`. No substring/LLM-made Rosewater mappings; no automatic merging of distinct effect families. If the existing Color Pie schema differs, adapt only the new crosswalk; do not edit frozen source. Report supported / query-only / unmatched mechanics counts honestly. It is acceptable for most of the 524 listed entries to be unimplemented in the MVP.

## 7. Discovery Clipboard — independent and useful

Always-available compact **clipboard icon and count** in header. Inspired by the useful **behavior** of Maze/Vox Mana, not its source-code ownership, localStorage key, Reading identifiers or styling.

- Only a manual `Add to Clipboard` action on an actual selected discovery result changes it. Do not add cards implicitly, change imported quantities, or apply swaps.
- Store actual Scryfall printing UUID, original returned name, set code, collector number, language if known, optional originating mechanic query ID, and an editable positive integer quantity. The same printing increments its quantity; two different printings of one card remain separate.
- Separate immutable imported-deck state from clipboard state; persist clipboard in a unique `sessionStorage` key **only for the browser tab's session**, across refresh in that tab. Validate saved objects on restore; if storage is blocked, gracefully use memory only and explain persistence is unavailable.
- Drawer/panel supports readable card list, quantity adjustments, remove one, Clear with a native confirm, real count, zero state, and a visible export.
- `Copy with printings`: `2 Card Name (SET) 123`, one entry per selected printing. `Copy names only` optional and clearly loses printing fidelity. Use real clipboard API when available plus a selectable textarea fallback. Do not promise another site's importer will honor printing data unless tested. Clear label: **“Discovery Clipboard — separate from your imported deck.”**
- No deck slot counter, legality checker, “best cards”, price sorting, recommendations, saved-deck management, EDHREC integration, or third-party deckbuilder APIs.

## 8. UI art direction and visual proof — not a generic dashboard

Treat high visual quality as a **real acceptance criterion**. **Inspect the Owner-supplied `references/` assets first**; if an item in the hierarchy was not actually supplied, do not invent or seek it through an open-ended repository hunt. Reference hierarchy, **read-only**:

1. **Art Trail**: main visual DNA—exploration, intentional geometry, instrument-level precision, considered transitions and graphic relationships. Use supplied screenshots first; record what was actually observed. Inspect a directly identified live screen/CSS only when necessary and available within the narrow permission above.
2. **Probably Paradise GDD**: structured editorial layout, manuscript-like type hierarchy, side annotations, thin rules **only if directly available**; don't guess.
3. **The Color Pie**: disciplined WUBRG accents, field-guide framing, provenance and color mechanics, not its existing routes or scripts.
4. **Robboles blog**: reading typography and rhythm if directly available.
5. **Vox Mana**: sticky/header Clipboard interaction and accessible count; **do not copy its whole brand appearance**.

If any references are missing, **do not invent their visual properties or hunt indefinitely**. Use a bespoke concept: **“a research field journal meets a precision mechanical instrument.”** Design from real content structure rather than fashionable components. Editorial serif for long flavor quotations where available via system fonts, legible sans for controls, compact monospaced technical provenance; ink/charcoal and warm parchment surfaces, subtle rust/metal accents, meaningful **WUBRG color as data**. Offset index spine, rational grid, crisp rules, narrow justified labels, carefully designed empty/loading/error states, and purposeful hand-built SVG/CSS connectors. Do not create AI-generated images; no stock hero illustration. Avoid giant pill cards, big rounded marketing panels, purple/blue gradients, glassmorphism, generic KPI dashboards, endless ornamental animations, “AI aesthetic” boilerplate, or a cloned deckbuilder grid.

**One-page experience:**
- **Masthead:** project identity, active deck/commander status, small color identity marks, persistent Clipboard trigger/count.
- **Import drawer/workbench:** focused first-run paste area and concise formatting example; minimize after successful import, status ledger stays accessible. A small `Load fixture demo` action must be visibly separate from live import.
- **Two main views:** `Flavor Archive` and `Mechanics Atlas`, with results and source-driven context; same imported deck, no repeated upload.
- **Flavor Archive:** strong reading hierarchy, filterable list of passages, dynamic cross-highlight when a repeated token/phrase is selected, source chips beside each actual passage, visible missing-text states. Counts are informative, not deck scores.
- **Mechanics Atlas:** top deck identity, what was actually detected, what is explorable via source-verified colors, context panel for one selected ability with source / card evidence / query. Avoid a fake overall “deck playstyle classification.”
- **Discovery:** Scryfall results in a compact, refined card collection, with optionally a small real printing thumbnail, exact set reference and Add button; preserve selected mechanic and scroll position while inspecting cards/Clipboard.
- **Clipboard:** right drawer or equivalent, usable at desktop and mobile, keyboard focus managed/returned, explicit close, no accidental loss of deck state.

At **1440×900 desktop** and **390px mobile**, the actual browser must show no clipped controls, no horizontal scroll, readable long passages, visually distinguishable provenance, visible focus rings, keyboard-operable controls, accessible modal/drawer behavior, sensible reduced motion, and useful errors. **Take screenshots** if browser tooling is available. Check the real page; a CSS-only review is not a visual PASS. No internal UI status may claim “verified” because mock data rendered successfully.

## 9. Execution sequence, quality gates and cut line

Follow this order **without restarting discovery or expanding scope**:

**Gate A — Inputs and contracts (read-only, brief):** verify the existing `C:\dev\mtg-deck-explorer` destination and the Owner-supplied `inputs/`, `fixtures/`, `references/` directories. Read/hash the four pinned source files, verify basic schema and Atlas tier invariants, inspect the real deck fixture format, and inspect supplied design images. Record missing or unusable references without inventing substitutes. Do not modify, replace, or move Owner-supplied files. No extra research corpus, uncontrolled scan, or mandatory visits to other projects.

**Gate B — Functional core:** implement import → exact printing resolution → Commander identity → full Flavor Archive and source ledger. Verify no silent flavor backfill, batching and missing-data states with fixtures. Stop adding features if this fails.

**Gate C — Deterministic reading + mechanics:** implement lexical summary with evidence/abstention; integrate tiny reviewed keyword/Atlas crosswalk, detected mechanics and separately sourced exploration. Do not add semantic archetype guessing.

**Gate D — Discovery & export:** implement one real vetted Scryfall search → card result → manual Clipboard add → quantity edit → copy with printing → confirm imported deck unchanged. Then enable a few more verified keyword rows.

**Gate E — Visual finish & adversarial QA:** refine real screen composition from inspected Art Trail reference, test mobile/desktop, focus/error/empty/loading, and produce objective report. Fix only discovered acceptance failures in allowed files. Do not add more source categories, import integrations, query recipes or design systems.

**If constrained:** cut from 16 keyword rows to 8; cut editorial motif groups to zero; simplify card thumbnails; retain import fidelity, full flavor archive, a truthful small literal summary/abstention, at least one source-proven mechanic, one real query and independent usable clipboard. Never trade correctness/security or a working end-to-end flow for a larger but unfinished taxonomy.

## 10. Targeted automated and manual tests — do not fake PASS

Create focused `node --test` suites and deterministic fixtures (no external dependencies). Ensure the suite exercises:

1. Plain text parsing, `Commander`/`Deck`/side sections, collector `001a`, duplicate quantities, bad lines retained, optional CSV with quoted names, UUID/set mismatch and name-only ambiguous.
2. Scryfall batching (75 + 25), dedupe, reorder, `not_found`, exact printing ID mismatch, multi-face flavor, missing flavor and no substitute edition; source text preserved verbatim.
3. Separate commander identity W+U = Azorius and colorless case; no commander ≠ inferred deck colors; provisional partner union; off-identity flags not removals.
4. Deterministic flavor token boundaries and repeated phrase matching, distinct card identities vs copies, duplicate passage suppression, exact evidence reference and sorting, sparse-data abstention; static tokens not interpreted as canonical lore.
5. Source parser classifications; official vs Wiki/Acorn/digital/former; identical mechanic names in two categories aren't blindly duplicated; Atlas `row_count` and four tier/auto-execute invariants; 623-row historical census is not 1,086-row revalidation.
6. Approved Atlas keyword IDs only; prevent `kw:Scry`/`kw:Proliferate`/ability-word misuse and `Do-not-emit`; Scryfall query safely combines `f:commander id<=wu` with proper `kw:` term; never `id=wu` for a deck's card pool. Test parenthesization, sanitization and allowed parameters.
7. Detector returns only actually observed keyword evidence; card granting a keyword doesn't automatically establish that it has that keyword; no keyword / unresolved card doesn't become a “missing deck mechanic.” No unverified 2021 color tier and no repair advice.
8. Actual search candidates individually rechecked for WU identity subset and Commander legality status; skipped incompatible results disclosed; a zero-result search is not broadened silently.
9. Clipboard duplicates same printing merged, different printings distinct, quantity changes, storage restore, clear, exported exact printing lines, fallback manual copy, no mutation of imported-deck objects, no Vox Mana key collision.
10. Malformed payloads, oversized input, XSS-like card name/text shown literally, network failure/429, missing source catalogs, inaccessible remote images, and no arbitrary host proxy.
11. Browser at 1440×900 + 390px: test real import/error/focus/panel/drawer flows, keyboard tab order, no horizontal overflow, reduced motion and source links; screenshots or explicit `BLOCKED` reason.

**Real provider smoke** only if outbound internet works: resolve several **actually verified different printings**, include one with flavor and one confirmed without, run a whitelist query, add real result to clipboard and inspect copied output. Don't invent specific live cards or claim fixture data came from Scryfall. If live internet is unavailable, leave functional adapters wired and report `LIVE BLOCKED`; demo must be clearly marked fixture-only.

**QA result vocabulary:** `PASS`, `FAIL`, `BLOCKED`, `NOT TESTED`. A unit fixture passing does **not** mean a real Scryfall flow, browser visual check, or licensing check passed. Do not conceal failing tests to present an attractive report.

## 11. Exact deliverables and finish condition

Inside `C:\dev\mtg-deck-explorer` only:
- Runnable `public/` web app with deliberate responsive typography/layout and accessible interactions.
- Minimal `server.mjs` with allowlisted Scryfall operations; code split into understandable small modules.
- **Unmodified** Owner-supplied `inputs/`, `fixtures/`, and `references/`; a versioned **small** explicit `crosswalk` and lexical-analysis rules with documented source IDs/assumptions; no giant generated ontology.
- Test fixtures and automated tests runnable without network.
- `README.md`: one-command start, tested Node version, supported pasted and CSV formats, exact-printing limitations, example deck fragment, fixture-mode truth label, source/Atlas version, rate limits, outbound calls, clipboard export, non-goals and accessibility notes.
- `PROTOTYPE_REPORT.md`: changed file inventory, **hashes for all four pinned inputs**, actual deck fixture(s) exercised, actual supplied design references inspected, number of mechanics list entries and Atlas records seen, crosswalk mappings supported versus search-only/unmapped, **actual** tests and results, provider and browser verification status, visible UI findings with screenshot paths if made, defects, source/legal caveats, limitations, and bounded **GO / NO-GO to show a real player**. If browser/live validation is blocked, mark that specifically; do not equate “not tested” with “working”.

Before finishing, inspect the target file list/diff for scope creep. No commits, pushes or feature expansion. Acknowledge any requirements cut to maintain quality. Do not run new phases or create a backlog without the Owner's permission.

### User-facing acceptance scenario

The Owner runs one local command, opens one attractive webpage, pastes an existing printing-aware 100-card Commander list, confirms actual printings and normal no-flavor cases, reads every recovered flavor passage, inspects a modest **evidence-backed, deterministic** recurring-language summary, sees their commander's real identity and supported detected mechanics, opens a vetted color-compatible Scryfall search, **chooses** an interesting returned printing, adds it to the clearly separate Clipboard, edits quantity and copies a useful print-aware list—**without AI calls, invented lore, strategic deck advice, or modifications to any existing project or the imported deck**.

END PROMPT
