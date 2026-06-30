import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { CliCommandError } from "./types.js";

export interface ReviewCommandOptions {
  runDir: string;
  output?: string;
  force?: boolean;
}

export interface ReviewCommandResult {
  runDir: string;
  reviewPath: string;
  feedbackPath: string;
  compare: boolean;
  caseCount: number;
}

interface ReviewRun {
  runDir: string;
  compare: boolean;
  benchmark: any | null;
  cases: ReviewCase[];
}

interface ReviewCase {
  id: string;
  variants: ReviewVariant[];
  delta?: number | null;
}

interface ReviewVariant {
  name: string;
  dir: string;
  assistant: string;
  grading: any | null;
  timing: any | null;
  toolSummary: any | null;
  contextManifest: any | null;
}

export async function reviewCommand(options: ReviewCommandOptions): Promise<ReviewCommandResult> {
  const runDir = path.resolve(options.runDir);
  const outputDir = options.output ? path.resolve(options.output) : runDir;
  const reviewPath = path.join(outputDir, "review.html");
  const feedbackPath = path.join(outputDir, "feedback.json");

  if (!options.force) {
    const existing = await listExistingFiles([reviewPath, feedbackPath]);
    if (existing.length > 0) {
      throw new CliCommandError(`Refusing to overwrite existing review file(s): ${existing.join(", ")}. Re-run with --force to overwrite.`);
    }
  }

  const run = await loadReviewRun(runDir);
  await mkdir(outputDir, { recursive: true });
  await writeFile(reviewPath, renderReviewHtml(run), "utf8");
  await writeFile(feedbackPath, `${JSON.stringify(buildFeedbackSkeleton(run), null, 2)}\n`, "utf8");

  return { runDir, reviewPath, feedbackPath, compare: run.compare, caseCount: run.cases.length };
}

async function loadReviewRun(runDir: string): Promise<ReviewRun> {
  const benchmark = await readJsonIfExists(path.join(runDir, "benchmark.json"));
  const entries = await readdir(runDir, { withFileTypes: true }).catch((error) => {
    throw new CliCommandError(`Could not read run directory ${runDir}: ${error instanceof Error ? error.message : String(error)}`);
  });
  const caseDirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("eval-")).map((entry) => path.join(runDir, entry.name)).sort();

  if (caseDirs.length === 0) throw new CliCommandError(`No eval case directories found in ${runDir}.`);

  const cases: ReviewCase[] = [];
  for (const caseDir of caseDirs) {
    const directGrading = await readJsonIfExists(path.join(caseDir, "grading.json"));
    const caseId = directGrading?.case_id ?? stripEvalPrefix(path.basename(caseDir));

    if (directGrading !== null) {
      cases.push({
        id: caseId,
        delta: findBenchmarkDelta(benchmark, caseId),
        variants: [await loadVariant("run", caseDir, directGrading)],
      });
      continue;
    }

    const variants: ReviewVariant[] = [];
    for (const variantName of ["with_skill", "without_skill"]) {
      const variantDir = path.join(caseDir, variantName);
      const grading = await readJsonIfExists(path.join(variantDir, "grading.json"));
      if (grading !== null) variants.push(await loadVariant(variantName, variantDir, grading));
    }

    if (variants.length > 0) {
      cases.push({ id: variants[0]?.grading?.case_id ?? caseId, delta: findBenchmarkDelta(benchmark, caseId), variants });
    }
  }

  if (cases.length === 0) throw new CliCommandError(`No reviewable grading artifacts found in ${runDir}.`);
  return { runDir, compare: benchmark !== null || cases.some((item) => item.variants.length > 1), benchmark, cases };
}

async function loadVariant(name: string, dir: string, grading: any): Promise<ReviewVariant> {
  return {
    name,
    dir,
    assistant: await readTextIfExists(path.join(dir, "assistant.md")),
    grading,
    timing: await readJsonIfExists(path.join(dir, "timing.json")),
    toolSummary: await readJsonIfExists(path.join(dir, "tool-summary.json")),
    contextManifest: await readJsonIfExists(path.join(dir, "context-manifest.json")),
  };
}

function renderReviewHtml(run: ReviewRun): string {
  const summary = summarizeRun(run);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Skeval review</title>
<style>
:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}body{margin:0;padding:32px;line-height:1.5}main{max-width:1200px;margin:0 auto}h1,h2,h3{line-height:1.15}.muted{color:#6b7280}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:20px 0}.card{border:1px solid #d1d5db;border-radius:12px;padding:16px}.case{border-top:2px solid #d1d5db;margin-top:32px;padding-top:24px}.variants{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}.variant{border:1px solid #d1d5db;border-radius:12px;padding:16px;min-width:0}.pass{color:#047857}.fail{color:#b91c1c}pre{background:#111827;color:#f9fafb;padding:12px;border-radius:8px;overflow:auto;white-space:pre-wrap}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border-bottom:1px solid #d1d5db;text-align:left;padding:8px;vertical-align:top}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.badge{display:inline-block;border-radius:999px;padding:2px 8px;background:#e5e7eb;color:#111827;font-size:12px}</style>
</head>
<body><main>
<h1>Skeval review</h1>
<p class="muted"><code>${escapeHtml(run.runDir)}</code></p>
<div class="cards">
  <div class="card"><strong>Mode</strong><br>${run.compare ? "compare" : "single run"}</div>
  <div class="card"><strong>Cases</strong><br>${summary.totalCases}</div>
  <div class="card"><strong>Assertions</strong><br><span class="pass">${summary.passedAssertions} passed</span> / <span class="fail">${summary.failedAssertions} failed</span></div>
  <div class="card"><strong>Pass rate</strong><br>${formatPercent(summary.passRate)}</div>
</div>
${run.benchmark ? renderBenchmark(run.benchmark) : ""}
${run.cases.map(renderCase).join("\n")}
</main></body></html>`;
}

function renderBenchmark(benchmark: any): string {
  const summary = benchmark.summary ?? {};
  return `<section><h2>Benchmark</h2><div class="cards">
    <div class="card"><strong>With skill</strong><br>${formatPercent(summary.with_skill_pass_rate)}</div>
    <div class="card"><strong>Without skill</strong><br>${formatPercent(summary.without_skill_pass_rate)}</div>
    <div class="card"><strong>Delta</strong><br>${formatDelta(summary.delta)}</div>
  </div></section>`;
}

function renderCase(item: ReviewCase): string {
  return `<section class="case"><h2>${escapeHtml(item.id)} ${item.delta == null ? "" : `<span class="badge">delta ${formatDelta(item.delta)}</span>`}</h2><div class="variants">${item.variants.map(renderVariant).join("\n")}</div></section>`;
}

function renderVariant(variant: ReviewVariant): string {
  const summary = variant.grading?.summary ?? {};
  const assertions = Array.isArray(variant.grading?.assertion_results) ? variant.grading.assertion_results : [];
  return `<article class="variant"><h3>${escapeHtml(variant.name)}</h3>
  <p><strong>Assertions:</strong> <span class="pass">${summary.passed ?? 0} passed</span> / <span class="fail">${summary.failed ?? 0} failed</span> (${formatPercent(summary.pass_rate)})</p>
  ${renderMetadata(variant)}
  <h4>Assertion evidence</h4>${renderAssertions(assertions)}
  <h4>Assistant output</h4><pre>${escapeHtml(variant.assistant || "(empty)")}</pre>
  </article>`;
}

function renderMetadata(variant: ReviewVariant): string {
  const duration = variant.timing?.duration_ms ?? variant.timing?.durationMs;
  const tokens = variant.toolSummary?.usage?.total_tokens ?? variant.toolSummary?.total_tokens ?? variant.toolSummary?.summary?.total_tokens;
  const model = variant.contextManifest?.model ?? variant.toolSummary?.model;
  const toolCalls = variant.toolSummary?.summary?.tool_call_count ?? variant.toolSummary?.tool_call_count;
  return `<table><tbody>
    ${duration == null ? "" : `<tr><th>Duration</th><td>${escapeHtml(String(duration))} ms</td></tr>`}
    ${tokens == null ? "" : `<tr><th>Tokens</th><td>${escapeHtml(String(tokens))}</td></tr>`}
    ${model == null ? "" : `<tr><th>Model</th><td><code>${escapeHtml(formatModel(model))}</code></td></tr>`}
    ${toolCalls == null ? "" : `<tr><th>Tool calls</th><td>${escapeHtml(String(toolCalls))}</td></tr>`}
  </tbody></table>`;
}

function renderAssertions(assertions: any[]): string {
  if (assertions.length === 0) return "<p class=\"muted\">No assertion results found.</p>";
  return `<table><thead><tr><th>Status</th><th>Assertion</th><th>Evidence</th></tr></thead><tbody>${assertions.map((assertion) => `<tr><td class="${assertion.passed ? "pass" : "fail"}">${assertion.passed ? "pass" : "fail"}</td><td>${escapeHtml(assertion.text ?? JSON.stringify(assertion.assertion ?? ""))}</td><td>${escapeHtml(assertion.evidence ?? "")}</td></tr>`).join("")}</tbody></table>`;
}

function buildFeedbackSkeleton(run: ReviewRun) {
  return {
    schema_version: "1",
    run_dir: run.runDir,
    compare: run.compare,
    cases: run.cases.map((item) => ({
      case_id: item.id,
      status: "needs-review",
      notes: "",
      variants: item.variants.map((variant) => ({
        name: variant.name,
        grading_summary: variant.grading?.summary ?? null,
        feedback: "",
      })),
    })),
  };
}

function summarizeRun(run: ReviewRun) {
  let passedAssertions = 0;
  let failedAssertions = 0;
  for (const item of run.cases) {
    for (const variant of item.variants) {
      passedAssertions += Number(variant.grading?.summary?.passed ?? 0);
      failedAssertions += Number(variant.grading?.summary?.failed ?? 0);
    }
  }
  const total = passedAssertions + failedAssertions;
  return { totalCases: run.cases.length, passedAssertions, failedAssertions, passRate: total === 0 ? null : passedAssertions / total };
}

function findBenchmarkDelta(benchmark: any | null, caseId: string): number | null {
  const found = benchmark?.cases?.find?.((item: any) => item.case_id === caseId);
  return typeof found?.delta === "number" ? found.delta : null;
}

async function readTextIfExists(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return "";
    throw error;
  }
}

async function readJsonIfExists(file: string): Promise<any | null> {
  const text = await readTextIfExists(file);
  return text ? JSON.parse(text) : null;
}

async function listExistingFiles(files: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const file of files) {
    try {
      const fileStat = await stat(file);
      if (fileStat.isFile()) existing.push(file);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  }
  return existing;
}

function stripEvalPrefix(value: string): string {
  return value.startsWith("eval-") ? value.slice("eval-".length) : value;
}

function formatPercent(value: unknown): string {
  return typeof value === "number" ? `${Math.round(value * 1000) / 10}%` : "n/a";
}

function formatDelta(value: unknown): string {
  return typeof value === "number" ? `${value >= 0 ? "+" : ""}${Math.round(value * 1000) / 10}%` : "n/a";
}

function formatModel(model: any): string {
  if (typeof model === "string") return model;
  if (model?.provider && model?.id) return `${model.provider}/${model.id}${model.thinking ? `:${model.thinking}` : ""}`;
  return JSON.stringify(model);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
