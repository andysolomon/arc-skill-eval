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
