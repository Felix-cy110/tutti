import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "/Users/chenyang/project/tutti-canvas-ui/node_modules/vite/dist/node/index.js";
import {
  ensureCanvasFile,
  insertCanvasImage,
  listCanvasFiles,
  readCanvasState,
  resolveCanvasTarget,
  saveCanvasSnapshot
} from "/Users/chenyang/project/tutti-canvas-ui/mcp/lib/canvas-storage.mjs";

const CANVAS_SOURCE_ROOT = "/Users/chenyang/project/tutti-canvas-ui";
const DEFAULT_PROJECT_DIR = "/Users/chenyang/project/tutti";
const MAX_REQUEST_BYTES = 64 * 1024 * 1024;
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));

const activeTargets = new Map();
let latestTarget = null;
let activationSequence = 0;
const canvasContexts = new Map();

function canvasKey(target) {
  return target.canvasFile;
}

function activateTarget(target, focusShapeId = null) {
  activationSequence += 1;
  const activeTarget = {
    ...target,
    activationSequence,
    revision: randomUUID(),
    focusShapeId
  };
  activeTargets.set(canvasKey(activeTarget), activeTarget);
  latestTarget = activeTarget;
  return activeTarget;
}

function summarizeShape(shape) {
  if (!shape || shape.typeName !== "shape") {
    return null;
  }
  return {
    id: shape.id,
    type: shape.type,
    parentId: shape.parentId,
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation,
    index: shape.index,
    props: shape.props,
    meta: shape.meta,
    isAiImageHolder:
      shape.meta?.tuttiAiImageHolder === true || shape.isAiImageHolder === true
  };
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
      throw new Error("Request body exceeds 64 MiB.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requiredString(record, key) {
  const value = typeof record?.[key] === "string" ? record[key].trim() : "";
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function optionalInteger(record, key) {
  const value = record?.[key];
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function cliInput(payload) {
  return payload && typeof payload.input === "object" && payload.input
    ? payload.input
    : {};
}

function selectionForState(state) {
  const context = canvasContexts.get(canvasKey(state)) ?? null;
  const selectedShapeIds = context?.selectedShapeIds ?? [];
  const selectedShapes = selectedShapeIds
    .map((shapeId) => summarizeShape(state.snapshot?.store?.[shapeId]))
    .filter(Boolean);
  return {
    version: 1,
    projectDir: state.projectDir,
    canvasRoot: state.canvasRoot,
    canvasName: state.canvasName,
    canvasFile: state.canvasFile,
    appConnected: Boolean(context),
    currentPageId: context?.currentPageId ?? null,
    viewportBounds: context?.viewportBounds ?? null,
    selectedShapeIds,
    selectedShapes
  };
}

async function handleCLI(pathname, request, response) {
  const payload = await readJSON(request);
  const input = cliInput(payload);
  const projectDir = requiredString(input, "project-dir");

  if (pathname === "/tutti/cli/list") {
    const result = await listCanvasFiles({ projectDir });
    writeJSON(response, 200, { kind: "json", value: result });
    return;
  }

  const canvasName = requiredString(input, "canvas-name");
  if (pathname === "/tutti/cli/open") {
    const target = await ensureCanvasFile({ projectDir, canvasName });
    const state = await readCanvasState(target);
    const activated = activateTarget(target);
    writeJSON(response, 200, {
      kind: "json",
      value: {
        version: state.version,
        projectDir: state.projectDir,
        canvasRoot: state.canvasRoot,
        canvasName: state.canvasName,
        canvasFile: state.canvasFile,
        container: state.container,
        storage: state.storage,
        updatedAt: state.updatedAt,
        revision: activated.revision
      }
    });
    return;
  }

  if (pathname === "/tutti/cli/selection") {
    const state = await readCanvasState({ projectDir, canvasName });
    writeJSON(response, 200, {
      kind: "json",
      value: selectionForState(state)
    });
    return;
  }

  if (pathname === "/tutti/cli/insert-image") {
    const target = resolveCanvasTarget({ projectDir, canvasName });
    const context = canvasContexts.get(canvasKey(target)) ?? null;
    const explicitAnchorShapeId =
      typeof input["anchor-shape-id"] === "string"
        ? input["anchor-shape-id"].trim()
        : "";
    const inferredAnchorShapeId =
      explicitAnchorShapeId ||
      (context?.selectedShapeIds?.length === 1
        ? context.selectedShapeIds[0]
        : undefined);
    const result = await insertCanvasImage({
      projectDir,
      canvasName,
      imagePath: requiredString(input, "image-path"),
      anchorShapeId: inferredAnchorShapeId,
      displayWidth: optionalInteger(input, "display-width"),
      displayHeight: optionalInteger(input, "display-height"),
      altText: typeof input["alt-text"] === "string" ? input["alt-text"] : "",
      context
    });
    const activated = activateTarget(result, result.shapeId);
    canvasContexts.set(canvasKey(result), {
      ...(context ?? {}),
      selectedShapeIds: [result.shapeId]
    });
    writeJSON(response, 200, {
      kind: "json",
      value: { ...result, revision: activated.revision }
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
    const canvasFile = url.searchParams.get("canvasFile")?.trim() ?? "";
    writeJSON(response, 200, {
      target: canvasFile
        ? (activeTargets.get(canvasFile) ?? null)
        : latestTarget
    });
    return;
  }

  if (pathname === "/api/canvases" && request.method === "GET") {
    const projectDir = requiredString(
      { projectDir: url.searchParams.get("projectDir") },
      "projectDir"
    );
    writeJSON(response, 200, await listCanvasFiles({ projectDir }));
    return;
  }

  if (pathname === "/api/canvas/state" && request.method === "GET") {
    const projectDir = requiredString(
      { projectDir: url.searchParams.get("projectDir") },
      "projectDir"
    );
    const canvasName = requiredString(
      { canvasName: url.searchParams.get("canvasName") },
      "canvasName"
    );
    writeJSON(response, 200, await readCanvasState({ projectDir, canvasName }));
    return;
  }

  if (pathname === "/api/canvas/open" && request.method === "POST") {
    const input = await readJSON(request);
    const target = await ensureCanvasFile({
      projectDir: requiredString(input, "projectDir"),
      canvasName: requiredString(input, "canvasName")
    });
    writeJSON(response, 200, activateTarget(target));
    return;
  }

  if (pathname === "/api/canvas/save" && request.method === "POST") {
    const input = await readJSON(request);
    const result = await saveCanvasSnapshot({
      projectDir: requiredString(input, "projectDir"),
      canvasName: requiredString(input, "canvasName"),
      snapshot: input.snapshot
    });
    writeJSON(response, 200, result);
    return;
  }

  if (pathname === "/api/canvas/context" && request.method === "POST") {
    const input = await readJSON(request);
    const target = resolveCanvasTarget({
      projectDir: requiredString(input, "projectDir"),
      canvasName: requiredString(input, "canvasName")
    });
    canvasContexts.set(canvasKey(target), {
      currentPageId:
        typeof input.currentPageId === "string" ? input.currentPageId : null,
      selectedShapeIds: Array.isArray(input.selectedShapeIds)
        ? input.selectedShapeIds.filter((value) => typeof value === "string")
        : [],
      viewportBounds:
        input.viewportBounds && typeof input.viewportBounds === "object"
          ? input.viewportBounds
          : null
    });
    writeJSON(response, 200, { ok: true });
    return;
  }

  writeJSON(response, 404, { error: "Unknown API route." });
}

function canvasPOCServer() {
  return {
    name: "tutti-canvas-poc-server",
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
              code: "tutti_canvas_poc_error",
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
    : path.join(APP_DIR, ".vite-tutti-canvas-poc"),
  define: {
    __TUTTI_CANVAS_POC_DEFAULT_PROJECT__: JSON.stringify(DEFAULT_PROJECT_DIR)
  },
  plugins: [canvasPOCServer()],
  resolve: {
    alias: {
      react: path.join(CANVAS_SOURCE_ROOT, "node_modules/react"),
      "react-dom": path.join(CANVAS_SOURCE_ROOT, "node_modules/react-dom"),
      tldraw: path.join(CANVAS_SOURCE_ROOT, "node_modules/tldraw"),
      "lucide-react": path.join(CANVAS_SOURCE_ROOT, "node_modules/lucide-react")
    },
    dedupe: ["react", "react-dom", "tldraw"]
  },
  optimizeDeps: {
    exclude: ["@tldraw/assets/imports.vite"]
  },
  server: {
    fs: {
      allow: [APP_DIR, CANVAS_SOURCE_ROOT]
    },
    hmr: false
  }
});
