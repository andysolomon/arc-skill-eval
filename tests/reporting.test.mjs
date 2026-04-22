import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildJsonReport,
  collectPiSdkRunnableCases,
  normalizeSkillEvalContract,
  renderHtmlReport,
  scoreDeterministicSkill,
  writeHtmlReport,
  writeJsonReport,
} from "../dist/index.js";

const baseSource = {
  kind: "local",
  input: ".",
  repositoryRoot: process.cwd(),
  displayName: "arc-skill-eval",
  resolvedRef: null,
  git: null,
};

test("buildJsonReport emits invocation-wide JSON with shared traces, parity cases, and placeholders", async () => {
  const contract = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 1,
    thresholds: {
      overall: 0.9,
      routing: 0.9,
      execution: 0.9,
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
          text: {
            include: ["## Plan"],
          },
        },
      },
    ],
    cliParity: [
      {
        id: "cli-parity-001",
        prompt: "Plan the work through the shipped CLI.",
      },
    ],
  });
  const cases = collectPiSdkRunnableCases(contract);
  const routingCase = cases.find((entry) => entry.caseId === "routing-explicit-001");
  const executionCase = cases.find((entry) => entry.caseId === "execution-001");
  const parityCase = cases.find((entry) => entry.caseId === "cli-parity-001");
  const routingTrace = createTrace({
    skill: "alpha",
    profile: contract.profile,
    targetTier: contract.targetTier,
    caseDefinition: routingCase,
    assistantText: "alpha",
    skillReads: [
      {
        toolCallId: "1",
        path: "skills/alpha/SKILL.md",
        absolutePath: "/tmp/skills/alpha/SKILL.md",
        skillName: "alpha",
      },
    ],
    model: {
      provider: "openai-codex",
      id: "gpt-5.4-mini",
      thinking: "minimal",
    },
  });
  const executionTrace = createTrace({
    skill: "alpha",
    profile: contract.profile,
    targetTier: contract.targetTier,
    caseDefinition: executionCase,
    assistantText: "## Plan",
    model: {
      provider: "openai-codex",
      id: "gpt-5.4-mini",
      thinking: "minimal",
    },
    raw: {
      messages: [{ role: "assistant", content: "## Plan" }],
      runtimeEvents: [{ type: "assistant-message" }],
      telemetryEntries: [{ kind: "tool-call" }],
    },
  });
  const paritySdkTrace = createTrace({
    skill: "alpha",
    profile: contract.profile,
    targetTier: contract.targetTier,
    caseDefinition: parityCase,
    assistantText: "PARITY_OK",
    model: {
      provider: "openai-codex",
      id: "gpt-5.4-mini",
      thinking: "minimal",
    },
  });
  const parityCliTrace = createTrace({
    runtime: "pi-cli-json",
    skill: "alpha",
    profile: contract.profile,
    targetTier: contract.targetTier,
    caseDefinition: parityCase,
    assistantText: "PARITY_OK",
    model: {
      provider: "openai-codex",
      id: "gpt-5.4-mini",
      thinking: "minimal",
    },
  });

  const score = await scoreDeterministicSkill({
    contract,
    cases: [
      {
        caseDefinition: routingCase,
        trace: routingTrace,
      },
      {
        caseDefinition: executionCase,
        trace: executionTrace,
      },
    ],
  });

  const report = buildJsonReport({
    source: baseSource,
    generatedAt: "2026-04-21T12:00:00.000Z",
    runId: "run-123",
    frameworkVersion: "0.1.0",
    skills: [
      {
        files: {
          skillName: "alpha",
          skillDir: "/tmp/skills/alpha",
          relativeSkillDir: "skills/alpha",
          skillDefinitionPath: "/tmp/skills/alpha/SKILL.md",
          evalDefinitionPath: "/tmp/skills/alpha/skill.eval.ts",
        },
        score,
        traces: [routingTrace, executionTrace, paritySdkTrace, parityCliTrace],
        parityCases: [
          {
            caseId: "cli-parity-001",
            sdkTrace: paritySdkTrace,
            cliTrace: parityCliTrace,
            sdkExecutionStatus: "completed",
            cliExecutionStatus: "completed",
            comparisonStatus: "matched",
            mismatches: [],
          },
        ],
      },
    ],
    invalidSkills: [
      {
        files: {
          skillName: "beta",
          skillDir: "/tmp/skills/beta",
          relativeSkillDir: "skills/beta",
          skillDefinitionPath: "/tmp/skills/beta/SKILL.md",
          evalDefinitionPath: "/tmp/skills/beta/skill.eval.ts",
        },
        issues: [
          {
            path: "routing.explicit[0].prompt",
            code: "required",
            message: "prompt is required",
          },
        ],
      },
    ],
  });

  assert.equal(report.reportVersion, "1");
  assert.equal(report.runId, "run-123");
  assert.equal(report.framework.version, "0.1.0");
  assert.equal(report.status, "warn");
  assert.equal(report.summary.discoveredSkillCount, 2);
  assert.equal(report.summary.validSkillCount, 1);
  assert.equal(report.summary.invalidSkillCount, 1);
  assert.equal(report.summary.caseCount, 2);
  assert.equal(report.summary.passedCaseCount, 2);
  assert.equal(report.summary.failedCaseCount, 0);
  assert.equal(report.summary.parityCaseCount, 1);
  assert.equal(report.summary.passedParityCaseCount, 1);
  assert.equal(report.summary.failedParityCaseCount, 0);
  assert.equal(report.summary.executedCaseCount, 3);
  assert.equal(report.skills.length, 1);
  assert.equal(report.invalidSkills.length, 1);
  assert.equal(report.traces.length, 4);
  assert.equal(report.skills[0].status, "passed");
  assert.equal(report.skills[0].tier.status, "not_computed");
  assert.equal(report.skills[0].baseline.status, "not_configured");
  assert.deepEqual(report.skills[0].models, [
    {
      provider: "openai-codex",
      id: "gpt-5.4-mini",
      thinking: "minimal",
    },
  ]);
  assert.equal(report.skills[0].cases[0].traceRef, "alpha::routing-explicit-001");
  assert.equal(report.skills[0].cases[0].trialStats.trialCount, 1);
  assert.equal(report.skills[0].cases[1].model.id, "gpt-5.4-mini");
  assert.equal(report.skills[0].parityCases[0].sdkTraceRef, "alpha::cli-parity-001::sdk");
  assert.equal(report.skills[0].parityCases[0].cliTraceRef, "alpha::cli-parity-001::cli");
  assert.equal(report.skills[0].parityCases[0].comparisonStatus, "matched");
  assert.equal(report.traces[3].traceId, "alpha::cli-parity-001::cli");
  assert.equal(report.traces[1].raw.runtimeEventCount, 1);
  assert.equal(report.traces[1].raw.telemetryEntryCount, 1);
  assert.equal(report.traces[1].raw.hasTelemetryEntries, true);
});

test("renderHtmlReport and write helpers produce stable report artifacts including parity diagnostics", async () => {
  const contract = normalizeSkillEvalContract({
    skill: "alpha",
    profile: "planning",
    targetTier: 1,
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
    cliParity: [
      {
        id: "cli-parity-001",
        prompt: "Plan the work through the shipped CLI.",
      },
    ],
  });
  const cases = collectPiSdkRunnableCases(contract);
  const caseDefinition = cases.find((entry) => entry.caseId === "routing-explicit-001");
  const parityCase = cases.find((entry) => entry.caseId === "cli-parity-001");
  const trace = createTrace({
    skill: "alpha",
    profile: contract.profile,
    targetTier: contract.targetTier,
    caseDefinition,
    assistantText: "alpha",
    skillReads: [
      {
        toolCallId: "1",
        path: "skills/alpha/SKILL.md",
        absolutePath: "/tmp/skills/alpha/SKILL.md",
        skillName: "alpha",
      },
    ],
  });
  const paritySdkTrace = createTrace({
    skill: "alpha",
    profile: contract.profile,
    targetTier: contract.targetTier,
    caseDefinition: parityCase,
    assistantText: "PARITY_OK",
  });
  const parityCliTrace = createTrace({
    runtime: "pi-cli-json",
    skill: "alpha",
    profile: contract.profile,
    targetTier: contract.targetTier,
    caseDefinition: parityCase,
    assistantText: "PARITY_DIFFERENT",
  });
  const score = await scoreDeterministicSkill({
    contract,
    cases: [
      {
        caseDefinition,
        trace,
      },
    ],
  });
  const report = buildJsonReport({
    source: baseSource,
    generatedAt: "2026-04-21T12:00:00.000Z",
    runId: "run-html",
    skills: [
      {
        files: {
          skillName: "alpha",
          skillDir: "/tmp/skills/alpha",
          relativeSkillDir: "skills/alpha",
          skillDefinitionPath: "/tmp/skills/alpha/SKILL.md",
          evalDefinitionPath: "/tmp/skills/alpha/skill.eval.ts",
        },
        score,
        traces: [trace, paritySdkTrace, parityCliTrace],
        parityCases: [
          {
            caseId: "cli-parity-001",
            sdkTrace: paritySdkTrace,
            cliTrace: parityCliTrace,
            sdkExecutionStatus: "completed",
            cliExecutionStatus: "completed",
            comparisonStatus: "mismatched",
            mismatches: [
              {
                path: "observations.assistantText",
                message: "Mismatch at observations.assistantText.",
                expected: "PARITY_OK",
                actual: "PARITY_DIFFERENT",
              },
            ],
          },
        ],
      },
    ],
    runIssues: [
      {
        code: "report.notice",
        severity: "warn",
        message: "Example warning",
      },
    ],
  });

  const html = renderHtmlReport(report);
  assert.match(html, /arc-skill-eval report/);
  assert.match(html, /run-html/);
  assert.match(html, /alpha::routing-explicit-001/);
  assert.match(html, /Example warning/);
  assert.match(html, /Parity cases/);
  assert.match(html, /observations\.assistantText/);

  const outputDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-report-"));

  try {
    const jsonPath = await writeJsonReport(report, path.join(outputDir, "report.json"));
    const htmlPath = await writeHtmlReport(report, path.join(outputDir, "report.html"));
    const jsonContent = await readFile(jsonPath, "utf8");
    const htmlContent = await readFile(htmlPath, "utf8");

    assert.match(jsonContent, /"reportVersion": "1"/);
    assert.match(jsonContent, /"runId": "run-html"/);
    assert.match(jsonContent, /"comparisonStatus": "mismatched"/);
    assert.match(htmlContent, /<!doctype html>/i);
    assert.match(htmlContent, /alpha::routing-explicit-001/);
    assert.match(htmlContent, /PARITY_DIFFERENT/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

function createTrace({
  source = baseSource,
  runtime = "pi-sdk",
  skill,
  profile,
  targetTier,
  caseDefinition,
  assistantText,
  model = null,
  skillReads = [],
  raw = {
    messages: [],
    runtimeEvents: [],
    telemetryEntries: [],
  },
}) {
  return {
    identity: {
      runtime,
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
      model,
    },
    timing: {
      startedAt: "2026-04-21T00:00:00.000Z",
      finishedAt: "2026-04-21T00:00:01.000Z",
      durationMs: 1000,
    },
    observations: {
      assistantText,
      toolCalls: [],
      toolResults: [],
      bashCommands: [],
      touchedFiles: [],
      writtenFiles: [],
      editedFiles: [],
      skillReads,
      externalCalls: [],
    },
    raw: {
      sessionId: "session-123",
      sessionFile: "/tmp/session.jsonl",
      messages: raw.messages,
      runtimeEvents: raw.runtimeEvents,
      telemetryEntries: raw.telemetryEntries,
    },
  };
}
