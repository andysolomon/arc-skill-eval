import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CliCommandError, createCommand, readEvalsJson, runCli } from "../dist/index.js";

async function createSkillFixture({ name = "demo-skill", description = "Helps write demo files." } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-create-"));
  const skillDir = path.join(root, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8",
  );
  return { root, skillDir };
}

test("createCommand writes a valid starter eval suite", async () => {
  const { root, skillDir } = await createSkillFixture();

  try {
    const result = await createCommand({ skillDir });

    assert.equal(result.written, true);
    assert.equal(result.dryRun, false);
    assert.equal(result.evals.skill_name, "demo-skill");
    assert.deepEqual(result.evals.evals.map((item) => item.id), [
      "trigger-explicit",
      "execution-golden-path",
      "adjacent-negative",
    ]);

    const written = await readEvalsJson(path.join(skillDir, "evals", "evals.json"));
    assert.equal(written.skill_name, "demo-skill");
    assert.equal(written.evals.length, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand parses YAML block scalar descriptions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-create-"));
  const skillDir = path.join(root, "block-description-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: block-description-skill\ndescription: >\n  Writes release notes for a project.\n  Use when the user asks for release documentation.\n---\n\n# Block Description Skill\n`,
    "utf8",
  );

  try {
    const result = await createCommand({ skillDir, dryRun: true });
    assert.match(result.evals.evals[0].prompt, /Writes release notes for a project/);
    assert.doesNotMatch(result.evals.evals[0].prompt, /: >/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand infers deterministic file and JSON assertions", async () => {
  const { root, skillDir } = await createSkillFixture({
    name: "artifact-skill",
    description: "Writes `plan.md` and `report.json` for release planning.",
  });

  try {
    const result = await createCommand({ skillDir, dryRun: true });
    const executionCase = result.evals.evals.find((item) => item.id === "execution-golden-path");

    assert(executionCase);
    assert.match(executionCase.prompt, /`plan\.md`/);
    assert.match(executionCase.prompt, /`report\.json`/);
    assert.deepEqual(executionCase.assertions.slice(0, 3), [
      { type: "file-exists", path: "plan.md" },
      { type: "file-exists", path: "report.json" },
      { type: "json-valid", path: "report.json" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand ignores artifact paths inside fenced code examples and advisory sections", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-create-"));
  const skillDir = path.join(root, "example-path-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: example-path-skill\ndescription: Produces \`evals/evals.json\`.\n---\n\n# Example Path Skill\n\n\`\`\`json\n{ "type": "file-exists", "path": ".releaserc.json" }\n\`\`\`\n\n## Quality rules\n\nIf the skill says \`example.json\`, do not infer that advisory example as an output.\n`,
    "utf8",
  );

  try {
    const result = await createCommand({ skillDir, dryRun: true });
    const executionCase = result.evals.evals.find((item) => item.id === "execution-golden-path");
    assert(executionCase);
    assert.deepEqual(executionCase.assertions.slice(0, 2), [
      { type: "file-exists", path: "evals/evals.json" },
      { type: "json-valid", path: "evals/evals.json" },
    ]);
    assert.equal(
      executionCase.assertions.some(
        (assertion) =>
          typeof assertion === "object" &&
          assertion !== null &&
          "path" in assertion &&
          (assertion.path === ".releaserc.json" || assertion.path === "example.json" || assertion.path === "evals.json"),
      ),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand scaffolds inferred fixture inputs", async () => {
  const { root, skillDir } = await createSkillFixture({
    name: "fixture-input-skill",
    description: "Reads `notes/input.md` and `requirements.md`, then writes `plan.md`.",
  });

  try {
    const dryRun = await createCommand({ skillDir, dryRun: true });
    const executionCase = dryRun.evals.evals.find((item) => item.id === "execution-golden-path");

    assert(executionCase);
    assert.deepEqual(dryRun.fixtureInputs, ["notes/input.md", "requirements.md"]);
    assert.deepEqual(executionCase.setup, {
      kind: "seeded",
      sources: [
        { from: "files/starter-inputs/notes/input.md", to: "notes/input.md" },
        { from: "files/starter-inputs/requirements.md", to: "requirements.md" },
      ],
    });
    assert.deepEqual(executionCase.assertions.slice(0, 1), [{ type: "file-exists", path: "plan.md" }]);

    const written = await createCommand({ skillDir });
    assert.deepEqual(written.fixtureInputs, ["notes/input.md", "requirements.md"]);
    assert.match(await readFile(path.join(skillDir, "evals", "files", "starter-inputs", "notes", "input.md"), "utf8"), /realistic input/);
    assert.match(await readFile(path.join(skillDir, "evals", "files", "starter-inputs", "requirements.md"), "utf8"), /realistic input/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand generates domain-aware adjacent negative cases", async () => {
  const { root, skillDir } = await createSkillFixture({
    name: "arc-creating-evals",
    description: "Creates skill eval suites and eval cases for agent skills.",
  });

  try {
    const result = await createCommand({ skillDir, dryRun: true });
    const negativeCase = result.evals.evals.find((item) => item.id === "adjacent-negative");

    assert(negativeCase);
    assert.equal(result.adjacentNegativeAssumption, "unit-test or QA request adjacent to eval-authoring");
    assert.match(negativeCase.prompt, /unit tests for a regular application module/);
    assert.match(negativeCase.prompt, /do not create the arc-creating-evals eval suite/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand uses guided designer in dry-run without writing files", async () => {
  const { root, skillDir } = await createSkillFixture({
    name: "concept-skill",
    description: "Helps reason about conceptual tradeoffs.",
  });

  try {
    let designerCalled = false;
    const result = await createCommand({
      skillDir,
      guided: true,
      dryRun: true,
      designer: async ({ skillText, starterEvals }) => {
        designerCalled = true;
        assert.match(skillText, /concept-skill/);
        assert.equal(starterEvals.skill_name, "concept-skill");
        return {
          fixtureInputs: ["brief.md"],
          rationale: ["Covers conceptual guidance and adjacent routing."],
          evals: {
            version: "1",
            skill_name: "concept-skill",
            evals: [
              {
                id: "guided-conceptual-tradeoff",
                prompt: "Help compare two architecture tradeoffs for a team decision.",
                expected_output: "A concrete tradeoff analysis.",
                assertions: [
                  {
                    id: "tradeoff-analysis",
                    kind: "output",
                    method: "judge",
                    prompt: "The response weighs concrete tradeoffs rather than giving generic advice.",
                  },
                ],
              },
            ],
          },
        };
      },
    });

    assert.equal(designerCalled, true);
    assert.equal(result.guided, true);
    assert.equal(result.interactive, false);
    assert.equal(result.written, false);
    assert.deepEqual(result.fixtureInputs, ["brief.md"]);
    assert.deepEqual(result.rationale, ["Covers conceptual guidance and adjacent routing."]);
    assert.deepEqual(result.evals.evals.map((item) => item.id), ["guided-conceptual-tradeoff"]);
    await assert.rejects(() => readFile(path.join(skillDir, "evals", "evals.json")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand supports guided interactive selection and prompt edits", async () => {
  const { root, skillDir } = await createSkillFixture({
    name: "grill-me",
    description: "A relentless interview to sharpen a plan or design.",
  });
  const messages = [];
  const confirmations = [false, true, true, false, false];
  const inputs = [
    "Grill me on the riskiest parts of this launch plan.",
    "The assistant should ask a structured sequence of hard questions.",
    "The response should challenge assumptions with direct questions.",
  ];

  try {
    const result = await createCommand({
      skillDir,
      guided: true,
      interactive: true,
      designer: async ({ starterEvals }) => ({
        evals: starterEvals,
        fixtureInputs: [],
        rationale: ["Review the proposed guided eval suite before writing evals.json."],
      }),
      interactivePrompt: {
        message(text) {
          messages.push(text);
        },
        async confirm() {
          return confirmations.shift() ?? true;
        },
        async input(_message, defaultValue) {
          return inputs.shift() ?? defaultValue;
        },
      },
    });

    assert.equal(result.guided, true);
    assert.equal(result.interactive, true);
    assert.equal(result.written, true);
    assert.match(messages.join("\n"), /Interactive guided eval creation for grill-me/);
    assert.deepEqual(result.evals.evals.map((item) => item.id), ["execution-golden-path"]);
    assert.equal(result.evals.evals[0].prompt, "Grill me on the riskiest parts of this launch plan.");
    assert.equal(result.evals.evals[0].expected_output, "The assistant should ask a structured sequence of hard questions.");
    assert.equal(result.evals.evals[0].assertions.length, 1);
    assert.equal(result.evals.evals[0].assertions[0].prompt, "The response should challenge assumptions with direct questions.");

    const written = await readEvalsJson(path.join(skillDir, "evals", "evals.json"));
    assert.deepEqual(written.evals.map((item) => item.id), ["execution-golden-path"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand preserves overwrite protection before guided interactive prompts", async () => {
  const { root, skillDir } = await createSkillFixture();
  const evalsDir = path.join(skillDir, "evals");
  let prompted = false;

  try {
    await mkdir(evalsDir, { recursive: true });
    await writeFile(path.join(evalsDir, "evals.json"), "existing", "utf8");

    await assert.rejects(
      () => createCommand({
        skillDir,
        guided: true,
        interactive: true,
        interactivePrompt: {
          message() {
            prompted = true;
          },
          async confirm() {
            prompted = true;
            return true;
          },
          async input(_message, defaultValue) {
            prompted = true;
            return defaultValue;
          },
        },
      }),
      CliCommandError,
    );
    assert.equal(prompted, false);
    assert.equal(await readFile(path.join(evalsDir, "evals.json"), "utf8"), "existing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand rejects invalid guided eval JSON without writing files", async () => {
  const { root, skillDir } = await createSkillFixture({ name: "bad-guided-skill" });

  try {
    await assert.rejects(
      () => createCommand({
        skillDir,
        guided: true,
        designer: async () => ({
          fixtureInputs: [],
          rationale: ["Invalid on purpose."],
          evals: { skill_name: "bad-guided-skill", evals: [{ id: "missing-prompt" }] },
        }),
      }),
      /failed validation|invalid evals\.json|`prompt`/,
    );
    await assert.rejects(() => readFile(path.join(skillDir, "evals", "evals.json")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand refuses to overwrite existing evals without force", async () => {
  const { root, skillDir } = await createSkillFixture();
  const evalsDir = path.join(skillDir, "evals");

  try {
    await mkdir(evalsDir, { recursive: true });
    await writeFile(path.join(evalsDir, "evals.json"), "existing", "utf8");

    await assert.rejects(() => createCommand({ skillDir }), CliCommandError);
    assert.equal(await readFile(path.join(evalsDir, "evals.json"), "utf8"), "existing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand supports dry-run without writing files", async () => {
  const { root, skillDir } = await createSkillFixture();

  try {
    const result = await createCommand({ skillDir, dryRun: true });

    assert.equal(result.written, false);
    assert.equal(result.evals.evals.length, 3);
    await assert.rejects(() => readFile(path.join(skillDir, "evals", "evals.json")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("createCommand overwrites with force", async () => {
  const { root, skillDir } = await createSkillFixture();
  const evalsDir = path.join(skillDir, "evals");

  try {
    await mkdir(evalsDir, { recursive: true });
    await writeFile(path.join(evalsDir, "evals.json"), "existing", "utf8");

    const result = await createCommand({ skillDir, force: true });
    assert.equal(result.written, true);
    const written = JSON.parse(await readFile(path.join(evalsDir, "evals.json"), "utf8"));
    assert.equal(written.skill_name, "demo-skill");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runCli handles create dry-run", async () => {
  const { root, skillDir } = await createSkillFixture();

  try {
    const result = await runCli(["create", skillDir, "--dry-run"]);

    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.skill_name, "demo-skill");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runCli handles create summary", async () => {
  const { root, skillDir } = await createSkillFixture({
    name: "summary-skill",
    description: "Writes `report.json` for summary testing.",
  });

  try {
    const result = await runCli(["create", skillDir, "--dry-run", "--summary"]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Generated starter eval suite for summary-skill/);
    assert.match(result.stdout, /Cases:\n- trigger-explicit\n- execution-golden-path\n- adjacent-negative/);
    assert.match(result.stdout, /Fixture inputs:[\s\S]*- none inferred yet/);
    assert.match(result.stdout, /Adjacent negative assumption:[\s\S]*- generic adjacent work request/);
    assert.match(result.stdout, /Deterministic assertions:[\s\S]*execution-golden-path: file-exists report\.json/);
    assert.match(result.stdout, /Deterministic assertions:[\s\S]*execution-golden-path: json-valid report\.json/);
    assert.match(result.stdout, /Judge assertions:[\s\S]*trigger-explicit: explicit-trigger-relevance/);
    assert.match(result.stdout, /Dry run only; no files written/);
    await assert.rejects(() => readFile(path.join(skillDir, "evals", "evals.json")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
