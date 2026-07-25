import assert from "node:assert/strict";
import test from "node:test";

import { gradeEvalCase, buildJudgePrompt, parseJudgeResponse } from "../dist/evals/grade.js";
import { defineSkillEval, evalCase, judge, fileExists } from "../dist/evals/builder/index.js";
import { validateEvalsJsonValue, EvalsJsonValidationError } from "../dist/evals/loader.js";

const scoredCase = (threshold, scaleMax) => ({
  id: "c",
  prompt: "p",
  assertions: [{ id: "a1", kind: "output", method: "judge", prompt: "quality", threshold, scaleMax }],
});

test("scored judge passes when the rubric score meets the threshold", async () => {
  const judge = async () => ({ results: [{ passed: false, evidence: "e", score: 4 }] });
  const g = await gradeEvalCase({ case: scoredCase(4, 5), workspaceDir: ".", assistantText: "x", judge });

  const r = g.assertion_results[0];
  assert.equal(r.passed, true); // threshold decides pass, not the judge's own `passed: false`
  assert.equal(r.score, 4);
  assert.equal(r.scoreScale, 5);
  assert.match(r.evidence, /score 4\/5 \(need >= 4\)/);
  assert.equal(g.summary.passed, 1);
});

test("scored judge fails when the rubric score is below the threshold", async () => {
  const judge = async () => ({ results: [{ passed: true, evidence: "e", score: 2 }] });
  const g = await gradeEvalCase({ case: scoredCase(4, 5), workspaceDir: ".", assistantText: "x", judge });

  const r = g.assertion_results[0];
  assert.equal(r.passed, false); // judge said passed:true, but 2 < 4
  assert.equal(r.score, 2);
  assert.equal(g.summary.failed, 1);
});

test("scored judge clamps out-of-range scores into the rubric scale", async () => {
  const judge = async () => ({ results: [{ passed: true, evidence: "e", score: 99 }] });
  const g = await gradeEvalCase({ case: scoredCase(4, 5), workspaceDir: ".", assistantText: "x", judge });
  assert.equal(g.assertion_results[0].score, 5); // clamped to scaleMax
  assert.equal(g.assertion_results[0].passed, true);
});

test("scored judge falls back to the boolean verdict when no score is returned", async () => {
  const judge = async () => ({ results: [{ passed: true, evidence: "e" }] });
  const g = await gradeEvalCase({ case: scoredCase(4, 5), workspaceDir: ".", assistantText: "x", judge });

  const r = g.assertion_results[0];
  assert.equal(r.passed, true); // no score -> use judged.passed
  assert.equal(r.score, undefined);
  assert.match(r.evidence, /no score returned/);
});

test("gradeEvalCase passes sparse rubrics only for the scored slots", async () => {
  const seen = [];
  const judge = async (input) => {
    seen.push(input.rubrics);
    return { results: input.assertions.map(() => ({ passed: true, evidence: "e", score: 5 })) };
  };
  const mixed = {
    id: "c",
    prompt: "p",
    assertions: [
      "a bare binary judge",
      { id: "scored", kind: "output", method: "judge", prompt: "quality", threshold: 3, scaleMax: 5 },
    ],
  };
  await gradeEvalCase({ case: mixed, workspaceDir: ".", assistantText: "x", judge });
  // Only the second assertion (batch index 1) is scored.
  assert.deepEqual(seen[0], [{ index: 1, scaleMax: 5 }]);
});

test("a purely binary judge batch carries no rubrics field", async () => {
  const seen = [];
  const judge = async (input) => {
    seen.push("rubrics" in input);
    return { results: [{ passed: true, evidence: "e" }] };
  };
  await gradeEvalCase({
    case: { id: "c", prompt: "p", assertions: ["plain judge"] },
    workspaceDir: ".",
    assistantText: "x",
    judge,
  });
  assert.equal(seen[0], false);
});

test("buildJudgePrompt marks scored assertions and instructs a 1-N score", () => {
  const prompt = buildJudgePrompt({
    assistantText: "x",
    assertions: ["binary claim", "scored claim"],
    rubrics: [{ index: 1, scaleMax: 5 }],
  });
  assert.match(prompt, /\[SCORED 1-5\] scored claim/);
  assert.doesNotMatch(prompt, /\[SCORED 1-5\] binary claim/);
  assert.match(prompt, /integer `score`/);
});

test("parseJudgeResponse captures an optional numeric score", () => {
  const parsed = parseJudgeResponse(
    JSON.stringify({ results: [{ passed: true, evidence: "e", score: 3 }, { passed: false, evidence: "e2" }] }),
    2,
  );
  assert.equal(parsed.results[0].score, 3);
  assert.equal(parsed.results[1].score, undefined);
});

test("builder .atLeast upgrades judge to a scored intent with default scale 5", () => {
  const json = defineSkillEval({
    skill_name: "d",
    cases: [evalCase({ id: "c", prompt: "p", assertions: [judge("quality").atLeast(4)] })],
  }).toJSON();
  assert.deepEqual(json.evals[0].assertions[0], {
    id: "c-judge-1",
    kind: "output",
    method: "judge",
    prompt: "quality",
    threshold: 4,
    scaleMax: 5,
  });
});

test("builder .atLeast(n, { outOf }) sets a custom scale and composes with .soft()", () => {
  const json = defineSkillEval({
    skill_name: "d",
    cases: [evalCase({ id: "c", prompt: "p", assertions: [judge("depth").atLeast(8, { outOf: 10 }).soft()] })],
  }).toJSON();
  const a = json.evals[0].assertions[0];
  assert.equal(a.threshold, 8);
  assert.equal(a.scaleMax, 10);
  assert.equal(a.mustPass, false);
});

test("builder .atLeast on a non-judge assertion throws at build time", () => {
  assert.throws(
    () =>
      defineSkillEval({
        skill_name: "d",
        cases: [evalCase({ id: "c", prompt: "p", assertions: [fileExists("a.json").atLeast(3)] })],
      }).toJSON(),
    /only valid on a judge/,
  );
});

test("loader rejects threshold/scaleMax on a non-judge output assertion", () => {
  assert.throws(
    () =>
      validateEvalsJsonValue(
        { skill_name: "d", evals: [{ id: "c", prompt: "p", assertions: [{ id: "x", kind: "output", method: "exact", expected: "hi", threshold: 3 }] }] },
        "t",
      ),
    EvalsJsonValidationError,
  );
});

test("loader rejects a threshold outside 1..scaleMax", () => {
  assert.throws(
    () =>
      validateEvalsJsonValue(
        { skill_name: "d", evals: [{ id: "c", prompt: "p", assertions: [{ id: "x", kind: "output", method: "judge", prompt: "p", threshold: 9, scaleMax: 5 }] }] },
        "t",
      ),
    EvalsJsonValidationError,
  );
});

test("loader accepts a well-formed scored judge and round-trips through the builder", () => {
  const json = defineSkillEval({
    skill_name: "d",
    cases: [evalCase({ id: "c", prompt: "p", assertions: [judge("quality").atLeast(4)] })],
  }).toJSON();
  assert.doesNotThrow(() => validateEvalsJsonValue(json, "round-trip"));
});
