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

test("parseCliArgs rejects invalid context mode", () => {
  assert.throws(
    () => parseCliArgs(["run", "./skill", "--context-mode", "global"]),
    CliUsageError,
  );
});
