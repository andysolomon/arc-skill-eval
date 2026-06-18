import assert from "node:assert/strict";
import test from "node:test";

import { CliUsageError, parseCliArgs } from "../dist/index.js";

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
