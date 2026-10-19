# Compact archive and complete discovery pagination — October 17, 2026

## Automated verification

- `node --test`: **86 passed, 0 failed, 0 skipped**. Output: [compact-pagination-tests.txt](compact-pagination-tests.txt).
- Includes source preservation for all 18 supplied files, exact imports, unchanged `id<=` semantics, validated numeric pages, provider-boundary paging, newest-printing preference, defensive duplicate handling, page-scoped skip reporting, stale result totals, expired contexts, Clipboard independence/export, and image safety.
- Syntax checks passed for the changed application, viewer, provider client and server modules.

## Browser verification

Tested through the in-app browser against the real localhost app and Scryfall, using the owner's Cosmic Spider-Man fixture. Browser operations used visible controls and read-only DOM observations. No fixture, reference or input source was edited.

### Archive and rules

- Real import retained **100 physical cards / 84 input entries / 84 resolved printings / 58 passages** after discovery, saves, paging and copy.
- Archive entries contain no `.entry-mana`. Printing details sit beside each passage on desktop and stack below on mobile; native disclosure opens and closes correctly.
- Arachnogenesis retains its DSC set symbol and exact flavor passage. Clicking its name opens the card viewer without a discovery Save action.
- Keyboard focus and pointer re-entry both show the exact-printing preview. Escape dismisses it; closing the card dialog returns focus to the name.
- Flying shows its inline official rules and **3 imported cards**, with no duplicate primary-rule button. Cross-references `509` and `702.17` remain interactive. Selecting `702.17` opened the Reach rules.

### Discovery and pagination

- Flying: **3,164 distinct cards / 132 pages** at test time. Pages 1 and 2 each displayed 24 distinct names, with no overlap. Page 8 displayed 24 across a provider batch boundary. Page 132 displayed the final 20 and disabled Next. Returning to page 1 restored the result grid and saved quantity.
- Deathtouch: **329 distinct cards / 14 pages** at test time. Page 1 contained 24 different cards and exactly one Acidic Slime. Its chosen printing was TMC 48 (the Marauding Mutagen alternate-name printing). Page 14 contained the final 17 cards and disabled Next.
- Provider query retains `(f:commander id<=wubrg)` and the selected keyword, with `prefer:newest`; `unique=cards` selects one gameplay card per result. Counts are live observations, not fixed promises.
- Result tiles have no duplicate name heading or set metadata below the image. Card inspection still supplies that information.
- An actual unavailable-art result (Abigale, Poet Laureate) displayed its returned face name and the explicit unavailable-art message after the final refinement; no replacement image was fetched.
- Save is beneath the image. DOM geometry confirmed no overlap with artwork and a 44px interaction target; the visible control is smaller.
- Previous/Next and direct page selection work. Focus returns to the top page selector after paging.
- Pending-request regression exercised: selected Flying page 60, opened the old Aang image while loading, waited for the grid to be replaced, then pressed Escape. Focus returned to `discovery-page-top` on page 60 instead of the document body.

### Save and export

- Opened Aang, Air Nomad from discovery; **Save to Clipboard** added one copy while keeping the viewer open. **Save another copy** updated the viewer to two copies and the grid to `Saved ×2`.
- Closed and reopened after paging away/back; the viewer still reported two copies.
- Saved Acidic Slime directly from the grid. Actual browser clipboard readback after Copy all with printings was:

```text
2 Aang, Air Nomad (PMEI) 2025-25
1 Acidic Slime (TMC) 48
```

- These were temporary verification entries in the agent preview tab, which began empty. Both were removed individually after testing; final Clipboard count is zero. No user-owned saved collection was cleared.

### Responsive checks

- Desktop: 1440 × 1000. Mobile: 390 × 844.
- Mobile discovery showed two image columns with controls outside art. Final-page selector remained below the sticky navigation (top ≈199px), held keyboard focus, and the document had no horizontal overflow.
- Mobile card viewer width was 370px; Save and saved quantity appeared directly below the art. Archive details stacked without horizontal overflow.
- The final preview tab reported no browser warning or error logs.
- Native touch hardware and a full screen-reader audit were not performed. Existing deterministic Clipboard pagination/export coverage remains in place; this pass did not recreate the prior 60-card collection exercise.

## Visual evidence

- [Desktop archive](compact-archive.png)
- [Archive hover preview](compact-archive-hover.png)
- [Mobile archive](compact-mobile-archive.png)
- [Inline mechanic rules](compact-mechanics.png)
- [Distinct-card discovery](compact-discovery.png)
- [Deathtouch cards](compact-deathtouch.png)
- [Save inside the card viewer](compact-discovery-viewer.png)
- [Mobile final-page navigation](compact-mobile-discovery.png)
- [Mobile card viewer](compact-mobile-viewer.png)

The local server remains available at http://127.0.0.1:4173. No public deployment was made.
