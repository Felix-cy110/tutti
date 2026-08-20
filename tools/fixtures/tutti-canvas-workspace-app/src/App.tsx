import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Editor, TLShapeId, TLStoreSnapshot } from "tldraw";
import { TuttiCanvas } from "/Users/chenyang/project/tutti-canvas-ui/src/renderer/src/App";

type CanvasTarget = {
  activationSequence: number;
  projectDir: string;
  canvasRoot: string;
  canvasName: string;
  canvasFile: string;
  revision: string;
  focusShapeId?: string | null;
};

type CanvasState = CanvasTarget & {
  snapshot: TLStoreSnapshot | null;
  storage: "empty" | "file" | "invalid";
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; target: CanvasTarget; snapshot: TLStoreSnapshot | null }
  | { status: "error"; message: string };

type SaveState = "saved" | "saving" | "unsaved" | "failed";

type Copy = {
  loading: string;
  loadFailed: string;
  retry: string;
  saved: string;
  saving: string;
  unsaved: string;
  failed: string;
};

const COPY: Record<"en" | "zh-CN", Copy> = {
  en: {
    loading: "Loading Tutti Canvas…",
    loadFailed: "Tutti Canvas could not be loaded",
    retry: "Retry",
    saved: "Saved",
    saving: "Saving",
    unsaved: "Unsaved",
    failed: "Save failed"
  },
  "zh-CN": {
    loading: "正在加载 Tutti 画布…",
    loadFailed: "Tutti 画布加载失败",
    retry: "重试",
    saved: "已保存",
    saving: "保存中",
    unsaved: "未保存",
    failed: "保存失败"
  }
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function requestJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string };
  };
  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return payload as T;
}

function stringFromRecord(value: unknown, key: string): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field.trim() : "";
}

async function resolveLocale(): Promise<"en" | "zh-CN"> {
  try {
    const context = await window.tuttiExternal?.app?.getContext();
    const locale = stringFromRecord(context, "locale").toLowerCase();
    if (locale.startsWith("zh")) {
      return "zh-CN";
    }
  } catch {
    // Browser locale remains the local-debug fallback.
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

async function resolveDefaultProjectDir(): Promise<string> {
  const userProjects = window.tuttiExternal?.userProjects;
  if (userProjects) {
    try {
      const selection = await userProjects.getDefaultSelection();
      const selectedPath = selection?.path?.trim();
      if (selectedPath) {
        return selectedPath;
      }
      const result = await userProjects.list();
      const firstPath = result.projects?.find((project) =>
        project.path?.trim()
      )?.path;
      if (firstPath) {
        return firstPath;
      }
    } catch {
      // The hard-coded project below keeps the POC usable outside Tutti.
    }
  }
  return __TUTTI_CANVAS_POC_DEFAULT_PROJECT__;
}

async function loadCanvas(target: CanvasTarget): Promise<CanvasState> {
  const params = new URLSearchParams({
    projectDir: target.projectDir,
    canvasName: target.canvasName
  });
  return requestJSON<CanvasState>(`/api/canvas/state?${params}`);
}

async function openCanvas(
  projectDir: string,
  canvasName: string
): Promise<CanvasTarget> {
  return requestJSON<CanvasTarget>("/api/canvas/open", {
    method: "POST",
    body: JSON.stringify({ projectDir, canvasName })
  });
}

async function resolveInitialTarget(): Promise<CanvasTarget> {
  const routeParams = new URLSearchParams(window.location.search);
  const routeCanvasFile = routeParams.get("canvasFile")?.trim() ?? "";
  const routeCanvasName = routeParams.get("canvasName")?.trim() ?? "";
  const routeProjectDir = routeParams.get("projectDir")?.trim() ?? "";
  if (routeCanvasFile && routeCanvasName && routeProjectDir) {
    const routed = await requestJSON<{ target: CanvasTarget | null }>(
      `/api/target?${new URLSearchParams({ canvasFile: routeCanvasFile })}`
    );
    if (routed.target) {
      return routed.target;
    }
    return openCanvas(routeProjectDir, routeCanvasName);
  }
  const active = await requestJSON<{ target: CanvasTarget | null }>(
    "/api/target"
  );
  if (active.target) {
    return active.target;
  }
  const projectDir = await resolveDefaultProjectDir();
  const params = new URLSearchParams({ projectDir });
  const listed = await requestJSON<{
    canvases: Array<{ canvasName: string; storage: string }>;
  }>(`/api/canvases?${params}`);
  const existing = listed.canvases.find(
    (candidate) => candidate.storage !== "invalid"
  );
  return openCanvas(projectDir, existing?.canvasName ?? "tutti-canvas-poc");
}

function CanvasSurface({
  copy,
  snapshot,
  target
}: {
  copy: Copy;
  snapshot: TLStoreSnapshot | null;
  target: CanvasTarget;
}): React.JSX.Element {
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const handleMount = useCallback(
    (editor: Editor) => {
      let saveTimer: number | undefined;
      let contextTimer: number | undefined;
      let contextInterval: number | undefined;
      let dirty = snapshot === null;
      let saving = false;
      let pending = false;
      let destroyed = false;

      if (target.focusShapeId) {
        const focusShapeId = target.focusShapeId as TLShapeId;
        if (editor.getShape(focusShapeId)) {
          editor.select(focusShapeId);
          editor.zoomToSelection();
        }
      }

      const syncContext = async (): Promise<void> => {
        if (destroyed) {
          return;
        }
        const viewport = editor.getViewportPageBounds();
        await requestJSON("/api/canvas/context", {
          method: "POST",
          body: JSON.stringify({
            projectDir: target.projectDir,
            canvasName: target.canvasName,
            currentPageId: editor.getCurrentPageId(),
            selectedShapeIds: [...editor.getSelectedShapeIds()],
            viewportBounds: {
              x: viewport.x,
              y: viewport.y,
              w: viewport.w,
              h: viewport.h
            }
          })
        }).catch(() => undefined);
      };

      const flush = async (): Promise<void> => {
        if (!dirty || destroyed) {
          return;
        }
        if (saving) {
          pending = true;
          return;
        }
        saving = true;
        dirty = false;
        setSaveState("saving");
        try {
          await requestJSON("/api/canvas/save", {
            method: "POST",
            body: JSON.stringify({
              projectDir: target.projectDir,
              canvasName: target.canvasName,
              snapshot: editor.store.getStoreSnapshot()
            })
          });
          if (!destroyed) {
            setSaveState("saved");
          }
        } catch (error) {
          console.error("Failed to save Tutti Canvas POC state.", error);
          dirty = true;
          if (!destroyed) {
            setSaveState("failed");
          }
        } finally {
          saving = false;
          if (pending) {
            pending = false;
            void flush();
          }
        }
      };

      const scheduleSave = (): void => {
        dirty = true;
        setSaveState("unsaved");
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => void flush(), 400);
      };
      const scheduleContext = (): void => {
        window.clearTimeout(contextTimer);
        contextTimer = window.setTimeout(() => void syncContext(), 100);
      };

      const unsubscribe = editor.store.listen(scheduleSave, {
        source: "user",
        scope: "document"
      });
      const unsubscribeContext = editor.store.listen(scheduleContext, {
        scope: "session"
      });
      contextInterval = window.setInterval(() => void syncContext(), 1000);
      void flush();
      void syncContext();

      return () => {
        window.clearTimeout(saveTimer);
        window.clearTimeout(contextTimer);
        window.clearInterval(contextInterval);
        unsubscribe();
        unsubscribeContext();
        if (dirty) {
          void requestJSON("/api/canvas/save", {
            method: "POST",
            body: JSON.stringify({
              projectDir: target.projectDir,
              canvasName: target.canvasName,
              snapshot: editor.store.getStoreSnapshot()
            }),
            keepalive: true
          }).catch(() => undefined);
        }
        destroyed = true;
      };
    },
    [snapshot, target.canvasName, target.focusShapeId, target.projectDir]
  );

  return (
    <>
      <TuttiCanvas onMount={handleMount} snapshot={snapshot ?? undefined} />
      <aside className="poc-canvas-status" title={target.canvasFile}>
        <span className="poc-canvas-name">{target.canvasName}</span>
        <span className="poc-canvas-path">{target.projectDir}</span>
        <span className={`poc-save-state poc-save-state-${saveState}`}>
          {copy[saveState]}
        </span>
      </aside>
    </>
  );
}

export default function App(): React.JSX.Element {
  const [locale, setLocale] = useState<"en" | "zh-CN">("en");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const activeRevisionRef = useRef("");
  const loadSequenceRef = useRef(0);
  const copy = COPY[locale];

  const showTarget = useCallback(
    async (target: CanvasTarget): Promise<void> => {
      const sequence = ++loadSequenceRef.current;
      setLoadState({ status: "loading" });
      try {
        const state = await loadCanvas(target);
        if (sequence !== loadSequenceRef.current) {
          return;
        }
        activeRevisionRef.current = target.revision;
        setLoadState({
          status: "ready",
          target,
          snapshot: state.snapshot
        });
      } catch (error) {
        if (sequence === loadSequenceRef.current) {
          setLoadState({ status: "error", message: errorMessage(error) });
        }
      }
    },
    []
  );

  const initialize = useCallback(async (): Promise<void> => {
    setLoadState({ status: "loading" });
    try {
      await showTarget(await resolveInitialTarget());
    } catch (error) {
      setLoadState({ status: "error", message: errorMessage(error) });
    }
  }, [showTarget]);

  useEffect(() => {
    void resolveLocale().then(setLocale);
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (loadState.status !== "ready") {
      return;
    }
    document.title = `${loadState.target.canvasName}.canvas`;
  }, [loadState]);

  useEffect(() => {
    if (loadState.status !== "ready") {
      return;
    }
    const targetUrl = `/api/target?${new URLSearchParams({
      canvasFile: loadState.target.canvasFile
    })}`;
    const timer = window.setInterval(() => {
      void requestJSON<{ target: CanvasTarget | null }>(targetUrl)
        .then(({ target }) => {
          if (target && target.revision !== activeRevisionRef.current) {
            return showTarget(target);
          }
          return undefined;
        })
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loadState, showTarget]);

  if (loadState.status === "loading") {
    return <main className="poc-status">{copy.loading}</main>;
  }
  if (loadState.status === "error") {
    return (
      <main className="poc-status">
        <strong>{copy.loadFailed}</strong>
        <span>{loadState.message}</span>
        <button type="button" onClick={() => void initialize()}>
          {copy.retry}
        </button>
      </main>
    );
  }
  return (
    <CanvasSurface
      key={`${loadState.target.canvasFile}:${loadState.target.revision}`}
      copy={copy}
      snapshot={loadState.snapshot}
      target={loadState.target}
    />
  );
}
