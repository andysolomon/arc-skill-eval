import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ModelSelection } from "../../contracts/types.js";
import { discoverEvalSkills, type DiscoveredEvalSkill } from "../../skills/intake.js";
import { isJudgeAssertion } from "../assertion-engine.js";
import { DEFAULT_JUDGE_MODEL, type LlmJudgeFn } from "../grade.js";
import { readEvalsJson } from "../loader.js";
import type { EvalCase, EvalsJsonFile } from "../types.js";
import type { PiSdkSessionFactory } from "../../pi/sdk-runner.js";
import { EvalRunError, type EvalRunOptions, type EvalRunPlan, type PlannedSkillRun } from "./types.js";

export async function planEvalRun(options: EvalRunOptions): Promise<EvalRunPlan> {
  const runId = options.runId ?? buildRunId();
  const iteration = normalizeIteration(options.iteration);
  const discovered = await discoverInput(options.input);
  const selectedSkills = filterSkills(discovered, options.skillNames);

  const loadedSkills = await Promise.all(
    selectedSkills.map(async (skill) => ({
      skill,
      evalsFile: await readEvalsJson(skill.evalsJsonPath),
    })),
  );

  await preflightAgentDirRuntime({
    agentDir: options.agentDir,
    model: options.model,
    judgeModel: options.judgeModel,
    createSession: options.createSession,
    judge: options.judge,
    evalsFiles: loadedSkills.map((item) => item.evalsFile),
    caseIds: options.caseIds,
  });

  const skills: PlannedSkillRun[] = loadedSkills.map(({ skill, evalsFile }) => ({
    skill,
    evalsFile,
    evalsDir: path.dirname(skill.evalsJsonPath),
    cases: filterCases(evalsFile, options.caseIds),
    outputDir: resolveSkillOutputDir({
      skill,
      runId,
      iteration,
      outputDirOverride: options.outputDirOverride,
    }),
  }));

  return { runId, iteration, skills };
}

interface AgentDirPreflightOptions {
  agentDir?: string;
  model?: ModelSelection;
  judgeModel?: ModelSelection;
  createSession?: PiSdkSessionFactory;
  judge?: LlmJudgeFn;
  evalsFiles: EvalsJsonFile[];
  caseIds?: string[];
}

interface RuntimeSettingsJson {
  defaultProvider?: unknown;
  defaultModel?: unknown;
}

interface RuntimeModelsJson {
  providers?: unknown;
}

async function preflightAgentDirRuntime(options: AgentDirPreflightOptions): Promise<void> {
  if (!options.agentDir) return;
  if (options.createSession && (options.judge || !selectedCasesNeedJudge(options.evalsFiles, options.caseIds))) return;

  const agentDir = path.resolve(options.agentDir);
  const issues: string[] = [];
  const modelsPath = path.join(agentDir, "models.json");
  const settingsPath = path.join(agentDir, "settings.json");
  const modelsJson = await readJsonFile<RuntimeModelsJson>(modelsPath);
  const settingsJson = await readJsonFile<RuntimeSettingsJson>(settingsPath);

  if (!modelsJson.ok) issues.push(`missing or unreadable models.json at ${modelsPath}`);
  if (!options.model && !settingsJson.ok) issues.push(`missing or unreadable settings.json at ${settingsPath}`);

  if (modelsJson.ok) {
    if (!isRecord(modelsJson.value.providers)) {
      issues.push(`models.json at ${modelsPath} must contain a providers object`);
    } else {
      const runnerSelection = options.model ?? selectionFromSettings(settingsJson.ok ? settingsJson.value : undefined);
      if (!options.createSession && runnerSelection) {
        validateProviderSelection({ selection: runnerSelection, providers: modelsJson.value.providers, issues, role: "runner" });
      }

      if (!options.judge && selectedCasesNeedJudge(options.evalsFiles, options.caseIds)) {
        const judgeSelection = options.judgeModel ?? runnerSelection ?? DEFAULT_JUDGE_MODEL;
        validateProviderSelection({ selection: judgeSelection, providers: modelsJson.value.providers, issues, role: "judge" });
      }
    }
  }

  if (!options.model && settingsJson.ok && !selectionFromSettings(settingsJson.value)) {
    issues.push(`settings.json at ${settingsPath} must define defaultProvider and defaultModel, or pass --model <provider/model>`);
  }

  if (issues.length === 0) return;

  throw new EvalRunError(
    [
      `Incomplete eval runtime for --agent-dir ${agentDir}.`,
      ...issues.map((issue) => `- ${issue}`),
      "",
      "Initialize a tiny eval runtime with:",
      `arc-skill-eval init-runtime ${agentDir} --provider <provider> --model <model>`,
      "",
      "Then set any required provider API key environment variable, pass --model/--judge-model for configured providers, or omit --agent-dir to use your default Pi agent directory (~/.pi/agent).",
    ].join("\n"),
  );
}

function selectionFromSettings(settings: RuntimeSettingsJson | undefined): ModelSelection | undefined {
  if (!settings) return undefined;
  if (typeof settings.defaultProvider !== "string" || typeof settings.defaultModel !== "string") return undefined;
  return { provider: settings.defaultProvider, id: settings.defaultModel };
}

function validateProviderSelection(options: {
  selection: ModelSelection;
  providers: Record<string, unknown>;
  issues: string[];
  role: "runner" | "judge";
}): void {
  const providerConfig = options.providers[options.selection.provider];
  if (!isRecord(providerConfig)) {
    options.issues.push(`${options.role} model provider '${options.selection.provider}' is not configured in models.json`);
    return;
  }

  const models = Array.isArray(providerConfig.models) ? providerConfig.models : [];
  const hasModel = models.some((model) => isRecord(model) && model.id === options.selection.id);
  if (!hasModel) {
    options.issues.push(`${options.role} model '${options.selection.provider}/${options.selection.id}' is not listed in models.json`);
  }

  if (typeof providerConfig.apiKey === "string" && looksLikeRequiredEnvVar(providerConfig.apiKey) && !process.env[providerConfig.apiKey]) {
    options.issues.push(`${options.role} model provider '${options.selection.provider}' requires environment variable ${providerConfig.apiKey}`);
  }
}

function selectedCasesNeedJudge(evalsFiles: EvalsJsonFile[], caseIds: string[] | undefined): boolean {
  return evalsFiles.some((evalsFile) =>
    filterCases(evalsFile, caseIds).some((evalCase) => (evalCase.assertions ?? []).some(isJudgeAssertion)),
  );
}

function looksLikeRequiredEnvVar(value: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/.test(value) && /(?:API|KEY|TOKEN|SECRET|AUTH|CREDENTIAL)/.test(value);
}

async function readJsonFile<T>(file: string): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: JSON.parse(await readFile(file, "utf8")) as T };
  } catch (error) {
    return { ok: false, error };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function discoverInput(input: string): Promise<DiscoveredEvalSkill[]> {
  const absolute = path.resolve(input);
  const directEvals = path.join(absolute, "evals", "evals.json");

  try {
    const directCheck = await import("node:fs/promises").then((fs) => fs.stat(directEvals));
    if (directCheck.isFile()) {
      return [
        {
          skillDir: absolute,
          relativeSkillDir: ".",
          skillDefinitionPath: path.join(absolute, "SKILL.md"),
          evalsJsonPath: directEvals,
        },
      ];
    }
  } catch {
    // fall through to repo-wide discovery
  }

  return await discoverEvalSkills(absolute);
}

function filterSkills(discovered: DiscoveredEvalSkill[], names: string[] | undefined): DiscoveredEvalSkill[] {
  if (!names || names.length === 0) return discovered;
  const allow = new Set(names);
  return discovered.filter((skill) => allow.has(path.basename(skill.skillDir)));
}

export function filterCases(file: EvalsJsonFile, ids: string[] | undefined): EvalCase[] {
  if (!ids || ids.length === 0) return file.evals;
  const allow = new Set(ids);
  return file.evals.filter((evalCase) => allow.has(String(evalCase.id)));
}

function resolveSkillOutputDir(args: {
  skill: DiscoveredEvalSkill;
  runId: string;
  iteration: string | undefined;
  outputDirOverride: string | undefined;
}): string {
  if (args.outputDirOverride) {
    return args.iteration
      ? path.resolve(args.outputDirOverride, path.basename(args.skill.skillDir), args.iteration, args.runId)
      : path.resolve(args.outputDirOverride, path.basename(args.skill.skillDir), args.runId);
  }
  return args.iteration
    ? path.join(args.skill.skillDir, "evals-runs", args.iteration, args.runId)
    : path.join(args.skill.skillDir, "evals-runs", args.runId);
}

export function buildRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
}

export function normalizeIteration(iteration: string | undefined): string | undefined {
  if (iteration === undefined) return undefined;
  const trimmed = iteration.trim();
  if (trimmed.length === 0) return undefined;
  const normalized = trimmed.startsWith("iteration-") ? trimmed : `iteration-${trimmed}`;
  return normalized.replace(/[^A-Za-z0-9_.-]/g, "-");
}
