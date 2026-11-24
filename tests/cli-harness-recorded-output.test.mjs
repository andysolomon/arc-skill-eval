// `run --runtime <harness> --compare` through the real CLI
// (`dist/bin/arc-skill-eval.js`) with a fake `claude`, `codex`,
// `cursor-agent` and `copilot` on PATH. Each fake prints what the real CLI
// printed for the same prompt (tests/fixtures/harness-output/<binary>.jsonl,
// recorded 2026-11-24 from claude 2.1.330, codex-cli 0.171.0, cursor-agent
// 2026.11.11 and copilot 1.0.114, trimmed, with the workspace path replaced
// by /workspace) and does what that run did: writes greeting.txt.
//
// Ways it could fail:
//   1. A runtime no longer reads the final answer out of its CLI's real
//      output, so assistant-text assertions fail, or pass on an earlier
//      message instead of the last one.
//   2. Token counts in the real output don't reach timing.json.
//   3. The without_skill run can still see the skill.
//   4. A skill staging folder is copied into outputs/.
//
// Each run's JSON result and what each fake saw are written to
// test-artifacts/cli-harness-recorded-output/.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "bin", "arc-skill-eval.js");
const recordings = path.join(repoRoot, "tests", "fixtures", "harness-output");
const artifactDir = path.join(repoRoot, "test-artifacts", "cli-harness-recorded-output");

const FAKE_HARNESS = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const binary = path.basename(process.argv[1]);
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const workspace = path.resolve(flag("-C") ?? flag("--workspace") ?? process.cwd());
const skills = [".agents", ".claude", ".cursor", ".github"].flatMap((dir) => {
  const root = path.join(workspace, dir, "skills");
  return fs.existsSync(root)
    ? fs.readdirSync(root, { recursive: true }).map(String).filter((entry) => entry.endsWith("SKILL.md")).map((entry) => dir + "/skills/" + entry.split(path.sep).join("/"))
    : [];
});
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ binary, skills }) + "\\n");
fs.writeFileSync(path.join(workspace, "greeting.txt"), "hello");
if (skills.length > 0) fs.writeFileSync(path.join(workspace, "earned.txt"), "written only with the skill\\n");
process.stdout.write(fs.readFileSync(path.join(process.env.FAKE_RECORDINGS, binary + ".jsonl"), "utf8"));
`;

const RUNTIMES = [
  { runtime: "claude-code", binary: "claude", skillsDir: ".claude/skills", tokens: { input_tokens: 4, output_tokens: 129 } },
  { runtime: "codex", binary: "codex", skillsDir: ".agents/skills", tokens: { input_tokens: 52909, output_tokens: 72 } },
  { runtime: "cursor-agent", binary: "cursor-agent", skillsDir: ".cursor/skills", tokens: { input_tokens: 14330, output_tokens: 148 } },
  { runtime: "copilot", binary: "copilot", skillsDir: ".github/skills", tokens: null },
];

async function setup(binary) {
  const root = await mkdtemp(path.join(tmpdir(), "arc-harness-recorded-"));
  const binDir = path.join(root, "bin");
  const runTmp = path.join(root, "run-tmp");
  const skillDir = path.join(root, "repo", "skills", "greeter");
  for (const dir of [binDir, runTmp, path.join(skillDir, "evals")]) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path.join(binDir, binary), FAKE_HARNESS, "utf8");
  await chmod(path.join(binDir, binary), 0o755);
  await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: greeter\ndescription: Writes greeting files.\n---\n", "utf8");
  await writeFile(
    path.join(skillDir, "evals", "evals.json"),
    JSON.stringify({
      skill_name: "greeter",
      evals: [
        {
          id: "greeting",
          prompt: "Create a file named greeting.txt containing hello. Then reply with one short sentence that names the file.",
          assertions: [
            { type: "file-exists", path: "greeting.txt" },
            { type: "file-exists", path: "earned.txt" },
            { type: "regex-match", pattern: "^Created .*greeting\\.txt", target: "assistant-text" },
          ],
        },
      ],
    }),
    "utf8",
  );
  return {
    root,
    skillDir,
    logFile: path.join(root, "harness.log"),
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      TMPDIR: runTmp,
      ANTHROPIC_API_KEY: "test-key-not-used",
      CODEX_API_KEY: "test-key-not-used",
      CURSOR_API_KEY: "test-key-not-used",
      COPILOT_GITHUB_TOKEN: "test-key-not-used",
      FAKE_LOG: path.join(root, "harness.log"),
      FAKE_RECORDINGS: recordings,
    },
  };
}

function runCli(ctx, runtime) {
  const args = [cliPath, "run", ctx.skillDir, "--runtime", runtime, "--compare", "--output-dir", path.join(ctx.root, "out"), "--json"];
  return new Promise((resolve) => {
    execFile(process.execPath, args, { env: ctx.env }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

for (const { runtime, binary, skillsDir, tokens } of RUNTIMES) {
  test(`${runtime}: grades the final answer from real ${binary} output, and the run without the skill cannot see it`, async () => {
    const ctx = await setup(binary);
    try {
      const result = await runCli(ctx, runtime);
      const log = await readFile(ctx.logFile, "utf8");
      await mkdir(artifactDir, { recursive: true });
      await writeFile(path.join(artifactDir, `${runtime}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
      await writeFile(path.join(artifactDir, `${runtime}.harness.log`), log, "utf8");

      const [skill] = JSON.parse(result.stdout).skills;
      assert.deepEqual(skill.errors, [], result.stderr);

      const calls = log.trim().split("\n").map((line) => JSON.parse(line));
      assert.equal(calls.length, 2, "one harness call per variant");
      const [withSkill, withoutSkill] = calls.map((call) => call.skills).sort((a, b) => b.length - a.length);
      assert.ok(withSkill.includes(`${skillsDir}/greeter/SKILL.md`), `the skill is staged in one run: ${withSkill}`);
      assert.deepEqual(withoutSkill, [], "the run without the skill cannot see it");

      const benchmark = JSON.parse(await readFile(skill.benchmarkPath, "utf8"));
      assert.deepEqual(
        benchmark.cases[0].assertions.map(({ text, with_skill, without_skill }) => ({ text, with_skill, without_skill })),
        [
          { text: "file-exists: greeting.txt", with_skill: true, without_skill: true },
          { text: "file-exists: earned.txt", with_skill: true, without_skill: false },
          { text: "regex-match: /^Created .*greeting\\.txt/ in assistant-text", with_skill: true, without_skill: true },
        ],
      );

      for (const variant of ["with_skill", "without_skill"]) {
        const variantDir = path.join(skill.outputDir, "eval-greeting", variant);
        const outputs = (await readdir(path.join(variantDir, "outputs"), { recursive: true })).map((entry) => entry.split(path.sep).join("/"));
        assert.ok(outputs.includes("greeting.txt"), `${variant} outputs/ holds what the agent wrote`);
        assert.ok(
          !outputs.some((entry) => /^\.(agents|claude|cursor|github)\/skills/.test(entry)),
          `${variant} outputs/ carries the staged skill: ${outputs.join(", ")}`,
        );
        if (tokens) {
          const timing = JSON.parse(await readFile(path.join(variantDir, "timing.json"), "utf8"));
          assert.equal(timing.token_usage.input_tokens, tokens.input_tokens);
          assert.equal(timing.token_usage.output_tokens, tokens.output_tokens);
        }
      }
    } finally {
      await rm(ctx.root, { recursive: true, force: true });
    }
  });
}
