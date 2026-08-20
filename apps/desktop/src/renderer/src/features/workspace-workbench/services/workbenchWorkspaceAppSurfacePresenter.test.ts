import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceAppCenterViewState } from "@tutti-os/workspace-app-center";
import type {
  WorkbenchHostHandle,
  WorkbenchState
} from "@tutti-os/workbench-surface";
import { workspaceAppCenterNodeID } from "../../workspace-app-center/services/workspaceAppCenterLaunchIds.ts";
import { createWorkbenchWorkspaceAppSurfacePresenter } from "./workbenchWorkspaceAppSurfacePresenter.ts";
import { registerWorkspaceAgentCanvasSurface } from "./workspaceAgentCanvasLaunchCoordinator.ts";

test("workbench app presenter opens apps as tabs in the singleton app-center node", async () => {
  const launches: unknown[] = [];
  const harness = createViewStateHarness();
  const presenter = createWorkbenchWorkspaceAppSurfacePresenter({
    ...harness,
    host: createHost({ launches }),
    workspaceId: "workspace-1"
  });
  const attempt = {
    appId: "ai-slide",
    attemptId: 1,
    workspaceId: "workspace-1"
  };

  presenter.beginOpen(attempt);
  const opened = await presenter.presentPrepared({
    appId: "ai-slide",
    attempt,
    prepared: true,
    prevStatus: "idle",
    workspaceId: "workspace-1"
  });

  assert.equal(opened, true);
  assert.deepEqual(harness.read(), {
    activeAppTab: "recommended",
    openAppId: "ai-slide",
    openAppIds: ["ai-slide"]
  });
  assert.deepEqual(launches, [
    {
      reason: "host",
      typeId: workspaceAppCenterNodeID
    }
  ]);
});

test("workbench app presenter does not open Tutti Canvas outside an Agent sidebar", async () => {
  const launches: unknown[] = [];
  const closedNodeIds: string[] = [];
  const harness = createViewStateHarness();
  const presenter = createWorkbenchWorkspaceAppSurfacePresenter({
    ...harness,
    host: createHost({ closedNodeIds, launches }),
    workspaceId: "workspace-1"
  });
  const attempt = {
    appId: "tutti-canvas",
    attemptId: 10,
    workspaceId: "workspace-1"
  };

  presenter.beginOpen(attempt);
  const opened = await presenter.presentPrepared({
    appId: "tutti-canvas",
    attempt,
    prepared: true,
    prevStatus: "idle",
    workspaceId: "workspace-1"
  });

  assert.equal(opened, false);
  assert.deepEqual(harness.read(), {
    activeAppTab: "recommended",
    openAppId: null,
    openAppIds: []
  });
  assert.deepEqual(launches, []);
  assert.equal(
    presenter.isOpen({ appId: "tutti-canvas", workspaceId: "workspace-1" }),
    false
  );
  presenter.close({ appId: "tutti-canvas", workspaceId: "workspace-1" });
  assert.deepEqual(closedNodeIds, []);
});

test("workbench app presenter opens Tutti Canvas in the focused Agent sidebar", async () => {
  const launches: unknown[] = [];
  let canvasOpen = false;
  const dispose = registerWorkspaceAgentCanvasSurface(
    "workspace-agent-canvas",
    "agent-node",
    {
      close: () => {
        canvasOpen = false;
      },
      isOpen: () => canvasOpen,
      open: () => {
        canvasOpen = true;
        return true;
      }
    }
  );
  const harness = createViewStateHarness();
  const presenter = createWorkbenchWorkspaceAppSurfacePresenter({
    ...harness,
    host: createHost({ launches, nodeStack: ["agent-node"] }),
    workspaceId: "workspace-agent-canvas"
  });
  const attempt = {
    appId: "tutti-canvas",
    attemptId: 11,
    workspaceId: "workspace-agent-canvas"
  };

  try {
    presenter.beginOpen(attempt);
    const opened = await presenter.presentPrepared({
      appId: "tutti-canvas",
      attempt,
      prepared: true,
      prevStatus: "idle",
      workspaceId: "workspace-agent-canvas"
    });

    assert.equal(opened, true);
    assert.equal(canvasOpen, true);
    assert.deepEqual(launches, []);
    assert.equal(
      presenter.isOpen({
        appId: "tutti-canvas",
        workspaceId: "workspace-agent-canvas"
      }),
      true
    );
    presenter.close({
      appId: "tutti-canvas",
      workspaceId: "workspace-agent-canvas"
    });
    assert.equal(canvasOpen, false);
  } finally {
    dispose();
  }
});

test("workbench app presenter selects an existing tab and forwards route intent", async () => {
  const activations: unknown[] = [];
  const launches: unknown[] = [];
  const harness = createViewStateHarness({
    activeAppTab: "recommended",
    openAppId: null,
    openAppIds: ["tutti-onboarding"]
  });
  const presenter = createWorkbenchWorkspaceAppSurfacePresenter({
    ...harness,
    host: createHost({ activations, launches }),
    workspaceId: "workspace-1"
  });
  const attempt = {
    appId: "tutti-onboarding",
    attemptId: 2,
    workspaceId: "workspace-1"
  };
  const intent = {
    kind: "open-route" as const,
    params: { step: "welcome" },
    route: "/start"
  };

  presenter.beginOpen(attempt);
  await presenter.presentPrepared({
    appId: "tutti-onboarding",
    attempt,
    intent,
    prepared: true,
    prevStatus: "running",
    workspaceId: "workspace-1"
  });

  assert.deepEqual(harness.read().openAppIds, ["tutti-onboarding"]);
  assert.equal(harness.read().openAppId, "tutti-onboarding");
  assert.deepEqual(activations, [
    [
      { nodeId: "app-center-node" },
      {
        payload: { appId: "tutti-onboarding", intent },
        type: "workspace-app:open"
      }
    ]
  ]);
  assert.deepEqual(launches, [
    {
      launchSource: "onboarding-auto",
      reason: "host",
      typeId: workspaceAppCenterNodeID
    }
  ]);
});

test("workbench app presenter closes tabs and detects inactive open apps", () => {
  const harness = createViewStateHarness({
    activeAppTab: "recommended",
    openAppId: "ai-doc",
    openAppIds: ["ai-slide", "ai-doc"]
  });
  const presenter = createWorkbenchWorkspaceAppSurfacePresenter({
    ...harness,
    host: createHost({}),
    workspaceId: "workspace-1"
  });

  assert.equal(
    presenter.isOpen({ appId: "ai-slide", workspaceId: "workspace-1" }),
    true
  );
  presenter.close({ appId: "ai-slide", workspaceId: "workspace-1" });
  assert.deepEqual(harness.read().openAppIds, ["ai-doc"]);
  assert.equal(harness.read().openAppId, "ai-doc");
});

test("workbench app presenter restores tabs when preparation rolls back", () => {
  const initial = {
    activeAppTab: "community" as const,
    openAppId: "ai-doc",
    openAppIds: ["ai-doc"]
  };
  const harness = createViewStateHarness(initial);
  const presenter = createWorkbenchWorkspaceAppSurfacePresenter({
    ...harness,
    host: createHost({}),
    workspaceId: "workspace-1"
  });
  const attempt = {
    appId: "ai-slide",
    attemptId: 3,
    workspaceId: "workspace-1"
  };

  presenter.beginOpen(attempt);
  presenter.rollbackOpen(attempt);

  assert.deepEqual(harness.read(), initial);
});

test("workbench app presenter keeps a newer tab when an older launch rolls back", () => {
  const harness = createViewStateHarness();
  const presenter = createWorkbenchWorkspaceAppSurfacePresenter({
    ...harness,
    host: createHost({}),
    workspaceId: "workspace-1"
  });
  const first = {
    appId: "ai-slide",
    attemptId: 4,
    workspaceId: "workspace-1"
  };
  const second = {
    appId: "ai-doc",
    attemptId: 5,
    workspaceId: "workspace-1"
  };

  presenter.beginOpen(first);
  presenter.beginOpen(second);
  presenter.rollbackOpen(first);

  assert.deepEqual(harness.read(), {
    activeAppTab: "recommended",
    openAppId: "ai-doc",
    openAppIds: ["ai-doc"]
  });
});

function createViewStateHarness(
  initial: WorkspaceAppCenterViewState = {
    activeAppTab: "recommended",
    openAppId: null,
    openAppIds: []
  }
): {
  getViewState(workspaceId: string): WorkspaceAppCenterViewState;
  read(): WorkspaceAppCenterViewState;
  setViewState(input: {
    state: Partial<WorkspaceAppCenterViewState>;
    workspaceId: string;
  }): void;
} {
  let state = initial;
  return {
    getViewState: () => state,
    read: () => state,
    setViewState: (input) => {
      state = { ...state, ...input.state };
    }
  };
}

function createHost(input: {
  activations?: unknown[];
  closedNodeIds?: string[];
  launches?: unknown[];
  nodeIds?: string[];
  nodeStack?: string[];
}): WorkbenchHostHandle {
  return {
    activateNode: (...args: unknown[]) => input.activations?.push(args),
    closeNode: (nodeId: string) => input.closedNodeIds?.push(nodeId),
    getSnapshot: () =>
      ({
        nodes: (input.nodeIds ?? []).map((id) => ({ id })),
        nodeStack: input.nodeStack ?? []
      }) as unknown as WorkbenchState,
    launchNode: async (
      request: Parameters<WorkbenchHostHandle["launchNode"]>[0]
    ) => {
      input.launches?.push(request);
      return "app-center-node";
    }
  } as unknown as WorkbenchHostHandle;
}
