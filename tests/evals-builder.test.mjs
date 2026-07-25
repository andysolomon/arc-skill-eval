import assert from "node:assert/strict";
import test from "node:test";

import {
  defineSkillEval,
  evalCase,
  seeded,
  fileExists,
  fileAbsent,
  jsonValid,
  regexMatch,
  exact,
  judge,
  toolRequired,
  toolForbidden,
  skillReadRequired,
  noForbiddenFilesTouched,
} from "../dist/evals/builder/index.js";
import { validateEvalsJsonValue, EvalsJsonValidationError } from "../dist/evals/loader.js";

test("defineSkillEval emits a valid evals.json shape with version + skill_name", () => {
  const suite = defineSkillEval({
    skill_name: "arc-demo",
    version: "1",
    cases: [
      evalCase({
        id: "golden",
        prompt: "Set it up.",
        expected_output: "config written",
        setup: seeded({ from: "files/clean", to: ".", mountMode: "flatten-contents" }),
        assertions: [fileExists(".releaserc.json"), jsonValid(".releaserc.json")],
      }),
    ],
  });

  const json = suite.toJSON();
  assert.equal(json.version, "1");
  assert.equal(json.skill_name, "arc-demo");
  assert.equal(json.evals.length, 1);
  assert.equal(json.evals[0].id, "golden");
  assert.deepEqual(json.evals[0].setup, {
    kind: "seeded",
    sources: [{ from: "files/clean", to: "." }],
    mountMode: "flatten-contents",
  });
  // JSON.stringify goes through toJSON (both drop undefined-valued keys identically).
  assert.equal(JSON.stringify(suite), JSON.stringify(json));
});

test("script helpers emit the cheap { type } form by default", () => {
  const json = defineSkillEval({
    skill_name: "arc-demo",
    cases: [
      evalCase({
        id: "c1",
        prompt: "p",
        assertions: [
          fileExists("a.json"),
          fileAbsent("b.txt"),
          jsonValid("a.json"),
          regexMatch("needle", { file: "a.json" }),
          regexMatch("assist"),
          judge("The response explains itself."),
        ],
      }),
    ],
  }).toJSON();

  const [fe, fa, jv, rxFile, rxText, jg] = json.evals[0].assertions;
  assert.deepEqual(fe, { type: "file-exists", path: "a.json" });
  assert.deepEqual(fa, { type: "file-absent", path: "b.txt" });
  assert.deepEqual(jv, { type: "json-valid", path: "a.json" });
  assert.deepEqual(rxFile, { type: "regex-match", pattern: "needle", target: { file: "a.json" } });
  assert.deepEqual(rxText, { type: "regex-match", pattern: "assist" });
  // Bare judge stays a string.
  assert.equal(jg, "The response explains itself.");
});

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

test("behavior + safety helpers emit intent objects with auto ids and matchers", () => {
  const json = defineSkillEval({
    skill_name: "arc-demo",
    cases: [
      evalCase({
        id: "proc",
        prompt: "p",
        assertions: [
          toolRequired("Write", { match: "releaserc" }),
          toolForbidden("Bash"),
          skillReadRequired("arc-demo"),
          noForbiddenFilesTouched([".env", ".github"]),
        ],
      }),
    ],
  }).toJSON();

  const [req, forbid, read, safe] = json.evals[0].assertions;
  assert.deepEqual(req, {
    id: "proc-tool-required-1",
    kind: "behavior",
    method: "tool-call-required",
    value: "Write",
    match: "releaserc",
  });
  assert.deepEqual(forbid, { id: "proc-tool-forbidden-2", kind: "behavior", method: "tool-call-forbidden", value: "Bash" });
  assert.deepEqual(read, { id: "proc-skill-read-3", kind: "behavior", method: "skill-read-required", value: "arc-demo" });
  assert.deepEqual(safe, {
    id: "proc-no-forbidden-files-4",
    kind: "safety",
    method: "no-forbidden-files-touched",
    config: { paths: [".env", ".github"] },
  });
});

test("toJSON output re-validates cleanly through the loader validator", () => {
  const json = defineSkillEval({
    skill_name: "arc-demo",
    cases: [
      evalCase({
        id: "c1",
        prompt: "p",
        assertions: [fileExists("a.json"), toolRequired("Write").soft(), judge("ok")],
      }),
    ],
  }).toJSON();

  // Round-trip: the emitted object is accepted by the same validator the runner uses.
  assert.doesNotThrow(() => validateEvalsJsonValue(json, "round-trip"));
});

test("defineSkillEval throws EvalsJsonValidationError on duplicate case ids", () => {
  const suite = defineSkillEval({
    skill_name: "arc-demo",
    cases: [
      evalCase({ id: "dup", prompt: "a", assertions: [fileExists("a")] }),
      evalCase({ id: "dup", prompt: "b", assertions: [fileExists("b")] }),
    ],
  });
  assert.throws(() => suite.toJSON(), EvalsJsonValidationError);
});

test("raw strings and assertion objects pass through untouched", () => {
  const json = defineSkillEval({
    skill_name: "arc-demo",
    cases: [
      evalCase({
        id: "mixed",
        prompt: "p",
        assertions: ["a bare judge string", { type: "file-exists", path: "x" }],
      }),
    ],
  }).toJSON();
  assert.deepEqual(json.evals[0].assertions, ["a bare judge string", { type: "file-exists", path: "x" }]);
});
