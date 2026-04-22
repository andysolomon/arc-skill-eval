import { defineSkillEval } from "../../../../../src/evalite/define-skill-eval.js";
import { explicit } from "./routing.js";

defineSkillEval({
  skill: "alpha",
  profile: "planning",
  targetTier: 0,
  routing: {
    explicit,
    implicitPositive: [],
    adjacentNegative: [],
  },
});
