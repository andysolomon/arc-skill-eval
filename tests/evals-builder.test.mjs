import assert from "node:assert/strict";
import test from "node:test";

import {
  defineSkillEval,
  evalCase,
  fileExists,
  exact,
  judge,
} from "../dist/evals/builder/index.js";

test("severity chaining upgrades to the intent form and bakes mustPass/severity", () => {
  const json = defineSkillEval({
    skill_name: "arc-demo",
    cases: [
      evalCase({
        id: "c1",
        prompt: "p",
        assertions: [
          fileExists("a.json").soft(),
          judge("Names each plugin.").severity("warn").id("plugins-named"),
          exact("done").gate(),
        ],
      }),
    ],
  }).toJSON();

  const [fe, jg, ex] = json.evals[0].assertions;
  // fileExists became a workspace intent with an auto id because .soft() was set.
  assert.deepEqual(fe, {
    id: "c1-file-exists-1",
    kind: "workspace",
    method: "file-exists",
    path: "a.json",
    mustPass: false,
  });
  assert.deepEqual(jg, {
    id: "plugins-named",
    kind: "output",
    method: "judge",
    prompt: "Names each plugin.",
    severity: "warn",
  });
  // Auto id uses the assertion's array position (index 2 → -3).
  assert.deepEqual(ex, { id: "c1-exact-3", kind: "output", method: "exact", expected: "done", mustPass: true });
});
