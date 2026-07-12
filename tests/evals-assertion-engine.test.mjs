import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  gradeDeterministicAssertion,
  isJudgeAssertion,
  judgePromptForAssertion,
  summarizeAssertion,
} from "../dist/evals/assertion-engine.js";

test("assertion engine centrally classifies judge assertions and retains deterministic failures", async () => {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), "arc-assertion-engine-"));

  try {
    const judgeAssertion = {
      id: "summary",
      kind: "output",
      method: "judge",
      prompt: "The assistant summarizes the change.",
    };
    const behaviorAssertion = {
      id: "tool-used",
      kind: "behavior",
      method: "tool-call-required",
      value: "read",
    };

    assert.equal(isJudgeAssertion("The assistant reports success."), true);
    assert.equal(isJudgeAssertion(judgeAssertion), true);
    assert.equal(isJudgeAssertion(behaviorAssertion), false);
    assert.equal(judgePromptForAssertion(judgeAssertion), "The assistant summarizes the change.");
    assert.equal(summarizeAssertion(behaviorAssertion), "behavior:tool-call-required: read");

    const result = await gradeDeterministicAssertion(behaviorAssertion, workspaceDir, "done");
    assert.deepEqual(result, {
      text: "behavior:tool-call-required: read",
      passed: false,
      evidence: "Behavior assertions require trace-aware grading and are not implemented yet",
      assertion: behaviorAssertion,
    });

    const safetyAssertion = { id: "no-live-calls", kind: "safety", method: "no-live-external-calls" };
    const snapshotAssertion = { id: "snapshot", kind: "workspace", method: "snapshot-diff", path: "out.txt" };
    const [safety, snapshot] = await Promise.all([
      gradeDeterministicAssertion(safetyAssertion, workspaceDir, "done"),
      gradeDeterministicAssertion(snapshotAssertion, workspaceDir, "done"),
    ]);
    assert.equal(safety.evidence, "Safety assertions require trace-aware grading and are not implemented yet");
    assert.equal(snapshot.evidence, "snapshot-diff assertions are not implemented yet");
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
