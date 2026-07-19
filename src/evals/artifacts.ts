/**
 * Eval case artifact persistence — single owner for `evals-runs/` per-variant
 * file layout and JSON shapes. CLI writes through here; TUI and review read through here.
 */

import { access, cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ContextManifestJson, ToolSummaryJson } from "../observability/types.js";
import { DEFAULT_IGNORED_DIRS, discoverEvalSkills } from "../skills/intake.js";
import type { EvalTrace } from "../traces/types.js";

import type { BenchmarkJson, EvalsJsonFile, GradingJson, TimingJson } from "./types.js";

/** @deprecated Use the assertion engine classifier for new presentation code. */
export { DETERMINISTIC_ASSERTION_TYPES } from "./assertion-engine.js";

export const CASE_VARIANT_ARTIFACT_NAMES = {
  assistant: "assistant.md",
  outputs: "outputs",
  timing: "timing.json",
  grading: "grading.json",
  trace: "trace.json",
  toolSummary: "tool-summary.json",
  contextManifest: "context-manifest.json",
} as const;

export interface CaseVariantArtifactPaths {
  assistant: string;
  outputs: string;
  timing: string;
  grading: string;
  trace: string;
  tool_summary: string;
  context_manifest: string;
}

export interface LoadedOutputFile {
  path: string;
  size: number;
}

export interface LoadedCaseVariantArtifacts {
  assistantText: string;
  timing: TimingJson | null;
  grading: GradingJson | null;
  toolSummary: ToolSummaryJson | null;
  contextManifest: ContextManifestJson | null;
  outputsDir: string;
  outputFiles: LoadedOutputFile[];
}

export interface LoadedCase extends LoadedCaseVariantArtifacts {
  id: string;
  caseDir: string;
  compare: boolean;
  delta: number | null;
  variants?: {
    with_skill: LoadedCaseVariantArtifacts;
    without_skill: LoadedCaseVariantArtifacts;
  };
}

export interface LoadedRunSummary {
  passCount: number;
  totalCases: number;
  exitCode: number;
  totalCost: number;
}

export interface LoadedRun {
  runId: string;
  runDir: string;
  skillDir: string | null;
  skillName: string | null;
  compare: boolean;
  benchmark: BenchmarkJson | null;
  cases: LoadedCase[];
  iteration: string | null;
  mtimeMs: number;
  summary: LoadedRunSummary;
}

export interface LoadedSkill {
  skillDir: string;
  skillName: string;
  evals: EvalsJsonFile | null;
  runDir: string | null;
  cases: LoadedCase[];
}

export function resolveCaseVariantArtifactPaths(variantDir: string): CaseVariantArtifactPaths {
  return {
    assistant: path.join(variantDir, CASE_VARIANT_ARTIFACT_NAMES.assistant),
    outputs: path.join(variantDir, CASE_VARIANT_ARTIFACT_NAMES.outputs),
    timing: path.join(variantDir, CASE_VARIANT_ARTIFACT_NAMES.timing),
    grading: path.join(variantDir, CASE_VARIANT_ARTIFACT_NAMES.grading),
    trace: path.join(variantDir, CASE_VARIANT_ARTIFACT_NAMES.trace),
    tool_summary: path.join(variantDir, CASE_VARIANT_ARTIFACT_NAMES.toolSummary),
    context_manifest: path.join(variantDir, CASE_VARIANT_ARTIFACT_NAMES.contextManifest),
  };
}

export interface WriteCaseVariantArtifactsInput {
  variantDir: string;
  assistantText: string;
  workspaceDir: string;
  timing: TimingJson;
  grading: GradingJson;
  trace: EvalTrace;
  toolSummary: ToolSummaryJson;
  contextManifest: ContextManifestJson;
}

export interface WriteCaseVariantArtifactsResult {
  paths: CaseVariantArtifactPaths;
}

export async function writeCaseVariantArtifacts(
  input: WriteCaseVariantArtifactsInput,
): Promise<WriteCaseVariantArtifactsResult> {
  const paths = resolveCaseVariantArtifactPaths(input.variantDir);

  await mkdir(paths.outputs, { recursive: true });
  await writeFile(paths.assistant, formatAssistantArtifact(input.assistantText), "utf-8");
  await cp(input.workspaceDir, paths.outputs, { recursive: true, force: true });
  await writeJsonArtifact(paths.timing, input.timing);
  await writeJsonArtifact(paths.grading, input.grading);
  await writeJsonArtifact(paths.trace, input.trace);
  await writeJsonArtifact(paths.tool_summary, input.toolSummary);
  await writeJsonArtifact(paths.context_manifest, input.contextManifest);

  return { paths };
}

export interface ReadCaseVariantArtifacts {
  grading: GradingJson | null;
  timing: TimingJson | null;
  toolSummary: ToolSummaryJson | null;
  contextManifest: ContextManifestJson | null;
  assistantText: string;
  compare: boolean;
}

export async function readCaseVariantArtifacts(caseDir: string): Promise<ReadCaseVariantArtifacts> {
  const compare = await pathExists(path.join(caseDir, "with_skill"));
  const base = compare ? path.join(caseDir, "with_skill") : caseDir;
  const loaded = await loadCaseVariantArtifacts(base);
  return {
    grading: loaded.grading,
    timing: loaded.timing,
    toolSummary: loaded.toolSummary,
    contextManifest: loaded.contextManifest,
    assistantText: loaded.assistantText,
    compare,
  };
}

export async function loadCaseVariantArtifacts(variantDir: string): Promise<LoadedCaseVariantArtifacts> {
  const paths = resolveCaseVariantArtifactPaths(variantDir);
  const [grading, timing, toolSummary, contextManifest, assistantText, outputFiles] = await Promise.all([
    readJsonFile<GradingJson>(paths.grading),
    readJsonFile<TimingJson>(paths.timing),
    readJsonFile<ToolSummaryJson>(paths.tool_summary),
    readJsonFile<ContextManifestJson>(paths.context_manifest),
    readTextFile(paths.assistant),
    listOutputFiles(paths.outputs),
  ]);

  return {
    grading,
    timing,
    toolSummary,
    contextManifest,
    assistantText,
    outputsDir: paths.outputs,
    outputFiles,
  };
}

export async function readGradingJson(variantDir: string): Promise<GradingJson | null> {
  return readJsonFile<GradingJson>(path.join(variantDir, CASE_VARIANT_ARTIFACT_NAMES.grading));
}

export async function loadBenchmarkJson(runDir: string): Promise<BenchmarkJson | null> {
  return readJsonFile<BenchmarkJson>(path.join(runDir, "benchmark.json"));
}

function findBenchmarkDelta(benchmark: BenchmarkJson | null, caseId: string): number | null {
  const found = benchmark?.cases?.find((item) => item.case_id === caseId);
  return typeof found?.delta === "number" ? found.delta : null;
}

async function loadCaseFromDir(caseDir: string, benchmark: BenchmarkJson | null): Promise<LoadedCase | null> {
  const directGrading = await readGradingJson(caseDir);
  const caseId = directGrading?.case_id ?? stripEvalPrefix(path.basename(caseDir));

  if (directGrading !== null) {
    const loaded = await loadCaseVariantArtifacts(caseDir);
    return {
      id: caseId,
      caseDir,
      compare: false,
      delta: findBenchmarkDelta(benchmark, caseId),
      ...loaded,
    };
  }

  const withSkillDir = path.join(caseDir, "with_skill");
  const withoutSkillDir = path.join(caseDir, "without_skill");
  const withGrading = await readGradingJson(withSkillDir);
  if (withGrading === null) return null;

  const [withSkill, withoutSkill] = await Promise.all([
    loadCaseVariantArtifacts(withSkillDir),
    loadCaseVariantArtifacts(withoutSkillDir),
  ]);

  return {
    id: withGrading.case_id ?? caseId,
    caseDir,
    compare: true,
    delta: findBenchmarkDelta(benchmark, caseId),
    ...withSkill,
    variants: {
      with_skill: withSkill,
      without_skill: withoutSkill,
    },
  };
}

export async function loadRun(runDir: string): Promise<LoadedRun> {
  const absRunDir = path.resolve(runDir);
  const benchmark = await loadBenchmarkJson(absRunDir);
  const entries = await readdir(absRunDir, { withFileTypes: true }).catch(() => []);
  const caseDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("eval-"))
    .map((entry) => path.join(absRunDir, entry.name))
    .sort();

  const cases: LoadedCase[] = [];
  for (const caseDir of caseDirs) {
    const loaded = await loadCaseFromDir(caseDir, benchmark);
    if (loaded) cases.push(loaded);
  }

  const compare = benchmark !== null || cases.some((item) => item.compare);
  const rel = path.basename(absRunDir);
  const parentName = path.basename(path.dirname(absRunDir));
  const iteration = parentName.startsWith("iteration-") ? parentName.slice("iteration-".length) : null;
  const runId = rel;
  const mtimeMs = await fileMtime(absRunDir);

  return {
    runId,
    runDir: absRunDir,
    skillDir: null,
    skillName: null,
    compare,
    benchmark,
    cases,
    iteration,
    mtimeMs,
    summary: summarizeLoadedRun(cases),
  };
}

export async function loadSkillRuns(skillDir: string): Promise<LoadedRun[]> {
  const absSkillDir = path.resolve(skillDir);
  const skillName = path.basename(absSkillDir);
  const runs: LoadedRun[] = [];
  for (const dir of await discoverRunDirs(absSkillDir)) {
    const run = await loadRun(dir);
    runs.push({ ...run, skillDir: absSkillDir, skillName });
  }
  runs.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return runs;
}

async function loadSkillFromDir(skillDir: string, runs: LoadedRun[]): Promise<LoadedSkill | null> {
  const absSkillDir = path.resolve(skillDir);
  const evals = await readJsonFile<EvalsJsonFile>(path.join(absSkillDir, "evals", "evals.json"));
  const evalById = new Map<string, EvalsJsonFile["evals"][number]>(
    (evals?.evals ?? []).map((entry) => [String(entry.id), entry]),
  );

  if (runs.length === 0) {
    if (!evals) return null;
    return {
      skillDir: absSkillDir,
      skillName: evals.skill_name,
      evals,
      runDir: null,
      cases: (evals.evals ?? []).map((entry) => unloadedLoadedCase(entry)),
    };
  }

  const latestRun = pickNewestRun(runs);
  const cases: LoadedCase[] = [];
  const loadedIds = new Set<string>();
  for (const loadedCase of latestRun.cases) {
    loadedIds.add(loadedCase.id);
    cases.push(loadedCase);
  }
  for (const entry of evals?.evals ?? []) {
    const id = String(entry.id);
    if (!loadedIds.has(id)) cases.push(unloadedLoadedCase(entry));
  }

  return {
    skillDir: absSkillDir,
    skillName: evals?.skill_name ?? path.basename(absSkillDir),
    evals,
    runDir: latestRun.runDir,
    cases,
  };
}

export async function reloadSkillArtifacts(
  skillDir: string,
): Promise<{ skill: LoadedSkill | null; runs: LoadedRun[] }> {
  const runs = await loadSkillRuns(skillDir);
  const skill = await loadSkillFromDir(skillDir, runs);
  return { skill, runs };
}

export async function loadWorkspaceArtifacts(
  input: string,
): Promise<{ skills: LoadedSkill[]; runs: LoadedRun[] }> {
  const abs = path.resolve(input);

  if (await pathExists(path.join(abs, "evals", "evals.json"))) {
    const { skill, runs } = await reloadSkillArtifacts(abs);
    return { skills: skill ? [skill] : [], runs };
  }

  const skills: LoadedSkill[] = [];
  const runs: LoadedRun[] = [];
  const discovered = await discoverEvalSkills(abs, {
    maxDepth: 3,
    requireSkillMd: false,
    ignoredDirs: new Set([...DEFAULT_IGNORED_DIRS, "evals-runs"]),
  });
  for (const skill of discovered) {
    const loaded = await reloadSkillArtifacts(skill.skillDir);
    if (loaded.skill) skills.push(loaded.skill);
    runs.push(...loaded.runs);
  }
  return { skills, runs };
}

export function summarizeLoadedRun(cases: LoadedCase[]): LoadedRunSummary {
  let passCount = 0;
  let exitCode = 0;
  let totalCost = 0;

  for (const loadedCase of cases) {
    const grading = loadedCase.grading;
    const failed = grading?.summary?.failed ?? 1;
    if (failed === 0) passCount += 1;
    else exitCode = 1;

    totalCost += Number(loadedCase.timing?.estimated_cost_usd ?? 0);
    if (loadedCase.compare && loadedCase.variants?.without_skill) {
      totalCost += Number(loadedCase.variants.without_skill.timing?.estimated_cost_usd ?? 0);
    }
  }

  return {
    passCount,
    totalCases: cases.length,
    exitCode,
    totalCost,
  };
}

function unloadedLoadedCase(entry: EvalsJsonFile["evals"][number]): LoadedCase {
  return {
    id: String(entry.id),
    caseDir: "",
    compare: false,
    delta: null,
    assistantText: "",
    timing: null,
    grading: null,
    toolSummary: null,
    contextManifest: null,
    outputsDir: "",
    outputFiles: [],
  };
}

async function discoverRunDirs(skillDir: string): Promise<string[]> {
  const root = path.join(skillDir, "evals-runs");
  if (!(await pathExists(root))) return [];

  const out: string[] = [];
  for (const name of await listDirs(root)) {
    const full = path.join(root, name);
    if (name.startsWith("iteration-")) {
      for (const runName of await listDirs(full)) out.push(path.join(full, runName));
    } else {
      out.push(full);
    }
  }

  const valid: string[] = [];
  for (const dir of out) {
    if ((await listDirs(dir)).some((entry) => entry.startsWith("eval-"))) valid.push(dir);
  }
  return valid;
}

function pickNewestRun(runs: LoadedRun[]): LoadedRun {
  let newest = runs[0]!;
  for (const run of runs) {
    if (run.mtimeMs > newest.mtimeMs) newest = run;
  }
  return newest;
}

export function formatAssistantArtifact(assistantText: string): string {
  return assistantText.endsWith("\n") ? assistantText : `${assistantText}\n`;
}

export async function writeJsonArtifact(pathname: string, value: unknown): Promise<void> {
  await writeFile(pathname, `${JSON.stringify(value, createSafeJsonReplacer(), 2)}\n`, "utf-8");
}

function createSafeJsonReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();

  return (_key, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }

    if (typeof value !== "object" || value === null) {
      return value;
    }

    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    return value;
  };
}

async function listOutputFiles(dir: string, cap = 200): Promise<LoadedOutputFile[]> {
  const out: LoadedOutputFile[] = [];

  async function walk(currentDir: string, rel: string): Promise<void> {
    if (out.length >= cap) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= cap) return;
      const full = path.join(currentDir, entry.name);
      const relative = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(full, relative);
      else {
        let size = 0;
        try {
          size = (await stat(full)).size;
        } catch {
          /* ignore */
        }
        out.push({ path: relative, size });
      }
    }
  }

  await walk(dir, "");
  out.sort((a, b) => (a.path < b.path ? -1 : 1));
  return out;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function fileMtime(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch {
    return 0;
  }
}

function stripEvalPrefix(value: string): string {
  return value.startsWith("eval-") ? value.slice("eval-".length) : value;
}
