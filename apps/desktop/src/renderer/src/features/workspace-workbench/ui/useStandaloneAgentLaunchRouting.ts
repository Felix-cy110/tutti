import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import type { WorkbenchHostNodeBodyContext } from "@tutti-os/workbench-surface";
import type { DesktopAgentDirectorySnapshot } from "@shared/contracts/agentDirectory.ts";
import type { DesktopHostWindowApi, DesktopRuntimeApi } from "@preload/types";
import type { IWorkspaceAppCenterService } from "@renderer/features/workspace-app-center";
import type { IAgentProviderStatusService as AgentProviderStatusService } from "@renderer/features/workspace-agent/services/agentProviderStatusService.interface.ts";
import type { IWorkspaceAgentActivityService } from "@renderer/features/workspace-agent/services/workspaceAgentActivityService.interface.ts";
import type { DesktopAgentGUIWorkbenchBodyProps } from "@renderer/features/workspace-agent/ui/desktopAgentGUIWorkbenchModel.ts";
import {
  registerWorkspaceAgentGuiLaunchHandler,
  requestWorkspaceAgentGuiLaunch
} from "@renderer/features/workspace-agent/services/workspaceAgentGuiLaunchCoordinator.ts";
import {
  desktopAgentGUIOpenSessionActivationType,
  normalizeDesktopAgentGUIProvider,
  type DesktopAgentGUIProvider,
  type DesktopAgentGUIWorkbenchState
} from "@renderer/features/workspace-agent/desktopAgentGUINodeState.ts";
import { handleStandaloneAgentGuiLaunch } from "../services/standaloneAgentGuiLaunchHandler.ts";
import type { StandaloneAgentIssueManagerOpenRequest } from "../services/standaloneAgentIssueManagerLaunch.ts";
import { createStandaloneAgentWorkspaceIssueManagerPresenter } from "../services/standaloneAgentWorkspaceIssueManagerPresenter.ts";
import {
  openWorkspaceAppFromStandaloneAgent,
  type StandaloneAgentWorkspaceAppOpenRequest
} from "../services/standaloneAgentWorkspaceAppSurfacePresenter.ts";
import {
  registerWorkspaceIssueManagerLaunchPresenter,
  requestWorkspaceIssueManagerLaunch
} from "../services/workspaceIssueManagerLaunchCoordinator.ts";
import { runStandaloneAgentLinkAction } from "../services/standaloneAgentLinkAction.ts";
import { requestWorkspaceBrowserLaunch } from "../services/workspaceBrowserLaunchCoordinator.ts";

interface StandaloneAgentLaunchRoutingInput {
  agentDirectorySnapshot: DesktopAgentDirectorySnapshot;
  agentProviderStatusService: AgentProviderStatusService;
  headerProvider: DesktopAgentGUIProvider;
  homeDirectory: string;
  hostWindowApi: Pick<DesktopHostWindowApi, "openAgentWindow">;
  ensureWorkspaceAppPolling(): void;
  openExternalUrl(url: string): Promise<void>;
  openFileInSidebar(
    path: string,
    validateExists?: boolean
  ): Promise<boolean> | boolean;
  runtimeApi: Pick<DesktopRuntimeApi, "logRendererDiagnostic">;
  setActivation: Dispatch<
    SetStateAction<WorkbenchHostNodeBodyContext["activation"]>
  >;
  setNodeState: Dispatch<SetStateAction<DesktopAgentGUIWorkbenchState>>;
  workspaceAgentActivityService: IWorkspaceAgentActivityService;
  workspaceAppCenterService: IWorkspaceAppCenterService;
  workspaceId: string;
}

export function useStandaloneAgentLaunchRouting({
  agentDirectorySnapshot,
  agentProviderStatusService,
  headerProvider,
  homeDirectory,
  hostWindowApi,
  ensureWorkspaceAppPolling,
  openExternalUrl,
  openFileInSidebar,
  runtimeApi,
  setActivation,
  setNodeState,
  workspaceAgentActivityService,
  workspaceAppCenterService,
  workspaceId
}: StandaloneAgentLaunchRoutingInput): {
  handleLinkAction: NonNullable<
    DesktopAgentGUIWorkbenchBodyProps["onLinkAction"]
  >;
  handleOpenMessageCenterChat(input: {
    agentSessionId: string;
    provider: string;
  }): void;
  issueManagerOpenRequest: StandaloneAgentIssueManagerOpenRequest | null;
  workspaceAppOpenRequest: StandaloneAgentWorkspaceAppOpenRequest | null;
} {
  const activationSequenceRef = useRef(1);
  const workspaceAppOpenSequenceRef = useRef(0);
  const [issueManagerOpenRequest, setIssueManagerOpenRequest] =
    useState<StandaloneAgentIssueManagerOpenRequest | null>(null);
  const [workspaceAppOpenRequest, setWorkspaceAppOpenRequest] =
    useState<StandaloneAgentWorkspaceAppOpenRequest | null>(null);
  const issueManagerPresenter = useMemo(
    () =>
      createStandaloneAgentWorkspaceIssueManagerPresenter({
        open: setIssueManagerOpenRequest
      }),
    []
  );
  const handleActivateAgentSession = useCallback(
    (input: {
      agentSessionId: string;
      agentTargetId: string | null;
      composerAppend?: {
        draftPrompt: string;
        focusComposer: true;
      };
      provider: string;
    }) => {
      setNodeState((current) => ({
        ...current,
        agentTargetId: input.agentTargetId,
        lastActiveAgentSessionId: input.agentSessionId,
        provider: normalizeDesktopAgentGUIProvider(input.provider)
      }));
      setActivation({
        payload: {
          agentSessionId: input.agentSessionId,
          ...(input.composerAppend
            ? { composerAppend: input.composerAppend }
            : {})
        },
        sequence: ++activationSequenceRef.current,
        type: desktopAgentGUIOpenSessionActivationType
      });
    },
    [setActivation, setNodeState]
  );
  const handleOpenMessageCenterChat = useCallback(
    (input: { agentSessionId: string; provider: string }) => {
      handleActivateAgentSession({ ...input, agentTargetId: null });
    },
    [handleActivateAgentSession]
  );

  useEffect(
    () =>
      registerWorkspaceAgentGuiLaunchHandler(workspaceId, (request) =>
        handleStandaloneAgentGuiLaunch(request, {
          activateAgentSession: handleActivateAgentSession,
          agentDirectorySnapshot,
          headerProvider,
          openAgentWindow: (input) => hostWindowApi.openAgentWindow(input),
          providerStatusSnapshot: agentProviderStatusService.getSnapshot(),
          workspaceId
        })
      ),
    [
      agentDirectorySnapshot,
      agentProviderStatusService,
      handleActivateAgentSession,
      headerProvider,
      hostWindowApi,
      workspaceId
    ]
  );
  useEffect(
    () =>
      registerWorkspaceIssueManagerLaunchPresenter(
        workspaceId,
        issueManagerPresenter
      ),
    [issueManagerPresenter, workspaceId]
  );

  const handleLinkAction = useCallback<
    NonNullable<DesktopAgentGUIWorkbenchBodyProps["onLinkAction"]>
  >(
    (action) => {
      void runStandaloneAgentLinkAction(action, {
        getAgentSession: ({ agentSessionId, workspaceId }) =>
          workspaceAgentActivityService.getSession(workspaceId, agentSessionId),
        homeDirectory,
        launchAgentGui: requestWorkspaceAgentGuiLaunch,
        launchWorkspaceIssueManager: requestWorkspaceIssueManagerLaunch,
        launchWorkspaceFiles: ({ path, validateExists }) =>
          openFileInSidebar(path, validateExists),
        launchWorkspaceApp: async ({ appId, workspaceId: targetWorkspaceId }) =>
          await openWorkspaceAppFromStandaloneAgent({
            appCenterService: workspaceAppCenterService,
            appId,
            ensureWorkspaceAppPolling,
            revealInSidebar: (revealedAppId) =>
              setWorkspaceAppOpenRequest({
                appId: revealedAppId,
                requestID: `standalone-agent-workspace-app-${++workspaceAppOpenSequenceRef.current}`
              }),
            workspaceId: targetWorkspaceId
          }),
        launchGroupChat: () => false,
        openBrowserUrl: requestWorkspaceBrowserLaunch,
        openExternalUrl,
        runtimeApi,
        workspaceId
      });
    },
    [
      homeDirectory,
      ensureWorkspaceAppPolling,
      openFileInSidebar,
      openExternalUrl,
      runtimeApi,
      workspaceAgentActivityService,
      workspaceAppCenterService,
      workspaceId
    ]
  );

  return {
    handleLinkAction,
    handleOpenMessageCenterChat,
    issueManagerOpenRequest,
    workspaceAppOpenRequest
  };
}
