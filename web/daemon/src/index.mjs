import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { corsHeaders, refusalReason } from "./access.mjs";
import { handleApplyPlan } from "./routes/apply-plan.mjs";
import { handleGenerateEvals } from "./routes/generate-evals.mjs";
import { handleHealth } from "./routes/health.mjs";
import { handleFs } from "./routes/fs.mjs";
import { handleRuns } from "./routes/runs.mjs";
import { handleSkillEvals } from "./routes/skill-evals.mjs";
import { handleSuggest } from "./routes/suggest.mjs";
import { handleWorkspace } from "./routes/workspace.mjs";
import { AccessError } from "./workspaces.mjs";
import { createRunWebSocketServer } from "./ws.mjs";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const port = Number.parseInt(process.env.PORT ?? "7357", 10);
const version = packageJson.version;

function sendJson(response, statusCode, payload) {
  const body = statusCode === 204 ? "" : JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function routeRequest(request, response) {
  // Refuse other websites and rebound host names before anything else,
  const refusal = refusalReason(request.headers);
  if (refusal) {
    sendJson(response, 403, { ok: false, error: refusal });
    return;
  }

  for (const [name, value] of Object.entries(corsHeaders(request.headers))) {
    response.setHeader(name, value);
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  const context = {
    port,
    version,
    url,
    sendJson,
    readJson,
  };

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const handled = await handleHealth(request, response, context)
    || await handleRuns(request, response, context)
    || await handleSuggest(request, response, context)
    || await handleGenerateEvals(request, response, context)
    || await handleApplyPlan(request, response, context)
    || await handleSkillEvals(request, response, context)
    || await handleWorkspace(request, response, context)
    || await handleFs(request, response, context);

  if (!handled) {
    sendJson(response, 404, { error: "Not found" });
  }
}

const server = http.createServer((request, response) => {
  routeRequest(request, response).catch((error) => {
    if (error instanceof AccessError && !response.headersSent) {
      sendJson(response, error.statusCode, { ok: false, error: error.message });
      return;
    }
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "Internal server error" });
      return;
    }
    response.destroy(error);
  });
});

createRunWebSocketServer(server);

server.listen(port, "127.0.0.1", () => {
  const entrypoint = path.relative(process.cwd(), fileURLToPath(import.meta.url));
  console.log(`arc-skill-eval daemon ${version} listening on http://127.0.0.1:${port}`);
  console.log(`entrypoint ${entrypoint}`);
});
