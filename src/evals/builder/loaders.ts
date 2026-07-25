/**
 * Thin, fixture-relative dataset loaders for the typed builder, exported as
 * `arc-skill-eval/evals/loaders`.
 *
 * The point is dataset fan-out: read a data file once at authoring time, then
 * `rows.map(evalCase)` into a `defineSkillEval` suite. Emit still produces one
 * `evals/evals.json` — the loaders run during authoring/emit, never at run
 * time. They do I/O, so they live apart from the pure/sync assertion helpers.
 *
 * ```ts
 * import { defineSkillEval, evalCase, judge } from "arc-skill-eval/evals";
 * import { loadJson } from "arc-skill-eval/evals/loaders";
 *
 * const rows = await loadJson<{ id: string; prompt: string; needle: string }[]>(
 *   "./data/triggers.json",
 *   { base: import.meta.url },
 * );
 *
 * export default defineSkillEval({
 *   skill_name: "arc-conventional-commits",
 *   cases: rows.map((row) =>
 *     evalCase({ id: row.id, prompt: row.prompt, assertions: [judge(`Addresses: ${row.needle}`).soft()] }),
 *   ),
 * });
 * ```
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface LoaderOptions {
  /**
   * The module doing the loading — pass `import.meta.url` to resolve the data
   * path relative to the suite file rather than the process working directory.
   * Accepts a `file:` URL, a `URL`, or a plain file path. Absolute data paths
   * ignore this.
   */
  base?: string | URL;
}

/** Thrown when a dataset cannot be read or parsed. Surfaces cleanly through `emit`. */
export class DatasetLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetLoadError";
  }
}

/**
 * Read and parse a JSON dataset. Returns whatever the file contains (typically
 * an array of rows) typed as `T`; no shape validation beyond `JSON.parse`.
 */
export async function loadJson<T = unknown>(dataPath: string, options?: LoaderOptions): Promise<T> {
  const resolved = resolveDataPath(dataPath, options?.base);
  const text = await readDataset(dataPath, resolved);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new DatasetLoadError(`Dataset ${dataPath} is not valid JSON: ${messageOf(error)}`);
  }
}

/**
 * Read and parse a JSON Lines dataset (one JSON value per line). Blank lines are
 * skipped; a malformed line names its 1-based line number. Returns `T[]`.
 */
export async function loadJsonl<T = unknown>(dataPath: string, options?: LoaderOptions): Promise<T[]> {
  const resolved = resolveDataPath(dataPath, options?.base);
  const text = await readDataset(dataPath, resolved);
  const rows: T[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line === "") continue;
    try {
      rows.push(JSON.parse(line) as T);
    } catch (error) {
      throw new DatasetLoadError(`Dataset ${dataPath} has invalid JSON on line ${index + 1}: ${messageOf(error)}`);
    }
  }
  return rows;
}

/** Resolve a data path: absolute wins; else relative to `base`'s directory, else cwd. */
function resolveDataPath(dataPath: string, base?: string | URL): string {
  if (path.isAbsolute(dataPath)) return dataPath;

  if (base !== undefined) {
    const baseStr = base instanceof URL ? base.href : base;
    const basePath = baseStr.startsWith("file:") ? fileURLToPath(baseStr) : baseStr;
    return path.resolve(path.dirname(basePath), dataPath);
  }

  return path.resolve(process.cwd(), dataPath);
}

async function readDataset(dataPath: string, resolved: string): Promise<string> {
  try {
    return await readFile(resolved, "utf8");
  } catch (error) {
    throw new DatasetLoadError(`Could not read dataset ${dataPath} (resolved to ${resolved}): ${messageOf(error)}`);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
