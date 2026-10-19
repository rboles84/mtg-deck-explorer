# Mechanical Projection Contract

> ## SOURCE LAYER STATUS: **FROZEN**
>
> Accepted Mechanical Color Pie 2021 baseline:
> **217** source identities · **216** projection mechanics · **1** structural-only
> identity · **19** adjudicated identity merges · **5** adjudicated tier conflicts ·
> **0** unresolved identities · **0** unresolved conflicts.
>
> Do not reopen extraction, identity reconciliation, or tier adjudication during
> downstream work unless `check_invariants.py` fails, or a concrete contradiction
> with the controlling Wizards source is demonstrated.
>
> Downstream disagreement belongs to the Vox projection or presentation layer,
> **not** the source layer.

### The only four reasons to reopen

1. `check_invariants.py` fails against an untouched rebuild.
2. A specific passage of the 2021 article or its change log is shown to be
   missing or misrepresented.
3. A deterministic parser defect is demonstrated with a concrete source example
   and it changes source truth — not naming or style preference.
4. A separately scoped newer Mechanical Color Pie version is begun. That is a
   new dated dataset; it does not silently mutate the 2021 snapshot.

None of these reopen it: two mechanics feel similar · a family would be tidier
combined · the UI would prefer 215 · a label is awkward · modern Magic probably
differs · Scryfall suggests these behave alike · maybe the group header should
count differently · Claude thinks Rosewater probably intended something else.
Those may change aliases, Vox families, presentation, or a future dataset. They
may not change what the mechanics are.

### Statistical recon: FROZEN

`data/recon/` measures this layer and is itself frozen. Its terminology is
canonical and is not to be reopened during UI work because another label would
read better:

- `shared_any_access` is INCLUSIVE of `shared_primary`.
- `shared_mixed_tier` is the exclusive remainder, and is the population that
  `selection.py` and the golden fixtures call `shared_access`.
- `shared_any_access = shared_primary + shared_mixed_tier`, asserted for every
  multi-colour selection.
- `canonical_family_members` is a partition summing to 216;
  `expanded_family_neighborhood` adds secondary cross-links and overlaps.

`tools/check_recon.py` is the freeze gate. It invokes the source, taxonomy and
fixture gates itself before asserting 53 statistical properties, so the chain
cannot be skipped by forgetting to run something.

### Gate order, enforced

    source gate -> generate -> downstream gate

- taxonomy: source gate → taxonomy generation → taxonomy gate
- runtime: source gate → taxonomy gate → runtime generation → fixture gate
- UI: source gate → runtime/fixture gate → UI

If an upstream gate fails, downstream generation never starts. `check_taxonomy.py`
runs the source gate itself rather than trusting the operator to remember.

What the Mechanics layer is allowed to say, and on what authority.

Written before implementation on purpose. The extraction is finished and
frozen; the open question is no longer *can we trust the data* but *what
questions should the UI ask of it*. This document answers only the second.

Status: **contract agreed.** The Color Wheel no longer carries a Mechanics
mode (its preview was removed in Story 1); nothing in
`vox-color/color-wheel.html` reads any of this.

---

## 1. The frozen source layer

`data/mcp2021.reconciled.json` is the authority. It is frozen at:

| | |
|---|---|
| colour/tier sections captured | 15 of 15 |
| raw colour-list placements | 465 |
| ability-catalog entries | 212 |
| **source identities** | **217** — FROZEN |
| structural / group-header only | 1 |
| **projection mechanics** (peer-eligible) | **216** — FROZEN |
| genuine internal source conflicts | **5**, all adjudicated |
| unadjudicated TIER conflicts | 0 |
| unruled IDENTITY pairs | 0 |

Frozen means: no further parser pass without a stated defect. Another
extraction run is now more likely to add risk than value.

*Note (Story 2, 2026-10-08, reason 3):* two parser defects fixed against the
article HTML (the copy fetched 2026-10-08 had sha256
`51017283b25a7506ff14d7fed27681468ba845a3c7b4b9f999d145c47bc29898`; the page's
bytes vary between fetches, so this identifies that copy only. The unfixed
parser reproduced the frozen files byte for byte from it, and QA's own fetch
reproduced the rebuilt files). (1) A
label split across `<b>` and `<strong>` was missed, so "Creature sacrifice,
forced, repeatable" lost its catalog entry and its explanation became a
second "-N/-N to their team"; it is now captured. (2) "Return target
creature from graveyard to hand." is marked up as a top-level entry; it is
kept under "Returning cards from graveyard to hand." by a named exception
(the 2017 edition shows it as a bullet item). No tier, placement, identity,
merge, conflict, family or golden changes; one basis moves colour-list-only →
both-agree. `data/recon/` was regenerated against the colour wheel as of
`96ae609`, its original input, with tie order now deterministic.

### Two counts, never one

- **Source identities (217)** — everything Rosewater actually listed,
  including structural/group entries. `Putting cards from hand onto the
  battlefield` is genuinely a Green-primary summary item *and* the catalog's
  heading over its variants, so it is counted here and marked
  `structural_only`. It is **never quietly subtracted** from this number.
- **Projection mechanics (216)** — leaf mechanics eligible to behave as peers
  in the UI. `structural_only` records are excluded from peer-mechanic maths.

Every merge keeps both original spellings under `source_aliases`, so it stays
provable. 18 records carry them.

**The 393-entry digest is deprecated.** It lost about 15% of the placements
and merged distinctions Rosewater actually drew. `tools/normalize_mechanical_pie.py`
and its outputs are retained as an audit artefact and as the record of how the
loss was found. They are not an alternate authority, and its 41-item split
queue is void — the article separates those bundles itself.

### The four adjudications

All four resolve toward the ability catalog, but the *reason* differs and the
reason is the part that matters.

| mechanic | colour | list | catalog | ruled | basis |
|---|---|---|---|---|---|
| `Flash` | B | tertiary | secondary | **secondary** | change log: black moved tertiary → secondary in 2021, so the list entry is stale 2017 data |
| `+N/+N (on spells)` | W | secondary | primary | **primary** | change log: White was primary in 2017 too, so the list contradicts both editions |
| `Exiling cards from graveyard` | W | primary | secondary | **secondary** | absent from the change log, so unchanged since 2017; list error |
| `Deal N damage to a creature with flying.` | R | secondary | tertiary | **tertiary** | absent from the change log; the catalog explains why green is the stronger anti-flying colour |
| `+N/+0 to your team` (ongoing) | B | secondary | tertiary | **tertiary** | persistent summary/catalog inconsistency in **both** 2017 and 2021; no 2021 change recorded |

Conflict #5 was invisible to the original audit. Before identity
reconciliation the summary label `+N/+0 to your team, ongoing` and the catalog
entry `+N/+0 to your team` under the ongoing group were two different
mechanics, so nothing ever compared their tiers. **That is the argument for
the gate:** literal-string reconciliation cannot detect a contradiction
between two records it believes are unrelated.

The losing claim is never deleted. Each carries `conflict`, `basis:
"adjudicated"` and the ruling's authority.

### The standing rule

> When the ability catalog and a colour summary list disagree, the catalog
> wins, because that is where the classification is discussed rather than
> merely tabulated. The contradicting claim is preserved as provenance.

Any future conflict is `UNADJUDICATED-CONFLICT` in the audit and **blocks**
the runtime build until ruled on. It is never resolved by the default.

*Note (Gate A, V11): "catalog wins" governs only the frozen `tier` field.
Player-facing output uses the two-reading projection (PRODUCT-DEFINITION
§18.8–§18.9): the three unresolved placements are shown as both official
claims.*

---

## 2. Three layers, and the wall between them

    SOURCE          Rosewater's mechanic, tier, explanation, date, provenance
      |             frozen; never inherits anything from below
      v
    VOX PROJECTION  normalised ids, functional families, search terms
      |             every record labelled source_class: vox_mana_derived
      v
    PRESENTATION    counts, comparisons, deltas, expandable detail

The wall is one-directional. `Exiling cards from graveyard — B primary, W
secondary, G secondary` is Rosewater. `family: graveyard_interaction` is ours,
and must be labelled as ours wherever it appears. A reader must never have to
guess which one they are looking at.

---

## 3. What the tiers mean in presentation

Rosewater's own definitions, and they are about **frequency and ownership in
design**, not card quality:

- **Primary** — the colour the ability appears in most: highest volume, lowest
  rarity it is used at, usually the colour that pushes power level.
- **Secondary** — appears regularly but less often, not always at as low a
  rarity, and may carry restrictions.
- **Tertiary** — occasional, not every set, sometimes years apart, often
  narrow or rules-bound.

Three hard rules follow.

**No score.** Tier counts must never be summed into a "mechanical power
score", a rating, or a bar whose length implies strength. Primary is not
stronger, tertiary is not bad. A colour with 60 primary mechanics is not
better than one with 45.

**Tiers are relative to how often an effect is used at all.** Secondary flying
appears far more than primary extra-turns. Never compare tiers across
different mechanics as if they were the same unit.

**Always dated.** Every Mechanics view carries, visibly and not in a drawer:

> Mechanical Color Pie 2021 · snapshot dated October 18, 2021

Never "Current Mechanics". Rosewater states it is a snapshot that will
continue to evolve, that per-set needs bend the default, and that some entries
are experiments that may not stick.

---

## 4. Selection semantics

Mechanics is a **projection**, not another geometric relationship. When it is
on, the alliance / conflict / four-colour chord semantics are suppressed. The
five colour nodes remain; selection illuminates nodes; the panel changes.

### One colour

Rosewater's three tiers for that colour, groupable by Vox family.

### Two or more colours

**Never manufacture pair mechanics.** There is no such thing as "Orzhov
mechanics" in this dataset. Compute over the selected set instead:

| section | contains |
|---|---|
| Shared strengths | mechanics where every selected colour is primary |
| Complementary strengths | mechanics one selected colour supplies that the others do not |
| Conditional access | reachable only at secondary or tertiary, shown with the catalog's restriction |
| What changes if… | the add/remove delta, below |

### Best access never replaces ownership

For a selection, a mechanic's best available tier is the strongest tier any
selected colour has. That answers "can this deck do it, and how centrally" —
it is **not** a summary of who does it. Per-colour ownership is carried
alongside, always. White tertiary plus Blue primary is *"best access primary
via Blue, and White also has tertiary access"*, never just "primary".

### Adding or removing a colour

Adding — four outcomes, not three:

- newly reachable
- best tier improved
- **new owner without tier improvement** — adding a colour to a selection that
  already has primary access cannot raise the maximum, but it can add a second
  colour that legitimately performs the mechanic. That is real information
  about the combination and must not vanish because a maximum did not move.
- unchanged / still unavailable

Removing — three outcomes: lost completely · tier degraded · **lost an owner
but retained access**.

### Four colours

Ask what capability is **lost** because one colour is absent, computed from
the catalog. This is better grounded than deriving a philosophy for the
combination, and it replaces guesswork with arithmetic.

### Five colours

The complete coloured catalog with no colour-based access restriction — but
the per-colour ownership distinctions stay visible. Access to everything is
not the same as equal ownership of everything.

---

## 5. Explicit non-goals

- No power score, rating, or strength ranking.
- No "pair mechanics" or per-edge mechanic lists.
- No 238-row reference table dumped onto the page. Summarise, then expand.
- No Vox family presented as though Rosewater wrote it.
- No claim that this is the current state of the colour pie.
- No mechanic distinction collapsed that the article draws — in particular
  `Cast spells from your graveyard` and `Cast spells out of graveyard` stay
  separate, and the `(on creatures)` / `(on spells)` / `(on Auras)` variants
  stay separate.

---

## 6. Fixtures required before wiring

Each must be reviewed as data before any of it reaches the wheel:

1. `W` — one colour, all three tiers
2. `WB` — two colours, all four panel sections
3. `BG` — a pair whose colours share little, to test Complementary
4. `UBR` (Grixis) — three colours, and the delta language already used there
5. `WUBR` — four colours, framed as what Green's absence costs
6. `WUBRG` — five, to check the "access is not ownership" framing
7. A mechanic with a restriction — `Flying`, for red's Dragons-and-Phoenixes
8. An adjudicated mechanic — `Flash`, to check the conflict is visible
9. A mechanic with no primary colour — `Playing cards off the top of your
   library, paying their mana cost`, which Rosewater made primary in no colour
10. A tertiary-only reading — to confirm it does not read as "bad"
11. **Provenance** — an identity merge surviving into the runtime: one
    mechanic, one canonical key, all source aliases still reachable, and no
    duplicate appearance in any count. Added beyond the original ten because
    it tests the exact class of bug that caused most of the source-phase
    trouble: a merge being silently undone downstream.

Fixture 9 matters: it disproves the natural assumption that every mechanic has
a primary colour. The introduction says there is always a primary; the catalog
contains an explicit exception. The data models the article, not the
introduction.

---

## 7. Order of work

1. ~~Extraction and reconciliation~~ — done, frozen.
2. ~~Adjudicate the four tier conflicts~~ — done, recorded with basis.
2.5 ~~Identity reconciliation~~ — done. 14 pairs ruled, merges applied
   BEFORE tier reconciliation, conflict detection rerun over the unified
   identities, one new conflict exposed and adjudicated. 0 unruled,
   0 unadjudicated.
3. ~~Vox family taxonomy~~ — **complete, 216 of 216.**
   `data/vox.families.json`, generated by `tools/build_taxonomy.py` from
   explicit ordered rules and validated by `tools/check_taxonomy.py`:
   23 families, **0 miscellaneous**, 0 unused, 36 mechanics carrying a
   secondary family. The pilot's 19 families needed 4 more at full scale
   (`stat_modification`, `characteristic_change`, `cheat_into_play`,
   `win_condition`); no existing family had to be split or abandoned.

   The RULES are the reviewable artefact, not 216 individual opinions. The
   builder **refuses to emit a miscellaneous family** and exits non-zero with
   the unclassified list, so a gap sends you to review the taxonomy — never
   the source layer, and never a junk drawer to reach 100%.

### Invariants, enforced not merely stated

`tools/check_invariants.py` exits non-zero if any of these drift. Run it after
every rebuild, before anything downstream is generated. It is negative-tested:
removing one mechanic and stripping one adjudication's authority produces
three failures and exit 1.

**217** source identities · **216** projection mechanics · exactly 1
`structural_only` · **19** identity merges · 5 adjudicated conflicts · 0
unadjudicated · 0 unruled identities · aliases retained after every merge · the
raw unmerged reconciliation stays reproducible independently · identity
rulings are inputs, never derived from reconciled output · every rebuild
reruns tier-conflict detection after identity merging.

### The merge safety hierarchy

Level 4 is what the four semantic pairs used, and the level exists precisely
so that "a reviewer decided" is never confused with "the matcher inferred".

| level | kind | automatic? |
|---|---|---|
| 1 | typesetting / unicode | yes |
| 2 | deterministic grammatical equivalence | yes |
| 3 | meaningful word changes | **never** |
| 4 | meaningful word changes **with direct source evidence** that one wording updates or parameterises the other | reviewer may rule `same-mechanic` |

**Do not generalise level 4 into "inserted or deleted words are safe to
merge".** The conservative matcher was right to refuse all four; what unlocked
them was external evidence, not similarity.

### The four semantic identities, and their evidence

| pair | canonical | evidence |
|---|---|---|
| `creature/player` vs `creature/planeswalker/player` (hand-size damage) | the planeswalker wording | change log: OLD is the shorter form, NEW adds planeswalker as a target |
| same, for sacrifice-for-damage | the planeswalker wording | same change-log entry |
| `power 3/4 or greater` vs `power 3 or greater` (single) | `power 3 or greater` | change log documents the floor moving from 4 to 3 |
| `power 3/4 or greater` vs `power 3 or greater` (mass) | `power 3 or greater` | the change log's own NEW text is `3/4 or greater`, then says the number is most often 3 but can be tweaked up — so `3/4` is Rosewater's shorthand for one parameterised threshold |

The shorter summary wording survives as a `source_alias` in every case.
4. ~~Runtime projection~~ — done. `data/mechanical-color-pie.runtime.json`,
   generated by `tools/build_runtime.py`. Contains NO new judgments: every
   value is indexed from the frozen source layer and the frozen taxonomy, so
   deleting it regenerates it identically. `meta` carries the snapshot date
   and the tier caution, so the UI cannot omit them.
5. ~~Fixtures~~ — done, **eleven** golden files in `data/fixtures/`.
   `tools/fixtures.py` regenerates and compares byte-for-byte; `--update` only
   after deciding new output is correct.
6. Panel design.
7. ~~Panel implementation~~ — done, behind the disabled toggle. The runtime is
   inlined by `tools/inline_runtime.py` because the app runs from `file://`
   where `fetch()` cannot read a sibling file. Reachable only via
   `#mechanics=preview` until the visual review passes.
   *Note (Gate A, V16): superseded. Every hash the router reads as the
   Mechanics route now lands in Explore at rest and is canonicalised; the
   preview is unreachable.*
   *Note (Story 1, 2026-10-08): the preview, its inlined runtime and
   `tools/inline_runtime.py` have been removed from the Color Wheel. Only the
   route guard remains.*
8. ~~Enable the toggle.~~ Withdrawn: the toggle was removed with the preview
   (Story 1). Mechanics is served by the Mechanical Color Pie explorer.

Steps 3–5 and 7 are done; step 8 is withdrawn.

### The gate, and why it is structural

    identity rulings -> rebuild union -> RERUN tier conflicts
      -> adjudicate everything newly exposed -> zero UNADJUDICATED
      -> only then is the count frozen

The merges are an **input to the parser**, applied before tier reconciliation,
not a cleanup afterwards. The conflict detector therefore reruns over unified
identities on every run, and a contradiction hidden by a wording difference
surfaces by itself. Merely checking that the 14 proposals were consumed would
not have been enough: the fifth conflict only exists after the merge.

The identity audit reads `mcp2021.reconciled.raw.json`, the UNMERGED baseline,
never the merged output. Running it against an already-merged file is
circular — the merges hide the pairs the audit exists to find, and it reports
a clean bill of health it has not earned.

### Step 2.5 relationship vocabulary

| value | meaning |
|---|---|
| `same-mechanic` | one mechanic, two spellings. Both labels kept as aliases. |
| `distinct` | genuinely separate. Never merged on similarity. |
| `group-header` | a heading the catalog breaks into variants. Kept as source; **must not become a peer mechanic in the runtime model.** |
| `variant-split` | the list encodes a qualifier in the label that the catalog puts in the group header. |

Candidates are generated by conservative normalisation ONLY — unicode and
invisible characters, terminal punctuation, grammatical number, trivial
morphology. Semantic similarity is never grounds for a merge, automatic or
proposed. Unicode and punctuation artefacts merge automatically because they
are typesetting, not meaning; anything that changes a word waits for a ruling.

**Hard audit condition:** no obvious same-mechanic pair may remain split
merely because its wording differs. Any `UNRULED` entry blocks the build.

---

## 8. Lesson worth keeping

The article's HTML is semantically richer than its paragraph hierarchy
suggests. Three parser defects, each producing plausible wrong data rather
than an error:

- tier lines matched inside explanation prose, so *"This ability was primary
  in both black and green"* parsed as an assignment;
- sub-abilities live in `<li>` **between** paragraphs, so a paragraph-only
  scan filed all 19 creature-pumping variants under one group header;
- stripping every parenthetical collided `(on creatures)` with `(on spells)`
  and `(on Auras)`.

The first run reported 8 conflicts. Five were mine. **A future extractor must
account for intervening `<li>` labels and must not infer mechanic identity by
stripping qualifiers.**
