import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "/Users/chenyang/project/tutti-deck/node_modules/vite/dist/node/index.js";
import {
  ensureDeckFile,
  insertDeckImage,
  listDeckFiles,
  readDeckDocument,
  readDeckState,
  resolveDeckTarget,
  saveDeckState,
  updateDeckState
} from "/Users/chenyang/project/tutti-deck/mcp/lib/deck-storage.mjs";

const DECK_SOURCE_ROOT = "/Users/chenyang/project/tutti-deck";
const DEFAULT_PROJECT_DIR = "/Users/chenyang/project/tutti";
const MAX_REQUEST_BYTES = 128 * 1024 * 1024;
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));

const activeTargets = new Map();
let latestTarget = null;
let activationSequence = 0;
const deckContexts = new Map();

function deckKey(target) {
  return target.deckFile;
}

function activateTarget(target, focusSlideId = null, focusObjectId = null) {
  activationSequence += 1;
  const activeTarget = {
    ...target,
    activationSequence,
    revision: randomUUID(),
    focusSlideId,
    focusObjectId
  };
  activeTargets.set(deckKey(activeTarget), activeTarget);
  latestTarget = activeTarget;
  return activeTarget;
}

function writeJSON(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(`${JSON.stringify(body)}\n`);
}

async function readJSON(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("Request body exceeds 128 MiB.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requiredString(record, key) {
  const value = typeof record?.[key] === "string" ? record[key].trim() : "";
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalPositiveNumber(record, key) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function cliInput(payload) {
  return payload && typeof payload.input === "object" && payload.input
    ? payload.input
    : {};
}

function parseOperations(value) {
  let operations;
  try {
    operations = JSON.parse(value);
  } catch (error) {
    throw new Error("operations-json must be a valid JSON array.", {
      cause: error
    });
  }
  if (!Array.isArray(operations)) {
    throw new Error("operations-json must decode to a JSON array.");
  }
  return operations;
}

function selectionForState(state) {
  const context = deckContexts.get(deckKey(state)) ?? null;
  const activeSlide =
    state.deck.slides.find((slide) => slide.id === context?.activeSlideId) ??
    state.deck.slides[0] ??
    null;
  const selectedObject =
    activeSlide?.objects.find(
      (object) => object.id === context?.selectedObjectId
    ) ?? null;
  return {
    version: 1,
    projectDir: state.projectDir,
    deckRoot: state.deckRoot,
    deckName: state.deckName,
    deckFile: state.deckFile,
    appConnected: Boolean(context),
    activeSlideId: activeSlide?.id ?? null,
    activeSlide,
    selectedObjectId: selectedObject?.id ?? null,
    selectedObject,
    revision: state.revision
  };
}

async function handleCLI(pathname, request, response) {
  const payload = await readJSON(request);
  const input = cliInput(payload);
  const projectDir = requiredString(input, "project-dir");

  if (pathname === "/tutti/cli/list") {
    writeJSON(response, 200, {
      kind: "json",
      value: await listDeckFiles({ projectDir })
    });
    return;
  }

  const deckName = requiredString(input, "deck-name");
  if (pathname === "/tutti/cli/open") {
    const target = await ensureDeckFile({
      projectDir,
      deckName,
      title: typeof input.title === "string" ? input.title : undefined
    });
    const state = await readDeckDocument(target);
    const activated = activateTarget(target);
    writeJSON(response, 200, {
      kind: "json",
      value: {
        version: state.version,
        projectDir: state.projectDir,
        deckRoot: state.deckRoot,
        deckName: state.deckName,
        deckFile: state.deckFile,
        container: state.container,
        storage: state.storage,
        title: state.deck.title,
        slideCount: state.deck.slides.length,
        revision: state.revision,
        targetRevision: activated.revision
      }
    });
    return;
  }

  if (pathname === "/tutti/cli/selection") {
    const state = await readDeckDocument({ projectDir, deckName });
    writeJSON(response, 200, {
      kind: "json",
      value: selectionForState(state)
    });
    return;
  }

  if (pathname === "/tutti/cli/document") {
    writeJSON(response, 200, {
      kind: "json",
      value: await readDeckDocument({ projectDir, deckName })
    });
    return;
  }

  if (pathname === "/tutti/cli/update") {
    const result = await updateDeckState({
      projectDir,
      deckName,
      expectedRevision: requiredString(input, "expected-revision"),
      operations: parseOperations(requiredString(input, "operations-json"))
    });
    const activated = activateTarget(
      result,
      result.focusSlideId,
      result.focusObjectId
    );
    writeJSON(response, 200, {
      kind: "json",
      value: { ...result, targetRevision: activated.revision }
    });
    return;
  }

  if (pathname === "/tutti/cli/insert-image") {
    const target = resolveDeckTarget({ projectDir, deckName });
    const context = deckContexts.get(deckKey(target)) ?? null;
    const result = await insertDeckImage({
      projectDir,
      deckName,
      imagePath: requiredString(input, "image-path"),
      slideId:
        typeof input["slide-id"] === "string"
          ? input["slide-id"].trim() || undefined
          : undefined,
      targetObjectId:
        typeof input["target-object-id"] === "string"
          ? input["target-object-id"].trim() || undefined
          : undefined,
      replaceSelectedImage:
        typeof input["replace-selected-image"] === "boolean"
          ? input["replace-selected-image"]
          : undefined,
      displayWidth: optionalPositiveNumber(input, "display-width"),
      displayHeight: optionalPositiveNumber(input, "display-height"),
      altText: typeof input["alt-text"] === "string" ? input["alt-text"] : "",
      context
    });
    deckContexts.set(deckKey(result), {
      activeSlideId: result.slideId,
      selectedObjectId: result.objectId
    });
    const activated = activateTarget(result, result.slideId, result.objectId);
    writeJSON(response, 200, {
      kind: "json",
      value: { ...result, targetRevision: activated.revision }
    });
    return;
  }

  writeJSON(response, 404, { error: "Unknown CLI route." });
}

async function handleAPI(pathname, url, request, response) {
  if (pathname === "/api/targets" && request.method === "GET") {
    writeJSON(response, 200, {
      targets: [...activeTargets.values()].sort(
        (left, right) => left.activationSequence - right.activationSequence
      )
    });
    return;
  }

  if (pathname === "/api/target" && request.method === "GET") {
    const deckFile = url.searchParams.get("deckFile")?.trim() ?? "";
    writeJSON(response, 200, {
      target: deckFile ? (activeTargets.get(deckFile) ?? null) : latestTarget
    });
    return;
  }

  if (pathname === "/api/decks" && request.method === "GET") {
    const projectDir = requiredString(
      { projectDir: url.searchParams.get("projectDir") },
      "projectDir"
    );
    writeJSON(response, 200, await listDeckFiles({ projectDir }));
    return;
  }

  if (pathname === "/api/deck/state" && request.method === "GET") {
    const projectDir = requiredString(
      { projectDir: url.searchParams.get("projectDir") },
      "projectDir"
    );
    const deckName = requiredString(
      { deckName: url.searchParams.get("deckName") },
      "deckName"
    );
    writeJSON(response, 200, await readDeckState({ projectDir, deckName }));
    return;
  }

  if (pathname === "/api/deck/open" && request.method === "POST") {
    const input = await readJSON(request);
    const target = await ensureDeckFile({
      projectDir: requiredString(input, "projectDir"),
      deckName: requiredString(input, "deckName"),
      title: typeof input.title === "string" ? input.title : undefined
    });
    writeJSON(response, 200, activateTarget(target));
    return;
  }

  if (pathname === "/api/deck/save" && request.method === "POST") {
    const input = await readJSON(request);
    const result = await saveDeckState({
      projectDir: requiredString(input, "projectDir"),
      deckName: requiredString(input, "deckName"),
      expectedRevision: requiredString(input, "expectedRevision"),
      deck: input.deck,
      hydrateAssets: false
    });
    writeJSON(response, 200, result);
    return;
  }

  if (pathname === "/api/deck/context" && request.method === "POST") {
    const input = await readJSON(request);
    const target = resolveDeckTarget({
      projectDir: requiredString(input, "projectDir"),
      deckName: requiredString(input, "deckName")
    });
    deckContexts.set(deckKey(target), {
      activeSlideId:
        typeof input.activeSlideId === "string" ? input.activeSlideId : null,
      selectedObjectId:
        typeof input.selectedObjectId === "string"
          ? input.selectedObjectId
          : null
    });
    writeJSON(response, 200, { ok: true });
    return;
  }

  writeJSON(response, 404, { error: "Unknown API route." });
}

function deckPOCServer() {
  return {
    name: "tutti-deck-poc-server",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        try {
          if (url.pathname === "/api/targets") {
            response.setHeader("access-control-allow-origin", "*");
          }
          if (url.pathname === "/healthz") {
            response.statusCode = 204;
            response.end();
            return;
          }
          if (url.pathname.startsWith("/tutti/cli/")) {
            if (request.method !== "POST") {
              writeJSON(response, 405, { error: "Method Not Allowed" });
              return;
            }
            await handleCLI(url.pathname, request, response);
            return;
          }
          if (url.pathname.startsWith("/api/")) {
            await handleAPI(url.pathname, url, request, response);
            return;
          }
          next();
        } catch (error) {
          writeJSON(response, 400, {
            error: {
              code: "tutti_deck_poc_error",
              message: error instanceof Error ? error.message : String(error)
            }
          });
        }
      });
    }
  };
}

export default defineConfig({
  root: APP_DIR,
  cacheDir: process.env.TUTTI_APP_RUNTIME_DIR?.trim()
    ? path.join(process.env.TUTTI_APP_RUNTIME_DIR.trim(), "vite-cache")
    : path.join(APP_DIR, ".vite-tutti-deck-poc"),
  define: {
    __TUTTI_DECK_POC_DEFAULT_PROJECT__: JSON.stringify(DEFAULT_PROJECT_DIR)
  },
  plugins: [deckPOCServer()],
  resolve: {
    alias: {
      react: path.join(DECK_SOURCE_ROOT, "node_modules/react"),
      "react-dom": path.join(DECK_SOURCE_ROOT, "node_modules/react-dom"),
      "lucide-react": path.join(DECK_SOURCE_ROOT, "node_modules/lucide-react"),
      "@fontsource-variable/lexend": path.join(
        DECK_SOURCE_ROOT,
        "node_modules/@fontsource-variable/lexend"
      )
    },
    dedupe: ["react", "react-dom", "lucide-react"]
  },
  server: {
    fs: {
      allow: [APP_DIR, DECK_SOURCE_ROOT]
    },
    hmr: false
  }
});
