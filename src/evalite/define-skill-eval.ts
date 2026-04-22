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
  PiSdkParityCase,
} from "../pi/types.js";
import type { EvalTrace, EvalTraceParityComparisonResult } from "../traces/types.js";
import { compareEvalTraceParity } from "../traces/compare-parity.js";
import type { DeterministicCaseScoreResult } from "../scorers/types.js";
import { scoreDeterministicCase } from "../scorers/engine.js";
import { synthesizeTrace } from "./synthesize-trace.js";
import { runCaseViaPi, runParityCaseViaPi, buildSkillFiles } from "./pi-runner-task.js";
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
  /**
   * For routing/execution lanes this is the single canonical trace.
   * For cli-parity lanes this is the SDK-side trace; the CLI-side
   * trace and the comparison result are attached under `parity`.
   */
  trace: EvalTrace;
  scorecard: DeterministicCaseScoreResult | null;
  parity: {
    cliTrace: EvalTrace;
    comparison: EvalTraceParityComparisonResult;
  } | null;
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
  for (const c of normalized.cliParity) {
    register(data, caseByKey, buildParityCase(normalized, c));
  }
  // live-smoke still gated behind ARC_INCLUDE_LIVE_SMOKE — deferred.
  if (process.env.ARC_INCLUDE_LIVE_SMOKE === "1") {
    // wiring will land alongside execution-lane Pi validation.
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
        if (caseDefinition.kind === "cli-parity") {
          const parityResult = await runParityCaseViaPi({
            contract: normalized,
            caseDefinition,
            source,
            skillFiles,
          });
          try {
            return {
              input,
              trace: parityResult.sdkTrace,
              scorecard: null,
              parity: {
                cliTrace: parityResult.cliTrace,
                comparison: parityResult.comparison,
              },
              summary: buildParitySummary(input, parityResult.comparison, "pi"),
            };
          } finally {
            await parityResult.cleanup().catch(() => undefined);
          }
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
            parity: null,
            summary: buildSummary(input, scorecard, "pi"),
          };
        } finally {
          await piResult.cleanup().catch(() => undefined);
        }
      }

      // Synthetic mode.
      if (caseDefinition.kind === "cli-parity") {
        const sdkTrace = synthesizeTrace({
          contract: normalized,
          caseDefinition,
          source,
          relativeSkillDir,
          runtime: "pi-sdk",
        });
        const cliTrace = synthesizeTrace({
          contract: normalized,
          caseDefinition,
          source,
          relativeSkillDir,
          runtime: "pi-cli-json",
        });
        const comparison = compareEvalTraceParity({ sdkTrace, cliTrace });
        return {
          input,
          trace: sdkTrace,
          scorecard: null,
          parity: { cliTrace, comparison },
          summary: buildParitySummary(input, comparison, "synthetic"),
        };
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
        parity: null,
        summary: buildSummary(input, scorecard, "synthetic"),
      };
    });

  evalite<SkillEvalInput, SkillEvalOutput, SkillEvalOutput>(normalized.skill, {
    data,
    task,
    scorers: [primaryScorer],
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

function buildParityCase(
  contract: NormalizedSkillEvalContract,
  definition: ParityCase,
): PiSdkParityCase {
  return {
    kind: "cli-parity",
    lane: "cli-parity",
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: contract.model,
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

function buildParitySummary(
  input: SkillEvalInput,
  comparison: EvalTraceParityComparisonResult,
  mode: "synthetic" | "pi",
): string {
  if (comparison.matched) {
    return `${input.caseId} [${mode}]: parity matched`;
  }
  return `${input.caseId} [${mode}]: parity MISMATCH (${comparison.mismatches.length})`;
}

/**
 * One unified scorer that dispatches by lane kind. Evalite averages
 * scorers equally and treats `null` as `0`, which means per-lane
 * conditional scorers drag down the displayed average. Folding
 * everything into one scorer keeps Evalite's displayed score aligned
 * with our canonical per-case score. Hard-assertion status, dimension
 * breakdown, and parity mismatches ride in `metadata`.
 */
const primaryScorer: Evalite.Scorer<
  SkillEvalInput,
  SkillEvalOutput,
  SkillEvalOutput
> = ({ output }) => {
  const { scorecard, parity } = output;

  if (parity) {
    return {
      score: parity.comparison.matched ? 1 : 0,
      name: "arc-skill",
      description:
        "cli-parity case: 1 when SDK vs CLI semantic projections match. Mismatches in metadata.",
      metadata: {
        lane: "cli-parity",
        matched: parity.comparison.matched,
        mismatchCount: parity.comparison.mismatches.length,
        mismatches: parity.comparison.mismatches,
      },
    };
  }

  if (!scorecard) {
    return {
      score: null,
      name: "arc-skill",
      description: "Non-scored lane (live-smoke or unsupported).",
    };
  }

  return {
    score: scorecard.score,
    name: "arc-skill",
    description:
      "Deterministic weighted score (routing/execution). Dimension + hard-assertion breakdown in metadata.",
    metadata: {
      lane: scorecard.lane,
      scorePercent: scorecard.scorePercent,
      executionStatus: scorecard.executionStatus,
      hardPassed: scorecard.hardPassed,
      passed: scorecard.passed,
      dimensions: scorecard.dimensions,
      hardAssertions: scorecard.hardAssertions,
      deferredExpectations: scorecard.deferredExpectations,
    },
  };
};
