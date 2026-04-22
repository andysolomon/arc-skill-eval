import path from "node:path";

import { evalite } from "evalite";
import type { Evalite } from "evalite";

import type {
  NormalizedSkillEvalContract,
  SkillEvalContract,
  RoutingCase,
  ExecutionCase,
  ParityCase,
  LiveSmokeCase,
} from "../contracts/types.js";
import { normalizeSkillEvalContract } from "../contracts/normalize.js";
import type { RepoSourceDescriptor } from "../load/source-types.js";
import type {
  PiSdkCaseLane,
  PiSdkRunnableCase,
  PiSdkRoutingCase,
  PiSdkExecutionCase,
} from "../pi/types.js";
import type { EvalTrace } from "../traces/types.js";
import type { DeterministicCaseScoreResult } from "../scorers/types.js";
import { scoreDeterministicCase } from "../scorers/engine.js";
import { synthesizeTrace } from "./synthesize-trace.js";

export type SkillEvalLane =
  | "routing-explicit"
  | "routing-implicit-positive"
  | "routing-adjacent-negative"
  | "routing-hard-negative"
  | "execution-deterministic"
  | "cli-parity"
  | "live-smoke";

export interface SkillEvalInput {
  skill: string;
  caseId: string;
  lane: SkillEvalLane;
  prompt: string;
}

export interface SkillEvalOutput {
  input: SkillEvalInput;
  trace: EvalTrace;
  scorecard: DeterministicCaseScoreResult | null;
  /** Human summary for Evalite's default output rendering. */
  summary: string;
}

export interface DefineSkillEvalOptions {
  /**
   * Override for the task function. Defaults to the synthetic-trace +
   * deterministic-scorer composition used by the experiment's spike.
   * Iteration 3+ will replace this with a real Pi SDK runner.
   */
  task?: Evalite.Task<SkillEvalInput, SkillEvalOutput>;
  /**
   * Optional provenance override for synthetic traces. Defaults to the
   * process cwd so the spike can run without a real repo source.
   */
  source?: RepoSourceDescriptor;
  /**
   * Optional relative skill dir override for synthetic traces.
   * Defaults to `"skills/<skill-name>"`.
   */
  relativeSkillDir?: string;
}

export function defineSkillEval(
  contract: SkillEvalContract,
  options: DefineSkillEvalOptions = {},
): void {
  const normalized = normalizeSkillEvalContract(contract);
  const source = options.source ?? defaultRepoSource();
  const relativeSkillDir =
    options.relativeSkillDir ?? `skills/${normalized.skill}`;

  const caseByKey = new Map<string, PiSdkRunnableCase>();
  const data: Evalite.DataShape<SkillEvalInput, SkillEvalOutput>[] = [];

  for (const c of normalized.routing.explicit) {
    register(data, caseByKey, buildRoutingCase(normalized, c, "routing-explicit"));
  }
  for (const c of normalized.routing.implicitPositive) {
    register(
      data,
      caseByKey,
      buildRoutingCase(normalized, c, "routing-implicit-positive"),
    );
  }
  for (const c of normalized.routing.adjacentNegative) {
    register(
      data,
      caseByKey,
      buildRoutingCase(normalized, c, "routing-adjacent-negative"),
    );
  }
  for (const c of normalized.routing.hardNegative) {
    register(
      data,
      caseByKey,
      buildRoutingCase(normalized, c, "routing-hard-negative"),
    );
  }
  for (const c of normalized.execution) {
    register(data, caseByKey, buildExecutionCase(normalized, c));
  }
  // cli-parity and live-smoke lanes are not part of deterministic scoring
  // and are deferred until the Pi runtime adapter lands on this branch.
  if (process.env.ARC_INCLUDE_LIVE_SMOKE === "1") {
    // live-smoke wiring is a deferred iteration; emit nothing for now
    // so Evalite doesn't try to score lanes the scorer refuses to handle.
  }

  const task: Evalite.Task<SkillEvalInput, SkillEvalOutput> =
    options.task ??
    (async (input) => {
      const key = caseKey(input.skill, input.caseId, input.lane);
      const caseDefinition = caseByKey.get(key);
      if (!caseDefinition) {
        throw new Error(
          `defineSkillEval task: no registered case for ${key}. Registered keys: ${Array.from(
            caseByKey.keys(),
          ).join(", ")}`,
        );
      }
      const trace = synthesizeTrace({
        contract: normalized,
        caseDefinition,
        source,
        relativeSkillDir,
      });
      const scorecard = isScorableCase(caseDefinition)
        ? await scoreDeterministicCase({
            contract: normalized,
            caseDefinition,
            trace,
          })
        : null;
      return {
        input,
        trace,
        scorecard,
        summary: scorecard
          ? `${input.caseId}: score=${scorecard.scorePercent ?? "—"}% hardPassed=${scorecard.hardPassed}`
          : `${input.caseId}: non-scored lane (${input.lane})`,
      };
    });

  evalite<SkillEvalInput, SkillEvalOutput, SkillEvalOutput>(normalized.skill, {
    data,
    task,
    scorers: [deterministicScorer, hardAssertionScorer],
  });
}

function register(
  data: Evalite.DataShape<SkillEvalInput, SkillEvalOutput>[],
  caseByKey: Map<string, PiSdkRunnableCase>,
  caseDefinition: PiSdkRunnableCase,
) {
  const key = caseKey(
    caseDefinition.skillName,
    caseDefinition.caseId,
    caseDefinition.lane,
  );
  caseByKey.set(key, caseDefinition);
  data.push({
    input: {
      skill: caseDefinition.skillName,
      caseId: caseDefinition.caseId,
      lane: caseDefinition.lane,
      prompt: caseDefinition.prompt,
    },
  });
}

function buildRoutingCase(
  contract: NormalizedSkillEvalContract,
  definition: RoutingCase,
  lane: PiSdkRoutingCase["lane"],
): PiSdkRoutingCase {
  return {
    kind: "routing",
    lane,
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: contract.model,
    definition,
  };
}

function buildExecutionCase(
  contract: NormalizedSkillEvalContract,
  definition: ExecutionCase,
): PiSdkExecutionCase {
  return {
    kind: "execution",
    lane: "execution-deterministic",
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: definition.model ?? contract.model,
    definition,
  };
}

function caseKey(skill: string, caseId: string, lane: PiSdkCaseLane | SkillEvalLane): string {
  return `${skill}::${lane}::${caseId}`;
}

function isScorableCase(caseDefinition: PiSdkRunnableCase): boolean {
  return caseDefinition.kind === "routing" || caseDefinition.kind === "execution";
}

function defaultRepoSource(): RepoSourceDescriptor {
  const cwd = process.cwd();
  return {
    kind: "local",
    input: cwd,
    repositoryRoot: cwd,
    displayName: path.basename(cwd),
    resolvedRef: null,
    git: null,
  };
}

const deterministicScorer: Evalite.Scorer<
  SkillEvalInput,
  SkillEvalOutput,
  SkillEvalOutput
> = ({ output }) => {
  const card = output.scorecard;
  if (!card) {
    return {
      score: null,
      name: "deterministic",
      description: "Non-scored lane (cli-parity / live-smoke).",
    };
  }
  return {
    score: card.score,
    name: "deterministic",
    description:
      "Weighted deterministic score (0..1) from scoreDeterministicCase. Dimension breakdown in metadata.",
    metadata: {
      scorePercent: card.scorePercent,
      executionStatus: card.executionStatus,
      passed: card.passed,
      dimensions: card.dimensions,
      deferredExpectations: card.deferredExpectations,
    },
  };
};

const hardAssertionScorer: Evalite.Scorer<
  SkillEvalInput,
  SkillEvalOutput,
  SkillEvalOutput
> = ({ output }) => {
  const card = output.scorecard;
  if (!card) {
    return {
      score: null,
      name: "hard-assertions",
      description: "Non-scored lane (cli-parity / live-smoke).",
    };
  }
  return {
    score: card.hardPassed ? 1 : 0,
    name: "hard-assertions",
    description:
      "1 when all hard assertions pass, 0 otherwise. Preserved separately from weighted score.",
    metadata: { assertions: card.hardAssertions },
  };
};
