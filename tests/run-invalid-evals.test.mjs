// `run` against an invalid evals.json, through the real CLI. Ways it could fail:
//
//   1. The CLI prints a stack trace with only "failed validation (N issues)"
//      and never says what is wrong (the behavior before this test existed).
//   2. An issue loses its location (which case, which field).
//   3. Validation errors exit 0, or JSON mode reports them as "internal".
//
// Writes the CLI output to test-artifacts/run-invalid-evals/.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "bin", "arc-skill-eval.js");
const artifactDir = path.join(repoRoot, "test-artifacts", "run-invalid-evals");

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function skillWithBadEvals() {
  const root = await mkdtemp(path.join(tmpdir(), "arc-invalid-evals-"));
  const skillDir = path.join(root, "skills", "broken");
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: broken\ndescription: Broken evals fixture.\n---\n", "utf8");
  await writeFile(
    path.join(skillDir, "evals", "evals.json"),
    JSON.stringify({
      skill_name: "broken",
      evals: [
        { id: "ok", prompt: "fine" },
        {
          id: "bad",
          prompt: "",
          assertions: [
            { type: "regex-match", pattern: "[unclosed" },
            { kind: "output", id: "judge", method: "judge", threshold: 9 },
          ],
        },
      ],
    }),
    "utf8",
  );
  return skillDir;
}

test("run lists every evals.json issue with its location and exits 1", async () => {
  const skillDir = await skillWithBadEvals();

  const text = await runCli(["run", skillDir]);
  const json = await runCli(["run", skillDir, "--json"]);
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, "run.json"), `${JSON.stringify({ text, json }, null, 2)}\n`, "utf8");

  assert.equal(text.code, 1);
  assert.doesNotMatch(text.stderr, /\n\s+at /, "no stack trace");
  assert.match(text.stderr, /failed validation \(3 issues\)/);
  assert.match(text.stderr, /- evals\[1\]: `prompt` must be a non-empty string/);
  assert.match(text.stderr, /- evals\[1\]: `assertions\[0\]\.pattern` is not a valid regular expression/);
  assert.match(text.stderr, /- evals\[1\]: `assertions\[1\]\.threshold` must be between 1 and 5/);

  assert.equal(json.code, 1);
  const { error } = JSON.parse(json.stdout);
  assert.equal(error.kind, "command");
  assert.match(error.message, /`assertions\[0\]\.pattern` is not a valid regular expression/);
});
