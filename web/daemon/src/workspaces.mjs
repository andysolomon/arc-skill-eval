/**
 * Every route that takes a path resolves it with `realpath` before the
 * workspace check, so `..` segments and symlinks that point elsewhere cannot
 * reach files outside a registered workspace.
 */

import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export class AccessError extends Error {
  constructor(message) {
    super(message);
    this.name = "AccessError";
    this.statusCode = 403;
  }
}

const workspaces = new Set();

export function expandPath(ref) {
  return ref === "~" || ref.startsWith("~/")
    ? path.join(homedir(), ref.slice(1))
    : path.resolve(ref);
}

export function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function registerWorkspace(directory) {
  const real = await realpath(directory);
  workspaces.add(real);
  return real;
}

export function isInsideWorkspace(realPath) {
  for (const root of workspaces) {
    if (isInside(realPath, root)) {
      return true;
    }
  }
  return false;
}

async function realpathOfNearestAncestor(absolute) {
  let current = absolute;
  const rest = [];
  for (;;) {
    try {
      return path.join(await realpath(current), ...rest);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        throw error;
      }
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

export async function resolveInWorkspace(candidate, { mustExist = true } = {}) {
  if (typeof candidate !== "string" || candidate.trim() === "" || candidate.includes("\0")) {
    throw new AccessError("A path inside the chosen workspace is required.");
  }

  const absolute = expandPath(candidate.trim());
  let real;
  try {
    real = mustExist ? await realpath(absolute) : await realpathOfNearestAncestor(absolute);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new AccessError(`${absolute} does not exist.`);
    }
    throw error;
  }

  if (!isInsideWorkspace(real)) {
    throw new AccessError(`${absolute} is outside the workspace you chose in the web app.`);
  }

  return real;
}

export async function resolveUnder(base, segments) {
  for (const segment of segments) {
    if (
      typeof segment !== "string"
      || segment === ""
      || segment.includes("\0")
      || path.isAbsolute(segment)
      || segment.split(/[\\/]/).includes("..")
    ) {
      throw new AccessError("Paths may not leave the workspace.");
    }
  }

  const joined = path.join(base, ...segments);
  let real;
  try {
    real = await realpath(joined);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new AccessError(`${joined} does not exist.`);
    }
    throw error;
  }

  if (!isInside(real, await realpath(base))) {
    throw new AccessError("Paths may not leave the workspace.");
  }

  return real;
}

export async function isBrowsable(realPath) {
  const home = await realpath(homedir()).catch(() => homedir());
  return isInside(realPath, home) || isInsideWorkspace(realPath);
}
