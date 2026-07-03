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

test("scoring with a missing eval set fails with a readable error", async () => {
  const skillDir = await makeSkillDir();
  await assert.rejects(
    optimizeDescriptionCommand({ skillDir, evalSetPath: path.join(skillDir, "missing.json") }),
    /Could not read eval set at .*missing\.json/,
  );
});

// ---------------------------------------------------------------- W-000036 scoring

const { buildRoutingProbePrompt, parseRoutingAnswer, scoreDescription, loadDistractorSkills } =
  await import("../dist/cli/optimize-description-command.js");

const DISTRACTORS = [
  { name: "alpha-planner", description: "Plans work items." },
  { name: "beta-writer", description: "Writes long-form docs." },
];

test("buildRoutingProbePrompt rotates the target position and lists every option once", () => {
  const target = { name: "demo-router", description: "Routes demo requests." };
  const positions = new Set();
  for (let i = 0; i < 3; i++) {
    const probe = buildRoutingProbePrompt({ userPrompt: "Route this.", target, distractors: DISTRACTORS, promptIndex: i });
    for (const skill of [target, ...DISTRACTORS]) {
      const occurrences = probe.split(`${skill.name}: `).length - 1;
      assert.equal(occurrences, 1, `${skill.name} listed exactly once`);
    }
    positions.add(probe.split("\n").findIndex((line) => line.includes("demo-router: ")));
    assert.match(probe, /User request: Route this\./);
  }
  assert.ok(positions.size > 1, "target should not sit in a fixed slot");
});

test("parseRoutingAnswer normalizes names, none, and noisy answers", () => {
  const names = ["demo-router", "alpha-planner"];
  assert.equal(parseRoutingAnswer("demo-router", names), "demo-router");
  assert.equal(parseRoutingAnswer("  Demo-Router.  ", names), "demo-router");
  assert.equal(parseRoutingAnswer("Answer: alpha-planner", names), "alpha-planner");
  assert.equal(parseRoutingAnswer("none", names), "none");
  assert.equal(parseRoutingAnswer("None of these apply.", names), "none");
  assert.equal(parseRoutingAnswer("I would pick demo-router for this.", names), "demo-router");
  assert.equal(parseRoutingAnswer("either demo-router or alpha-planner", names), null);
});

test("scoreDescription computes split accuracy with the no-trigger rule", async () => {
  // Scripted prober: trigger prompts route to the target; near-miss-1 wrongly
  // routes to the target (a real failure); near-miss-2 picks a distractor (fine).
  const byPrompt = {
    "Use demo-router for this.": "demo-router",
    "Send this request to the right handler.": "demo-router",
    "Explain how HTTP routing works in general.": "demo-router",
    "Review my nginx config.": "alpha-planner",
  };
  const prober = async (probe) => {
    const line = probe.split("\n").find((l) => l.startsWith("User request: "));
    return byPrompt[line.slice("User request: ".length)];
  };

  const score = await scoreDescription({
    skillName: "demo-router",
    description: "Routes demo requests.",
    distractors: DISTRACTORS,
    evalSet: validSet,
    prober,
  });

  // train: explicit-1 ✓, near-miss-1 ✗ → 1/2. test: implicit-1 ✓, near-miss-2 ✓ → 2/2.
  assert.deepEqual(score.train, { correct: 1, total: 2, accuracy: 0.5 });
  assert.deepEqual(score.test, { correct: 2, total: 2, accuracy: 1 });
  const nearMiss1 = score.verdicts.find((v) => v.id === "near-miss-1");
  assert.equal(nearMiss1.correct, false);
  assert.equal(nearMiss1.got, "demo-router");
  const nearMiss2 = score.verdicts.find((v) => v.id === "near-miss-2");
  assert.equal(nearMiss2.correct, true, "routing a no-trigger prompt to a distractor counts as correct");
});

test("an unparseable probe answer counts as incorrect for both expectations", async () => {
  const prober = async () => "I cannot decide between these excellent options";
  const score = await scoreDescription({
    skillName: "demo-router",
    description: "Routes demo requests.",
    distractors: DISTRACTORS,
    evalSet: validSet,
    prober,
  });
  assert.ok(score.verdicts.every((v) => v.got === null && v.correct === false));
});

test("loadDistractorSkills reads sibling frontmatter, honors explicit dirs, and skips the target", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "arc-optdesc-siblings-"));
  const mk = async (name, description) => {
    const dir = path.join(parent, name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n`, "utf8");
    return dir;
  };
  const targetDir = await mk("demo-router", "Routes demo requests.");
  await mk("alpha-planner", "Plans work items.");
  await mk("beta-writer", "Writes long-form docs.");
  await mkdir(path.join(parent, "not-a-skill"), { recursive: true });

  const explicitDir = await mkdtemp(path.join(tmpdir(), "arc-optdesc-explicit-"));
  await writeFile(path.join(explicitDir, "SKILL.md"), "---\nname: gamma-deployer\ndescription: Deploys things.\n---\n", "utf8");

  const distractors = await loadDistractorSkills({ skillDir: targetDir, targetName: "demo-router", explicitDirs: [explicitDir] });
  assert.deepEqual(distractors.map((d) => d.name), ["gamma-deployer", "alpha-planner", "beta-writer"], "explicit first, then sorted siblings, no target");
});

test("score mode via the command validates eval-set/skill match and reports counts", async () => {
  const skillDir = await makeSkillDir();
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  const setPath = path.join(skillDir, "evals", "description-evals.json");
  await writeFile(setPath, JSON.stringify(validSet, null, 2), "utf8");

  const result = await optimizeDescriptionCommand({
    skillDir,
    evalSetPath: setPath,
    prober: async () => "demo-router",
  });
  assert.equal(result.mode, "score");
  assert.equal(result.probeCount, 4);
  assert.equal(result.score.train.total, 2);

  const mismatched = { ...structuredClone(validSet), skill_name: "other-skill" };
  await writeFile(setPath, JSON.stringify(mismatched), "utf8");
  await assert.rejects(
    optimizeDescriptionCommand({ skillDir, evalSetPath: setPath, prober: async () => "none" }),
    /is for skill "other-skill" but the target skill is "demo-router"/,
  );
});


// ---------------------------------------------------------------- W-000037 optimization loop

const { optimizeDescription, buildProposeDescriptionPrompt, parseProposedDescription } =
  await import("../dist/cli/optimize-description-command.js");

// Prober keyed on the description under test: maps description → set of prompt
// texts it routes to the target. Everything else routes to "none".
function proberFor(routingTable) {
  return async (probe) => {
    const userPrompt = probe.split("\n").find((l) => l.startsWith("User request: ")).slice("User request: ".length);
    const descLine = probe.split("\n").find((l) => l.includes("demo-router: ")).split("demo-router: ")[1];
    const triggers = routingTable[descLine] ?? new Set();
    return triggers.has(userPrompt) ? "demo-router" : "none";
  };
}

const P = Object.fromEntries(validSet.prompts.map((p) => [p.id, p.prompt]));
const BASE = "Routes demo requests to the right handler.";
const OVERFIT = "overfit description";
const GOOD = "generalizing description";

test("optimizeDescription picks the winner by held-out test accuracy, not train", async () => {
  // baseline: routes only explicit-1 (train 1/2: near-miss-1 ok via none; explicit ok; wait—)
  const routingTable = {
    // baseline: misses implicit-1 (test trigger) → train 2/2? explicit-1 ✓, near-miss-1 → none ✓ = train 2/2…
    // We need baseline train imperfect so candidates can beat it:
    // baseline routes nothing → explicit-1 ✗ (train), implicit-1 ✗ (test), near-misses ✓
    [BASE]: new Set(),
    // overfit: fixes explicit-1 (train 2/2) but still misses implicit-1 (test 1/2 → same as baseline)
    [OVERFIT]: new Set([P["explicit-1"]]),
    // good: fixes both triggers, no over-trigger (train 2/2, test 2/2)
    [GOOD]: new Set([P["explicit-1"], P["implicit-1"]]),
  };
  const proposals = [OVERFIT, GOOD];
  const report = await optimizeDescription({
    skillName: "demo-router",
    skillText: SKILL_MD,
    currentDescription: BASE,
    distractors: [],
    evalSet: validSet,
    maxIterations: 3,
    prober: proberFor(routingTable),
    proposer: async () => proposals.shift() ?? GOOD,
  });

  assert.deepEqual(report.baseline.train, { correct: 1, total: 2, accuracy: 0.5 });
  assert.deepEqual(report.baseline.test, { correct: 1, total: 2, accuracy: 0.5 });
  assert.equal(report.iterations.length, 2, "stops early once train is perfect");
  assert.equal(report.iterations[0].test.accuracy, 0.5, "overfit candidate evaluated on test but does not win");
  assert.equal(report.winner.description, GOOD);
  assert.equal(report.winner.test.accuracy, 1);
});

test("optimizeDescription reports no winner when nothing beats baseline on held-out prompts", async () => {
  const routingTable = {
    [BASE]: new Set([P["explicit-1"]]),          // train 2/2? explicit ✓, near-miss-1 ✓ → 2/2 train, test: implicit ✗, near-miss-2 ✓ → 1/2
  };
  const report = await optimizeDescription({
    skillName: "demo-router",
    skillText: SKILL_MD,
    currentDescription: BASE,
    distractors: [],
    evalSet: validSet,
    maxIterations: 3,
    prober: proberFor(routingTable),
    proposer: async () => { throw new Error("should not be called when train is already perfect"); },
  });
  assert.equal(report.winner, null);
  assert.equal(report.iterations.length, 0, "perfect train baseline short-circuits the loop");
});

test("a failed proposal records the error and the loop continues", async () => {
  const routingTable = {
    [BASE]: new Set(),
    [GOOD]: new Set([P["explicit-1"], P["implicit-1"]]),
  };
  let calls = 0;
  const report = await optimizeDescription({
    skillName: "demo-router",
    skillText: SKILL_MD,
    currentDescription: BASE,
    distractors: [],
    evalSet: validSet,
    maxIterations: 3,
    prober: proberFor(routingTable),
    proposer: async () => {
      calls += 1;
      if (calls === 1) throw new Error("model unavailable");
      return GOOD;
    },
  });
  assert.equal(report.iterations[0].description, null);
  assert.match(report.iterations[0].proposalError, /model unavailable/);
  assert.equal(report.winner.description, GOOD);
});

test("buildProposeDescriptionPrompt names both failure directions; parseProposedDescription normalizes", () => {
  const prompt = buildProposeDescriptionPrompt({
    skillName: "demo-router",
    currentDescription: BASE,
    failures: [
      { prompt: "Send this along.", expect: "trigger", got: "none" },
      { prompt: "Explain routing.", expect: "no-trigger", got: "demo-router" },
    ],
    skillText: SKILL_MD,
  });
  assert.match(prompt, /SHOULD trigger, but the gate chose none: "Send this along\."/);
  assert.match(prompt, /should NOT trigger, but the gate chose demo-router: "Explain routing\."/);
  assert.match(prompt, /Return ONLY the new description text/);

  assert.equal(parseProposedDescription('```\n"Routes things."\n```'), "Routes things.");
  assert.equal(parseProposedDescription("description: Routes\nthings   neatly."), "Routes things neatly.");
});

test("optimize mode via the command returns the report with probe accounting", async () => {
  const skillDir = await makeSkillDir();
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  const setPath = path.join(skillDir, "evals", "description-evals.json");
  await writeFile(setPath, JSON.stringify(validSet, null, 2), "utf8");

  const result = await optimizeDescriptionCommand({
    skillDir,
    evalSetPath: setPath,
    maxIterations: 1,
    prober: async () => "demo-router",   // routes everything to target: train 1/2, test 1/2
    proposer: async () => "A different description.",
  });
  assert.equal(result.mode, "optimize");
  assert.ok(result.probeCount >= 4, "baseline train+test probes counted");
  assert.equal(result.report.winner, null, "candidate identical behavior cannot beat baseline");
});

// ---------------------------------------------------------------- W-000038 apply

const { replaceFrontmatterDescription } = await import("../dist/cli/optimize-description-command.js");
const { parseSkillFrontmatter } = await import("../dist/cli/create-command.js");

const NEW_DESC = "Routes demo requests, including implicit handler-selection asks; does not trigger for conceptual routing questions or infra config reviews.";

test("replaceFrontmatterDescription rewrites plain, quoted, and block-scalar descriptions", () => {
  const bodies = {
    plain: "---\nname: demo-router\ndescription: Routes demo requests.\nlicense: MIT\n---\n\n# Body\n\nUnchanged text.\n",
    quoted: '---\nname: demo-router\ndescription: "Routes demo requests."\nlicense: MIT\n---\n\n# Body\n\nUnchanged text.\n',
    block: "---\nname: demo-router\ndescription: >\n  Routes demo\n  requests.\nlicense: MIT\n---\n\n# Body\n\nUnchanged text.\n",
  };
  for (const [style, text] of Object.entries(bodies)) {
    const updated = replaceFrontmatterDescription(text, NEW_DESC);
    assert.ok(updated, `${style}: rewrite succeeds`);
    const fm = parseSkillFrontmatter(updated, "/tmp/demo-router");
    assert.equal(fm.description.replace(/\s+/g, " "), NEW_DESC, `${style}: new description reads back`);
    assert.equal(fm.name, "demo-router", `${style}: other keys preserved`);
    assert.match(updated, /license: MIT/, `${style}: sibling key intact`);
    assert.match(updated, /# Body\n\nUnchanged text\.\n$/, `${style}: document body byte-identical`);
    assert.match(updated, /description: >\n {2}\S/, `${style}: written as a block scalar`);
  }
});

test("replaceFrontmatterDescription refuses ambiguous documents", () => {
  assert.equal(replaceFrontmatterDescription("# No frontmatter\n", NEW_DESC), null);
  assert.equal(replaceFrontmatterDescription("---\nname: x\n---\nbody\n", NEW_DESC), null, "no description key");
  assert.equal(replaceFrontmatterDescription("---\nname: x\ndescription: y\n---\n", "   "), null, "empty replacement");
});

test("--apply writes the winner into SKILL.md and verifies the round-trip", async () => {
  const skillDir = await makeSkillDir();
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  const setPath = path.join(skillDir, "evals", "description-evals.json");
  await writeFile(setPath, JSON.stringify(validSet, null, 2), "utf8");

  const winner = "Routes demo requests to handlers, including implicit selection asks.";
  // Baseline routes nothing; the winner routes exactly the trigger prompts.
  const prober = async (probe) => {
    const userPrompt = probe.split("\n").find((l) => l.startsWith("User request: ")).slice("User request: ".length);
    const isWinnerDesc = probe.includes(`demo-router: ${winner}`);
    const isTriggerPrompt = userPrompt === P["explicit-1"] || userPrompt === P["implicit-1"];
    return isWinnerDesc && isTriggerPrompt ? "demo-router" : "none";
  };

  const result = await optimizeDescriptionCommand({
    skillDir,
    evalSetPath: setPath,
    maxIterations: 2,
    apply: true,
    prober,
    proposer: async () => winner,
  });
  assert.equal(result.mode, "optimize");
  assert.equal(result.report.winner.description, winner);
  assert.equal(result.applied, true);

  const fm = parseSkillFrontmatter(await readFile(path.join(skillDir, "SKILL.md"), "utf8"), skillDir);
  assert.equal(fm.description.replace(/\s+/g, " "), winner);
});

test("--apply with no winner leaves SKILL.md untouched", async () => {
  const skillDir = await makeSkillDir();
  const before = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  const setPath = path.join(skillDir, "evals", "description-evals.json");
  await writeFile(setPath, JSON.stringify(validSet, null, 2), "utf8");

  const result = await optimizeDescriptionCommand({
    skillDir,
    evalSetPath: setPath,
    maxIterations: 1,
    apply: true,
    prober: async () => "none",          // candidate behaves identically → no winner
    proposer: async () => "Some other description.",
  });
  assert.equal(result.report.winner, null);
  assert.equal(result.applied, false);
  assert.equal(await readFile(path.join(skillDir, "SKILL.md"), "utf8"), before);
});

test("argv: --apply requires --max-iterations", () => {
  assert.throws(
    () => parseCliArgs(["optimize-description", "./skills/demo", "--eval-set", "set.json", "--apply"]),
    /--apply .* requires --max-iterations/,
  );
  const ok = parseCliArgs(["optimize-description", "./skills/demo", "--eval-set", "set.json", "--max-iterations", "3", "--apply"]);
  assert.equal(ok.apply, true);
});
