import assert from "node:assert/strict";
import test from "node:test";

import { CliUsageError, parseCliArgs } from "../dist/index.js";

test("parseCliArgs rejects invalid context mode", () => {
  assert.throws(
    () => parseCliArgs(["run", "./skill", "--context-mode", "global"]),
    CliUsageError,
  );
});

test("parseCliArgs leaves sandbox undefined when flag omitted", () => {
  const parsed = parseCliArgs(["run", "./skill"]);

  assert.equal(parsed.command, "run");
  assert.equal(parsed.sandbox, undefined);
});

test("parseCliArgs rejects invalid --sandbox value", () => {
  assert.throws(
    () => parseCliArgs(["run", "./skill", "--sandbox", "docker"]),
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
