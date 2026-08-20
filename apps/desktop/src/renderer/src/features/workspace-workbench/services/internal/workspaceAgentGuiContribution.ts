import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import type { BrowserNodeFeature } from "@tutti-os/browser-node";
import type {
  AgentGUIProvider,
  AgentGUIAllAgentsPresentation,
  AgentGUIAgentsEmptyRenderer,
  AgentGUIAgent,
  AgentGUIAgentDirectoryPort
} from "@tutti-os/agent-gui";
import {
  createAgentGuiWorkbenchContribution,
  type AgentGuiWorkbenchConversationIdentity
} from "@tutti-os/agent-gui/workbench/contribution";
import { resolveAgentGuiWorkbenchConversationIdentity } from "@tutti-os/agent-gui/workbench";
import type {
  AgentGuiWorkbenchProvider,
  AgentGuiWorkbenchState
} from "@tutti-os/agent-gui/workbench/types";
import { isAgentGuiWorkbenchProvider } from "@tutti-os/agent-gui/workbench/providerCatalog";
import {
  AgentToolSidebar,
  type AgentToolSidebarCopy,
  type AgentToolSidebarHeaderLayout,
  type AgentToolSidebarHandle,
  type AgentToolTab
} from "@tutti-os/agent-gui/workbench/tool-sidebar";
import type { I18nRuntime } from "@tutti-os/ui-i18n-runtime";
import type {
  TuttidClient,
  TuttidEventStreamClient
} from "@tutti-os/client-tuttid-ts";
import type {
  WorkbenchContribution,
  WorkbenchDockPreviewCache
} from "@tutti-os/workbench-surface";
import type {
  DesktopComputerUseApi,
  DesktopHostFilesApi,
  DesktopHostWindowApi,
  DesktopPlatformApi,
  DesktopRuntimeApi
} from "@preload/types";
import type { IDesktopRichTextAtService } from "@renderer/features/rich-text-at";
import {
  WorkspaceAppCenterDirectAppBody,
  type IWorkspaceAppCenterService
} from "@renderer/features/workspace-app-center";
import type {
  IAgentsService,
  IWorkspaceAgentActivityService
} from "@renderer/features/workspace-agent";
import type { IWorkspaceUserProjectService } from "@renderer/features/workspace-user-project";
import type { IWorkspaceFileManagerService } from "@renderer/features/workspace-file-manager";
import type { IWorkspaceFilePreviewSurfaceHost } from "@renderer/features/workspace-file-preview";
import type { IReporterService } from "@renderer/features/analytics";
import { createDesktopAgentGUIWorkbenchHostInput } from "@renderer/features/workspace-agent/services/createDesktopAgentGUIWorkbenchHostInput.ts";
import { createDesktopWorkspaceAgentStatusSource } from "@renderer/features/workspace-agent/services/createDesktopAgentStatusSource.ts";
import { requestWorkspaceAgentGuiLaunch } from "@renderer/features/workspace-agent/services/workspaceAgentGuiLaunchCoordinator.ts";
import type { IAgentProviderStatusService as AgentProviderStatusService } from "@renderer/features/workspace-agent/services/agentProviderStatusService.interface.ts";
import type { IAgentQuickPromptService as AgentQuickPromptService } from "@renderer/features/workspace-agent/services/agentQuickPromptService.interface.ts";
import type { DesktopAgentGUIWorkbenchBodyProps } from "@renderer/features/workspace-agent/ui/desktopAgentGUIWorkbenchModel.ts";
import { DesktopAgentGUIWorkbenchBody } from "@renderer/features/workspace-agent/ui/DesktopAgentGUIWorkbenchBody.tsx";
import {
  runDesktopAgentGUILinkAction,
  type DesktopAgentGUILinkActionDependencies
} from "@renderer/features/workspace-agent/services/desktopAgentGUILinkActions.ts";
import {
  workspaceWorkbenchDesktopI18nKeys,
  type WorkspaceWorkbenchDesktopI18nRuntime
} from "@shared/i18n";
import { requestWorkspaceBrowserLaunch } from "../workspaceBrowserLaunchCoordinator.ts";
import { requestWorkspaceFilesLaunch } from "../workspaceFilesLaunchCoordinator.ts";
import { requestWorkspaceIssueManagerLaunch } from "../workspaceIssueManagerLaunchCoordinator.ts";
import { requestGroupChatLaunch } from "../groupChatLaunchCoordinator.ts";
import { registerWorkspaceAgentCanvasSurface } from "../workspaceAgentCanvasLaunchCoordinator.ts";
import {
  readTuttiCanvasTargets,
  resolveTuttiCanvasFallbackTabLabel,
  resolveTuttiCanvasOpenRouteIntent,
  resolveTuttiCanvasTabLabel,
  resolveTuttiCanvasTargetsUrl,
  type TuttiCanvasTarget
} from "../tuttiCanvasTarget.ts";
import { useExternalStoreValue } from "../../ui/useExternalStoreValue.ts";
import { workspaceAgentGuiNodeFrame } from "./workspaceWorkbenchComposition.ts";
import type { AgentSessionReplayDesktopComposition } from "@renderer/features/agent-session-replay/services/agentSessionReplayDesktopComposition.ts";

const tuttiCanvasAppId = "tutti-canvas";
const tuttiCanvasTargetPollIntervalMs = 500;

function DesktopWorkspaceAgentGUIWorkbenchBodyWithSideRuntime({
  appCenterService,
  appI18n,
  createAgentSideConversationRuntime,
  linkActionDependencies,
  workspaceAppBrowserFeature,
  ...props
}: Omit<
  DesktopWorkspaceAgentGUIWorkbenchBodyProps,
  "agentSideConversationRuntime" | "onLinkAction"
> & {
  appCenterService: IWorkspaceAppCenterService;
  appI18n: I18nRuntime<string>;
  createAgentSideConversationRuntime: () => DesktopAgentGUIWorkbenchBodyProps["agentSideConversationRuntime"];
  linkActionDependencies: Omit<
    DesktopAgentGUILinkActionDependencies,
    "launchWorkspaceApp"
  >;
  workspaceAppBrowserFeature?: BrowserNodeFeature;
}) {
  const sidebarRef = useRef<AgentToolSidebarHandle>(null);
  const canvasOpenRef = useRef(false);
  const [mountedTabs, setMountedTabs] = useState<readonly AgentToolTab[]>([]);
  const mountedTabsRef = useRef(mountedTabs);
  mountedTabsRef.current = mountedTabs;
  const [canvasTargetsByFile, setCanvasTargetsByFile] = useState<
    ReadonlyMap<string, TuttiCanvasTarget>
  >(() => new Map());
  const handledCanvasRevisionByFileRef = useRef(new Map<string, string>());
  const canvasPreparationRef = useRef<ReturnType<
    IWorkspaceAppCenterService["prepareAppLaunch"]
  > | null>(null);
  const sideRuntime = useMemo(
    () => createAgentSideConversationRuntime(),
    [createAgentSideConversationRuntime]
  );
  useEffect(() => () => sideRuntime?.dispose?.(), [sideRuntime]);
  const copy = useMemo<AgentToolSidebarCopy>(
    () => ({
      close: appI18n.t("workspace.agentGui.toolSidebar.close"),
      closeRightPanel: appI18n.t(
        "workspace.agentGui.toolSidebar.closeRightPanel"
      ),
      expand: appI18n.t("workspace.agentGui.toolSidebar.expandPanel"),
      newTab: appI18n.t("workspace.agentGui.toolSidebar.newTab"),
      openRightPanel: appI18n.t(
        "workspace.agentGui.toolSidebar.openRightPanel"
      ),
      resizeSidebar: appI18n.t("workspace.agentGui.toolSidebar.resizeSidebar"),
      shrink: appI18n.t("workspace.agentGui.toolSidebar.shrinkPanel"),
      tool: appI18n.t("workspace.agentGui.toolSidebar.tool")
    }),
    [appI18n]
  );
  const prepareCanvas = useCallback(() => {
    const activePreparation = canvasPreparationRef.current;
    if (activePreparation) return activePreparation;
    const preparation = appCenterService.prepareAppLaunch({
      appId: tuttiCanvasAppId,
      workspaceId: props.workspaceId
    });
    canvasPreparationRef.current = preparation;
    const clearPreparation = () => {
      if (canvasPreparationRef.current === preparation) {
        canvasPreparationRef.current = null;
      }
    };
    void preparation.then(clearPreparation, clearPreparation);
    return preparation;
  }, [appCenterService, props.workspaceId]);
  const launchWorkspaceApp = useCallback<
    NonNullable<DesktopAgentGUILinkActionDependencies["launchWorkspaceApp"]>
  >(
    async ({ appId, workspaceId }) => {
      if (appId !== tuttiCanvasAppId) {
        return appCenterService.openApp({ appId, workspaceId });
      }
      const app = await prepareCanvas();
      if (!app) return false;
      return Boolean(sidebarRef.current?.openPanel("canvas", appId));
    },
    [appCenterService, prepareCanvas]
  );
  const handleLinkAction = useCallback<
    NonNullable<DesktopAgentGUIWorkbenchBodyProps["onLinkAction"]>
  >(
    (action) => {
      void runDesktopAgentGUILinkAction(action, {
        ...linkActionDependencies,
        launchWorkspaceApp
      });
    },
    [launchWorkspaceApp, linkActionDependencies]
  );
  const containerWidth = props.context.node.frame.width;
  const canvasRuntimeSignature = useExternalStoreValue(
    (listener) => appCenterService.subscribe(listener),
    () => {
      const app = appCenterService.store.apps.find(
        (candidate) => candidate.appId === tuttiCanvasAppId
      );
      return `${app?.runtimeStatus ?? ""}\u0000${app?.launchUrl ?? ""}`;
    },
    () => ""
  );
  const canvasApp = appCenterService.store.apps.find(
    (candidate) => candidate.appId === tuttiCanvasAppId
  );
  const canvasLaunchUrl = canvasApp?.launchUrl?.trim() ?? "";
  useEffect(() => {
    const targetsUrl = resolveTuttiCanvasTargetsUrl(canvasLaunchUrl);
    if (!targetsUrl) return;

    let cancelled = false;
    let initialized = false;
    let requestInFlight = false;
    let closeGenericTabTimer: number | undefined;
    const pollTargets = async (): Promise<void> => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch(targetsUrl, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const targets = readTuttiCanvasTargets(await response.json());
        const genericCanvasTabOpen = mountedTabsRef.current.some(
          (tab) => tab.panel === "canvas" && tab.resourceId === tuttiCanvasAppId
        );
        const changedTargets = targets.filter(
          (target) =>
            handledCanvasRevisionByFileRef.current.get(target.canvasFile) !==
            target.revision
        );

        if (!initialized) {
          initialized = true;
          if (!genericCanvasTabOpen) {
            for (const target of targets) {
              handledCanvasRevisionByFileRef.current.set(
                target.canvasFile,
                target.revision
              );
            }
            return;
          }
        }

        const target = genericCanvasTabOpen
          ? (targets.at(-1) ?? null)
          : (changedTargets.at(-1) ?? null);
        if (!target || cancelled) return;

        for (const changedTarget of genericCanvasTabOpen
          ? targets
          : changedTargets) {
          handledCanvasRevisionByFileRef.current.set(
            changedTarget.canvasFile,
            changedTarget.revision
          );
        }
        setCanvasTargetsByFile((current) => {
          const next = new Map(current);
          next.set(target.canvasFile, target);
          return next;
        });
        sidebarRef.current?.openPanel("canvas", target.canvasFile);

        window.clearTimeout(closeGenericTabTimer);
        closeGenericTabTimer = window.setTimeout(() => {
          const genericTab = mountedTabsRef.current.find(
            (tab) =>
              tab.panel === "canvas" && tab.resourceId === tuttiCanvasAppId
          );
          if (genericTab) {
            sidebarRef.current?.closeTab(genericTab.id);
          }
        }, 0);
      } catch {
        // The Workspace App may be restarting between catalog updates.
      } finally {
        requestInFlight = false;
      }
    };

    void pollTargets();
    const timer = window.setInterval(
      () => void pollTargets(),
      tuttiCanvasTargetPollIntervalMs
    );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(closeGenericTabTimer);
    };
  }, [canvasLaunchUrl, canvasRuntimeSignature]);
  useEffect(() => {
    if (!props.context.isFocused) return;
    return registerWorkspaceAgentCanvasSurface(
      props.workspaceId,
      props.context.node.id,
      {
        close: () => sidebarRef.current?.close(),
        isOpen: () => canvasOpenRef.current,
        open: () =>
          Boolean(sidebarRef.current?.openPanel("canvas", tuttiCanvasAppId))
      }
    );
  }, [props.context.isFocused, props.context.node.id, props.workspaceId]);

  const canvasLabel = appI18n.t("workspace.agentGui.toolSidebar.canvas");
  return createElement(AgentToolSidebar, {
    children: createElement(DesktopWorkspaceAgentGUIWorkbenchBody, {
      ...props,
      agentSideConversationRuntime: sideRuntime,
      appCenterService,
      onLinkAction: handleLinkAction
    }),
    ref: sidebarRef,
    containerWidth,
    copy,
    header: {
      layout: "overlay",
      owner: "host",
      render: (layout) =>
        createElement(DesktopAgentToolSidebarHeaderPortal, {
          layout,
          nodeId: props.context.node.id
        })
    },
    mainContentMinWidthPx: 320,
    panels: [
      {
        id: "canvas",
        label: canvasLabel
      }
    ],
    renderPanel: ({ active, tab }) => {
      const canvasTarget =
        tab.resourceId && tab.resourceId !== tuttiCanvasAppId
          ? (canvasTargetsByFile.get(tab.resourceId) ?? null)
          : null;
      return workspaceAppBrowserFeature
        ? createElement(WorkspaceAppCenterDirectAppBody, {
            active,
            appCenterService,
            appId: tuttiCanvasAppId,
            browserFeature: workspaceAppBrowserFeature,
            fallbackLabel: appI18n.t("common.loading"),
            i18n: appI18n,
            launchIntent: canvasTarget
              ? resolveTuttiCanvasOpenRouteIntent(canvasTarget)
              : null,
            surfaceId: `${props.context.node.id}:${tab.resourceId ?? tuttiCanvasAppId}`,
            workspaceId: props.workspaceId
          })
        : createElement(
            "div",
            {
              className:
                "flex h-full items-center justify-center text-sm text-[var(--text-secondary)]"
            },
            appI18n.t("workspace.agentGui.toolSidebar.unavailable", {
              tool: canvasLabel
            })
          );
    },
    resizeContainerContentWidth: async () => ({ width: containerWidth }),
    resolveTabLabel: (tab, defaultLabel) => {
      if (!tab.resourceId || tab.resourceId === tuttiCanvasAppId) {
        return `Tutti ${canvasLabel}`;
      }
      const target = canvasTargetsByFile.get(tab.resourceId);
      return target
        ? resolveTuttiCanvasTabLabel(target)
        : resolveTuttiCanvasFallbackTabLabel(tab.resourceId) || defaultLabel;
    },
    onActivePanelChange: (panel) => {
      canvasOpenRef.current = panel === "canvas";
    },
    onPanelOpen: (panel) => {
      if (panel === "canvas") void prepareCanvas();
    },
    onTabsChange: setMountedTabs
  });
}

function DesktopAgentToolSidebarHeaderPortal({
  layout,
  nodeId
}: {
  layout: AgentToolSidebarHeaderLayout;
  nodeId: string;
}): ReactNode {
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    let header: HTMLElement | null = null;
    const bindPortal = () => {
      const windowShell = Array.from(
        document.querySelectorAll<HTMLElement>("[data-workbench-window-id]")
      ).find((candidate) => candidate.dataset.workbenchWindowId === nodeId);
      const nextHeader = windowShell?.querySelector<HTMLElement>(
        "[data-agent-gui-workbench-header]"
      );
      const portal = nextHeader?.querySelector<HTMLElement>(
        "[data-agent-gui-workbench-tool-sidebar-portal]"
      );
      if (!nextHeader || !portal) return false;

      header = nextHeader;
      header.dataset.agentGuiWorkbenchHeaderToolSidebar = "true";
      setPortalElement(portal);
      return true;
    };
    const observer = new MutationObserver(() => {
      if (bindPortal()) observer.disconnect();
    });
    if (!bindPortal()) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      observer.disconnect();
      if (header) {
        delete header.dataset.agentGuiWorkbenchHeaderToolSidebar;
        header.style.removeProperty("--agent-gui-tool-sidebar-layout-width");
      }
    };
  }, [nodeId]);
  useLayoutEffect(() => {
    const header = portalElement?.parentElement;
    if (!header) return;
    header.style.setProperty(
      "--agent-gui-tool-sidebar-layout-width",
      `${Math.max(0, Math.round(layout.layoutWidthPx))}px`
    );
  }, [layout.layoutWidthPx, portalElement]);
  return portalElement ? createPortal(layout.actions, portalElement) : null;
}

export function createWorkspaceAgentGuiContribution(input: {
  agentQuickPromptService?: AgentQuickPromptService;
  agentSessionReplayComposition?: AgentSessionReplayDesktopComposition | null;
  agentProviderStatusService: AgentProviderStatusService;
  appCenterService: IWorkspaceAppCenterService;
  appI18n: I18nRuntime<string>;
  computerUseApi: Pick<DesktopComputerUseApi, "checkStatus">;
  dockPreviewCache: WorkbenchDockPreviewCache;
  dockIconUrls?: Parameters<
    typeof createAgentGuiWorkbenchContribution
  >[0]["dockIconUrls"];
  unifiedDockIconUrl?: Parameters<
    typeof createAgentGuiWorkbenchContribution
  >[0]["unifiedDockIconUrl"];
  defaultAgentProvider?: string | null;
  hostFilesApi: DesktopHostFilesApi;
  hostWindowApi: Pick<DesktopHostWindowApi, "openAgentWindow">;
  i18n: WorkspaceWorkbenchDesktopI18nRuntime;
  onCapabilitySettingsRequest?: DesktopAgentGUIWorkbenchBodyProps["onCapabilitySettingsRequest"];
  agentsService: Pick<IAgentsService, "getSnapshot" | "subscribe">;
  allAgentsPresentation?: AgentGUIAllAgentsPresentation | null;
  renderAgentsEmpty?: AgentGUIAgentsEmptyRenderer;
  comingSoonAgentProviders?: readonly AgentGUIProvider[];
  tuttidClient: TuttidClient;
  eventStreamClient?: TuttidEventStreamClient;
  platformApi: Pick<
    DesktopPlatformApi,
    "homeDirectory" | "os" | "resolveDroppedEntries" | "resolveDroppedPaths"
  >;
  reporterService?: Pick<IReporterService, "trackEvents">;
  richTextAtService: IDesktopRichTextAtService;
  runtimeApi: DesktopRuntimeApi;
  workspaceAgentActivityService: IWorkspaceAgentActivityService;
  workspaceFileManagerService: IWorkspaceFileManagerService;
  workspaceFilePreviewSurfaceHost: IWorkspaceFilePreviewSurfaceHost;
  workspaceUserProjectService: IWorkspaceUserProjectService;
  workspaceId: string;
  workspaceAppBrowserFeature?: BrowserNodeFeature;
}): WorkbenchContribution {
  const defaultAgentProvider = isAgentGuiWorkbenchProvider(
    input.defaultAgentProvider
  )
    ? input.defaultAgentProvider
    : null;
  const agentGUIWorkbenchHostInput = createDesktopAgentGUIWorkbenchHostInput({
    agentQuickPromptService: input.agentQuickPromptService,
    agentSessionReplayComposition: input.agentSessionReplayComposition,
    hostFilesApi: input.hostFilesApi,
    eventStreamClient: input.eventStreamClient,
    tuttidClient: input.tuttidClient,
    platformApi: input.platformApi,
    reporterService: input.reporterService,
    richTextAtService: input.richTextAtService,
    runtimeApi: input.runtimeApi,
    workspaceAgentActivityService: input.workspaceAgentActivityService,
    workspaceFileManagerService: input.workspaceFileManagerService,
    workspaceFilePreviewSurfaceHost: input.workspaceFilePreviewSurfaceHost,
    workspaceUserProjectService: input.workspaceUserProjectService,
    workspaceId: input.workspaceId
  });
  const workspaceAgentStatusSource = createDesktopWorkspaceAgentStatusSource({
    agentActivityRuntime: agentGUIWorkbenchHostInput.agentActivityRuntime,
    agents: () => input.agentsService.getSnapshot().agents,
    workspaceAgentProbes:
      agentGUIWorkbenchHostInput.agentHostApi.workspaceAgentProbes,
    workspaceId: input.workspaceId
  });
  const trackWorkspaceAgentGUIEngagement =
    agentGUIWorkbenchHostInput.createAgentGUIEngagementEventSink("workspace");
  const sessionEngine = input.workspaceAgentActivityService.getSessionEngine(
    input.workspaceId
  );
  const linkActionDependencies: Omit<
    DesktopAgentGUILinkActionDependencies,
    "launchWorkspaceApp"
  > = {
    getAgentSession: ({ agentSessionId, workspaceId }) =>
      input.workspaceAgentActivityService.getSession(
        workspaceId,
        agentSessionId
      ),
    homeDirectory: input.platformApi.homeDirectory,
    launchAgentGui: requestWorkspaceAgentGuiLaunch,
    launchWorkspaceIssueManager: requestWorkspaceIssueManagerLaunch,
    launchWorkspaceFiles: requestWorkspaceFilesLaunch,
    launchGroupChat: requestGroupChatLaunch,
    openBrowserUrl: requestWorkspaceBrowserLaunch,
    openExternalUrl: (url) => input.hostFilesApi.openExternal(url),
    workspaceId: input.workspaceId
  };
  const renderAgentGuiWorkbenchBody = (
    context: Parameters<
      Parameters<typeof createAgentGuiWorkbenchContribution>[0]["renderBody"]
    >[0],
    helpers: Parameters<
      Parameters<typeof createAgentGuiWorkbenchContribution>[0]["renderBody"]
    >[1]
  ) => {
    return createElement(DesktopWorkspaceAgentGUIWorkbenchBodyWithSideRuntime, {
      agentActivityRuntime: agentGUIWorkbenchHostInput.agentActivityRuntime,
      createAgentSideConversationRuntime:
        agentGUIWorkbenchHostInput.createAgentSideConversationRuntime,
      agentHostApi: agentGUIWorkbenchHostInput.agentHostApi,
      agentSessionReplayService:
        agentGUIWorkbenchHostInput.agentSessionReplayService,
      agentStatusSource: workspaceAgentStatusSource,
      tuttiModePlanReviewRuntime:
        agentGUIWorkbenchHostInput.tuttiModePlanReviewRuntime,
      appCenterService: input.appCenterService,
      appI18n: input.appI18n,
      agentProviderStatusService: input.agentProviderStatusService,
      context,
      computerUseApi: input.computerUseApi,
      dockPreviewCache: input.dockPreviewCache,
      onCapabilitySettingsRequest: input.onCapabilitySettingsRequest,
      linkActionDependencies,
      onOpenAgentConversationWindow: async (request) => {
        await requestWorkspaceAgentGuiLaunch({
          ...request,
          openInNewWindow: true
        });
      },
      onStateChange: (...args) => helpers.onStateChange(...args),
      onConversationRailLayoutChange: helpers.onConversationRailLayoutChange,
      agentsService: helpers.agentDirectory,
      allAgentsPresentation: input.allAgentsPresentation,
      renderAgentsEmpty: input.renderAgentsEmpty,
      comingSoonAgentProviders: input.comingSoonAgentProviders,
      defaultAgentProvider: input.defaultAgentProvider,
      contextMentionProviders:
        agentGUIWorkbenchHostInput.contextMentionProviders,
      runtimeApi: input.runtimeApi,
      trackAgentProviderChatReady:
        agentGUIWorkbenchHostInput.trackAgentProviderChatReady,
      onEngagementEvent: trackWorkspaceAgentGUIEngagement,
      trackWorkspaceFileReferences:
        agentGUIWorkbenchHostInput.trackWorkspaceFileReferences,
      workspaceFileReferenceAdapter:
        agentGUIWorkbenchHostInput.workspaceFileReferenceAdapter,
      resolveExternalPromptEntries:
        agentGUIWorkbenchHostInput.resolveExternalPromptEntries,
      prepareExternalPromptFiles:
        agentGUIWorkbenchHostInput.prepareExternalPromptFiles,
      onRequestGitBranches: agentGUIWorkbenchHostInput.onRequestGitBranches,
      referenceSourceAggregator:
        agentGUIWorkbenchHostInput.referenceSourceAggregator,
      resolveWorkspaceReferenceEntryIconUrl:
        agentGUIWorkbenchHostInput.resolveWorkspaceReferenceEntryIconUrl,
      resolveMentionReferenceTarget:
        agentGUIWorkbenchHostInput.resolveMentionReferenceTarget,
      resolveWorkspaceReferenceInitialTarget:
        agentGUIWorkbenchHostInput.resolveWorkspaceReferenceInitialTarget,
      workspaceId: input.workspaceId,
      workspaceAppBrowserFeature: input.workspaceAppBrowserFeature
    });
  };

  return createAgentGuiWorkbenchContribution({
    copy: {
      collapseConversationRail: input.appI18n.t(
        "workspace.agentGui.collapseConversationRail"
      ),
      expandConversationRail: input.appI18n.t(
        "workspace.agentGui.expandConversationRail"
      ),
      fallbackAgentLabel: input.appI18n.t(
        "workspace.agentGui.fallbackAgentLabel"
      ),
      newConversation: input.appI18n.t("workspace.agentGui.newConversation"),
      openDetachedWindow: input.appI18n.t("workspace.agentGui.openNewWindow"),
      nodeTitle: input.i18n.t(workspaceWorkbenchDesktopI18nKeys.nodes.agent),
      untitledConversation: input.appI18n.t(
        "workspace.agentGui.untitledConversation"
      ),
      sessionMenu: {
        copyAsMarkdown: input.appI18n.t(
          "workspace.agentGui.sessionMenu.copyAsMarkdown"
        ),
        copyAsReference: input.appI18n.t(
          "workspace.agentGui.sessionMenu.copyAsReference"
        ),
        moreSessionActions: input.appI18n.t(
          "workspace.agentGui.sessionMenu.moreActions"
        ),
        renameSession: input.appI18n.t("workspace.agentGui.sessionMenu.rename")
      }
    },
    dockIconUrls: input.dockIconUrls,
    unifiedDockIconUrl: input.unifiedDockIconUrl,
    frame: workspaceAgentGuiNodeFrame,
    defaultProvider: defaultAgentProvider,
    agentDirectory: input.agentsService,
    providerAvailability: () =>
      resolveWorkspaceAgentGuiProviderAvailability(
        input.agentProviderStatusService
      ),
    renderBody: (context, helpers) =>
      renderAgentGuiWorkbenchBody(context, helpers),
    resolveDockPopupIdentity: (state) =>
      resolveWorkspaceAgentGuiDockPopupIdentity(state, {
        dockIconUrls: input.dockIconUrls,
        agents: input.agentsService.getSnapshot().agents,
        sessionEngine
      }),
    onOpenDetachedWindow: ({ agentTargetId, provider }) => {
      void requestWorkspaceAgentGuiLaunch({
        agentTargetId,
        openInNewWindow: true,
        provider,
        workspaceId: input.workspaceId
      });
    },
    sessionEngine,
    workspaceId: input.workspaceId
  });
}

type DesktopWorkspaceAgentGUIWorkbenchBodyProps = Omit<
  DesktopAgentGUIWorkbenchBodyProps,
  "agentDirectory" | "defaultAgentTargetId"
> & {
  agentsService: AgentGUIAgentDirectoryPort;
  defaultAgentProvider?: string | null;
};

function DesktopWorkspaceAgentGUIWorkbenchBody({
  agentsService,
  defaultAgentProvider,
  ...props
}: DesktopWorkspaceAgentGUIWorkbenchBodyProps): ReactNode {
  const snapshot = useExternalStoreValue(
    (listener) => agentsService.subscribe(listener),
    () => agentsService.getSnapshot(),
    () => agentsService.getSnapshot()
  );
  return createElement(DesktopAgentGUIWorkbenchBody, {
    ...props,
    agentDirectory: snapshot,
    defaultAgentTargetId: resolveDefaultAgentTargetId({
      agents: snapshot.agents,
      defaultProvider: defaultAgentProvider
    })
  });
}

function resolveDefaultAgentTargetId(input: {
  agents: readonly AgentGUIAgent[];
  defaultProvider?: string | null;
}): string | null {
  const defaultProvider = input.defaultProvider?.trim() ?? "";
  return (
    input.agents.find(
      (agent) =>
        defaultProvider !== "" &&
        agent.provider === defaultProvider &&
        agent.availability.status === "ready"
    )?.agentTargetId ??
    input.agents.find((agent) => agent.availability.status === "ready")
      ?.agentTargetId ??
    null
  );
}

function resolveWorkspaceAgentGuiProviderAvailability(
  service: AgentProviderStatusService
): Partial<Record<AgentGuiWorkbenchProvider, boolean>> {
  const availability: Partial<Record<AgentGuiWorkbenchProvider, boolean>> = {};
  for (const status of service.getSnapshot().statuses) {
    if (!isAgentGuiWorkbenchProvider(status.provider)) {
      continue;
    }
    // Only pin ready providers. Contribution rebuilds freeze this map; marking
    // in-flight probes as false blocks dock launch until the next revision and
    // Agent Session Replay clicks often land in that window.
    if (status.availability.status === "ready") {
      availability[status.provider] = true;
    }
  }
  return availability;
}

function resolveWorkspaceAgentGuiDockPopupIdentity(
  state: AgentGuiWorkbenchState | null,
  input: {
    dockIconUrls?: Parameters<
      typeof createAgentGuiWorkbenchContribution
    >[0]["dockIconUrls"];
    agents?: readonly AgentGUIAgent[];
    sessionEngine: ReturnType<
      IWorkspaceAgentActivityService["getSessionEngine"]
    >;
  }
): AgentGuiWorkbenchConversationIdentity | null {
  return resolveAgentGuiWorkbenchConversationIdentity({
    agents: input.agents ?? [],
    dockIconUrls: input.dockIconUrls,
    engineState: input.sessionEngine.getSnapshot(),
    workbenchState: state
  });
}
