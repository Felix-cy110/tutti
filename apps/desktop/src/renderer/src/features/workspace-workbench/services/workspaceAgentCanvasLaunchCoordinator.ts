import { WorkspaceScopedRegistrationRegistry } from "./internal/workspaceScopedRegistrationRegistry.ts";

export interface WorkspaceAgentCanvasSurface {
  close(): void;
  isOpen(): boolean;
  open(): boolean;
}

interface RegisteredWorkspaceAgentCanvasSurface {
  nodeId: string;
  surface: WorkspaceAgentCanvasSurface;
}

const surfaces =
  new WorkspaceScopedRegistrationRegistry<RegisteredWorkspaceAgentCanvasSurface>();

export function registerWorkspaceAgentCanvasSurface(
  workspaceId: string,
  nodeId: string,
  surface: WorkspaceAgentCanvasSurface
): () => void {
  const normalizedWorkspaceId = workspaceId.trim();
  const normalizedNodeId = nodeId.trim();
  if (!normalizedWorkspaceId || !normalizedNodeId) return () => {};
  return surfaces.register(normalizedWorkspaceId, {
    nodeId: normalizedNodeId,
    surface
  });
}

export function openWorkspaceAgentCanvasSurface(input: {
  nodeId?: string | null;
  workspaceId: string;
}): boolean {
  const surface = resolveSurface(input);
  return surface?.open() === true;
}

export function closeWorkspaceAgentCanvasSurfaces(workspaceId: string): void {
  surfaces.get(workspaceId)?.surface.close();
}

export function isWorkspaceAgentCanvasSurfaceOpen(
  workspaceId: string
): boolean {
  return surfaces.get(workspaceId)?.surface.isOpen() === true;
}

function resolveSurface(input: {
  nodeId?: string | null;
  workspaceId: string;
}): WorkspaceAgentCanvasSurface | null {
  const workspaceId = input.workspaceId.trim();
  const nodeId = input.nodeId?.trim() ?? "";
  if (!workspaceId || !nodeId) return null;
  const registered = surfaces.get(workspaceId);
  return registered?.nodeId === nodeId ? registered.surface : null;
}
