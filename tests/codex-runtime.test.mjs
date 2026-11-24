import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runEvalsCommand } from "../dist/index.js";
import { createCodexRuntime } from "../dist/runtime/codex/index.js";

const CODEX_FIXTURE_JSONL = [
  JSON.stringify({ type: "thread.started", thread_id: "codex-fixture-thread" }),
  JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", id: "m1", text: "I wrote greeting.txt for you." },
  }),
].join("\n");

async function createSkillFixture(evals) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "arc-codex-rt-"));
  const skillDir = path.join(repoRoot, "skills", "codex-demo");
  const evalsDir = path.join(skillDir, "evals");
  await mkdir(evalsDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: codex-demo\ndescription: Codex runtime fixture skill.\n---\n",
    "utf8",
  );
  await writeFile(path.join(evalsDir, "evals.json"), JSON.stringify({ skill_name: "codex-demo", evals }), "utf8");
  return { repoRoot, skillDir };
}

test("codex runtime rejects --sandbox just-bash before spawn", async () => {
  let spawned = false;
  const runtime = createCodexRuntime({
    invoker: async () => {
      spawned = true;
      return { stdout: CODEX_FIXTURE_JSONL, stderr: "", exitCode: 0 };
    },
  });
  const { skillDir } = await createSkillFixture([
    {
      id: "sandbox-block",
      prompt: "Write greeting.txt",
      assertions: [{ type: "file-exists", path: "greeting.txt" }],
    },
  ]);

  const result = await runEvalsCommand({ input: skillDir, runtime, sandbox: "just-bash" });
  assert.equal(spawned, false);
  assert.equal(result.summary.failedCases, 1);
  assert.match(result.skills[0].errors[0].message, /does not support --sandbox just-bash/);
});

test("codex runtime fails case on non-zero exit even when assistant text is present", async () => {
  const { skillDir } = await createSkillFixture([
    {
      id: "exit-one",
      prompt: "Write greeting.txt",
      assertions: [{ type: "file-exists", path: "greeting.txt" }],
    },
  ]);

  const runtime = createCodexRuntime({
    invoker: async () => ({
      stdout: CODEX_FIXTURE_JSONL,
      stderr: "ANTHROPIC_API_KEY=should-not-leak",
      exitCode: 1,
    }),
  });

  const result = await runEvalsCommand({ input: skillDir, runtime });
  assert.equal(result.summary.failedCases, 1);
  assert.match(result.skills[0].errors[0].message, /\[REDACTED\]/);
  assert.doesNotMatch(result.skills[0].errors[0].message, /should-not-leak/);
});

test("codex harness trace stores redacted stderr forensics only", async () => {
  const { skillDir } = await createSkillFixture([
    {
      id: "stderr-redact",
      prompt: "Write greeting.txt",
      setup: { kind: "empty" },
      assertions: [
        { type: "file-exists", path: "greeting.txt" },
        { type: "regex-match", pattern: "greeting", target: "assistant-text" },
      ],
    },
  ]);

  const runtime = createCodexRuntime({
    invoker: async ({ cwd }) => {
      await writeFile(path.join(cwd, "greeting.txt"), "hello\n", "utf8");
      return {
        stdout: CODEX_FIXTURE_JSONL,
        stderr: "CODEX_API_KEY=raw-secret-value",
        exitCode: 0,
      };
    },
  });

  const result = await runEvalsCommand({ input: skillDir, runtime });
  const trace = JSON.parse(
    await readFile(
      path.join(skillDir, "evals-runs", result.runId, "eval-stderr-redact", "trace.json"),
      "utf8",
    ),
  );
  const processEvent = trace.raw.runtimeEvents.find((event) => event.kind === "codex-process");
  assert.ok(processEvent);
  assert.equal(processEvent.stderr, undefined);
  assert.match(processEvent.stderrPreviewRedacted, /\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(trace), /raw-secret-value/);
});
