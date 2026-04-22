import { fileURLToPath } from "node:url";
import path from "node:path";

import { defineSkillEval } from "../../../../../src/evalite/define-skill-eval.js";
import { explicit } from "./routing.js";
import { executionCases } from "./execution.js";
import { parityCases } from "./parity.js";

const skillDir = path.dirname(fileURLToPath(import.meta.url));

defineSkillEval(
  {
    skill: "alpha",
    profile: "planning",
    targetTier: 0,
    // Pin model for the Evalite spike so Pi mode does not inherit the
    // user's global default (which may point elsewhere, e.g. ChatGPT Plus
    // with quota caps).
    model: { provider: "google", id: "gemini-2.5-flash" },
    routing: {
      explicit,
      implicitPositive: [],
      adjacentNegative: [],
    },
    execution: executionCases,
    cliParity: parityCases,
  },
  {
    skillDir,
    repositoryRoot: skillDir,
  },
);
