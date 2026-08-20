import { WorkspaceScopedRegistrationRegistry } from "./internal/workspaceScopedRegistrationRegistry.ts";

export interface WorkspaceAgentDeckSurface {
  close(): void;
  isOpen(): boolean;
  open(): boolean;
}

interface RegisteredWorkspaceAgentDeckSurface {
  nodeId: string;
  surface: WorkspaceAgentDeckSurface;
}

const surfaces =
  new WorkspaceScopedRegistrationRegistry<RegisteredWorkspaceAgentDeckSurface>();

export function registerWorkspaceAgentDeckSurface(
  workspaceId: string,
  nodeId: string,
  surface: WorkspaceAgentDeckSurface
): () => void {
  const normalizedWorkspaceId = workspaceId.trim();
  const normalizedNodeId = nodeId.trim();
  if (!normalizedWorkspaceId || !normalizedNodeId) return () => {};
  return surfaces.register(normalizedWorkspaceId, {
    nodeId: normalizedNodeId,
    surface
  });
}

export function openWorkspaceAgentDeckSurface(input: {
  nodeId?: string | null;
  workspaceId: string;
}): boolean {
  const surface = resolveSurface(input);
  return surface?.open() === true;
}

export function closeWorkspaceAgentDeckSurfaces(workspaceId: string): void {
  surfaces.get(workspaceId)?.surface.close();
}

export function isWorkspaceAgentDeckSurfaceOpen(workspaceId: string): boolean {
  return surfaces.get(workspaceId)?.surface.isOpen() === true;
}

function resolveSurface(input: {
  nodeId?: string | null;
  workspaceId: string;
}): WorkspaceAgentDeckSurface | null {
  const workspaceId = input.workspaceId.trim();
  const nodeId = input.nodeId?.trim() ?? "";
  if (!workspaceId || !nodeId) return null;
  const registered = surfaces.get(workspaceId);
  return registered?.nodeId === nodeId ? registered.surface : null;
}
