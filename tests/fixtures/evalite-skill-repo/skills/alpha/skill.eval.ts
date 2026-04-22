import { fileURLToPath } from "node:url";
import path from "node:path";

import { defineSkillEval } from "../../../../../src/evalite/define-skill-eval.js";
import { explicit } from "./routing.js";
import { executionCases } from "./execution.js";

const skillDir = path.dirname(fileURLToPath(import.meta.url));

defineSkillEval(
  {
    skill: "alpha",
    profile: "planning",
    targetTier: 0,
    routing: {
      explicit,
      implicitPositive: [],
      adjacentNegative: [],
    },
    execution: executionCases,
  },
  {
    skillDir,
    repositoryRoot: skillDir,
  },
);
