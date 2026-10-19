# Approved polish verification

Date: October 16, 2026, America/Denver. Local app: http://127.0.0.1:4173/. Node v24.14.0. Browser: Codex in-app Chromium, tested at 1440 × 900 and 390 × 844 through actual controls and supported read-only DOM inspection.

## Implemented priorities

1. One shared hover/focus preview and click/tap/Enter detail dialog for imported, evidence, discovery and Clipboard cards. Exact returned printing images, explicit multi-face controls, loading/unavailable states, Escape dismissal and focus return.
2. Locally pinned Mana 1.17.1 and Keyrune 3.19.0, readable accessible fallbacks, exact set-code matching, and real mana/cost/identity symbols. Source commits, licenses and asset hashes are retained under `public/vendor/`.
3. Working Import / Read / Understand / Explore / Collect / Export navigation, browser history and in-session state preservation.
4. Visible selected commander, searchable chooser, retained selections across filtering, explicit Apply and contextual identity inspection.
5. Readable metadata and controls, dark ink/gold inspection surfaces, warm paper reading, restrained color traces and UUID disclosure inside details.

## Automated results

**66 passed, 0 failed, 0 skipped** in the final `node --test tests/*.test.mjs` run (354.9151 ms). Full output: [polish-tests.txt](polish-tests.txt). This includes 50 existing tests and 16 focused image/symbol/polish tests. All 18 owner files under inputs, fixtures and references remain byte-identical to the initial audit. The original deck parser, exact matching, eight governed mechanics, source distinctions, Clipboard persistence and immutable import tests continue to pass.

## Observed browser results

| Check | Result and evidence |
| --- | --- |
| Real owner import | PASS: Cosmic Spider-Man fixture resolves 84 entries / 100 physical cards / 84 printings / 58 passages, with WUBRG commander identity. |
| Real pointer hover | PASS: moving onto Arachnogenesis opens its preview with no dialog or card focus. Crossing onto the preview keeps it open; leaving both surfaces dismisses it after the crossing grace. Re-entry after Escape reopens normally. |
| Keyboard preview | PASS after fixes: an offscreen name focused by keyboard scrolls into view and retains its preview. Final mobile preview is x16, width343, right359 inside client width375; exact art loads. Escape closes it. |
| Popup activation and dismissal | PASS: click and Enter open Arachnogenesis details, focus the Close button, and expose exact printing information. Escape returns focus to the name without immediately reopening its tooltip. |
| Modal focus boundaries | PASS after fix: Shift+Tab from card Close wraps to Printing identifier; Clipboard Close wraps to Clear. Focus remains inside the respective dialog. This is not an exhaustive accessibility audit. |
| Multi-face printing | PASS: Gwen Stacy // Ghost-Spider switches to Ghost-Spider, announces face 2, updates pressed state, and loads the returned back-face image for printing b0f1597f-1dc7-465e-8fcb-0afe61bcca46. |
| Exact image association | PASS: Arachnogenesis uses the provider image for f5f18431-64c0-4ae5-bdc1-1e953313f086 (DSC 169). No name lookup or other edition is used. |
| Symbols | PASS: local Mana and Keyrune glyphs visibly load for costs, identity and supported sets. Unknown exact set codes such as PLST/LMAR remain text. Font source/MIME/CSP and unsupported-token handling also have deterministic coverage. |
| Identity popup | PASS: White opens contextual evidence for the selected commander identity and preserves the surrounding imported deck. |
| Commander selection | PASS: chooser filtering retains selections; switching Cosmic Spider-Man to Arasta changes the identity to Green, then restoring Cosmic returns WUBRG. Archive query `Ara`, all 84 entries and 58 passages remain available. |
| Navigation/history | PASS: Read and Understand select their respective views. Back restores Archive with query `Ara`; Forward restores Mechanics. The masthead returns to the top without reloading the imported deck. |
| Governed discovery | PASS: actual WUBRG Trample search reports 2,889 matches, 175 first-page records, 12 shown and 0 skipped. Counts are the provider response observed during this run, not a permanent catalog claim. |
| Clipboard/export | PASS: manually added Aang, Swift Savior // Aang and La, Ocean's Fury (TLA 204); quantity 2 updated the visible export and actual clipboard to `2 Aang, Swift Savior // Aang and La, Ocean's Fury (TLA) 204`. |
| Nested inspection | PASS: card details open above the Clipboard; Escape closes only the top dialog and returns focus to its card trigger. |
| Reload persistence | PASS: the exact Clipboard entry and quantity survive reload. Its metadata-only preview honestly has no art until card metadata is encountered again; no replacement is fetched. The one test entry was subsequently removed. |
| Responsive layout | PASS: document scrollWidth equals clientWidth at desktop (1425) and mobile (375). Mobile detail width370 fits the 375px client area. Preview width accounts for the scrollbar and retains 16px margins. |
| Browser diagnostics | PASS: final browser warning/error log is empty. |

## Defects caught during this pass

- Identity text inherited the wrong last-child layout after adding its tooltip; explicit identity-copy styling fixed the wrapping.
- Native reverse Tab could escape a dialog to the document body; explicit boundary wrapping now keeps focus inside both modal types.
- Commander re-rendering lost the selected observation class; selection is restored during rendering.
- Asynchronous hash navigation could race a subsequent input action; navigation now applies the route synchronously while retaining browser history.
- Scroll padding and anchor margins doubled the navigation offset; a single anchor margin now controls it.
- Keyboard focus could scroll a name after its preview opened, immediately closing the preview. Repositioning after the scroll frame and keyboard recovery now preserve it without overriding Escape suppression.
- Preview placement calculated a narrow width but initially left its CSS width unchanged. The actual width is now capped before measuring, including scrollbar space.

## Screenshots

- [Desktop overview](polish-desktop.png): masthead, readable navigation, real identity symbols, import counts and visible commander.
- [Desktop preview](polish-hover-preview.png): settled exact-printing preview, loaded art, mana symbols and archive context. The final capture uses keyboard focus; pointer hover was separately exercised above.
- [Card details](polish-card-details.png): exact-printing modal.
- [Mobile preview](polish-mobile-preview.png): final 343px preview with 16px margins at a 390px viewport.
- [Mobile details](polish-mobile-details.png): settled card art and responsive detail layout.

## Limits not represented as passes

- Reduced-motion CSS is implemented and inspected; OS reduced-motion emulation was unavailable through the browser API. A full screen-reader audit and physical touch-device test were not performed. Mobile click/keyboard behavior was exercised at the narrow viewport.
- Native Clear confirmation click-through remains unverified from the original implementation; the test entry was removed through its ordinary Remove action. Clipboard denial and blocked storage were not forced in this browser pass.
- Missing/unsafe image URLs, synthetic art suppression and multi-face association have deterministic coverage. A real slow image, image-network failure, provider outage or 429 was not intentionally induced.
- Scryfall image documentation returned access errors. Actual image loading and exact association were verified; imagery terms were not.

The local server was restarted for font MIME and image CSP changes and is intentionally left running as requested. The owner deck remains loaded in the delivery tab. No deployment or external message was sent.
