// The audit "null run", through the real CLI (`dist/bin/arc-skill-eval.js audit`).
//
// A null run sets up each case's workspace and grades its assertions before
// any agent has touched it. An assertion that passes there cannot fail, so it
// proves nothing about the skill. Ways this check can go wrong:
//
//   1. It misses an assertion on a seeded file (the bug it exists to catch).
//   2. It flags an assertion the run has to earn, so authors learn to ignore it.
//   3. It flags "did not happen" assertions, which pass on a null run by design.
//   4. It calls a model for judge strings. `audit` must stay offline.
//   5. It misses a regex that matches an empty response.
//   6. One broken suite (bad JSON shape, missing fixture) aborts the whole audit.
//   7. It leaves case workspaces in the temp dir.
//
// Each test writes the CLI's output to test-artifacts/audit-null-run/.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "bin", "arc-skill-eval.js");
const artifactDir = path.join(repoRoot, "test-artifacts", "audit-null-run");

async function writeSkill(root, name, evalsJson, files = {}) {
  const skillDir = path.join(root, "skills", name);
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Null-run fixture skill.\n---\n\n# ${name}\n`,
    "utf8",
  );
  await writeFile(
    path.join(skillDir, "evals", "evals.json"),
    typeof evalsJson === "string" ? evalsJson : JSON.stringify(evalsJson),
    "utf8",
  );
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(skillDir, "evals", relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return skillDir;
}

async function audit(root, name) {
  const runTmp = path.join(root, "run-tmp");
  await mkdir(runTmp, { recursive: true });
  const { stdout } = await run(process.execPath, [cliPath, "audit", path.join(root, "skills"), "--json"], {
    env: { ...process.env, TMPDIR: runTmp },
  });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(path.join(artifactDir, `${name}.json`), stdout, "utf8");
  return { report: JSON.parse(stdout), leftovers: await readdir(runTmp) };
}

const seeded = { kind: "seeded", sources: [{ from: "files/repo", to: "." }], mountMode: "flatten-contents" };

test("audit flags assertions that pass before the agent runs, and no others", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-null-run-"));
  await writeSkill(
    root,
    "release-setup",
    {
      skill_name: "release-setup",
      evals: [
        {
          id: "golden",
          prompt: "Set up releases in this repo.",
          setup: seeded,
          assertions: [
            { type: "file-exists", path: "package.json" },
            { type: "file-exists", path: ".releaserc.json" },
            { type: "regex-match", pattern: "demo-package", target: { file: "package.json" } },
            { type: "regex-match", pattern: "conventionalcommits", target: { file: ".releaserc.json" } },
            { type: "regex-match", pattern: "^\\s*$" },
            { type: "file-absent", path: "junk.txt" },
            { id: "wrote", kind: "behavior", method: "tool-call-required", value: "write" },
            { id: "no-bash", kind: "behavior", method: "tool-call-forbidden", value: "bash" },
            "The response names the preset it installed.",
          ],
        },
      ],
    },
    { "files/repo/package.json": '{ "name": "demo-package" }\n' },
  );

  const { report, leftovers } = await audit(root, "vacuous");
  const findings = report.skills[0].findings.filter((finding) => finding.category === "vacuous-assertion");

  assert.deepEqual(
    findings.map((finding) => finding.message.match(/assertion (\d+)/)?.[1]).sort(),
    ["1", "3", "5"],
    JSON.stringify(report.skills[0].findings, null, 2),
  );
  for (const finding of findings) {
    assert.equal(finding.severity, "warn");
    assert.match(finding.message, /golden/);
    assert.equal(finding.path, "evals/evals.json");
  }
  assert.deepEqual(leftovers, [], "the null run removed every workspace it made");
});

test("a case that only checks absence is reported once, at info", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-null-run-"));
  await writeSkill(root, "quiet", {
    skill_name: "quiet",
    evals: [
      {
        id: "should-not-trigger",
        prompt: "Summarise this commit.",
        assertions: [
          { type: "file-absent", path: ".releaserc.json" },
          { id: "no-write", kind: "behavior", method: "tool-call-forbidden", value: "write" },
        ],
      },
      {
        id: "mixed",
        prompt: "Set up releases.",
        assertions: [
          { type: "file-absent", path: "junk.txt" },
          { type: "file-exists", path: ".releaserc.json" },
        ],
      },
    ],
  });

  const { report } = await audit(root, "absence-only");
  const findings = report.skills[0].findings.filter((finding) => finding.category !== "eval-sync");

  assert.equal(findings.length, 1, JSON.stringify(findings, null, 2));
  assert.equal(findings[0].category, "absence-only-case");
  assert.equal(findings[0].severity, "info");
  assert.match(findings[0].message, /should-not-trigger/);
});

test("a broken suite becomes a finding and the other skills are still audited", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-null-run-"));
  await writeSkill(root, "a-bad-shape", { skill_name: "a-bad-shape", evals: [{ id: "x" }] });
  await writeSkill(root, "b-missing-fixture", {
    skill_name: "b-missing-fixture",
    evals: [
      {
        id: "golden",
        prompt: "Go.",
        setup: { kind: "seeded", sources: [{ from: "files/nope", to: "." }], mountMode: "flatten-contents" },
        assertions: [{ type: "file-exists", path: "out.txt" }],
      },
    ],
  });
  await writeSkill(
    root,
    "c-fine",
    {
      skill_name: "c-fine",
      evals: [{ id: "golden", prompt: "Go.", setup: seeded, assertions: [{ type: "file-exists", path: "seed.txt" }] }],
    },
    { "files/repo/seed.txt": "seed\n" },
  );

  const { report, leftovers } = await audit(root, "broken-suite");
  const byName = Object.fromEntries(report.skills.map((skill) => [skill.name, skill.findings]));

  const badShape = byName["a-bad-shape"].find((finding) => finding.category === "eval-suite");
  assert.equal(badShape?.severity, "high", JSON.stringify(byName["a-bad-shape"], null, 2));
  assert.match(badShape.message, /prompt/);

  const missing = byName["b-missing-fixture"].find((finding) => finding.category === "eval-suite");
  assert.equal(missing?.severity, "high", JSON.stringify(byName["b-missing-fixture"], null, 2));
  assert.match(missing.message, /golden/);

  assert.ok(byName["c-fine"].some((finding) => finding.category === "vacuous-assertion"));
  assert.deepEqual(leftovers, []);
});

// The coverage map: a case can name the SKILL.md sections it covers in
// `metadata.covers`. Audit checks the names against the headings. Ways this
// could fail:
//
//   8. A case covers a section that was renamed or removed, and nothing says so.
//   9. A `#` line inside a code fence counts as a section.
//  10. A suite that never used `covers` gets a list of uncovered sections.
//  11. "Phase 2" does not match the heading "Phase 2: Draft the config", or a
//      covered subsection leaves its parent section listed as uncovered.
const COVERAGE_SKILL_MD = `---
name: covered
description: Coverage map fixture skill.
---

# Covered

## Phase 1: Inspect the repo

## Phase 2: Draft the config

### Monorepo layout

\`\`\`bash
## not a heading
\`\`\`

## Phase 3: Write files

## Quality rules
`;

test("audit checks metadata.covers against the SKILL.md headings", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-null-run-"));
  const skillDir = await writeSkill(root, "covered", {
    skill_name: "covered",
    evals: [
      { id: "inspect", prompt: "Go.", metadata: { covers: ["Phase 1"] }, assertions: [{ type: "file-exists", path: "a.txt" }] },
      { id: "monorepo", prompt: "Go.", metadata: { covers: ["monorepo layout"] }, assertions: [{ type: "file-exists", path: "b.txt" }] },
      { id: "old", prompt: "Go.", metadata: { covers: ["Phase 4: Publish"] }, assertions: [{ type: "file-exists", path: "c.txt" }] },
    ],
  });
  await writeFile(path.join(skillDir, "SKILL.md"), COVERAGE_SKILL_MD, "utf8");

  const { report } = await audit(root, "coverage-map");
  const findings = report.skills[0].findings.filter((finding) => finding.category === "eval-coverage");

  const unknown = findings.filter((finding) => finding.severity === "warn");
  assert.equal(unknown.length, 1, JSON.stringify(findings, null, 2));
  assert.match(unknown[0].message, /"old"/);
  assert.match(unknown[0].message, /Phase 4: Publish/);

  const uncovered = findings.filter((finding) => finding.severity === "info");
  assert.equal(uncovered.length, 1, JSON.stringify(findings, null, 2));
  assert.match(uncovered[0].message, /Phase 3: Write files/);
  assert.match(uncovered[0].message, /Quality rules/);
  assert.doesNotMatch(uncovered[0].message, /Phase 1|Phase 2|not a heading/);
});

test("a suite that never names sections gets no coverage findings", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-null-run-"));
  const skillDir = await writeSkill(root, "covered", {
    skill_name: "covered",
    evals: [{ id: "inspect", prompt: "Go.", assertions: [{ type: "file-exists", path: "a.txt" }] }],
  });
  await writeFile(path.join(skillDir, "SKILL.md"), COVERAGE_SKILL_MD, "utf8");

  const { report } = await audit(root, "coverage-map-not-used");
  assert.deepEqual(
    report.skills[0].findings.filter((finding) => finding.category === "eval-coverage"),
    [],
  );
});
