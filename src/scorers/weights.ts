import type { SkillProfile } from "../contracts/types.js";
import type { ScoreWeights } from "./types.js";

const ZERO_STYLE = 0;

export const PROFILE_DEFAULT_WEIGHTS: Record<SkillProfile, ScoreWeights> = {
  planning: {
    trigger: 0.35,
    process: 0.35,
    outcome: 0.3,
    style: ZERO_STYLE,
  },
  "repo-mutation": {
    trigger: 0.2,
    process: 0.4,
    outcome: 0.4,
    style: ZERO_STYLE,
  },
  "external-api": {
    trigger: 0.2,
    process: 0.3,
    outcome: 0.5,
    style: ZERO_STYLE,
  },
  orchestration: {
    trigger: 0.2,
    process: 0.45,
    outcome: 0.35,
    style: ZERO_STYLE,
  },
};

export function resolveScoreWeights(
  profile: SkillProfile,
  overrides: Partial<ScoreWeights> | undefined,
): ScoreWeights {
  return {
    ...PROFILE_DEFAULT_WEIGHTS[profile],
    ...overrides,
  };
}
