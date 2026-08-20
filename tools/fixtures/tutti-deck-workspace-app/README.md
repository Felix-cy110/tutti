# Tutti Deck Workspace App POC

This unpacked Workspace App proves the Tutti-side integration path for Tutti
Deck without turning the experiment into a release package.

The prototype intentionally hard-codes the local Deck checkout at
`/Users/chenyang/project/tutti-deck`. It reuses that checkout's editor UI,
`.deck` ZIP storage module, and installed Vite dependencies.

## Try it

1. Start Tutti Desktop from this worktree.
2. Once per local installation, open App Center, choose **Load unpacked**, and
   select this directory so the app becomes an `@` candidate.
3. Type `@Tutti Deck` in an Agent composer and select the result.
4. The Deck opens in a dedicated right-side **Deck** panel. Each exact
   `.deck` file gets its own mounted tab; other Workspace Apps keep their
   existing behavior.

The installed app contributes these Agent-visible commands:

```text
tutti deck list --project-dir <absolute-project-path>
tutti deck open --project-dir <absolute-project-path> --deck-name <name>
tutti deck selection --project-dir <absolute-project-path> --deck-name <name>
tutti deck document --project-dir <absolute-project-path> --deck-name <name>
tutti deck update --project-dir <absolute-project-path> --deck-name <name> --expected-revision <revision> --operations-json '<json-array>'
tutti deck insert-image --project-dir <absolute-project-path> --deck-name <name> --image-path <absolute-image-path>
```

`deck open`, `deck update`, and `deck insert-image` open or activate the
right-panel tab identified by the exact `deckFile`. The UI and CLI both read
and write `<project>/.tutti-decks/<name>.deck`. Closing a tab only closes its UI
and never deletes the file.

This is macOS-local feasibility code. A production package must remove the
absolute checkout path and build the Deck frontend and storage code into the
Workspace App package.
