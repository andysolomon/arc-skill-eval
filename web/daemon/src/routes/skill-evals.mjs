import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expandPath } from "./workspace.mjs";

export async function handleSkillEvals(request, response, context) {
  if (request.method !== "GET" || context.url.pathname !== "/skill-evals") {
    return false;
  }

  const root = context.url.searchParams.get("root");
  if (!root) {
    context.sendJson(response, 400, { error: "missing root query parameter" });
    return true;
  }

  const evalsPath = path.join(expandPath(root), "evals", "evals.json");
  if (!existsSync(evalsPath)) {
    context.sendJson(response, 200, {
      ok: false,
      root,
      error: "no evals/evals.json in this skill",
    });
    return true;
  }

  try {
    const evals = JSON.parse(await readFile(evalsPath, "utf8"));
    context.sendJson(response, 200, { ok: true, root, evals });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.sendJson(response, 200, {
      ok: false,
      root,
      error: `could not parse evals.json: ${message}`,
    });
  }

  return true;
}
