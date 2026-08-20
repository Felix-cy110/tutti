import type { TuttiExternalWorkspaceOpenRouteIntent } from "@tutti-os/workspace-external-core/contracts";

export const tuttiDeckWorkspaceAppId = "tutti-deck";

export function resolveWorkspaceAppToolPanelId(appId: string): "apps" | "deck" {
  return appId === tuttiDeckWorkspaceAppId ? "deck" : "apps";
}

export interface TuttiDeckTarget {
  activationSequence: number;
  deckFile: string;
  deckName: string;
  deckRoot: string;
  focusObjectId?: string | null;
  focusSlideId?: string | null;
  projectDir: string;
  revision: string;
}

export function readTuttiDeckTargets(value: unknown): TuttiDeckTarget[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const targets = (value as { targets?: unknown }).targets;
  if (!Array.isArray(targets)) {
    return [];
  }
  return targets
    .filter(isTuttiDeckTarget)
    .sort((left, right) => left.activationSequence - right.activationSequence);
}

export function resolveTuttiDeckTargetsUrl(launchUrl: string): string | null {
  try {
    return new URL("/api/targets", launchUrl).toString();
  } catch {
    return null;
  }
}

export function resolveTuttiDeckTabLabel(
  target: Pick<TuttiDeckTarget, "deckName">
): string {
  return `${target.deckName}.deck`;
}

export function resolveTuttiDeckFallbackTabLabel(deckFile: string): string {
  const fileName = deckFile.split(/[\\/]/u).filter(Boolean).at(-1)?.trim();
  return fileName || deckFile;
}

export function resolveTuttiDeckOpenRouteIntent(
  target: Pick<TuttiDeckTarget, "deckFile" | "deckName" | "projectDir">
): TuttiExternalWorkspaceOpenRouteIntent {
  return {
    kind: "open-route",
    params: {
      deckFile: target.deckFile,
      deckName: target.deckName,
      projectDir: target.projectDir
    },
    route: "/"
  };
}

function isTuttiDeckTarget(value: unknown): value is TuttiDeckTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const target = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(target.activationSequence) &&
    (target.activationSequence as number) > 0 &&
    isNonEmptyString(target.deckFile) &&
    isNonEmptyString(target.deckName) &&
    isNonEmptyString(target.deckRoot) &&
    isNonEmptyString(target.projectDir) &&
    isNonEmptyString(target.revision) &&
    isOptionalString(target.focusSlideId) &&
    isOptionalString(target.focusObjectId)
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
