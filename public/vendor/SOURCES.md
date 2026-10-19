# Local icon assets

These assets were requested for Deck Explorer and retrieved from Andrew Gioia's official repositories on 2026-10-16. Runtime font loading is entirely local; there is no CDN dependency.

| Library | Pinned release | Immutable source commit | Files retained |
| --- | --- | --- | --- |
| Mana | [v1.17.1](https://github.com/andrewgioia/mana/releases/tag/v1.17.1) | `957ad2abcde30c9ffa38e2d37c8512c6be967199` | CSS, Mana WOFF2/WOFF, MPlantin WOFF, upstream README |
| Keyrune | [v3.19.0](https://github.com/andrewgioia/keyrune/releases/tag/v3.19.0) | `e117dcf159157c45ad0d8f23dc5f5106f4ced865` | CSS, Keyrune WOFF2/WOFF, upstream README and LICENSE |

Reference sheets: [Mana](https://mana.andrewgioia.com/cheatsheet.html) and [Keyrune](https://keyrune.andrewgioia.com/cheatsheet.html).

The raw source URLs follow `https://raw.githubusercontent.com/andrewgioia/{repository}/{commit}/{path}`. Keyrune's README at the pinned 3.19.0 release still says 3.18.0; the immutable release and its CSS declare 3.19.0.

## License and attribution

- **Mana**, by Andrew Gioia: fonts under [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/); CSS under the [MIT License](https://opensource.org/license/mit). The exact upstream declaration is retained in `mana/README.md`. Mana, tap, and card type symbol imagery is copyright Wizards of the Coast.
- **Keyrune**, copyright (c) 2019 Andrew Gioia: prepared fonts under SIL Open Font License 1.1; CSS and icon source under [GPL 3.0](https://www.gnu.org/licenses/gpl-3.0.html). The complete upstream license description is retained unchanged in `keyrune/LICENSE.md`. Underlying set symbols are Wizards of the Coast trademarks used to identify their sets; their use does not indicate endorsement.
- Full license texts accompany the assets in `OFL-1.1.txt`, `mana/MIT.txt`, and `keyrune/GPL-3.0.txt`. The OFL file is the official generic text, including its illustrative copyright header; the actual upstream copyright/attribution notices are retained in the library README/LICENSE files and the unchanged font metadata.
- Local changes to each CSS file only replace the `@font-face` source list with the locally retained webfont formats, add `font-display`, and add a provenance comment. The stale Mana source-map request was removed. Glyph declarations and font binaries are unchanged.
- `public/symbols.mjs` lists only exact set codes present in the pinned Keyrune CSS. An unavailable code is shown as its actual text, never mapped to a guessed parent set.

## Card images

Card images are not bundled, modified, or generated. The API retains only provider-supplied `small`, `normal`, and `large` URLs on the exact `https://cards.scryfall.io` host, including the selected printing's faces. The browser loads those URLs directly when a preview is requested. There is no image proxy or substitution by card name.

The [Scryfall API image documentation](https://scryfall.com/docs/api/images) and general API documentation returned access errors during this session (the API index returned HTTP 403); this file does not claim their imagery terms were verified. Provider attribution, exact printing links, and an unavailable-image state remain part of the preview.
