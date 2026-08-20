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
import {
  AgentToolSidebar,
  type AgentToolSidebarCopy,
  type AgentToolSidebarHeaderLayout,
  type AgentToolSidebarHandle,
  type AgentToolTab
} from "@tutti-os/agent-gui/workbench/tool-sidebar";
import type { I18nRuntime } from "@tutti-os/ui-i18n-runtime";
import type { WorkbenchHostNodeBodyContext } from "@tutti-os/workbench-surface";
import {
  WorkspaceAppCenterDirectAppBody,
  type IWorkspaceAppCenterService
} from "@renderer/features/workspace-app-center";
import type { DesktopAgentGUIWorkbenchBodyProps } from "@renderer/features/workspace-agent/ui/desktopAgentGUIWorkbenchModel.ts";
import {
  runDesktopAgentGUILinkAction,
  type DesktopAgentGUILinkActionDependencies
} from "@renderer/features/workspace-agent/services/desktopAgentGUILinkActions.ts";
import { registerWorkspaceAgentDeckSurface } from "../workspaceAgentDeckLaunchCoordinator.ts";
import {
  readTuttiDeckTargets,
  resolveTuttiDeckFallbackTabLabel,
  resolveTuttiDeckOpenRouteIntent,
  resolveTuttiDeckTabLabel,
  resolveTuttiDeckTargetsUrl,
  tuttiDeckWorkspaceAppId,
  type TuttiDeckTarget
} from "../tuttiDeckTarget.ts";
import { useExternalStoreValue } from "../../ui/useExternalStoreValue.ts";

const tuttiDeckTargetPollIntervalMs = 500;

export function DesktopWorkspaceAgentDeckSidebar({
  appCenterService,
  appI18n,
  context,
  createAgentSideConversationRuntime,
  linkActionDependencies,
  renderAgentBody,
  workspaceAppBrowserFeature,
  workspaceId
}: {
  appCenterService: IWorkspaceAppCenterService;
  appI18n: I18nRuntime<string>;
  context: WorkbenchHostNodeBodyContext;
  createAgentSideConversationRuntime: () => DesktopAgentGUIWorkbenchBodyProps["agentSideConversationRuntime"];
  linkActionDependencies: Omit<
    DesktopAgentGUILinkActionDependencies,
    "launchWorkspaceApp"
  >;
  renderAgentBody(input: {
    agentSideConversationRuntime: DesktopAgentGUIWorkbenchBodyProps["agentSideConversationRuntime"];
    onLinkAction: NonNullable<
      DesktopAgentGUIWorkbenchBodyProps["onLinkAction"]
    >;
  }): ReactNode;
  workspaceAppBrowserFeature?: BrowserNodeFeature;
  workspaceId: string;
}): ReactNode {
  const sidebarRef = useRef<AgentToolSidebarHandle>(null);
  const deckOpenRef = useRef(false);
  const [mountedTabs, setMountedTabs] = useState<readonly AgentToolTab[]>([]);
  const mountedTabsRef = useRef(mountedTabs);
  mountedTabsRef.current = mountedTabs;
  const [deckTargetsByFile, setDeckTargetsByFile] = useState<
    ReadonlyMap<string, TuttiDeckTarget>
  >(() => new Map());
  const handledDeckRevisionByFileRef = useRef(new Map<string, string>());
  const deckPreparationRef = useRef<ReturnType<
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

  const prepareDeck = useCallback(() => {
    const activePreparation = deckPreparationRef.current;
    if (activePreparation) return activePreparation;
    const preparation = appCenterService.prepareAppLaunch({
      appId: tuttiDeckWorkspaceAppId,
      workspaceId
    });
    deckPreparationRef.current = preparation;
    const clearPreparation = () => {
      if (deckPreparationRef.current === preparation) {
        deckPreparationRef.current = null;
      }
    };
    void preparation.then(clearPreparation, clearPreparation);
    return preparation;
  }, [appCenterService, workspaceId]);

  const launchWorkspaceApp = useCallback<
    NonNullable<DesktopAgentGUILinkActionDependencies["launchWorkspaceApp"]>
  >(
    async ({ appId, workspaceId: targetWorkspaceId }) => {
      if (appId !== tuttiDeckWorkspaceAppId) {
        return appCenterService.openApp({
          appId,
          workspaceId: targetWorkspaceId
        });
      }
      const app = await prepareDeck();
      if (!app) return false;
      return Boolean(sidebarRef.current?.openPanel("deck", appId));
    },
    [appCenterService, prepareDeck]
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

  const deckRuntimeSignature = useExternalStoreValue(
    (listener) => appCenterService.subscribe(listener),
    () => {
      const app = appCenterService.store.apps.find(
        (candidate) => candidate.appId === tuttiDeckWorkspaceAppId
      );
      return `${app?.runtimeStatus ?? ""}\u0000${app?.launchUrl ?? ""}`;
    },
    () => ""
  );
  const deckApp = appCenterService.store.apps.find(
    (candidate) => candidate.appId === tuttiDeckWorkspaceAppId
  );
  const deckLaunchUrl = deckApp?.launchUrl?.trim() ?? "";
  useEffect(() => {
    const targetsUrl = resolveTuttiDeckTargetsUrl(deckLaunchUrl);
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
        const targets = readTuttiDeckTargets(await response.json());
        const genericDeckTabOpen = mountedTabsRef.current.some(
          (tab) =>
            tab.panel === "deck" && tab.resourceId === tuttiDeckWorkspaceAppId
        );
        const changedTargets = targets.filter(
          (target) =>
            handledDeckRevisionByFileRef.current.get(target.deckFile) !==
            target.revision
        );

        if (!initialized) {
          initialized = true;
          if (!genericDeckTabOpen) {
            for (const target of targets) {
              handledDeckRevisionByFileRef.current.set(
                target.deckFile,
                target.revision
              );
            }
            return;
          }
        }

        const target = genericDeckTabOpen
          ? (targets.at(-1) ?? null)
          : (changedTargets.at(-1) ?? null);
        if (!target || cancelled) return;

        for (const changedTarget of genericDeckTabOpen
          ? targets
          : changedTargets) {
          handledDeckRevisionByFileRef.current.set(
            changedTarget.deckFile,
            changedTarget.revision
          );
        }
        setDeckTargetsByFile((current) => {
          const next = new Map(current);
          next.set(target.deckFile, target);
          return next;
        });
        sidebarRef.current?.openPanel("deck", target.deckFile);

        window.clearTimeout(closeGenericTabTimer);
        closeGenericTabTimer = window.setTimeout(() => {
          const genericTab = mountedTabsRef.current.find(
            (tab) =>
              tab.panel === "deck" && tab.resourceId === tuttiDeckWorkspaceAppId
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
      tuttiDeckTargetPollIntervalMs
    );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(closeGenericTabTimer);
    };
  }, [deckLaunchUrl, deckRuntimeSignature]);

  useEffect(() => {
    if (!context.isFocused) return;
    return registerWorkspaceAgentDeckSurface(workspaceId, context.node.id, {
      close: () => sidebarRef.current?.close(),
      isOpen: () => deckOpenRef.current,
      open: () =>
        Boolean(sidebarRef.current?.openPanel("deck", tuttiDeckWorkspaceAppId))
    });
  }, [context.isFocused, context.node.id, workspaceId]);

  const deckLabel = appI18n.t("workspace.agentGui.toolSidebar.deck");
  return createElement(AgentToolSidebar, {
    children: renderAgentBody({
      agentSideConversationRuntime: sideRuntime,
      onLinkAction: handleLinkAction
    }),
    ref: sidebarRef,
    containerWidth: context.node.frame.width,
    copy,
    header: {
      layout: "overlay",
      owner: "host",
      render: (layout) =>
        createElement(DesktopAgentToolSidebarHeaderPortal, {
          layout,
          nodeId: context.node.id
        })
    },
    mainContentMinWidthPx: 320,
    panels: [{ id: "deck", label: deckLabel }],
    renderPanel: ({ active, tab }) => {
      const deckTarget =
        tab.resourceId && tab.resourceId !== tuttiDeckWorkspaceAppId
          ? (deckTargetsByFile.get(tab.resourceId) ?? null)
          : null;
      return workspaceAppBrowserFeature
        ? createElement(WorkspaceAppCenterDirectAppBody, {
            active,
            appCenterService,
            appId: tuttiDeckWorkspaceAppId,
            browserFeature: workspaceAppBrowserFeature,
            fallbackLabel: appI18n.t("common.loading"),
            i18n: appI18n,
            launchIntent: deckTarget
              ? resolveTuttiDeckOpenRouteIntent(deckTarget)
              : null,
            surfaceId: `${context.node.id}:${tab.resourceId ?? tuttiDeckWorkspaceAppId}`,
            workspaceId
          })
        : createElement(
            "div",
            {
              className:
                "flex h-full items-center justify-center text-sm text-[var(--text-secondary)]"
            },
            appI18n.t("workspace.agentGui.toolSidebar.unavailable", {
              tool: deckLabel
            })
          );
    },
    resizeContainerContentWidth: async () => ({
      width: context.node.frame.width
    }),
    resolveTabLabel: (tab, defaultLabel) => {
      if (!tab.resourceId || tab.resourceId === tuttiDeckWorkspaceAppId) {
        return `Tutti ${deckLabel}`;
      }
      const target = deckTargetsByFile.get(tab.resourceId);
      return target
        ? resolveTuttiDeckTabLabel(target)
        : resolveTuttiDeckFallbackTabLabel(tab.resourceId) || defaultLabel;
    },
    onActivePanelChange: (panel) => {
      deckOpenRef.current = panel === "deck";
    },
    onPanelOpen: (panel) => {
      if (panel === "deck") void prepareDeck();
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
