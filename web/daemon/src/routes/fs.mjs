import { existsSync } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { expandPath, isBrowsable } from "../workspaces.mjs";

const OUTSIDE_ERROR = "outside your home folder and the workspaces you opened";

function resolveFsPath(pathParam) {
  if (!pathParam || pathParam.trim() === "") {
    return homedir();
  }

  return expandPath(pathParam.trim());
}

/**
 * The parent directory, when the folder picker may list it too. A parent that
 * no longer exists still counts when its nearest existing ancestor may be
 * listed, so the picker can walk up from a stale workspace path.
 */
async function browsableParent(resolved) {
  const parentDir = path.dirname(resolved);
  if (parentDir === resolved) {
    return null;
  }

  for (let candidate = parentDir; ; candidate = path.dirname(candidate)) {
    const real = await realpath(candidate).catch(() => null);
    if (real !== null) {
      return (await isBrowsable(real)) ? parentDir : null;
    }
    if (path.dirname(candidate) === candidate) {
      return null;
    }
  }
}

/**
 * Lists one directory for the folder picker. Only the home folder, the
 * workspaces the user opened, and their subfolders can be listed.
 */
export async function handleFs(request, response, context) {
  if (request.method !== "GET" || context.url.pathname !== "/fs") {
    return false;
  }

  const resolved = resolveFsPath(context.url.searchParams.get("path"));
  const failure = async (error) => {
    context.sendJson(response, 200, {
      ok: false,
      path: resolved,
      parent: await browsableParent(resolved),
      error,
      entries: [],
    });
    return true;
  };

  const real = await realpath(resolved).catch(() => null);
  if (real === null) {
    return failure("directory not found");
  }

  if (!(await isBrowsable(real))) {
    return failure(OUTSIDE_ERROR);
  }

  try {
    const stats = await stat(real);
    if (!stats.isDirectory()) {
      return failure("not a directory");
    }

    const entries = (await readdir(real, { withFileTypes: true }))
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
      parent: await browsableParent(resolved),
      entries,
    });
    return true;
  } catch (error) {
    return failure(error.message);
  }
}
