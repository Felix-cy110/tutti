import assert from "node:assert/strict";
import test from "node:test";
import {
  readTuttiDeckTargets,
  resolveTuttiDeckFallbackTabLabel,
  resolveTuttiDeckOpenRouteIntent,
  resolveTuttiDeckTabLabel,
  resolveWorkspaceAppToolPanelId
} from "./tuttiDeckTarget.ts";

test("Tutti Deck targets stay ordered by activation sequence", () => {
  const targets = readTuttiDeckTargets({
    targets: [
      {
        activationSequence: 2,
        deckFile: "C:\\work\\.tutti-decks\\路演.deck",
        deckName: "路演",
        deckRoot: "C:\\work\\.tutti-decks",
        projectDir: "C:\\work",
        revision: "revision-2"
      },
      {
        activationSequence: 1,
        deckFile: "/work/.tutti-decks/产品.deck",
        deckName: "产品",
        deckRoot: "/work/.tutti-decks",
        focusSlideId: "slide-cover",
        projectDir: "/work",
        revision: "revision-1"
      },
      { activationSequence: 0 }
    ]
  });

  assert.deepEqual(
    targets.map((target) => target.deckName),
    ["产品", "路演"]
  );
});

test("only Tutti Deck routes into the dedicated panel", () => {
  assert.equal(resolveWorkspaceAppToolPanelId("tutti-deck"), "deck");
  assert.equal(resolveWorkspaceAppToolPanelId("documents"), "apps");
});

test("Tutti Deck target builds file labels and the app route", () => {
  const target = {
    deckFile: "C:\\work\\.tutti-decks\\路演.deck",
    deckName: "路演",
    projectDir: "C:\\work"
  };

  assert.equal(resolveTuttiDeckTabLabel(target), "路演.deck");
  assert.equal(resolveTuttiDeckFallbackTabLabel(target.deckFile), "路演.deck");
  assert.deepEqual(resolveTuttiDeckOpenRouteIntent(target), {
    kind: "open-route",
    params: {
      deckFile: target.deckFile,
      deckName: target.deckName,
      projectDir: target.projectDir
    },
    route: "/"
  });
});
