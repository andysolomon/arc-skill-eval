import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
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

const exists = (p) => access(p).then(() => true, () => false);

test("generateCreateProposal returns the designer proposal without writing anything", async () => {
  const skillDir = await makeSkillDir();
  const proposal = await generateCreateProposal({ skillDir, guided: true, designer: stubDesigner });

  assert.equal(proposal.evals.skill_name, "demo-skill");
  assert.deepEqual(proposal.evals.evals.map((c) => c.id), ["stub-case"]);
  assert.deepEqual(proposal.rationale, ["stub rationale"]);
  assert.equal(await exists(path.join(skillDir, "evals", "evals.json")), false, "dry-run must not write evals.json");
});

test("generateCreateProposal guided:false builds the deterministic starter without a model", async () => {
  const skillDir = await makeSkillDir();
  const proposal = await generateCreateProposal({ skillDir, guided: false });

  const ids = proposal.evals.evals.map((c) => String(c.id));
  assert.ok(ids.includes("trigger-explicit") && ids.includes("adjacent-negative"), `starter cases expected, got: ${ids}`);
  assert.equal(await exists(path.join(skillDir, "evals", "evals.json")), false);
});

test("writeCreateProposal writes and validates the accepted proposal", async () => {
  const skillDir = await makeSkillDir();
  const proposal = await generateCreateProposal({ skillDir, guided: true, designer: stubDesigner });
  const result = await writeCreateProposal({ skillDir, proposal });

  assert.equal(result.written, true);
  const onDisk = JSON.parse(await readFile(result.evalsJsonPath, "utf8"));
  assert.equal(onDisk.skill_name, "demo-skill");
  assert.deepEqual(onDisk.evals.map((c) => c.id), ["stub-case"]);
});

test("writeCreateProposal refuses to overwrite an existing suite unless forced", async () => {
  const skillDir = await makeSkillDir();
  const proposal = await generateCreateProposal({ skillDir, guided: true, designer: stubDesigner });
  await writeCreateProposal({ skillDir, proposal });

  await assert.rejects(writeCreateProposal({ skillDir, proposal }), /Refusing to overwrite/);
  const forced = await writeCreateProposal({ skillDir, proposal, force: true });
  assert.equal(forced.written, true);
});

test("a designer failure propagates as a rejection with its message", async () => {
  const skillDir = await makeSkillDir();
  await assert.rejects(
    generateCreateProposal({ skillDir, guided: true, designer: async () => { throw new Error("model unavailable"); } }),
    /model unavailable/,
  );
  assert.equal(await exists(path.join(skillDir, "evals", "evals.json")), false);
});

test("an invalid designer proposal is rejected before review", async () => {
  const skillDir = await makeSkillDir();
  await assert.rejects(
    generateCreateProposal({
      skillDir,
      guided: true,
      designer: async () => ({ evals: { nope: true }, fixtureInputs: [], rationale: [] }),
    }),
  );
});
