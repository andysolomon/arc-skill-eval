import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runEvalCase } from "../dist/index.js";

async function createSkillFixture() {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-runcase-"));
  const skillDir = path.join(repoRoot, "skills", "sample");
  const evalsDir = path.join(skillDir, "evals");

  await mkdir(evalsDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: sample\ndescription: Test skill used by run-case tests.\n---\n\n# sample\n",
    "utf8",
  );
  await writeFile(
    path.join(evalsDir, "evals.json"),
    JSON.stringify({ skill_name: "sample", evals: [] }),
    "utf8",
  );

  const skill = {
    skillDir,
    relativeSkillDir: "skills/sample",
    skillDefinitionPath: path.join(skillDir, "SKILL.md"),
    evalsJsonPath: path.join(evalsDir, "evals.json"),
  };

  return { repoRoot, skill, evalsDir };
}

function createAssistantMessage(delta, usageOverrides = {}) {
  return {
    role: "assistant",
    content: [{ type: "text", text: delta }],
    api: "mock",
    provider: "mock",
    model: "mock-model",
    stopReason: "stop",
    timestamp: Date.now(),
    usage: {
      input: 10,
      output: 20,
      cacheRead: 5,
      cacheWrite: 3,
      totalTokens: 38,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      ...usageOverrides,
    },
  };
}

function createInjectedSession({
  onPrompt,
  assistantText = "ok",
  extraMessages = [],
  model = { provider: "mock", id: "mock-model", contextWindow: 1000 },
  thinkingLevel = "low",
  contextUsage = { contextWindow: 1000, percent: 3.8 },
} = {}) {
  const sessionState = {
    listener: () => {},
  };

  return {
    sessionId: "session-test",
    sessionFile: undefined,
    messages: extraMessages,
    model,
    thinkingLevel,
    getContextUsage: () => contextUsage,
    subscribe(listener) {
      sessionState.listener = listener;
      return () => {
        sessionState.listener = () => {};
      };
    },
    async prompt(text) {
      if (onPrompt) await onPrompt(text);
      if (assistantText) {
        sessionState.listener({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: assistantText,
          },
        });
      }
    },
    dispose() {},
  };
}

test("runEvalCase returns assistantText + timing when case has no files", async () => {
  const { repoRoot, skill, evalsDir } = await createSkillFixture();

  try {
    const result = await runEvalCase({
      skill,
      evalsDir,
      case: {
        id: 1,
        prompt: "Say hello.",
        assertions: ["The response contains 'hello'"],
      },
      createSession: async (options) => {
        assert.equal(options.skill.contract.skill, "sample");
        assert.equal(options.caseDefinition.caseId, "1");
        assert.equal(options.caseDefinition.kind, "execution");
        assert.equal(options.caseDefinition.lane, "execution-deterministic");
        return {
          model: null,
          session: createInjectedSession({
            assistantText: "hello there",
            extraMessages: [createAssistantMessage("hello there")],
          }),
        };
      },
    });

    try {
      assert.equal(result.caseId, 1);
      assert.equal(result.assistantText, "hello there");
      assert.equal(typeof result.workspaceDir, "string");
      await access(result.workspaceDir, fsConstants.F_OK);
      // 10 + 20 + 5 + 3 = 38
      assert.equal(result.timing.total_tokens, 38);
      assert.deepEqual(result.timing.token_usage, {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_tokens: 5,
        cache_write_tokens: 3,
        total_tokens: 38,
      });
      assert.deepEqual(result.timing.model, { provider: "mock", id: "mock-model", thinking: "low" });
      assert.equal(result.timing.thinking_level, "low");
      assert.equal(result.timing.estimated_cost_usd, 0);
      assert.equal(result.timing.context_window_tokens, 1000);
      assert.equal(result.timing.context_window_used_percent, 3.8);
      assert.ok(result.timing.duration_ms >= 0);
      assert.equal(result.trace.identity.runtime, "pi-sdk");
      assert.equal(result.trace.observations.assistantText, "hello there");
      assert.equal(result.contextManifest.runtime, "pi");
      assert.equal(result.contextManifest.mode, "isolated");
      assert.deepEqual(result.contextManifest.attached_skills, [
        { name: "sample", path: path.join(skill.skillDir, "SKILL.md"), role: "target" },
      ]);
      assert.equal(result.toolSummary.tool_call_count, 0);
      assert.equal(result.toolSummary.mcp_tool_call_count, 0);
    } finally {
      await result.cleanup();
    }

    await assert.rejects(() => access(result.workspaceDir, fsConstants.F_OK));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalCase materializes declared files into the per-case workspace before invoking Pi", async () => {
  const { repoRoot, skill, evalsDir } = await createSkillFixture();

  const filesDir = path.join(evalsDir, "files", "clean-repo");
  await mkdir(filesDir, { recursive: true });
  await writeFile(
    path.join(filesDir, "package.json"),
    JSON.stringify({ name: "fixture-pkg" }),
    "utf8",
  );

  try {
    let observedWorkspace;
    let packageJsonAtPromptTime;

    const result = await runEvalCase({
      skill,
      evalsDir,
      case: {
        id: "with-files",
        prompt: "Inspect the package.",
        files: ["files/clean-repo/package.json"],
      },
      createSession: async (options) => {
        observedWorkspace = options.workspaceDir;
        return {
          model: null,
          session: createInjectedSession({
            onPrompt: async () => {
              packageJsonAtPromptTime = await readFile(
                path.join(options.workspaceDir, "files/clean-repo/package.json"),
                "utf8",
              );
            },
            assistantText: "done",
            extraMessages: [createAssistantMessage("done")],
          }),
        };
      },
    });

    try {
      assert.equal(observedWorkspace, result.workspaceDir);
      assert.equal(packageJsonAtPromptTime, JSON.stringify({ name: "fixture-pkg" }));

      const copied = await readFile(
        path.join(result.workspaceDir, "files/clean-repo/package.json"),
        "utf8",
      );
      assert.equal(copied, JSON.stringify({ name: "fixture-pkg" }));
    } finally {
      await result.cleanup();
    }

    await assert.rejects(() => access(result.workspaceDir, fsConstants.F_OK));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalCase materializes explicit seeded setup with flattened contents", async () => {
  const { repoRoot, skill, evalsDir } = await createSkillFixture();

  const filesDir = path.join(evalsDir, "files", "clean-repo");
  await mkdir(filesDir, { recursive: true });
  await writeFile(path.join(filesDir, "package.json"), JSON.stringify({ name: "flat-pkg" }), "utf8");

  try {
    let packageJsonAtPromptTime;

    const result = await runEvalCase({
      skill,
      evalsDir,
      case: {
        id: "with-setup",
        prompt: "Inspect the package.",
        setup: {
          kind: "seeded",
          sources: [{ from: "files/clean-repo", to: "." }],
          mountMode: "flatten-contents",
        },
      },
      createSession: async (options) => ({
        model: null,
        session: createInjectedSession({
          onPrompt: async () => {
            packageJsonAtPromptTime = await readFile(
              path.join(options.workspaceDir, "package.json"),
              "utf8",
            );
          },
          assistantText: "done",
          extraMessages: [createAssistantMessage("done")],
        }),
      }),
    });

    try {
      assert.equal(packageJsonAtPromptTime, JSON.stringify({ name: "flat-pkg" }));
      const copied = await readFile(path.join(result.workspaceDir, "package.json"), "utf8");
      assert.equal(copied, JSON.stringify({ name: "flat-pkg" }));
      await assert.rejects(() => access(path.join(result.workspaceDir, "files/clean-repo/package.json"), fsConstants.F_OK));
    } finally {
      await result.cleanup();
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runEvalCase cleanup is idempotent and tears down the workspace", async () => {
  const { repoRoot, skill, evalsDir } = await createSkillFixture();

  try {
    const result = await runEvalCase({
      skill,
      evalsDir,
      case: { id: "cleanup", prompt: "ping" },
      createSession: async () => ({
        model: null,
        session: createInjectedSession({
          assistantText: "pong",
          extraMessages: [createAssistantMessage("pong")],
        }),
      }),
    });

    await access(result.workspaceDir, fsConstants.F_OK);
    await result.cleanup();
    await assert.rejects(() => access(result.workspaceDir, fsConstants.F_OK));

    // Calling cleanup twice must not throw.
    await result.cleanup();
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
