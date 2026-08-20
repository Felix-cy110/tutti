import type { WorkspaceAppCenterViewState } from "@tutti-os/workspace-app-center";
import type { WorkbenchHostHandle } from "@tutti-os/workbench-surface";
import type {
  WorkspaceAppOpenAttempt,
  WorkspaceAppSurfacePresenter
} from "../../workspace-app-center/services/workspaceAppSurfaceHost.interface.ts";
import { workspaceAppCenterNodeID } from "../../workspace-app-center/services/workspaceAppCenterLaunchIds.ts";
import {
  closeWorkspaceAppTab,
  openWorkspaceAppTab,
  readWorkspaceAppTabIds
} from "../../workspace-app-center/services/workspaceAppCenterTabs.ts";
import { workspaceOnboardingAppId } from "./workspaceOnboarding.ts";
import {
  closeWorkspaceAgentDeckSurfaces,
  isWorkspaceAgentDeckSurfaceOpen,
  openWorkspaceAgentDeckSurface
} from "./workspaceAgentDeckLaunchCoordinator.ts";

const tuttiDeckAppId = "tutti-deck";

export function createWorkbenchWorkspaceAppSurfacePresenter(input: {
  getViewState(workspaceId: string): WorkspaceAppCenterViewState;
  host: WorkbenchHostHandle;
  setViewState(request: {
    state: Partial<WorkspaceAppCenterViewState>;
    workspaceId: string;
  }): void;
  workspaceId: string;
}): WorkspaceAppSurfacePresenter {
  const previousStateByAttemptId = new Map<
    number,
    WorkspaceAppCenterViewState
  >();
  const directDeckAttemptIds = new Set<number>();
  let latestAttemptId: number | null = null;

  const restoreAttempt = (attempt: WorkspaceAppOpenAttempt): void => {
    const previousState = previousStateByAttemptId.get(attempt.attemptId);
    previousStateByAttemptId.delete(attempt.attemptId);
    if (!previousState || attempt.workspaceId !== input.workspaceId) {
      return;
    }
    const currentState = input.getViewState(input.workspaceId);
    const wasAlreadyOpen = readWorkspaceAppTabIds(previousState).includes(
      attempt.appId
    );
    input.setViewState({
      state:
        latestAttemptId === attempt.attemptId
          ? previousState
          : wasAlreadyOpen
            ? currentState
            : closeWorkspaceAppTab(currentState, attempt.appId),
      workspaceId: input.workspaceId
    });
    if (latestAttemptId === attempt.attemptId) {
      latestAttemptId = null;
    }
  };

  return {
    beginOpen(attempt) {
      if (attempt.workspaceId !== input.workspaceId) {
        return;
      }
      if (attempt.appId === tuttiDeckAppId) {
        directDeckAttemptIds.add(attempt.attemptId);
        return;
      }
      const previousState = input.getViewState(input.workspaceId);
      previousStateByAttemptId.set(attempt.attemptId, previousState);
      latestAttemptId = attempt.attemptId;
      input.setViewState({
        state: openWorkspaceAppTab(previousState, attempt.appId),
        workspaceId: input.workspaceId
      });
    },
    close(request) {
      if (request.workspaceId !== input.workspaceId) {
        return;
      }
      if (request.appId === tuttiDeckAppId) {
        closeWorkspaceAgentDeckSurfaces(input.workspaceId);
        return;
      }
      input.setViewState({
        state: closeWorkspaceAppTab(
          input.getViewState(input.workspaceId),
          request.appId
        ),
        workspaceId: input.workspaceId
      });
    },
    isOpen(request) {
      if (
        request.workspaceId === input.workspaceId &&
        request.appId === tuttiDeckAppId
      ) {
        return isWorkspaceAgentDeckSurfaceOpen(input.workspaceId);
      }
      return (
        request.workspaceId === input.workspaceId &&
        readWorkspaceAppTabIds(input.getViewState(input.workspaceId)).includes(
          request.appId
        )
      );
    },
    async presentPrepared(request) {
      if (
        request.appId === tuttiDeckAppId &&
        request.workspaceId === input.workspaceId &&
        directDeckAttemptIds.delete(request.attempt.attemptId)
      ) {
        const focusedNodeId =
          input.host.getSnapshot().nodeStack?.at(-1) ?? null;
        return openWorkspaceAgentDeckSurface({
          nodeId: focusedNodeId,
          workspaceId: input.workspaceId
        });
      }
      if (
        request.workspaceId !== input.workspaceId ||
        !previousStateByAttemptId.has(request.attempt.attemptId)
      ) {
        return false;
      }
      const nodeId = await input.host.launchNode({
        reason: "host",
        typeId: workspaceAppCenterNodeID,
        ...(request.appId === workspaceOnboardingAppId
          ? { launchSource: "onboarding-auto" }
          : {})
      });
      if (!nodeId) {
        restoreAttempt(request.attempt);
        return false;
      }
      previousStateByAttemptId.delete(request.attempt.attemptId);
      if (latestAttemptId === request.attempt.attemptId) {
        latestAttemptId = null;
      }
      if (request.intent) {
        input.host.activateNode(
          { nodeId },
          {
            payload: { appId: request.appId, intent: request.intent },
            type: "workspace-app:open"
          }
        );
      }
      return true;
    },
    rollbackOpen(attempt) {
      if (attempt.appId === tuttiDeckAppId) {
        directDeckAttemptIds.delete(attempt.attemptId);
        return;
      }
      restoreAttempt(attempt);
    }
  };
}
