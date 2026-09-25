import assert from "node:assert/strict";
import test from "node:test";

import {
  CliCommandError,
  parseGuidedEvalDesignerResponse,
} from "../dist/index.js";

test("parseGuidedEvalDesignerResponse normalizes conceptual grill-me proposal", () => {
  const response = JSON.stringify({
    rationale: "grill-me is conversational, so the suite emphasizes probing questions and over-triggering.",
    trigger_behavior: {
      should_trigger: ["User asks to be grilled on a plan"],
      should_not_trigger: ["User asks to summarize meeting notes"],
    },
    fixtures: [
      {
        path: "files/golden-path/plan.md",
        purpose: "Seed a plan for the grilling interview.",
        contents: "# Plan\nLaunch a beta next week.",
      },
    ],
    evals: {
      version: "1",
      skill_name: "grill-me",
      evals: [
        {
          id: "trigger-explicit",
          description: "Explicit grilling request.",
          prompt: "Grill me on this launch plan.",
          expected_output: "Assistant should run a probing interview rather than provide generic advice.",
          setup: { kind: "empty" },
          assertions: [
            {
              id: "asks-probing-questions",
              kind: "output",
              method: "judge",
              prompt: "The response asks concrete, challenging questions about assumptions, risks, and evidence.",
              mustPass: true,
            },
          ],
          metadata: { tags: ["trigger", "positive", "guided"], difficulty: "easy", intent: "explicit-trigger" },
        },
        {
          id: "execution-golden-path",
          description: "Runs a representative grilling session from a seeded plan.",
          prompt: "Use the plan.md file and grill me on the weakest parts of the plan.",
          expected_output: "Assistant should pressure-test the plan with structured follow-up questions.",
          setup: {
            kind: "seeded",
            sources: [{ from: "files/golden-path/plan.md", to: "plan.md" }],
          },
          assertions: [
            {
              id: "structured-pressure-test",
              kind: "output",
              method: "judge",
              prompt: "The response structures the grilling around assumptions, risks, tradeoffs, and next evidence needed.",
              mustPass: true,
            },
          ],
          metadata: { tags: ["execution", "golden-path", "guided"], difficulty: "medium", intent: "representative-execution" },
        },
        {
          id: "adjacent-negative",
          description: "Meeting notes request should not force a grilling interview.",
          prompt: "Organize these meeting notes into decisions and action items.",
          expected_output: "Assistant should organize notes without insisting on a grilling session.",
          setup: { kind: "empty" },
          assertions: [
            {
              id: "avoids-overtrigger",
              kind: "output",
              method: "judge",
              prompt: "The response does not claim that a grilling interview is required for this note-organization task.",
              mustPass: true,
            },
          ],
          metadata: { tags: ["routing", "negative", "guided"], difficulty: "easy", intent: "adjacent-negative" },
        },
      ],
    },
  });

  const proposal = parseGuidedEvalDesignerResponse(response, { skillName: "grill-me" });

  assert.equal(proposal.evals.skill_name, "grill-me");
  assert.equal(proposal.fixtures[0].path, "files/golden-path/plan.md");
  assert.equal(proposal.triggerBehavior.should_trigger[0], "User asks to be grilled on a plan");
  assert.deepEqual(proposal.evals.evals.map((evalCase) => evalCase.id), [
    "trigger-explicit",
    "execution-golden-path",
    "adjacent-negative",
  ]);
  assert.equal(proposal.evals.evals[0].assertions[0].method, "judge");
  assert.equal(proposal.evals.evals[2].metadata.intent, "adjacent-negative");
});

test("parseGuidedEvalDesignerResponse rejects unsafe fixture paths", () => {
  const response = JSON.stringify({
    rationale: "Unsafe path should fail.",
    trigger_behavior: { should_trigger: ["x"], should_not_trigger: ["y"] },
    fixtures: [{ path: "../secrets.md", contents: "bad" }],
    evals: {
      version: "1",
      skill_name: "grill-me",
      evals: [
        {
          id: "bad-fixture",
          prompt: "Use the fixture.",
          setup: { kind: "seeded", sources: [{ from: "../secrets.md", to: "input.md" }] },
          assertions: [],
        },
      ],
    },
  });

  assert.throws(
    () => parseGuidedEvalDesignerResponse(response, { skillName: "grill-me" }),
    (error) => {
      assert(error instanceof CliCommandError);
      assert.match(error.message, /safe relative path/);
      assert.match(error.message, /must start with files\//);
      return true;
    },
  );
});

test("parseGuidedEvalDesignerResponse rejects unknown fixture references", () => {
  const response = JSON.stringify({
    rationale: "Unknown fixture should fail.",
    trigger_behavior: { should_trigger: ["x"], should_not_trigger: ["y"] },
    fixtures: [{ path: "files/known/input.md", contents: "ok" }],
    evals: {
      version: "1",
      skill_name: "grill-me",
      evals: [
        {
          id: "unknown-fixture",
          prompt: "Use the fixture.",
          setup: { kind: "seeded", sources: [{ from: "files/missing/input.md", to: "input.md" }] },
          assertions: [],
        },
      ],
    },
  });

  assert.throws(
    () => parseGuidedEvalDesignerResponse(response, { skillName: "grill-me" }),
    /references unknown fixture files\/missing\/input\.md/,
  );
});
