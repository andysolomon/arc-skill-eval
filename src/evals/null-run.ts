import path from "node:path";

import type { DiscoveredSkillFiles } from "../load/source-types.js";
import type { EvalTraceObservations } from "../traces/types.js";

import {
  gradeDeterministicAssertion,
  isJudgeAssertion,
  summarizeAssertion,
  type DeterministicAssertion,
} from "./assertion-engine.js";
import type { EvalAssertion, EvalCase } from "./types.js";
import { prepareCaseWorkspace } from "./workspace.js";

export interface VacuousAssertion {
  index: number;
  text: string;
  evidence: string;
}

export interface NullRunCaseResult {
  caseId: string;
  vacuous: VacuousAssertion[];
  absenceOnly: boolean;
  setupError?: string;
}

const NOTHING_HAPPENED: EvalTraceObservations = {
  assistantText: "",
  toolCalls: [],
  toolResults: [],
  bashCommands: [],
  touchedFiles: [],
  writtenFiles: [],
  editedFiles: [],
  skillReads: [],
  externalCalls: [],
};

export async function nullRunCase(options: {
  evalCase: EvalCase;
  evalsDir: string;
  skillDir: string;
}): Promise<NullRunCaseResult> {
  const caseId = String(options.evalCase.id);
  const assertions = options.evalCase.assertions ?? [];
  const absenceOnly = assertions.length > 0 && assertions.every(checksAbsence);
  const positive = assertions
    .map((assertion, index) => ({ assertion, index }))
    .filter(({ assertion }) => !isJudgeAssertion(assertion) && !checksAbsence(assertion));

  if (positive.length === 0) {
    return { caseId, vacuous: [], absenceOnly };
  }

  let workspace;
  try {
    workspace = await prepareCaseWorkspace({
      evalsDir: options.evalsDir,
      setup: options.evalCase.setup,
      files: options.evalCase.files,
      skillFiles: skillFilesFor(options.skillDir),
    });
  } catch (error) {
    return { caseId, vacuous: [], absenceOnly, setupError: error instanceof Error ? error.message : String(error) };
  }

  try {
    const vacuous: VacuousAssertion[] = [];
    for (const { assertion, index } of positive) {
      const result = await gradeDeterministicAssertion(
        assertion as DeterministicAssertion,
        workspace.workspaceDir,
        "",
        NOTHING_HAPPENED,
      );
      if (result.passed) {
        vacuous.push({ index, text: summarizeAssertion(assertion), evidence: result.evidence });
      }
    }
    return { caseId, vacuous, absenceOnly };
  } finally {
    await workspace.cleanup().catch(() => undefined);
  }
}

function checksAbsence(assertion: EvalAssertion): boolean {
  if (typeof assertion === "string") return false;
  if ("type" in assertion) return assertion.type === "file-absent";
  switch (assertion.kind) {
    case "workspace":
      return assertion.method === "file-absent";
    case "behavior":
      return assertion.method.endsWith("-forbidden");
    case "safety":
      return true;
    case "output":
      return false;
  }
}

function skillFilesFor(skillDir: string): DiscoveredSkillFiles {
  return {
    skillName: path.basename(skillDir),
    skillDir,
    relativeSkillDir: ".",
    skillDefinitionPath: path.join(skillDir, "SKILL.md"),
    evalDefinitionPath: path.join(skillDir, "evals", "evals.json"),
  };
}
