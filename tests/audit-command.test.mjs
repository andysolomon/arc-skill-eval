import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { auditCommand, renderAuditMarkdown } from "../dist/cli/audit-command.js";

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
