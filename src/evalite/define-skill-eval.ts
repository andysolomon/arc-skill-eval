import { evalite } from "evalite";
import type { Evalite } from "evalite";
import type {
  SkillEvalContract,
  RoutingCase,
  ExecutionCase,
  ParityCase,
  LiveSmokeCase,
} from "../contracts/types.js";

export type SkillEvalLane =
  | "routing-explicit"
  | "routing-implicit-positive"
  | "routing-adjacent-negative"
  | "routing-hard-negative"
  | "execution"
  | "cli-parity"
  | "live-smoke";

export interface SkillEvalInput {
  skill: string;
  caseId: string;
  lane: SkillEvalLane;
  prompt: string;
}

export interface SkillEvalOutput {
  skill: string;
  caseId: string;
  lane: SkillEvalLane;
  /**
   * Stubbed for the spike. Real implementation will carry EvalTrace +
   * optional workspace outcome + deterministic scorecard pieces.
   */
  summary: string;
}

export interface DefineSkillEvalOptions {
  /**
   * Optional override for the task function. Defaults to a deterministic
   * stub so `defineSkillEval` can be used without Pi SDK access during
   * the experiment's scaffolding phase.
   */
  task?: Evalite.Task<SkillEvalInput, SkillEvalOutput>;
}

/**
 * Compiles a SkillEvalContract into one Evalite eval so Evalite's
 * file discovery (`**\/*.eval.ts`) picks it up directly.
 *
 * Spike scope:
 * - routing lanes are flattened into data[]
 * - execution/parity/live-smoke emitted to data[] but currently handled
 *   by the stub task as no-op
 * - scorer suite is a single "mentions-skill" placeholder so wiring can be
 *   validated end-to-end before deterministic scorers are ported
 */
export function defineSkillEval(
  contract: SkillEvalContract,
  options: DefineSkillEvalOptions = {},
): void {
  const skill = contract.skill;

  const data: Evalite.DataShape<SkillEvalInput, SkillEvalOutput>[] = [
    ...routingToData(skill, "routing-explicit", contract.routing.explicit),
    ...routingToData(
      skill,
      "routing-implicit-positive",
      contract.routing.implicitPositive,
    ),
    ...routingToData(
      skill,
      "routing-adjacent-negative",
      contract.routing.adjacentNegative,
    ),
    ...routingToData(
      skill,
      "routing-hard-negative",
      contract.routing.hardNegative ?? [],
    ),
    ...executionToData(skill, contract.execution ?? []),
    ...parityToData(skill, contract.cliParity ?? []),
    ...liveSmokeToData(skill, contract.liveSmoke ?? []),
  ];

  const task: Evalite.Task<SkillEvalInput, SkillEvalOutput> =
    options.task ?? defaultStubTask;

  evalite<SkillEvalInput, SkillEvalOutput, SkillEvalOutput>(skill, {
    data,
    task,
    scorers: [mentionsSkillScorer],
  });
}

function routingToData(
  skill: string,
  lane: SkillEvalLane,
  cases: RoutingCase[],
): Evalite.DataShape<SkillEvalInput, SkillEvalOutput>[] {
  return cases.map((c) => ({
    input: { skill, caseId: c.id, lane, prompt: c.prompt },
  }));
}

function executionToData(
  skill: string,
  cases: ExecutionCase[],
): Evalite.DataShape<SkillEvalInput, SkillEvalOutput>[] {
  return cases.map((c) => ({
    input: { skill, caseId: c.id, lane: "execution", prompt: c.prompt },
  }));
}

function parityToData(
  skill: string,
  cases: ParityCase[],
): Evalite.DataShape<SkillEvalInput, SkillEvalOutput>[] {
  return cases.map((c) => ({
    input: { skill, caseId: c.id, lane: "cli-parity", prompt: c.prompt },
  }));
}

function liveSmokeToData(
  skill: string,
  cases: LiveSmokeCase[],
): Evalite.DataShape<SkillEvalInput, SkillEvalOutput>[] {
  if (process.env.ARC_INCLUDE_LIVE_SMOKE !== "1") return [];
  return cases.map((c) => ({
    input: { skill, caseId: c.id, lane: "live-smoke", prompt: c.prompt },
  }));
}

const defaultStubTask: Evalite.Task<SkillEvalInput, SkillEvalOutput> = (
  input,
) => ({
  skill: input.skill,
  caseId: input.caseId,
  lane: input.lane,
  summary: `stub: would have routed "${input.prompt}" through ${input.skill}`,
});

const mentionsSkillScorer: Evalite.Scorer<
  SkillEvalInput,
  SkillEvalOutput,
  SkillEvalOutput
> = ({ input, output }) => {
  const hit = output.summary.toLowerCase().includes(input.skill.toLowerCase());
  return {
    score: hit ? 1 : 0,
    name: "mentions-skill",
    description:
      "Spike placeholder: passes when the task output summary mentions the skill name.",
  };
};
