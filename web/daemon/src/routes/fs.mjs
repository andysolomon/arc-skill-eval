import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

function resolveFsPath(pathParam) {
  if (!pathParam || pathParam.trim() === "") {
    return homedir();
  }

  const ref = pathParam.trim();
  return ref === "~" || ref.startsWith("~/")
    ? path.join(homedir(), ref.slice(1))
    : path.resolve(ref);
}

export async function handleFs(request, response, context) {
  if (request.method !== "GET" || context.url.pathname !== "/fs") {
    return false;
  }

  const resolved = resolveFsPath(context.url.searchParams.get("path"));

  try {
    const stats = await stat(resolved).catch(() => null);

    if (!stats?.isDirectory()) {
      context.sendJson(response, 200, {
        ok: false,
        path: resolved,
        error: "not a directory",
        entries: [],
      });
      return true;
    }

    const parentDir = path.dirname(resolved);
    const parent = parentDir === resolved ? null : parentDir;

    const entries = (await readdir(resolved, { withFileTypes: true }))
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => {
        const childPath = path.join(resolved, entry.name);
        const isDir = entry.isDirectory();

        return {
          name: entry.name,
          path: childPath,
          type: isDir ? "dir" : "file",
          isSkill: isDir ? existsSync(path.join(childPath, "SKILL.md")) : false,
          hasEvalsRuns: isDir ? existsSync(path.join(childPath, "evals-runs")) : false,
        };
      })
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "dir" ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, 1000);

    context.sendJson(response, 200, {
      ok: true,
      path: resolved,
      parent,
      entries,
    });
    return true;
  } catch (error) {
    context.sendJson(response, 200, {
      ok: false,
      path: resolved,
      error: error.message,
      entries: [],
    });
    return true;
  }
}
