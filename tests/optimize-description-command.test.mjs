import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  buildGenerateTriggerSetPrompt,
  optimizeDescriptionCommand,
  validateDescriptionEvalSetValue,
} from "../dist/cli/optimize-description-command.js";
import { parseCliArgs } from "../dist/cli/argv.js";

const SKILL_MD = `---
name: demo-router
description: Routes demo requests to the right handler.
---

# Demo router

Explains routing.
`;

const validSet = {
  version: "1",
  skill_name: "demo-router",
  prompts: [
    { id: "explicit-1", prompt: "Use demo-router for this.", expect: "trigger", split: "train" },
    { id: "implicit-1", prompt: "Send this request to the right handler.", expect: "trigger", split: "test" },
    { id: "near-miss-1", prompt: "Explain how HTTP routing works in general.", expect: "no-trigger", split: "train", note: "conceptual question, not a routing task" },
    { id: "near-miss-2", prompt: "Review my nginx config.", expect: "no-trigger", split: "test", note: "adjacent infra task" },
  ],
};

async function makeSkillDir() {
  const skillDir = await mkdtemp(path.join(tmpdir(), "arc-optdesc-"));
  await writeFile(path.join(skillDir, "SKILL.md"), SKILL_MD, "utf8");
  return skillDir;
}

const exists = (p) => access(p).then(() => true, () => false);

test("validateDescriptionEvalSetValue accepts a well-formed set and names problems otherwise", () => {
  assert.deepEqual(validateDescriptionEvalSetValue(structuredClone(validSet)), validSet);

  assert.throws(() => validateDescriptionEvalSetValue({ ...structuredClone(validSet), skill_name: "" }), /`skill_name` must be a non-empty string/);
  assert.throws(
    () => validateDescriptionEvalSetValue({ ...structuredClone(validSet), prompts: [{ id: "a", prompt: "p", expect: "maybe", split: "train" }] }),
    /prompts\[0\]\.expect must be "trigger" or "no-trigger"/,
  );
  assert.throws(
    () => validateDescriptionEvalSetValue({
      ...structuredClone(validSet),
      prompts: validSet.prompts.map((p) => ({ ...p, split: "train" })),
    }),
    /at least one prompt must be in the test split/,
  );
  assert.throws(
    () => validateDescriptionEvalSetValue({
      ...structuredClone(validSet),
      prompts: validSet.prompts.filter((p) => p.expect === "trigger"),
    }),
    /at least one prompt must expect no-trigger/,
  );
  const dupIds = structuredClone(validSet);
  dupIds.prompts[1].id = "explicit-1";
  assert.throws(() => validateDescriptionEvalSetValue(dupIds), /prompts\[1\]\.id "explicit-1" is duplicated/);
});

test("buildGenerateTriggerSetPrompt embeds the skill and demands near-miss negatives with splits", () => {
  const prompt = buildGenerateTriggerSetPrompt({ skillName: "demo-router", skillText: SKILL_MD });
  assert.match(prompt, /ADJACENT NEAR-MISSES/);
  assert.match(prompt, /70% "train" and 30% "test"/);
  assert.match(prompt, /=== TARGET SKILL\.md ===/);
  assert.ok(prompt.includes(SKILL_MD));
  assert.match(prompt, /Return ONLY JSON/);
});

test("--generate-only writes the validated set and reports counts, without touching SKILL.md", async () => {
  const skillDir = await makeSkillDir();
  const before = await readFile(path.join(skillDir, "SKILL.md"), "utf8");

  const result = await optimizeDescriptionCommand({
    skillDir,
    generateOnly: true,
    generator: async (input) => {
      assert.equal(input.skillName, "demo-router");
      // Fenced + renamed skill: the parser strips fences and pins skill_name.
      return "```json\n" + JSON.stringify({ ...structuredClone(validSet), skill_name: "wrong-name" }, null, 2) + "\n```";
    },
  });

  assert.equal(result.triggerCount, 2);
  assert.equal(result.noTriggerCount, 2);
  assert.equal(result.trainCount, 2);
  assert.equal(result.testCount, 2);

  const onDisk = JSON.parse(await readFile(result.evalSetPath, "utf8"));
  assert.equal(onDisk.skill_name, "demo-router", "generator-mangled skill_name is pinned to the real one");
  assert.equal(onDisk.prompts.length, 4);
  assert.equal(await readFile(path.join(skillDir, "SKILL.md"), "utf8"), before, "SKILL.md must not change");
  assert.equal(result.evalSetPath, path.join(skillDir, "evals", "description-evals.json"));
});

test("--generate-only refuses to overwrite an existing set unless forced", async () => {
  const skillDir = await makeSkillDir();
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(path.join(skillDir, "evals", "description-evals.json"), "{}", "utf8");

  const generator = async () => JSON.stringify(validSet);
  await assert.rejects(optimizeDescriptionCommand({ skillDir, generateOnly: true, generator }), /Refusing to overwrite/);
  const forced = await optimizeDescriptionCommand({ skillDir, generateOnly: true, force: true, generator });
  assert.equal(forced.triggerCount, 2);
});

test("an invalid generator response is rejected and nothing is written", async () => {
  const skillDir = await makeSkillDir();
  await assert.rejects(
    optimizeDescriptionCommand({ skillDir, generateOnly: true, generator: async () => JSON.stringify({ version: "1", skill_name: "demo-router", prompts: [] }) }),
    /`prompts` must be a non-empty array/,
  );
  assert.equal(await exists(path.join(skillDir, "evals", "description-evals.json")), false);
});

test("argv: optimize-description parses flags and enforces the mode requirement", () => {
  const parsed = parseCliArgs(["optimize-description", "./skills/demo", "--generate-only", "--force", "--model", "anthropic/claude-haiku-4-5"]);
  assert.equal(parsed.command, "optimize-description");
  assert.equal(parsed.skillDir, "./skills/demo");
  assert.equal(parsed.generateOnly, true);
  assert.equal(parsed.force, true);
  assert.deepEqual(parsed.model, { provider: "anthropic", id: "claude-haiku-4-5" });

  assert.throws(() => parseCliArgs(["optimize-description", "./skills/demo"]), /--generate-only .* or --eval-set/);
  assert.throws(() => parseCliArgs(["optimize-description", "./skills/demo", "--max-iterations", "0"]), /Invalid --max-iterations/);
  const withSet = parseCliArgs(["optimize-description", "./skills/demo", "--eval-set", "set.json", "--max-iterations", "5"]);
  assert.equal(withSet.evalSetPath, "set.json");
  assert.equal(withSet.maxIterations, 5);
});

test("scoring path reports itself as a later slice for now", async () => {
  const skillDir = await makeSkillDir();
  await assert.rejects(
    optimizeDescriptionCommand({ skillDir, evalSetPath: "whatever.json" }),
    /next slices .*--generate-only/s,
  );
});
