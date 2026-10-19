Commander Shortlist regression excerpts

Source: owner-supplied Commander_Shortlist_Validated_Pack (read-only).
decks.json retains the 28 primary TXT exports as strings with original byte
hashes, plus the three alternatives needed to exercise board/name differences.
Expected counts describe the app's explicit section policy, not deck legality.
Core exports' four leading # notes are stripped only by the test adapter.
Their original forms remain rejection cases. No product format is added.

cards.json retains 16 unmodified Scryfall card objects from the pack's captured
collection responses, including original response paths/hashes and object
hashes. These are pinned regression data, not a claim of current live metadata.
The four reversible cards have matching Oracle IDs on both faces and no
top-level Oracle ID. Sanar has prepare layout, a shared top-level image, and
two text parts. The ordinary/reversible Command Tower combination is an
intentional two-card test fragment, not an assertion about an original deck.

Run: node --test tests/commander-shortlist.test.mjs
No Downloads directory, live provider, or fixture generation is required.
