import type { TuttiExternalWorkspaceOpenRouteIntent } from "@tutti-os/workspace-external-core/contracts";

export const tuttiCanvasWorkspaceAppId = "tutti-canvas";

export function resolveWorkspaceAppToolPanelId(
  appId: string
): "apps" | "canvas" {
  return appId === tuttiCanvasWorkspaceAppId ? "canvas" : "apps";
}

export interface TuttiCanvasTarget {
  activationSequence: number;
  canvasFile: string;
  canvasName: string;
  canvasRoot: string;
  focusShapeId?: string | null;
  projectDir: string;
  revision: string;
}

export function readTuttiCanvasTargets(value: unknown): TuttiCanvasTarget[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const targets = (value as { targets?: unknown }).targets;
  if (!Array.isArray(targets)) {
    return [];
  }
  return targets
    .filter(isTuttiCanvasTarget)
    .sort((left, right) => left.activationSequence - right.activationSequence);
}

export function resolveTuttiCanvasTargetsUrl(launchUrl: string): string | null {
  try {
    return new URL("/api/targets", launchUrl).toString();
  } catch {
    return null;
  }
}

export function resolveTuttiCanvasTabLabel(
  target: Pick<TuttiCanvasTarget, "canvasName">
): string {
  return `${target.canvasName}.canvas`;
}

export function resolveTuttiCanvasFallbackTabLabel(canvasFile: string): string {
  const fileName = canvasFile.split(/[\\/]/u).filter(Boolean).at(-1)?.trim();
  return fileName || canvasFile;
}

export function resolveTuttiCanvasOpenRouteIntent(
  target: Pick<TuttiCanvasTarget, "canvasFile" | "canvasName" | "projectDir">
): TuttiExternalWorkspaceOpenRouteIntent {
  return {
    kind: "open-route",
    params: {
      canvasFile: target.canvasFile,
      canvasName: target.canvasName,
      projectDir: target.projectDir
    },
    route: "/"
  };
}

function isTuttiCanvasTarget(value: unknown): value is TuttiCanvasTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const target = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(target.activationSequence) &&
    (target.activationSequence as number) > 0 &&
    isNonEmptyString(target.canvasFile) &&
    isNonEmptyString(target.canvasName) &&
    isNonEmptyString(target.canvasRoot) &&
    isNonEmptyString(target.projectDir) &&
    isNonEmptyString(target.revision) &&
    (target.focusShapeId === undefined ||
      target.focusShapeId === null ||
      typeof target.focusShapeId === "string")
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
