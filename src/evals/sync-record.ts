/**
 * The sync record: `<skillDir>/evals/sync.json`, written by `run --stamp` when
 * the whole suite passes. It holds a hash of every skill file and every suite
 * file as they were at that moment, so a later check can tell whether the
 * suite still describes the skill it passed against.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SYNC_RECORD_RELATIVE_PATH = "evals/sync.json";

/** Relative posix path to sha256, for every file in one tree. */
export type FileHashes = Record<string, string>;

export interface SyncRecord {
  version: 1;
  stamped_at: string;
  /** The run that passed. */
  run_id: string;
  /** HEAD when the record was written, when the skill lives in a git repository. */
  commit?: string;
  /** True when the skill directory had uncommitted changes at that commit. */
  dirty?: boolean;
  /** The skill's own files: everything except `evals/`, `evals-runs/`, `node_modules/` and dot-files. */
  skill: FileHashes;
  /** The suite: every file under `evals/` except this record. */
  suite: FileHashes;
}

export type SyncCheck =
  | { status: "missing" }
  | { status: "invalid"; reason: string }
  | { status: "in_sync"; record: SyncRecord }
  | { status: "stale"; record: SyncRecord; skillChanges: string[]; suiteChanges: string[] };

/** Hash the skill and suite trees and write the record. */
export async function writeSyncRecord(skillDir: string, runId: string): Promise<{ path: string; record: SyncRecord }> {
  const git = await readGitState(skillDir);
  const record: SyncRecord = {
    version: 1,
    stamped_at: new Date().toISOString(),
    run_id: runId,
    ...(git ? { commit: git.commit, dirty: git.dirty } : {}),
    ...(await hashSkillAndSuite(skillDir)),
  };
  const recordPath = path.join(skillDir, ...SYNC_RECORD_RELATIVE_PATH.split("/"));
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return { path: recordPath, record };
}

/** Compare the record with the files on disk. Never throws. */
export async function checkSyncRecord(skillDir: string): Promise<SyncCheck> {
  let raw: string;
  try {
    raw = await readFile(path.join(skillDir, ...SYNC_RECORD_RELATIVE_PATH.split("/")), "utf8");
  } catch {
    return { status: "missing" };
  }

  let record: SyncRecord;
  try {
    record = parseSyncRecord(JSON.parse(raw));
  } catch (error) {
    return { status: "invalid", reason: error instanceof Error ? error.message : String(error) };
  }

  const current = await hashSkillAndSuite(skillDir);
  const skillChanges = changedPaths(record.skill, current.skill);
  const suiteChanges = changedPaths(record.suite, current.suite);
  return skillChanges.length === 0 && suiteChanges.length === 0
    ? { status: "in_sync", record }
    : { status: "stale", record, skillChanges, suiteChanges };
}

async function hashSkillAndSuite(skillDir: string): Promise<{ skill: FileHashes; suite: FileHashes }> {
  const skill: FileHashes = {};
  const suite: FileHashes = {};
  await hashTree(skillDir, "", skill, (relative) => relative === "evals");
  await hashTree(path.join(skillDir, "evals"), "", suite, (relative) => relative === "sync.json");
  return { skill, suite };
}

const SKIPPED_DIRECTORIES = new Set(["evals-runs", "node_modules"]);

async function hashTree(
  absoluteDir: string,
  relativePrefix: string,
  into: FileHashes,
  skip: (relativePath: string) => boolean,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (skip(relativePath)) continue;

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      await hashTree(path.join(absoluteDir, entry.name), relativePath, into, skip);
    } else if (entry.isFile() && !entry.name.endsWith(".skill.tgz")) {
      const contents = await readFile(path.join(absoluteDir, entry.name));
      into[relativePath] = createHash("sha256").update(contents).digest("hex");
    }
  }
}

/** Paths that were added, removed or edited, sorted. */
function changedPaths(recorded: FileHashes, current: FileHashes): string[] {
  const changed = new Set<string>();
  for (const [file, hash] of Object.entries(recorded)) {
    if (current[file] !== hash) changed.add(file);
  }
  for (const file of Object.keys(current)) {
    if (!(file in recorded)) changed.add(file);
  }
  return [...changed].sort();
}

function parseSyncRecord(value: unknown): SyncRecord {
  if (typeof value !== "object" || value === null) throw new Error("not a JSON object");
  const record = value as Partial<SyncRecord>;
  if (record.version !== 1) throw new Error(`unsupported version ${JSON.stringify(record.version)}`);
  if (typeof record.stamped_at !== "string" || typeof record.run_id !== "string") {
    throw new Error("missing `stamped_at` or `run_id`");
  }
  if (!isFileHashes(record.skill) || !isFileHashes(record.suite)) {
    throw new Error("`skill` and `suite` must map file paths to hashes");
  }
  return record as SyncRecord;
}

function isFileHashes(value: unknown): value is FileHashes {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((hash) => typeof hash === "string")
  );
}

/** HEAD and whether the skill directory is dirty, or undefined outside a git repository. */
async function readGitState(skillDir: string): Promise<{ commit: string; dirty: boolean } | undefined> {
  try {
    const options = { cwd: skillDir, timeout: 5_000 };
    const { stdout: commit } = await execFileAsync("git", ["rev-parse", "HEAD"], options);
    const { stdout: status } = await execFileAsync("git", ["status", "--porcelain", "--", "."], options);
    return { commit: commit.trim(), dirty: status.trim().length > 0 };
  } catch {
    return undefined;
  }
}
