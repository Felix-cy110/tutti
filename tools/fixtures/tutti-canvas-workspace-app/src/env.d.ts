declare const __TUTTI_CANVAS_POC_DEFAULT_PROJECT__: string;

interface TuttiCanvasProjectSelection {
  path?: string | null;
}

interface TuttiCanvasExternalBridge {
  app?: {
    getContext(): Promise<unknown>;
    subscribe?(listener: (context: unknown) => void): () => void;
  };
  userProjects?: {
    getDefaultSelection(): Promise<TuttiCanvasProjectSelection | null>;
    list(): Promise<{ projects?: TuttiCanvasProjectSelection[] }>;
  };
}

interface Window {
  tuttiExternal?: TuttiCanvasExternalBridge;
}
