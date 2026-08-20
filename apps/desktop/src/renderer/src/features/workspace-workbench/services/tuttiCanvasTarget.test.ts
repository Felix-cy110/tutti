import assert from "node:assert/strict";
import test from "node:test";
import {
  readTuttiCanvasTargets,
  resolveTuttiCanvasFallbackTabLabel,
  resolveTuttiCanvasOpenRouteIntent,
  resolveTuttiCanvasTabLabel,
  resolveTuttiCanvasTargetsUrl
} from "./tuttiCanvasTarget.ts";

test("canvas targets retain exact file identity and activation order", () => {
  const targets = readTuttiCanvasTargets({
    targets: [
      {
        activationSequence: 2,
        canvasFile: "C:\\work\\.tutti-canvases\\海报.canvas",
        canvasName: "海报",
        canvasRoot: "C:\\work\\.tutti-canvases",
        projectDir: "C:\\work",
        revision: "revision-2"
      },
      {
        activationSequence: 1,
        canvasFile: "/work/.tutti-canvases/人物图.canvas",
        canvasName: "人物图",
        canvasRoot: "/work/.tutti-canvases",
        projectDir: "/work",
        revision: "revision-1"
      },
      { activationSequence: 3, canvasName: "invalid" }
    ]
  });

  assert.deepEqual(
    targets.map((target) => target.canvasFile),
    [
      "/work/.tutti-canvases/人物图.canvas",
      "C:\\work\\.tutti-canvases\\海报.canvas"
    ]
  );
});

test("canvas tab copy displays file names while routing the exact target", () => {
  const target = {
    canvasFile: "C:\\work\\.tutti-canvases\\海报.canvas",
    canvasName: "海报",
    projectDir: "C:\\work"
  };

  assert.equal(resolveTuttiCanvasTabLabel(target), "海报.canvas");
  assert.equal(
    resolveTuttiCanvasFallbackTabLabel(target.canvasFile),
    "海报.canvas"
  );
  assert.deepEqual(resolveTuttiCanvasOpenRouteIntent(target), {
    kind: "open-route",
    params: {
      canvasFile: target.canvasFile,
      canvasName: "海报",
      projectDir: "C:\\work"
    },
    route: "/"
  });
});

test("canvas target polling stays on the workspace app origin", () => {
  assert.equal(
    resolveTuttiCanvasTargetsUrl("http://127.0.0.1:4173/app?source=tutti"),
    "http://127.0.0.1:4173/api/targets"
  );
  assert.equal(resolveTuttiCanvasTargetsUrl("not a url"), null);
});
