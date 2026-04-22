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
import { runCaseViaPi, buildSkillFiles } from "./pi-runner-task.js";
import type { DiscoveredSkillFiles } from "../load/source-types.js";

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
   * Override for the task function. When set, the synthetic / Pi branch
   * is bypassed entirely.
   */
  task?: Evalite.Task<SkillEvalInput, SkillEvalOutput>;
  /**
   * Absolute path to the skill's directory (the one containing
   * `SKILL.md` + this `skill.eval.ts`). Required when the real Pi
   * runner is active (`ARC_EVALITE_USE_PI=1`). In synthetic mode the
   * cwd is used as the default repo source.
   */
  skillDir?: string;
  /**
   * Absolute path to the repository root that contains `skillDir`.
   * Defaults to `skillDir` itself, so a self-contained skill fixture
   * works without extra config. Only needed if the skill lives inside
   * a larger repo and you want RepoSourceDescriptor to reflect that.
   */
  repositoryRoot?: string;
  /**
   * Optional provenance override for synthetic traces. When unset,
   * it is derived from `skillDir`/`repositoryRoot` when available or
   * from the process cwd as a last resort.
   */
  source?: RepoSourceDescriptor;
  /**
   * Optional relative skill dir override for synthetic traces.
   * Defaults to `path.relative(repositoryRoot, skillDir)` when
   * available, or `"skills/<skill-name>"` otherwise.
   */
  relativeSkillDir?: string;
}

export function defineSkillEval(
  contract: SkillEvalContract,
  options: DefineSkillEvalOptions = {},
): void {
  const normalized = normalizeSkillEvalContract(contract);
  const repositoryRoot = options.repositoryRoot ?? options.skillDir ?? process.cwd();
  const skillDir = options.skillDir ?? repositoryRoot;
  const source = options.source ?? defaultRepoSource(repositoryRoot);
  const relativeSkillDir =
    options.relativeSkillDir ??
    (options.skillDir
      ? path.relative(repositoryRoot, skillDir) || "."
      : `skills/${normalized.skill}`);
  const skillFiles: DiscoveredSkillFiles | null = options.skillDir
    ? buildSkillFiles({
        skillDir,
        repositoryRoot,
        skillName: normalized.skill,
      })
    : null;
  const usePi = process.env.ARC_EVALITE_USE_PI === "1";

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

      if (usePi) {
        if (!skillFiles) {
          throw new Error(
            `defineSkillEval: ARC_EVALITE_USE_PI=1 requires the \`skillDir\` option on the defineSkillEval call.`,
          );
        }
        const piResult = await runCaseViaPi({
          contract: normalized,
          caseDefinition,
          source,
          skillFiles,
        });
        try {
          const scorecard = isScorableCase(caseDefinition)
            ? await scoreDeterministicCase({
                contract: normalized,
                caseDefinition,
                trace: piResult.trace,
                workspace: piResult.workspace ?? undefined,
                skillFiles,
              })
            : null;
          return {
            input,
            trace: piResult.trace,
            scorecard,
            summary: buildSummary(input, scorecard, "pi"),
          };
        } finally {
          await piResult.cleanup().catch(() => undefined);
        }
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
            skillFiles: skillFiles ?? undefined,
          })
        : null;
      return {
        input,
        trace,
        scorecard,
        summary: buildSummary(input, scorecard, "synthetic"),
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

function defaultRepoSource(repositoryRoot: string): RepoSourceDescriptor {
  return {
    kind: "local",
    input: repositoryRoot,
    repositoryRoot,
    displayName: path.basename(repositoryRoot),
    resolvedRef: null,
    git: null,
  };
}

function buildSummary(
  input: SkillEvalInput,
  scorecard: DeterministicCaseScoreResult | null,
  mode: "synthetic" | "pi",
): string {
  if (!scorecard) {
    return `${input.caseId} [${mode}]: non-scored lane (${input.lane})`;
  }
  return `${input.caseId} [${mode}]: score=${scorecard.scorePercent ?? "—"}% hardPassed=${scorecard.hardPassed}`;
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
