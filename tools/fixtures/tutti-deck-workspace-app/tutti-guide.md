# Tutti Deck Agent Guide

The current project directory is the source of truth. Do not use a session id,
thread id, timestamp, or random UUID as a Deck name.

1. Run `tutti deck list --project-dir "$PWD" --json` before choosing a Deck.
2. Reuse an exact existing name when the user refers to an established Deck.
3. Otherwise choose a short human-readable name and run
   `tutti deck open --project-dir "$PWD" --deck-name "<name>" --json`.
4. Each Deck is one direct child file at
   `<project-dir>/.tutti-decks/<name>.deck`.
5. Before editing, run `tutti deck document` and pass its `revision` unchanged
   to `tutti deck update --expected-revision`. Put the semantic operation array
   in `--operations-json`.
6. Before inserting an image, run `tutti deck selection`. Then call
   `tutti deck insert-image` with the exact absolute bitmap path and optional
   slide or object ids.

Only use the advertised `tutti deck` commands to read or change Deck state. Do
not inspect the Deck checkout, unzip or rewrite a `.deck` file, or copy a Deck
from another project. If a command reports a revision conflict, read the Deck
again and recompute the edit instead of retrying stale operations.

The open Workspace App watches CLI changes and opens or activates one
right-panel tab per exact `deckFile`. A tab label is `<deckName>.deck`; closing
it does not delete the file.
