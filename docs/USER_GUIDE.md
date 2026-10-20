# Using Deck Explorer

[← Back to the README](../README.md)

## Import a deck

Paste an export or choose/drop one `.txt` or `.csv` file. The preview shows the detected format, quantities, extras, and designated commanders before you import. Editing or choosing a file does not contact Scryfall; select **Import deck** to resolve the cards.

Commander and main-deck quantities must total **100**, including the commander. Sideboard, Maybeboard, Considering, and Companion sections are retained as extras and excluded from the main analysis.

### Text lists

Each row needs a quantity and card name. Set and collector number identify a particular edition:

```text
Commander
1 Card Name (SET) 123

Deck
2 Another Card (SET) 045
```

This is a format example, not a complete deck. The [included Cosmic Spider-Man list](../fixtures/cosmicspiderman.txt) is a real 100-card import fixture.

- `1x Card Name` is accepted, as are `[Commander]` and `[Commander{top}]` tags.
- `Deck`, `Mainboard`, and `Main deck` headings identify the main deck.
- Finish markers such as `*F*` and `*E*`, category tags, and supported ownership annotations are preserved as metadata.
- An inline `Maybeboard{noDeck}{noPrice}` tag excludes that row’s quantity from the main deck.
- A trailing singleton after Sideboard can require a placement confirmation. Blank lines alone do not designate a commander.

### CSV files

Generic CSV and the supported Helvault-compatible schema can carry quantities, names, printing identifiers, language, and sections. For example:

```csv
Quantity,Name,Set,Collector Number,Scryfall ID,Language,Section
1,"Card Name",SET,123,,en,Commander
```

Quoted fields and commas are supported. A Scryfall printing UUID takes precedence over set/collector coordinates; conflicting supplied details are reported. Unsupported or conflicting meaning-bearing columns are flagged.

**TappedOut CSV is not supported.** Export a plain-text deck list instead. Renaming a CSV file to `.txt` does not convert it. If that export omits printing details or commander roles, select the commander and review the assumed editions.

### Printing provenance

Flavor text belongs to an edition. The app keeps three cases visible:

| Printing status | Meaning |
| --- | --- |
| Supplied printing | Your list identified an edition; the returned record was checked against the supplied details. |
| Assumed printing | Your list supplied a name, or a name with only a set hint. The displayed reference edition may differ from your physical card. |
| User-selected reference | You chose another edition of the same resolved card identity using its Scryfall printing UUID. |

An invalid supplied printing never silently falls back to a name lookup. Unknown set hints stay visible with a warning; a recognized set hint constrains the lookup. An edition with no flavor text is a valid result.

Non-English editions require an exact Scryfall printing UUID in CSV. Their passages remain readable but are excluded from English repeated-language analysis.

### Failed imports

Invalid lines and unresolved required cards block replacement of the loaded deck. Inspect the reported problems and correct the draft. A failed request preserves the previous deck. Extra-section failures are reported separately from required-deck failures.

The import is bounded to 200,000 characters and 500 entries across all sections; files have an additional 800,000-byte limit before decoding. Quantities must be positive integers from 1 to 999. **Clear pasted text** clears the draft while preserving the loaded deck and Clipboard.

## Read the cards

Choose one or two distinct imported cards as commanders, or use the designated Commander section. Color identity comes from Scryfall’s card data. Two commanders produce a provisional combined identity; pairing eligibility is not checked.

In the reading view:

- Search for a card or passage.
- Hover or keyboard-focus a card name for a preview. Select it to open the detail dialog; Escape closes it.
- On supported double-faced cards, the face control changes art, rules, and flavor together. Split and Adventure cards display their named text parts together.
- Inspect printing details to see the edition, original import row, and source link.

Repeated-language results use normalized English words and two- or three-word phrases. Each result needs at least **two distinct card identities and two independent passage texts**. More copies of one card, or the same passage repeated across cards, cannot create independent support. Open the evidence to inspect the original passages and matching spans.

The analysis can return no supported repeated terms. It makes no claim about a deck’s story, intent, or quality.

## Explore mechanics and other cards

Mechanics come from two explicitly distinguished sources: Scryfall’s reported keyword labels, and reviewed matches against full Oracle wording or symbols. Exact source slices are retained for wording matches. These can include grants, restrictions, reminder text, or references, so a match is not proof of an inherent ability.

Open a mechanic to inspect its contributing cards and rules/reference panel. Some references establish an official numbered rule; others document a named card, a designer’s explanation, or playtest format guidance. The source label describes that scope. Unknown provider labels remain visible without automatically gaining a search.

Selecting a mechanic does not run a card search. Use its **Find** section to search deliberately:

- Results must be reported Commander-legal and within the selected commander color identity; colorless cards can qualify.
- Two selected commanders use their combined color identity, without establishing that the pair is legal.
- Searches use reviewed recipes. Review-tier recipes disclose their limits.
- Results show one printing per distinct card and can be browsed in pages of 24.
- A zero-result search remains empty. Playtest or digital labels can be inspectable in an import while having no Commander-legal discovery results.

Searches identify cards matching a recipe. They do not recommend additions or certify a complete deck’s legality.

## Collect and export

Select **Save** below a discovery result, or **Save to Clipboard** in its detail dialog. Browsing alone never collects a card.

Saving the same printing increases its quantity. Different editions stay separate. In the Clipboard you can search, change quantities, remove entries, and browse pages of 12 printings.

Copy/export includes the **entire Clipboard**, even when a filter or page hides some entries. The format retains edition coordinates:

```text
2 Card Name (SET) 123
```

If browser clipboard access is unavailable, use the selectable text field to copy manually. Compatibility with every other deckbuilder’s importer has not been verified.

## Storage and network access

| Data | Where it lives |
| --- | --- |
| Import draft, loaded deck, and card details | Browser memory; reload and reimport to restore the deck. |
| Saved printing coordinates and quantities | Browser session storage, surviving refresh within that tab’s session. |
| Provider responses and resolved import contexts | Bounded, temporary server memory; discarded when the server stops. |
| Card images | Loaded directly from Scryfall when displayed. |

If session storage is unavailable, the Clipboard stays in memory and the app explains that limitation. After a refresh, saved coordinates can still be exported, but card art and rules may be unavailable until that printing is encountered again.

Explicit imports and searches contact Scryfall through the local server. There are no searches as you type, automatic discovery searches, telemetry, or model endpoints. The local server serves static files only from `public/`; fixtures and reports are available in this public repository but are not served by the running app.

**Export discoveries you want to keep before ending the browser session.**

## Troubleshooting

| What happened | What to try |
| --- | --- |
| The 100-card check fails | Count quantities, include the commander, and check section headings or maybeboard tags. |
| A supplied edition cannot be resolved | Check the set code and collector number, or use the exact Scryfall printing UUID in CSV. |
| A name-only import shows an unexpected edition | Review its assumed-printing label and choose a reference edition of the same card. |
| A card has no flavor text | Inspect the edition: some printings have none. Missing text is not filled in. |
| Discovery says the import context expired | Reimport the deck; server contexts expire after 30 minutes. |
| A provider request fails or is rate-limited | Read the error and any stated retry interval. The app does not replace failed requests with demo data. |
| Copy does not work | Use the visible manual-copy field. |
| Port 4173 is in use | Stop the other server or set a different `PORT` before starting this one. |
| Server-side changes do not appear after refresh | Stop and restart the Node process, then refresh the page. |

For example, in PowerShell, start on another port with:

```powershell
$env:PORT = '4174'
node server.mjs
```

Then open [http://127.0.0.1:4174](http://127.0.0.1:4174).

For a reproducible problem, [open an issue](https://github.com/rboles84/mtg-deck-explorer/issues) with the smallest relevant list, exact printing details, steps, and expected/observed behavior. For a source correction, include the original publication or card link.
