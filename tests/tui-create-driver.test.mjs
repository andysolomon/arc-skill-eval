import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { generateCreateProposal, writeCreateProposal } from "../dist/tui/create-driver.js";

const SKILL_MD = `---
name: demo-skill
description: Demonstrates guided create in tests.
---

# Demo skill

Creates \`out/report.md\`.
`;

const stubEvals = {
  version: "1",
  skill_name: "demo-skill",
  evals: [
    {
      id: "stub-case",
      prompt: "Do the demo task.",
      expected_output: "The demo task is done.",
      assertions: [{ type: "file-exists", path: "out/report.md" }],
    },
  ],
};

const stubDesigner = async () => ({
  evals: stubEvals,
  fixtureInputs: ["files/input.md"],
  rationale: ["stub rationale"],
});

async function makeSkillDir() {
  const skillDir = await mkdtemp(path.join(tmpdir(), "arc-create-driver-"));
  await writeFile(path.join(skillDir, "SKILL.md"), SKILL_MD, "utf8");
  return skillDir;
}

test("writeCreateProposal refuses to overwrite an existing suite unless forced", async () => {
  const skillDir = await makeSkillDir();
  const proposal = await generateCreateProposal({ skillDir, guided: true, designer: stubDesigner });
  await writeCreateProposal({ skillDir, proposal });

  await assert.rejects(writeCreateProposal({ skillDir, proposal }), /Refusing to overwrite/);
  const forced = await writeCreateProposal({ skillDir, proposal, force: true });
  assert.equal(forced.written, true);
});
