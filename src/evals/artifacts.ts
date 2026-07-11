/**
 * Eval case artifact persistence — single owner for `evals-runs/` per-variant
 * file layout and JSON shapes. CLI writes through here; TUI reads through here.
 */

import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ContextManifestJson, ToolSummaryJson } from "../observability/types.js";
import type { EvalTrace } from "../traces/types.js";

import type { GradingJson, TimingJson } from "./types.js";

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

  const [grading, timing, toolSummary, contextManifest, assistantText] = await Promise.all([
    readJsonFile<GradingJson>(path.join(base, CASE_VARIANT_ARTIFACT_NAMES.grading)),
    readJsonFile<TimingJson>(path.join(base, CASE_VARIANT_ARTIFACT_NAMES.timing)),
    readJsonFile<ToolSummaryJson>(path.join(base, CASE_VARIANT_ARTIFACT_NAMES.toolSummary)),
    readJsonFile<ContextManifestJson>(path.join(base, CASE_VARIANT_ARTIFACT_NAMES.contextManifest)),
    readTextFile(path.join(base, CASE_VARIANT_ARTIFACT_NAMES.assistant)),
  ]);

  return { grading, timing, toolSummary, contextManifest, assistantText, compare };
}

export async function readGradingJson(variantDir: string): Promise<GradingJson | null> {
  return readJsonFile<GradingJson>(path.join(variantDir, CASE_VARIANT_ARTIFACT_NAMES.grading));
}

/** Script assertion types graded deterministically (not LLM-judge). */
export const DETERMINISTIC_ASSERTION_TYPES = new Set(["file-exists", "regex-match", "json-valid"]);

export interface MappedAssertionView {
  type: string;
  det: boolean;
  label: string;
  target: string;
  passed: boolean;
  evidence: string;
  raw: string;
}

/** Map one grading.json assertion_result entry for TUI display. */
export function mapAssertionResultForView(result: {
  text?: string;
  passed?: boolean;
  evidence?: string;
  assertion?: unknown;
}): MappedAssertionView {
  const assertion = result.assertion;
  const isString = typeof assertion === "string";
  let type = "llm-judge";
  let det = false;
  let target = "";

  if (!isString && assertion && typeof assertion === "object") {
    const record = assertion as Record<string, unknown>;
    if (typeof record.type === "string") {
      type = record.type;
      det = DETERMINISTIC_ASSERTION_TYPES.has(record.type);
    } else if (record.kind && record.method) {
      type = `${record.kind}/${record.method}`;
      det = record.method !== "judge";
    }
    const tgt = record.path ?? (record.target && ((record.target as Record<string, unknown>).file ?? record.target));
    target = typeof tgt === "string" ? tgt : "";
  }

  const rawLabel = String(result.text ?? "");
  const label =
    det && rawLabel.toLowerCase().startsWith(`${type.toLowerCase()}:`)
      ? rawLabel.slice(type.length + 1).trim()
      : rawLabel;

  return {
    type,
    det,
    label,
    target,
    passed: Boolean(result.passed),
    evidence: String(result.evidence ?? ""),
    raw: assertion === undefined ? "" : JSON.stringify(assertion),
  };
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
