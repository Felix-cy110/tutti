import { describe, expect, it } from "vitest";
import { resolveSubmittedTuttiDeckLaunch } from "./resolveComposerWorkspaceAppLaunch";

describe("resolveSubmittedTuttiDeckLaunch", () => {
  it("opens Tutti Deck from the submitted composer mention", () => {
    expect(
      resolveSubmittedTuttiDeckLaunch({
        content: [{ type: "text", text: "create a presentation" }],
        displayPrompt:
          "[@Tutti 幻灯片](mention://workspace-app/tutti-deck?workspaceId=workspace-1) 制作路演"
      })
    ).toEqual({
      appId: "tutti-deck",
      source: "agent-composer-submit",
      type: "open-workspace-app",
      workspaceId: "workspace-1"
    });
  });

  it("falls back to submitted text content", () => {
    expect(
      resolveSubmittedTuttiDeckLaunch({
        content: [
          {
            type: "text",
            text: "[@Deck](mention://workspace-app/tutti-deck?workspaceId=workspace-2)"
          }
        ]
      })?.workspaceId
    ).toBe("workspace-2");
  });

  it("does not auto-open ordinary workspace app mentions", () => {
    expect(
      resolveSubmittedTuttiDeckLaunch({
        content: [
          {
            type: "text",
            text: "[@AI 文档](mention://workspace-app/ai-doc?workspaceId=workspace-1)"
          }
        ]
      })
    ).toBeNull();
  });
});
