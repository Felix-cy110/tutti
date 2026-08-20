import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceAgentGuiContributionSource = readFileSync(
  new URL("./internal/workspaceAgentGuiContribution.ts", import.meta.url),
  "utf8"
);
const workspaceAppCenterInlineAppBodySource = readFileSync(
  new URL(
    "../../workspace-app-center/services/internal/workspaceAppCenterInlineAppBody.tsx",
    import.meta.url
  ),
  "utf8"
);

test("workspace Agent canvas tabs use the concrete canvas file identity", () => {
  assert.match(
    workspaceAgentGuiContributionSource,
    /openPanel\("canvas", target\.canvasFile\)/
  );
  assert.match(
    workspaceAgentGuiContributionSource,
    /resolveTuttiCanvasTabLabel\(target\)/
  );
  assert.match(
    workspaceAgentGuiContributionSource,
    /resolveTuttiCanvasOpenRouteIntent\(canvasTarget\)/
  );
  assert.doesNotMatch(
    workspaceAgentGuiContributionSource,
    /resolveTabLabel:\s*\(\)\s*=>\s*`Tutti/
  );
});

test("workspace Agent canvas browser receives its canvas-specific route", () => {
  assert.match(
    workspaceAppCenterInlineAppBodySource,
    /launchIntent\?: TuttiExternalWorkspaceOpenRouteIntent \| null/
  );
  assert.match(
    workspaceAppCenterInlineAppBodySource,
    /resolveWorkspaceAppOpenUrl\(app\.launchUrl, launchIntent\)/
  );
  assert.match(
    workspaceAppCenterInlineAppBodySource,
    /activationUrl=\{activationUrl\}/
  );
});
