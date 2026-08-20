declare const __TUTTI_DECK_POC_DEFAULT_PROJECT__: string;

interface TuttiDeckProjectSelection {
  path?: string | null;
}

interface TuttiDeckExternalBridge {
  app?: {
    getContext(): Promise<unknown>;
    subscribe?(listener: (context: unknown) => void): () => void;
  };
  userProjects?: {
    getDefaultSelection(): Promise<TuttiDeckProjectSelection | null>;
    list(): Promise<{ projects?: TuttiDeckProjectSelection[] }>;
  };
}

interface Window {
  tuttiExternal?: TuttiDeckExternalBridge;
}
