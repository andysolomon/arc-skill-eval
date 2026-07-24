import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runEvalsCommand } from "../dist/index.js";
import { createClaudeCodeRuntime } from "../dist/runtime/claude-code/index.js";
import { stageClaudeSkills } from "../dist/runtime/claude-code/staging.js";
import { assertRuntimeReady, resolveRuntime } from "../dist/runtime/registry.js";

const exists = (p) => access(p).then(() => true, () => false);

const CLAUDE_FIXTURE_JSONL = [
  JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text: "I wrote greeting.txt for you." }] },
  }),
  JSON.stringify({
    type: "result",
    result: "I wrote greeting.txt for you.",
    usage: { input_tokens: 12, output_tokens: 8 },
  }),
].join("\n");

async function createSkillFixture(evals) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "arc-claude-rt-"));
  const skillDir = path.join(repoRoot, "skills", "claude-demo");
  const evalsDir = path.join(skillDir, "evals");
  await mkdir(evalsDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: claude-demo\ndescription: Claude Code runtime fixture skill.\n---\n",
    "utf8",
  );
  await writeFile(path.join(evalsDir, "evals.json"), JSON.stringify({ skill_name: "claude-demo", evals }), "utf8");
  return { skillDir };
}

test("claude-code runtime with injected invoker grades file-exists and assistant-text", async () => {
  const { skillDir } = await createSkillFixture([
    {
      id: "claude-greeting",
      prompt: "Write greeting.txt",
      expected_output: "greeting.txt exists",
      setup: { kind: "empty" },
      assertions: [
        { type: "file-exists", path: "greeting.txt" },
        { type: "regex-match", pattern: "greeting\\.txt", target: "assistant-text" },
      ],
    },
  ]);

  const runtime = createClaudeCodeRuntime({
    invoker: async ({ cwd }) => {
      await writeFile(path.join(cwd, "greeting.txt"), "hello\n", "utf8");
      return { stdout: CLAUDE_FIXTURE_JSONL, stderr: "", exitCode: 0 };
    },
  });

  const result = await runEvalsCommand({ input: skillDir, runtime });

  assert.equal(result.summary.totalCases, 1);
  assert.equal(result.summary.passedCases, 1);
  assert.equal(result.summary.failedAssertions, 0);

  const tracePath = path.join(skillDir, "evals-runs", result.runId, "eval-claude-greeting", "trace.json");
  const trace = JSON.parse(await readFile(tracePath, "utf8"));
  assert.equal(trace.identity.runtime, "claude-code");
});

test("stageClaudeSkills copies target skill into .claude/skills when attachSkill is true", async () => {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), "arc-claude-stage-"));
  const skillDir = path.join(workspaceDir, "skill-src");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: staged\ndescription: x\n---\n", "utf8");

  await stageClaudeSkills({
    workspaceDir,
    targetSkill: { name: "staged", skillDir },
    attachSkill: true,
    extraSkillPaths: [],
  });

  assert.ok(await exists(path.join(workspaceDir, ".claude", "skills", "staged", "SKILL.md")));
});

test("resolveRuntime returns claude-code", () => {
  assert.equal(resolveRuntime("claude-code").id, "claude-code");
});

test("assertRuntimeReady accepts claude-code when binary is present", async () => {
  await assertRuntimeReady("claude-code");
});
