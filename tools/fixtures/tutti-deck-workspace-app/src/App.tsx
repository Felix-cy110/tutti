import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  App as TuttiDeckEditor,
  type DeckEditorContext
} from "/Users/chenyang/project/tutti-deck/src/App";
import type { Deck } from "/Users/chenyang/project/tutti-deck/src/types";

type DeckTarget = {
  activationSequence: number;
  projectDir: string;
  deckRoot: string;
  deckName: string;
  deckFile: string;
  revision: string;
  focusSlideId?: string | null;
  focusObjectId?: string | null;
};

type DeckState = {
  version: number;
  projectDir: string;
  deckRoot: string;
  deckName: string;
  deckFile: string;
  revision: string;
  deck: Deck;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; target: DeckTarget; state: DeckState }
  | { status: "error"; message: string };

type Copy = {
  loading: string;
  loadFailed: string;
  retry: string;
  savedToProject: string;
};

const COPY: Record<"en" | "zh-CN", Copy> = {
  en: {
    loading: "Loading Tutti Deck…",
    loadFailed: "Tutti Deck could not be loaded",
    retry: "Retry",
    savedToProject: "Saved to project Deck"
  },
  "zh-CN": {
    loading: "正在加载 Tutti 幻灯片…",
    loadFailed: "Tutti 幻灯片加载失败",
    retry: "重试",
    savedToProject: "已保存到项目 Deck"
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
  if (!value || typeof value !== "object") return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field.trim() : "";
}

async function resolveLocale(): Promise<"en" | "zh-CN"> {
  try {
    const context = await window.tuttiExternal?.app?.getContext();
    if (stringFromRecord(context, "locale").toLowerCase().startsWith("zh")) {
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
      if (selectedPath) return selectedPath;
      const result = await userProjects.list();
      const firstPath = result.projects?.find((project) =>
        project.path?.trim()
      )?.path;
      if (firstPath) return firstPath;
    } catch {
      // The hard-coded project below keeps the POC usable outside Tutti.
    }
  }
  return __TUTTI_DECK_POC_DEFAULT_PROJECT__;
}

async function loadDeck(target: DeckTarget): Promise<DeckState> {
  const params = new URLSearchParams({
    projectDir: target.projectDir,
    deckName: target.deckName
  });
  return requestJSON<DeckState>(`/api/deck/state?${params}`);
}

async function openDeck(
  projectDir: string,
  deckName: string
): Promise<DeckTarget> {
  return requestJSON<DeckTarget>("/api/deck/open", {
    method: "POST",
    body: JSON.stringify({ projectDir, deckName })
  });
}

async function resolveInitialTarget(): Promise<DeckTarget> {
  const routeParams = new URLSearchParams(window.location.search);
  const routeDeckFile = routeParams.get("deckFile")?.trim() ?? "";
  const routeDeckName = routeParams.get("deckName")?.trim() ?? "";
  const routeProjectDir = routeParams.get("projectDir")?.trim() ?? "";
  if (routeDeckFile && routeDeckName && routeProjectDir) {
    const routed = await requestJSON<{ target: DeckTarget | null }>(
      `/api/target?${new URLSearchParams({ deckFile: routeDeckFile })}`
    );
    if (routed.target) return routed.target;
    return openDeck(routeProjectDir, routeDeckName);
  }
  const active = await requestJSON<{ target: DeckTarget | null }>(
    "/api/target"
  );
  if (active.target) return active.target;
  const projectDir = await resolveDefaultProjectDir();
  const listed = await requestJSON<{
    decks: Array<{ deckName: string; storage: string }>;
  }>(`/api/decks?${new URLSearchParams({ projectDir })}`);
  const existing = listed.decks.find(
    (candidate) => candidate.storage !== "invalid"
  );
  return openDeck(projectDir, existing?.deckName ?? "tutti-deck-poc");
}

function DeckSurface({
  copy,
  state,
  target
}: {
  copy: Copy;
  state: DeckState;
  target: DeckTarget;
}): React.JSX.Element {
  const revisionRef = useRef(state.revision);
  const contextRef = useRef<DeckEditorContext>({
    activeSlideId: target.focusSlideId ?? null,
    selectedObjectId: target.focusObjectId ?? null
  });
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const contextTimerRef = useRef<number | null>(null);

  const saveDeck = useCallback(
    (deck: Deck): Promise<void> => {
      const save = saveQueueRef.current.then(async () => {
        const saved = await requestJSON<{ revision: string }>(
          "/api/deck/save",
          {
            method: "POST",
            body: JSON.stringify({
              projectDir: target.projectDir,
              deckName: target.deckName,
              expectedRevision: revisionRef.current,
              deck
            })
          }
        );
        revisionRef.current = saved.revision;
      });
      saveQueueRef.current = save.catch(() => undefined);
      return save;
    },
    [target.deckName, target.projectDir]
  );

  const syncContext = useCallback(() => {
    void requestJSON("/api/deck/context", {
      method: "POST",
      body: JSON.stringify({
        projectDir: target.projectDir,
        deckName: target.deckName,
        activeSlideId: contextRef.current.activeSlideId,
        selectedObjectId: contextRef.current.selectedObjectId
      })
    }).catch(() => undefined);
  }, [target.deckName, target.projectDir]);

  const handleContextChange = useCallback(
    (context: DeckEditorContext) => {
      contextRef.current = context;
      if (contextTimerRef.current) window.clearTimeout(contextTimerRef.current);
      contextTimerRef.current = window.setTimeout(syncContext, 100);
    },
    [syncContext]
  );

  useEffect(() => {
    const interval = window.setInterval(syncContext, 1000);
    syncContext();
    return () => {
      window.clearInterval(interval);
      if (contextTimerRef.current) window.clearTimeout(contextTimerRef.current);
    };
  }, [syncContext]);

  return (
    <div className="deck-widget-root">
      <TuttiDeckEditor
        externalRevision={state.revision}
        focusObjectId={target.focusObjectId ?? null}
        focusSlideId={target.focusSlideId ?? null}
        initialDeck={state.deck}
        savedLabel={copy.savedToProject}
        saveDeck={saveDeck}
        onContextChange={handleContextChange}
      />
      <aside className="poc-deck-storage" title={target.deckFile}>
        {target.deckFile}
      </aside>
    </div>
  );
}

export default function App(): React.JSX.Element {
  const [locale, setLocale] = useState<"en" | "zh-CN">("en");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const activeRevisionRef = useRef("");
  const loadSequenceRef = useRef(0);
  const copy = COPY[locale];

  const showTarget = useCallback(async (target: DeckTarget): Promise<void> => {
    const sequence = ++loadSequenceRef.current;
    setLoadState({ status: "loading" });
    try {
      const state = await loadDeck(target);
      if (sequence !== loadSequenceRef.current) return;
      activeRevisionRef.current = target.revision;
      setLoadState({ status: "ready", target, state });
    } catch (error) {
      if (sequence === loadSequenceRef.current) {
        setLoadState({ status: "error", message: errorMessage(error) });
      }
    }
  }, []);

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
    if (loadState.status !== "ready") return;
    document.title = `${loadState.target.deckName}.deck`;
  }, [loadState]);

  useEffect(() => {
    if (loadState.status !== "ready") return;
    const targetUrl = `/api/target?${new URLSearchParams({
      deckFile: loadState.target.deckFile
    })}`;
    const timer = window.setInterval(() => {
      void requestJSON<{ target: DeckTarget | null }>(targetUrl)
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
    <DeckSurface
      key={`${loadState.target.deckFile}:${loadState.target.revision}`}
      copy={copy}
      state={loadState.state}
      target={loadState.target}
    />
  );
}
