import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { auditCommand, renderAuditMarkdown } from "../dist/cli/audit-command.js";
import { parseCliArgs } from "../dist/cli/argv.js";
import { runCli } from "../dist/cli/run-cli.js";

test("auditCommand reports deterministic skill findings", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-audit-"));
  const skillDir = path.join(root, "demo-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), `---
name: demo-skill
description: Use when asked to demo a skill.
disable-model-invocation: true
---
# Demo

See [MISSING.md](MISSING.md).
`, "utf8");

  const result = await auditCommand({ input: root });

  assert.equal(result.summary.skillCount, 1);
  assert.equal(result.skills[0].name, "demo-skill");
  assert.equal(result.skills[0].hasEvals, false);
  assert.ok(result.skills[0].findings.some((finding) => finding.category === "local-link"));
  assert.ok(result.skills[0].findings.some((finding) => finding.category === "eval-coverage"));
  assert.ok(result.skills[0].findings.some((finding) => finding.category === "invocation"));

  const markdown = renderAuditMarkdown(result);
  assert.match(markdown, /# Skill Audit/);
  assert.match(markdown, /demo-skill/);
});

test("audit CLI supports json and output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-audit-cli-"));
  const skillDir = path.join(root, "ok-skill");
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), `---
name: ok-skill
description: Reviews things.
---
# OK
`, "utf8");
  await writeFile(path.join(skillDir, "evals", "evals.json"), `{"skill_name":"ok-skill","evals":[]}`, "utf8");

  assert.deepEqual(parseCliArgs(["audit", root, "--json"]).command, "audit");

  const output = path.join(root, "audit.json");
  const cliResult = await runCli(["audit", root, "--json", "--output", output]);
  assert.equal(cliResult.exitCode, 0);
  const parsed = JSON.parse(await readFile(output, "utf8"));
  assert.equal(parsed.summary.skillCount, 1);
  assert.match(cliResult.stdout, /ok-skill/);
});
