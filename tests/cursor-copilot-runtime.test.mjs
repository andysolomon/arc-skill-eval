import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runEvalsCommand } from "../dist/index.js";
import { createCursorAgentRuntime } from "../dist/runtime/cursor-agent/index.js";
import { createCopilotRuntime } from "../dist/runtime/copilot/index.js";

async function createSkillFixture(prefix, name, evals) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), prefix));
  const skillDir = path.join(repoRoot, "skills", name);
  const evalsDir = path.join(skillDir, "evals");
  await mkdir(evalsDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Fixture skill.\n---\n`,
    "utf8",
  );
  await writeFile(path.join(evalsDir, "evals.json"), JSON.stringify({ skill_name: name, evals }), "utf8");
  return { skillDir };
}

const greetingEvals = [
  {
    id: "greeting",
    prompt: "Write greeting.txt",
    expected_output: "greeting.txt exists",
    setup: { kind: "empty" },
    assertions: [
      { type: "file-exists", path: "greeting.txt" },
      { type: "regex-match", pattern: "greeting\\.txt", target: "assistant-text" },
    ],
  },
];

test("cursor-agent runtime with injected invoker grades a case", async () => {
  const { skillDir } = await createSkillFixture("arc-cursor-rt-", "cursor-demo", greetingEvals);
  const runtime = createCursorAgentRuntime({
    invoker: async ({ cwd }) => {
      await writeFile(path.join(cwd, "greeting.txt"), "hello\n", "utf8");
      return {
        stdout: `${JSON.stringify({ type: "assistant", text: "I wrote greeting.txt" })}\n`,
        stderr: "",
        exitCode: 0,
      };
    },
  });

  const result = await runEvalsCommand({ input: skillDir, runtime });
  assert.equal(result.summary.passedCases, 1);
  const trace = JSON.parse(
    await readFile(path.join(skillDir, "evals-runs", result.runId, "eval-greeting", "trace.json"), "utf8"),
  );
  assert.equal(trace.identity.runtime, "cursor-agent");
});

test("copilot runtime with injected invoker grades a case", async () => {
  const { skillDir } = await createSkillFixture("arc-copilot-rt-", "copilot-demo", greetingEvals);
  const runtime = createCopilotRuntime({
    invoker: async ({ cwd }) => {
      await writeFile(path.join(cwd, "greeting.txt"), "hello\n", "utf8");
      return {
        stdout: `${JSON.stringify({ type: "result", result: "I wrote greeting.txt" })}\n`,
        stderr: "",
        exitCode: 0,
      };
    },
  });

  const result = await runEvalsCommand({ input: skillDir, runtime });
  assert.equal(result.summary.passedCases, 1);
  const trace = JSON.parse(
    await readFile(path.join(skillDir, "evals-runs", result.runId, "eval-greeting", "trace.json"), "utf8"),
  );
  assert.equal(trace.identity.runtime, "copilot");
});
