import assert from "node:assert/strict";
import test from "node:test";

import { CliUsageError, parseCliArgs } from "../dist/index.js";

test("parseCliArgs accepts create options", () => {
  const parsed = parseCliArgs(["create", "./skills/demo", "--dry-run", "--summary", "--force"]);

  assert.deepEqual(parsed, {
    command: "create",
    skillDir: "./skills/demo",
    dryRun: true,
    summary: true,
    force: true,
    guided: false,
    interactive: false,
  });
});

test("parseCliArgs accepts guided interactive create options", () => {
  const parsed = parseCliArgs(["create", "./skills/demo", "--guided", "--interactive"]);

  assert.deepEqual(parsed, {
    command: "create",
    skillDir: "./skills/demo",
    dryRun: false,
    summary: false,
    force: false,
    guided: true,
    interactive: true,
  });
});

test("parseCliArgs requires --guided for interactive create", () => {
  assert.throws(
    () => parseCliArgs(["create", "./skills/demo", "--interactive"]),
    /--interactive is currently supported with --guided/,
  );
});

test("parseCliArgs accepts review options", () => {
  const parsed = parseCliArgs(["review", "./evals-runs/run-1", "--output", "./review", "--force"]);

  assert.deepEqual(parsed, {
    command: "review",
    runDir: "./evals-runs/run-1",
    output: "./review",
    force: true,
  });
});

test("parseCliArgs accepts init-runtime options", () => {
  const parsed = parseCliArgs([
    "init-runtime",
    "./.arc-skill-eval/pi-agent",
    "--provider",
    "ollama-cloud",
    "--model=gpt-oss:20b",
    "--force",
  ]);

  assert.deepEqual(parsed, {
    command: "init-runtime",
    targetDir: "./.arc-skill-eval/pi-agent",
    provider: "ollama-cloud",
    model: "gpt-oss:20b",
    force: true,
  });
});

test("parseCliArgs requires init-runtime provider and model", () => {
  assert.throws(
    () => parseCliArgs(["init-runtime", "./.arc-skill-eval/pi-agent", "--provider", "ollama-cloud"]),
    CliUsageError,
  );
});

test("parseCliArgs accepts extra skill paths and context mode", () => {
  const parsed = parseCliArgs([
    "run",
    "./skill",
    "--extra-skill",
    "./skills/distractor",
    "--extra-skill=./skills/other",
    "--context-mode",
    "ambient",
  ]);

  assert.equal(parsed.command, "run");
  assert.deepEqual(parsed.extraSkillPaths, ["./skills/distractor", "./skills/other"]);
  assert.equal(parsed.contextMode, "ambient");
});

test("parseCliArgs accepts agent dir", () => {
  const parsed = parseCliArgs(["run", "./skill", "--agent-dir", "./.arc-skill-eval/pi-agent"]);

  assert.equal(parsed.command, "run");
  assert.equal(parsed.agentDir, "./.arc-skill-eval/pi-agent");
});

test("parseCliArgs accepts runner and judge model pins", () => {
  const parsed = parseCliArgs([
    "run",
    "./skill",
    "--model",
    "openai-codex/gpt-5.5:medium",
    "--judge-model=mistral/ministral-8b-latest",
  ]);

  assert.equal(parsed.command, "run");
  assert.deepEqual(parsed.model, { provider: "openai-codex", id: "gpt-5.5", thinking: "medium" });
  assert.deepEqual(parsed.judgeModel, { provider: "mistral", id: "ministral-8b-latest" });
});

test("parseCliArgs rejects invalid context mode", () => {
  assert.throws(
    () => parseCliArgs(["run", "./skill", "--context-mode", "global"]),
    CliUsageError,
  );
});

test("parseCliArgs treats Ollama-style colon tags as part of the model id", () => {
  const parsed = parseCliArgs(["run", "./skill", "--model", "ollama/glm-5.2:cloud"]);

  assert.equal(parsed.command, "run");
  assert.deepEqual(parsed.model, { provider: "ollama", id: "glm-5.2:cloud" });
});

test("parseCliArgs supports thinking suffixes after colon-tagged model ids", () => {
  const parsed = parseCliArgs(["run", "./skill", "--model", "ollama/qwen3.5:cloud:medium"]);

  assert.equal(parsed.command, "run");
  assert.deepEqual(parsed.model, { provider: "ollama", id: "qwen3.5:cloud", thinking: "medium" });
});

test("parseCliArgs rejects model pins without provider", () => {
  assert.throws(
    () => parseCliArgs(["run", "./skill", "--model", "gpt-5.5"]),
    CliUsageError,
  );
});
