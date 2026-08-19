# Tutti Canvas Workspace App POC

This unpacked Workspace App proves the Tutti-side integration path for Tutti
Canvas without turning the experiment into a release package.

The prototype intentionally hard-codes the local canvas checkout at
`/Users/chenyang/project/tutti-canvas-ui`. It reuses that checkout's tldraw UI,
`.canvas` ZIP storage module, and installed Vite dependencies.

## Try it

1. Start Tutti Desktop from this worktree.
2. Once per local installation, open App Center, choose **Load unpacked**, and
   select this directory so the app becomes an `@` candidate.
3. Type `@Tutti Canvas` in an Agent composer and select the result.
4. The standalone Agent page opens the canvas in its dedicated right-side
   **Canvas** panel. An Agent embedded in the workspace opens a direct,
   right-aligned canvas WebView instead of an App Center tab. Other Workspace
   Apps keep their existing behavior.

The installed app contributes these Agent-visible commands through the normal
Workspace App CLI capability guide:

```text
tutti canvas list --project-dir <absolute-project-path>
tutti canvas open --project-dir <absolute-project-path> --canvas-name <name>
tutti canvas selection --project-dir <absolute-project-path> --canvas-name <name>
tutti canvas insert-image --project-dir <absolute-project-path> --canvas-name <name> --image-path <absolute-image-path>
```

`canvas open` changes the canvas shown by an already-open app. The UI and CLI
both read and write the same `<project>/.tutti-canvases/<name>.canvas` file.

This is macOS-local feasibility code. A production package must remove the
absolute checkout path, build the canvas frontend into the app package, and own
the storage module instead of importing code from another checkout at runtime.
