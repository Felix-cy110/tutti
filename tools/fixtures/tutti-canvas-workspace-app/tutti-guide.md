# Tutti Canvas Agent Guide

The current project directory is the source of truth. Do not use a session id,
thread id, timestamp, or random UUID as a canvas name.

1. Run `tutti canvas list --project-dir "$PWD" --json` before choosing a canvas.
2. Reuse an exact existing name when the user refers to an established canvas.
3. Otherwise choose a short human-readable name and run
   `tutti canvas open --project-dir "$PWD" --canvas-name "<name>" --json`.
4. Each canvas is one direct child file at
   `<project-dir>/.tutti-canvases/<name>.canvas`.
5. For image generation, first run `tutti canvas selection` for the same project
   and canvas. If exactly one selected shape is an AI image holder, generate to
   that holder's ratio and pass its id as `--anchor-shape-id`.
6. After generating a bitmap, run `tutti canvas insert-image` with the exact
   absolute output path. Do not claim completion until the command returns the
   inserted shape id and asset path.

Only use the advertised `tutti canvas` commands to read or change canvas state.
Do not inspect the Canvas checkout, unzip or rewrite a `.canvas` file, or copy a
snapshot from another canvas. A newly created blank canvas supports direct image
insertion. If a Canvas CLI command fails, report its exact error instead of
repairing the implementation or archive from the Agent session.

The open Workspace App watches CLI changes and opens or activates one
right-panel tab per exact `canvasFile` after `canvas open` or
`canvas insert-image`. A tab label is `<canvasName>.canvas`; closing it does not
delete the file.
