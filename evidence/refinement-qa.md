# Visual refinement verification

October 16, 2026 · local Deck Explorer · Node v24.14.0 · Codex in-app Chromium.

## Final behavior

- The commander has an always-visible exact-printing image. Selecting it opens the existing card viewer; it does not produce a redundant hover preview. The commander panel shows one identity-symbol row, without the duplicate WUBRG label or mana-cost row. White mana has a contrasting outline.
- Passage and repeated-word evidence use dark rounded dialogs with centered Close controls. They show card art, exact set symbols, edition metadata, highlighted passages and useful counts. Printing identifiers and human-readable import line numbers are inside optional details. Analyzer IDs, row IDs and character offsets are absent from the reading surface.
- Mechanics show official rules and the matching imported cards together. The dated official rules text is extracted locally into 3,322 numbered entries and 1,331 sections. Rule references support hover, keyboard focus and click; cross-references open other local rule sections. The original source and extraction script are retained.
- Discovery uses compact printed-card images with a persistent Save action. Search meaning is explained in ordinary language. Raw JSON and repetitive provenance labels are removed from the main flow; source dates and limitations remain available in the footer and optional explanations.
- The user's final correction is applied: discovery uses **`id<=`**, the frozen Atlas commander-pool baseline. Fewer-color and colorless cards within the commander identity are included. No exact-identity override remains active.
- Clipboard rows are compact, searchable, and paged at 12 printings. Export always includes the entire collection. Save badges track quantity changes and removals.

## Automated verification

**76 tests passed, 0 failed, 0 skipped.** Full output: [refinement-tests.txt](refinement-tests.txt).

Coverage includes parser/resolution, original source hashes, exact images and faces, local symbol support, the restored subset query and result validation, reproducible pinned rules extraction, and a 60-printing Clipboard fixture. The collection tests prove complete page coverage, search normalization, separate editions, full export despite filters, clamping after removal, persistence and imported-deck immutability.

All 18 original files under `inputs/`, `fixtures/`, and `references/` remain byte-identical. No package dependency, deployment or source-folder modification was introduced.

## Actual browser checks

| Check | Observed result |
| --- | --- |
| Owner import | PASS: 84 entries / 100 physical cards / 84 resolved printings / 58 flavor passages. Cosmic Spider-Man remains selected. |
| Commander direct image | PASS: keyboard focus produces no hover popup; Enter opens Cosmic Spider-Man in the card viewer. |
| Passage evidence | PASS: Arachnogenesis shows its card, DSC set symbol, exact passage and one deck copy. Optional details read “From line 1 of your import · Deck.” No input-row jargon remains. |
| Dialog consistency/sizing | PASS after a CSS correction: single-passage dialog is content-sized (about 387px high at desktop), centered and dark. Long evidence remains bounded and scrollable. |
| Repeated-word evidence | PASS: “spider” shows 12 card entries, 12 set symbols and 15 highlighted matches. No character spans, analyzer IDs or raw row IDs are present in visible text. |
| Rules with deck cards | PASS: Flying shows 702.9a–c and visible Cosmic Spider-Man, Gwen Stacy // Ghost-Spider, and Spider-Woman, Stunning Savior cards. |
| Rules hover/focus | PASS: exact Flying section appears on pointer hover and keyboard focus. Escape dismisses a pointer-only popup with focus elsewhere. |
| Rules cross-reference | PASS: clicking Flying opens its dialog; clicking 702.17 opens Reach's three subrules locally. |
| Mobile rule preview | PASS: x16, width343, right359 inside client width375 at a 390px viewport. No document horizontal overflow. |
| Corrected live search | PASS: Haste uses `(f:commander id<=wubrg) (kw:Haste)` and reports 2,043 matching printings; Flying reports 9,963. These are observed provider counts, not permanent catalog values. Both display the bounded first 12. |
| Discovery gallery | PASS: 12 actual images with visible Save actions. Unsupported exact set codes remain readable once, without guessed icons or doubled set labels. |
| Clipboard editing/copy | PASS: Adeliz DOM 190 changed to quantity 2; actual clipboard readback included `2 Adeliz, the Cinder Wind (DOM) 190` and the other three selected printings. |
| Search vs export | PASS: filtering Clipboard to Dragon shows one row while export retains all four collected printings. |
| Pagination | PASS with real results: 16 printings / 17 cards; page one shows 12 rows, page two shows four; export retains 16 lines. Focus returns to the search field after reaching the final page. |
| Session restoration | PASS: all 17 physical cards remain after reload. Artwork metadata remains in memory only; the same searches restore known card metadata without changing saved entries. |
| Save badge synchronization | PASS: quantity change shows Saved ×2; removing the temporary collection resets discovery controls to Save. |
| Mobile Clipboard | PASS: clientWidth and scrollWidth both368; quantity/remove controls stay visible, list scrolls within the dialog, and Shift+Tab from Close wraps to Clear within the dialog. |
| Mobile passage | PASS: dialog clientWidth/scrollWidth both368, readable quote and edition, centered Close, no horizontal overflow. |
| Browser diagnostics | PASS: final warning/error log is empty. |

All 16 temporary test printings were removed using their ordinary Remove controls. The delivery tab's Clipboard was empty before testing and is empty again. The owner deck remains loaded. The local server remains running on port 4173.

## Screenshots

- [Commander](refinement-commander.png)
- [Passage dialog](refinement-passage.png)
- [Repeated-word evidence](refinement-observation.png)
- [Rules and imported cards](refinement-mechanics.png)
- [Discovery gallery](refinement-discovery.png)
- [Compact Clipboard](refinement-clipboard.png)
- [Mobile passage](refinement-mobile-passage.png)
- [Mobile Clipboard](refinement-mobile-clipboard.png)

## Verification limits

Viewport and keyboard checks are browser tests, not physical touch-device or exhaustive screen-reader audits. Reduced-motion CSS remains implemented; OS-level emulation was not available. Native Clear confirmation was not exercised; temporary data was removed entry by entry. Network failure, denied Clipboard permission and blocked storage were not deliberately induced in this browser pass. Previous deterministic safeguards remain covered. Scryfall imagery-term verification remains outside the successful image-loading checks recorded here.
