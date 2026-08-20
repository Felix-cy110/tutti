import {
  resolveWorkspaceMentionLinkAction,
  type OpenWorkspaceAppLinkAction
} from "../../../actions/workspaceLinkActions";
import type { AgentPromptContentBlock } from "../../../shared/contracts/dto";

const tuttiCanvasMentionPattern =
  /mention:\/\/workspace-app\/tutti-canvas(?:\?[^)\s<>"']*)?/u;

export function resolveSubmittedTuttiCanvasLaunch(input: {
  content: readonly AgentPromptContentBlock[];
  displayPrompt?: string;
}): OpenWorkspaceAppLinkAction | null {
  const prompt =
    input.displayPrompt ??
    input.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
  const href = prompt.match(tuttiCanvasMentionPattern)?.[0] ?? null;
  if (!href) return null;
  const action = resolveWorkspaceMentionLinkAction({
    href,
    source: "agent-composer-submit"
  });
  return action?.type === "open-workspace-app" &&
    action.appId === "tutti-canvas"
    ? action
    : null;
}
