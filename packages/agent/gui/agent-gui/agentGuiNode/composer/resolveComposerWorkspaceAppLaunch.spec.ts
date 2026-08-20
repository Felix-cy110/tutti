import { describe, expect, it } from "vitest";
import { resolveSubmittedTuttiCanvasLaunch } from "./resolveComposerWorkspaceAppLaunch";

describe("resolveSubmittedTuttiCanvasLaunch", () => {
  it("opens Tutti Canvas from the submitted composer mention", () => {
    expect(
      resolveSubmittedTuttiCanvasLaunch({
        content: [
          {
            type: "text",
            text: "create an image"
          }
        ],
        displayPrompt:
          "[@Tutti 画布](mention://workspace-app/tutti-canvas?workspaceId=workspace-1) 生成图片"
      })
    ).toEqual({
      appId: "tutti-canvas",
      source: "agent-composer-submit",
      type: "open-workspace-app",
      workspaceId: "workspace-1"
    });
  });

  it("falls back to submitted text content", () => {
    expect(
      resolveSubmittedTuttiCanvasLaunch({
        content: [
          {
            type: "text",
            text: "[@Canvas](mention://workspace-app/tutti-canvas?workspaceId=workspace-2)"
          }
        ]
      })?.workspaceId
    ).toBe("workspace-2");
  });

  it("does not auto-open ordinary workspace app mentions", () => {
    expect(
      resolveSubmittedTuttiCanvasLaunch({
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
