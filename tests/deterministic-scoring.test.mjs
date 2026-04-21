import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectPiSdkRunnableCases,
  createWorkspaceContext,
  materializeFixture,
  normalizeSkillEvalContract,
  scoreDeterministicCase,
  scoreDeterministicSkill,
} from "../dist/index.js";

const baseSource = {
  kind: "local",
  input: ".",
  repositoryRoot: process.cwd(),
  displayName: "arc-skill-eval",
  resolvedRef: null,
  git: null,
};

test("scoreDeterministicCase preserves soft scores when hard assertions fail", async () => {
  const contract = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 1,
    routing: {
      explicit: [
        {
          id: "routing-explicit-001",
          prompt: "Use alpha explicitly.",
          expected: {
            signals: {
              include: ["target-skill-read"],
            },
            tools: {
              include: ["read"],
            },
          },
          mustPass: [{ type: "no-forbidden-commands", commands: ["git reset --hard"] }],
        },
      ],
      implicitPositive: [],
      adjacentNegative: [],
    },
  });
  const caseDefinition = collectPiSdkRunnableCases(contract)[0];
  const trace = createTrace({
    skill: "alpha",
    profile: contract.profile,
    targetTier: contract.targetTier,
    caseDefinition,
    assistantText: "I used alpha to handle this.",
    toolCalls: [{ toolCallId: "1", toolName: "read" }],
    bashCommands: ["git reset --hard"],
    skillReads: [
      {
        toolCallId: "1",
        path: "skills/alpha/SKILL.md",
        absolutePath: "/tmp/skills/alpha/SKILL.md",
        skillName: "alpha",
      },
    ],
  });

  const result = await scoreDeterministicCase({
    contract,
    caseDefinition,
    trace,
  });

  assert.equal(result.hardPassed, false);
  assert.equal(result.passed, false);
  assert.equal(result.hardAssertions.length, 1);
  assert.equal(result.hardAssertions[0].type, "no-forbidden-commands");
  assert.equal(result.score, 1);
  assert.equal(result.scorePercent, 100);
  assert.equal(result.dimensions.trigger.score, 1);
  assert.equal(result.dimensions.process.score, 1);
});

test("scoreDeterministicCase scores execution files and custom assertions against fixture-backed workspaces", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-score-execution-"));
  const skillDir = path.join(tempRoot, "skills/alpha");
  const fixtureDir = path.join(skillDir, "fixtures/basic");
  const skillFiles = {
    skillName: "alpha",
    skillDir,
    relativeSkillDir: "skills/alpha",
    skillDefinitionPath: path.join(skillDir, "SKILL.md"),
    evalDefinitionPath: path.join(skillDir, "skill.eval.ts"),
  };

  await mkdir(fixtureDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "# Alpha\n", "utf8");
  await writeFile(path.join(skillDir, "skill.eval.ts"), "export default {};\n", "utf8");
  await writeFile(
    path.join(skillDir, "assertions.ts"),
    [
      'import { readFile } from "node:fs/promises";',
      'import path from "node:path";',
      "",
      "export async function hardGuard({ workspaceDir }) {",
      '  const content = await readFile(path.join(workspaceDir, "PLAN.md"), "utf8");',
      '  return { pass: content.includes("## Plan"), message: "PLAN.md exists and looks like a plan." };',
      "}",
      "",
      "export async function softOutcome({ workspaceDir }) {",
      '  const content = await readFile(path.join(workspaceDir, "PLAN.md"), "utf8");',
      '  return { pass: true, score: content.includes("Acceptance Criteria") ? 1 : 0.75, message: "Outcome quality scored from PLAN.md." };',
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(path.join(fixtureDir, "README.md"), "before\n", "utf8");

  const contract = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 1,
    routing: {
      explicit: [],
      implicitPositive: [],
      adjacentNegative: [],
    },
    execution: [
      {
        id: "execution-001",
        prompt: "Create a plan.",
        fixture: {
          kind: "docs",
          source: "./fixtures/basic",
        },
        expected: {
          text: {
            include: ["## Plan"],
          },
          tools: {
            include: ["write"],
          },
          commands: {
            include: ["git status --short"],
          },
          files: {
            include: ["PLAN.md"],
            created: ["PLAN.md"],
            edited: ["README.md"],
          },
        },
        mustPass: [{ type: "custom", ref: "./assertions.ts#hardGuard" }],
        customAssertions: [{ ref: "./assertions.ts#softOutcome" }],
      },
    ],
  });
  const caseDefinition = collectPiSdkRunnableCases(contract)[0];
  const materialized = await materializeFixture({
    skillFiles,
    fixture: contract.execution[0].fixture,
  });

  try {
    assert.deepEqual(materialized.initialSnapshot.files.map((entry) => entry.path), ["README.md"]);

    await writeFile(path.join(materialized.workspaceDir, "README.md"), "after\n", "utf8");
    await writeFile(
      path.join(materialized.workspaceDir, "PLAN.md"),
      "## Plan\n\n### Tasks\n\n### Acceptance Criteria\n",
      "utf8",
    );

    const trace = createTrace({
      source: { ...baseSource, repositoryRoot: tempRoot },
      skill: "alpha",
      profile: contract.profile,
      targetTier: contract.targetTier,
      caseDefinition,
      assistantText: "## Plan\n\n### Tasks",
      toolCalls: [{ toolCallId: "1", toolName: "write" }],
      bashCommands: ["git status --short"],
    });

    const result = await scoreDeterministicCase({
      contract,
      caseDefinition,
      trace,
      skillFiles,
      workspace: createWorkspaceContext({
        workspaceDir: materialized.workspaceDir,
        fixture: materialized,
      }),
    });

    assert.equal(result.hardPassed, true);
    assert.equal(result.passed, true);
    assert.equal(result.dimensions.process.score, 1);
    assert.ok(result.dimensions.outcome.score > 0.9);
    assert.ok(result.score > 0.95);
    assert.equal(result.dimensions.outcome.checks.some((check) => check.code === "files.created"), true);
    assert.equal(result.dimensions.outcome.checks.some((check) => check.code === "files.edited"), true);
    assert.equal(result.dimensions.outcome.checks.some((check) => check.code === "custom.soft"), true);
    assert.equal(result.hardAssertions[0].type, "custom");
  } finally {
    await materialized.cleanup();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("scoreDeterministicSkill aggregates lane thresholds and keeps runtime failures diagnosable", async () => {
  const contract = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 1,
    enforcement: {
      score: "required",
    },
    thresholds: {
      routing: 0.9,
      execution: 0.9,
      overall: 0.8,
    },
    routing: {
      explicit: [
        {
          id: "routing-explicit-001",
          prompt: "Use alpha explicitly.",
        },
      ],
      implicitPositive: [],
      adjacentNegative: [],
    },
    execution: [
      {
        id: "execution-001",
        prompt: "Create a plan.",
        expected: {
          tools: {
            include: ["write"],
          },
          text: {
            include: ["## Plan"],
          },
        },
      },
    ],
  });
  const cases = collectPiSdkRunnableCases(contract);
  const routingCase = cases.find((entry) => entry.caseId === "routing-explicit-001");
  const executionCase = cases.find((entry) => entry.caseId === "execution-001");

  const routingTrace = createTrace({
    skill: "alpha",
    profile: contract.profile,
    targetTier: contract.targetTier,
    caseDefinition: routingCase,
    assistantText: "alpha",
  });
  const executionTrace = createTrace({
    skill: "alpha",
    profile: contract.profile,
    targetTier: contract.targetTier,
    caseDefinition: executionCase,
    assistantText: "No plan here.",
  });

  const result = await scoreDeterministicSkill({
    contract,
    cases: [
      {
        caseDefinition: routingCase,
        trace: routingTrace,
      },
      {
        caseDefinition: executionCase,
        trace: executionTrace,
        executionStatus: "failed",
      },
    ],
  });

  assert.equal(result.cases.length, 2);
  assert.equal(result.cases[1].executionStatus, "failed");
  assert.equal(result.cases[1].passed, false);
  assert.equal(result.cases[1].score, 0);
  assert.equal(result.lanes.routing.score, 1);
  assert.equal(result.lanes.routing.thresholdPassed, true);
  assert.equal(result.lanes.routing.status, "passed");
  assert.equal(result.lanes.execution.score, 0);
  assert.equal(result.lanes.execution.thresholdPassed, false);
  assert.equal(result.lanes.execution.status, "failed");
  assert.equal(result.lanes.overall.score, 0.5);
  assert.equal(result.lanes.overall.scorePercent, 50);
  assert.equal(result.lanes.overall.thresholdPercent, 80);
  assert.equal(result.lanes.overall.status, "failed");
  assert.equal(result.lanes.overall.failedCaseCount, 1);
});

function createTrace({
  source = baseSource,
  skill,
  profile,
  targetTier,
  caseDefinition,
  assistantText,
  toolCalls = [],
  bashCommands = [],
  skillReads = [],
  externalCalls = [],
}) {
  return {
    identity: {
      runtime: "pi-sdk",
      source,
      skill: {
        name: skill,
        relativeSkillDir: `skills/${skill}`,
        profile,
        targetTier,
      },
      case: {
        caseId: caseDefinition.caseId,
        kind: caseDefinition.kind,
        lane: caseDefinition.lane,
        prompt: caseDefinition.prompt,
      },
      model: null,
    },
    timing: {
      startedAt: "2026-04-21T00:00:00.000Z",
      finishedAt: "2026-04-21T00:00:01.000Z",
      durationMs: 1000,
    },
    observations: {
      assistantText,
      toolCalls,
      toolResults: [],
      bashCommands,
      touchedFiles: [],
      writtenFiles: [],
      editedFiles: [],
      skillReads,
      externalCalls,
    },
    raw: {
      sessionId: "session-123",
      sessionFile: undefined,
      messages: [],
      sdkEvents: [],
      telemetryEntries: [],
    },
  };
}
