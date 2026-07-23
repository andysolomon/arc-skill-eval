import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPO_CACHE = path.join(homedir(), ".arc-skill-eval", "repos");

/**
 * A workspace ref is either a local directory path (~ expands to $HOME) or a
 * GitHub repo reference: https://github.com/owner/repo, github.com/owner/repo,
 * or github:owner/repo. Repos are shallow-cloned into ~/.arc-skill-eval/repos
 * and fast-forwarded (best effort) on later requests.
 */
function parseGithubRef(ref) {
  const match =
    /^(?:https?:\/\/)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(ref)
    ?? /^github:([\w.-]+)\/([\w.-]+)$/.exec(ref);

  return match ? { owner: match[1], repo: match[2] } : null;
}

export function expandPath(ref) {
  return ref === "~" || ref.startsWith("~/")
    ? path.join(homedir(), ref.slice(1))
    : path.resolve(ref);
}

async function resolveGithubRepo({ owner, repo }) {
  const target = path.join(REPO_CACHE, `${owner}__${repo}`);
  await mkdir(REPO_CACHE, { recursive: true });

  if (existsSync(path.join(target, ".git"))) {
    await execFileAsync("git", ["-C", target, "pull", "--ff-only"], {
      timeout: 30_000,
    }).catch(() => undefined);
    return target;
  }

  await execFileAsync(
    "git",
    ["clone", "--depth", "1", `https://github.com/${owner}/${repo}.git`, target],
    { timeout: 120_000 },
  );
  return target;
}

function parseFrontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) {
    return {};
  }

  const fields = {};
  const lines = match[1].split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const pair = /^(name|description):\s*(.*)$/.exec(lines[index]);
    if (!pair) {
      continue;
    }

    let value = pair[2].trim();

    // YAML block scalars (`description: >` / `|`, with optional +/- chomping):
    // join the following more-indented lines into one string.
    if (/^[>|][+-]?$/.test(value)) {
      const block = [];
      while (index + 1 < lines.length && /^\s+\S/.test(lines[index + 1])) {
        block.push(lines[index + 1].trim());
        index += 1;
      }
      value = block.join(" ");
    }

    fields[pair[1]] = value.replace(/^['"]|['"]$/g, "").trim();
  }

  return fields;
}

async function readSkillDir(skillPath) {
  try {
    const markdown = await readFile(path.join(skillPath, "SKILL.md"), "utf8");
    const frontmatter = parseFrontmatter(markdown);
    const id = path.basename(skillPath);

    return {
      id,
      name: frontmatter.name ?? id,
      description: frontmatter.description ?? "",
      path: skillPath,
      hasEvals: existsSync(path.join(skillPath, "evals", "evals.json")),
    };
  } catch {
    return null;
  }
}

const IGNORED_DIRS = new Set([
  ".git",
  ".github",
  ".husky",
  ".idea",
  ".vscode",
  ".vercel",
  ".firecrawl",
  ".next",
  ".cache",
  ".turbo",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "wt",
  "tests",
  "__tests__",
  "fixtures",
  "__fixtures__",
]);

async function collectSkillDirs(dir, depth, maxDepth, out) {
  if (out.length >= 500 || depth > maxDepth) {
    return;
  }

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
    out.push(dir);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    await collectSkillDirs(path.join(dir, entry.name), depth + 1, maxDepth, out);
  }
}

/**
 * A skill dir is any directory containing SKILL.md. Recursively walks the
 * workspace (including dot-directories such as .agents/ and .claude/) while
 * skipping build/cache dirs and treating SKILL.md dirs as leaves.
 */
export async function scanSkills(root) {
  const dirs = [];
  await collectSkillDirs(root, 0, 5, dirs);
  const skills = await Promise.all(dirs.map(readSkillDir));
  return skills
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path));
}

export async function resolveWorkspaceRef(ref) {
  const github = parseGithubRef(ref);
  let resolvedPath;
  let source = "local";

  if (github) {
    source = "github";
    try {
      resolvedPath = await resolveGithubRepo(github);
    } catch (error) {
      return {
        resolvedPath: undefined,
        source,
        exists: false,
        error: `could not clone github.com/${github.owner}/${github.repo}: ${error.message}`,
      };
    }
  } else {
    resolvedPath = expandPath(ref);
  }

  const exists = await stat(resolvedPath)
    .then((stats) => stats.isDirectory())
    .catch(() => false);

  if (!exists) {
    return {
      resolvedPath,
      source,
      exists: false,
      error: "directory not found",
    };
  }

  return { resolvedPath, source, exists: true };
}

export async function handleWorkspace(request, response, context) {
  if (request.method !== "GET" || context.url.pathname !== "/workspace") {
    return false;
  }

  const ref = context.url.searchParams.get("root")?.trim();

  if (!ref) {
    context.sendJson(response, 400, {
      ok: false,
      error: "missing root query parameter",
    });
    return true;
  }

  const resolution = await resolveWorkspaceRef(ref);

  if (!resolution.exists) {
    context.sendJson(response, 200, {
      ok: false,
      root: ref,
      ...(resolution.resolvedPath !== undefined ? { resolvedPath: resolution.resolvedPath } : {}),
      source: resolution.source,
      exists: false,
      error: resolution.error,
      skills: [],
    });
    return true;
  }

  context.sendJson(response, 200, {
    ok: true,
    root: ref,
    resolvedPath: resolution.resolvedPath,
    source: resolution.source,
    exists: true,
    skills: await scanSkills(resolution.resolvedPath),
  });
  return true;
}
