import { useMemo, type ReactNode } from "react";
import {
  createWorkbenchHostLaunchedNodeId,
  type WorkbenchContribution,
  type WorkbenchHostNodeBodyContext,
  type WorkbenchHostNodeData,
  type WorkbenchNode
} from "@tutti-os/workbench-surface";
import type { TuttiExternalWorkspaceOpenRouteIntent } from "@tutti-os/workspace-external-core/contracts";
import {
  findWorkspaceApp,
  resolveWorkspaceAppDisplayName,
  useWorkspaceAppCenterService,
  workspaceAppCenterNodeID,
  workspaceAppDockEntryId,
  workspaceAppWebviewInstanceId,
  workspaceAppWebviewTypeID
} from "@renderer/features/workspace-app-center";
import { createStandaloneAgentDirectToolHost } from "./standaloneAgentToolWorkbench.ts";

export function StandaloneAgentAppViewerToolPanel({
  active,
  appId,
  contributions,
  launchIntent = null,
  resourceKey = null,
  unavailableLabel,
  workspaceId
}: {
  active: boolean;
  appId: string;
  contributions: readonly WorkbenchContribution[] | undefined;
  launchIntent?: TuttiExternalWorkspaceOpenRouteIntent | null;
  resourceKey?: string | null;
  unavailableLabel: string;
  workspaceId: string;
}): ReactNode {
  const { service } = useWorkspaceAppCenterService();
  const resolved = resolveStandaloneAgentAppWebviewContribution(contributions);
  const directHost = useMemo(createStandaloneAgentDirectToolHost, []);
  const app = findWorkspaceApp(service, appId);

  if (!resolved) {
    return (
      <div
        className="flex h-full min-h-0 items-center justify-center text-sm text-[var(--text-secondary)]"
        role="status"
      >
        {unavailableLabel}
      </div>
    );
  }

  const instanceId = workspaceAppWebviewInstanceId(appId);
  const baseNodeId = createWorkbenchHostLaunchedNodeId({
    instanceId,
    typeId: workspaceAppWebviewTypeID
  });
  const resourceSuffix = resourceKey
    ? `:${encodeURIComponent(resourceKey)}`
    : "";
  const nodeId = `${baseNodeId}${resourceSuffix}`;
  const instanceKey = `${instanceId}${resourceSuffix}`;
  const title = app
    ? resolveWorkspaceAppDisplayName(app)
    : resolved.definition.title;
  const node: WorkbenchNode<WorkbenchHostNodeData> = {
    data: {
      dockEntryId: workspaceAppDockEntryId(appId),
      instanceId,
      instanceKey,
      typeId: workspaceAppWebviewTypeID
    },
    displayMode: "fullscreen",
    frame: resolved.definition.frame,
    id: nodeId,
    isMinimized: !active,
    kind: "window",
    restoreFrame: null,
    title
  };
  const lookup = {
    instanceId,
    instanceKey,
    nodeId,
    typeId: workspaceAppWebviewTypeID,
    workspaceId
  };
  const context: WorkbenchHostNodeBodyContext = {
    activation: launchIntent
      ? {
          payload: {
            appId,
            intent: launchIntent,
            title
          },
          sequence: 1,
          type: "workspace-app:open"
        }
      : null,
    displayMode: node.displayMode,
    externalNodeState:
      resolved.contribution.externalStateSource?.getNodeState(lookup) ?? null,
    externalWorkspaceState:
      resolved.contribution.externalStateSource?.getWorkspaceState({
        workspaceId
      }) ?? null,
    focus: () => undefined,
    host: directHost.host,
    instanceId,
    instanceKey,
    isDragging: false,
    isFocused: active,
    isResizing: false,
    isVisible: true,
    node,
    setNodeRuntimeState: () => undefined,
    setSnapshotNodeState: () => undefined
  };

  return (
    <div
      className="h-full min-h-0 w-full overflow-hidden"
      data-standalone-agent-app-viewer-surface="true"
    >
      {resolved.definition.renderBody(context)}
    </div>
  );
}

function resolveStandaloneAgentAppWebviewContribution(
  contributions: readonly WorkbenchContribution[] | undefined
) {
  const contribution = contributions?.find(
    (candidate) => candidate.id === workspaceAppCenterNodeID
  );
  const definition = contribution?.nodes?.find(
    (candidate) => candidate.typeId === workspaceAppWebviewTypeID
  );
  return contribution && definition ? { contribution, definition } : null;
}
