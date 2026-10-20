# Validation and repository layout

[← README](../README.md)

## Public checks

From a clean checkout with Node.js 24.14.0:

```sh
node scripts/build-catalog-gaps.mjs --check
node --test
```

The tests use retained fixtures and local HTTP servers. They cover import and printing provenance, immutable deck state, literal language analysis, mechanic detection, source scope, search boundaries, card views, and Clipboard behavior. The [GitHub workflow](../.github/workflows/validate.yml) runs these commands on Windows and Linux. Public checks do not require the private archive or Python.

The [validated baseline tag](https://github.com/rboles84/mtg-deck-explorer/tree/validated-baseline-2026-10-19) identifies the published version with 347 passing tests. Live Scryfall checks and browser observations are dated evidence, separate from offline test results. A passing test suite does not establish complete Magic rules coverage, full deck legality, or public-hosting readiness.

The [repository cleanup verification](../reports/repository-cleanup-20261019/verification.json) records the backup, exact catalog comparison, archived and relocated files, unchanged browser code, and local test results.

## Where things belong

| Location | Purpose |
| --- | --- |
| `server.mjs` | Local Node entry point; serves static files from `public/` and handles the bounded API. |
| `public/` | Browser code, styles, derived rules data, and bundled icon assets. |
| `lib/` | Server-side catalog and provider logic. |
| [`lib/data/crosswalk.json`](../lib/data/crosswalk.json) | The unchanged eight historical source mappings. Moving this file does not change the discovery catalog. |
| `inputs/` | Pinned source and recipe inputs needed by the app, generators, and validation. |
| `fixtures/`, `tests/fixtures/` | Import examples and regression fixtures. |
| `evidence/` | Pinned rules text, original source audit, provider smoke record, and archive receipt. |
| `reports/` | Retained provider responses, citations, witnesses, and validation records. Some earlier reports describe superseded versions; use their dates and recorded scope. |
| `docs/` | User documentation and selected screenshots. |
| `backups/` | Local recovery ZIPs, Git history bundle, and the private archive. Git ignores this directory. |

The source text, recipes, test witnesses, and receipts required by the current checks stay public. The cleanup retains the card-layout witness used by current UI tests, even though it sits inside a historical iteration folder.

## Private archive

The October 19 cleanup archives internal implementation notes, original design references, unused QA captures, historical code copies, and two preservation scripts tied to earlier local workspace layouts. The [public receipt](../evidence/repository-archive.json) lists their original paths, sizes, and SHA-256 hashes. It contains no archived document contents.

The original 18-file source audit remains unchanged. Public acceptance tests still verify the five original runtime/test inputs byte for byte. They also verify that the 13 retired design assets have the same audited hashes in the archive receipt and are absent from the current tree. Their actual archived bytes are checked separately by the owner:

```sh
python scripts/verify-private-archive.py backups/repo-cleanup-20261019/private-archive.zip
```

This optional owner check uses Python's standard library, validates the entire ZIP and every archived file, and checks the 13 design originals against the original audit. It does not extract files or make network requests. A clone without the private ZIP cannot verify those private bytes; the public mechanic and source checks remain reproducible.

The full pre-cleanup app is separately preserved in `backups/repo-cleanup-20261019/before.zip`, with file hashes and restore instructions. `history.bundle` preserves the Git history. Restore into a new empty directory outside this checkout so Node does not discover backed-up tests alongside the active ones.

The cleanup removes archived files from new commits. Earlier public commits and the validated baseline tag still contain their historical versions; no history rewrite is part of this cleanup.
