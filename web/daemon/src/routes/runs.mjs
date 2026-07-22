import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createRun, getRun } from "../state.mjs";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
]);

function artifactPath(workspaceRoot, runId, caseId, kind) {
  const base = path.resolve(workspaceRoot, "evals-runs", runId, caseId);
  const filePath = path.resolve(base, kind);
  const relative = path.relative(base, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

async function sendArtifact(request, response, context, match) {
  const [, runId, caseId, kind] = match.map(decodeURIComponent);
  const run = getRun(runId);

  if (!run?.workspaceRoot) {
    context.sendJson(response, 404, { error: "Artifact not found" });
    return true;
  }

  const filePath = artifactPath(run.workspaceRoot, runId, caseId, kind);
  if (!filePath) {
    context.sendJson(response, 404, { error: "Artifact not found" });
    return true;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) {
      context.sendJson(response, 404, { error: "Artifact not found" });
      return true;
    }

    response.writeHead(200, {
      "content-type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      "content-length": file.size,
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    context.sendJson(response, 404, { error: "Artifact not found" });
  }

  return true;
}

export async function handleRuns(request, response, context) {
  if (request.method === "POST" && context.url.pathname === "/runs") {
    const body = await context.readJson(request);
    const run = createRun(body);

    context.sendJson(response, 201, {
      runId: run.runId,
      wsUrl: `ws://localhost:${context.port}/runs/${encodeURIComponent(run.runId)}`,
    });
    return true;
  }

  const runStateMatch = /^\/runs\/([^/]+)$/.exec(context.url.pathname);
  if (request.method === "GET" && runStateMatch) {
    const run = getRun(decodeURIComponent(runStateMatch[1]));
    if (!run) {
      context.sendJson(response, 404, { error: "Run not found" });
      return true;
    }

    context.sendJson(response, 200, run);
    return true;
  }

  const artifactMatch = /^\/runs\/([^/]+)\/artifacts\/([^/]+)\/(.+)$/.exec(context.url.pathname);
  if (request.method === "GET" && artifactMatch) {
    return sendArtifact(request, response, context, artifactMatch);
  }

  return false;
}
