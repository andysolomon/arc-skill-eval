import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CliCommandError,
  runCli,
  runTestCommand,
  runValidateCommand,
} from "../dist/index.js";

test("runCli supports discovery JSON and validation human output", async () => {
  const repoDir = await createCliFixtureRepo();

  try {
    const listResult = await runCli(["list", repoDir, "--json"]);
    assert.equal(listResult.exitCode, 0);
    assert.equal(listResult.stderr, "");

    const listPayload = JSON.parse(listResult.stdout);
    assert.equal(listPayload.skills.length, 2);
    assert.deepEqual(
      listPayload.skills.map((skill) => skill.skillName),
      ["alpha", "beta"],
    );

    const validateResult = await runCli(["validate", repoDir, "--skill", "beta"]);
    assert.equal(validateResult.exitCode, 1);
    assert.match(validateResult.stdout, /Invalid skills:/);
    assert.match(validateResult.stdout, /beta/);
    assert.match(validateResult.stdout, /routing\.explicit\[0\]\.prompt/);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
  }
});

test("runValidateCommand fails fast on unknown selected skills", async () => {
  const repoDir = await createCliFixtureRepo();

  try {
    await assert.rejects(
      () => runValidateCommand({ input: repoDir, skillNames: ["missing"] }),
      (error) => {
        assert.equal(error instanceof CliCommandError, true);
        assert.match(error.message, /Unknown skill name/);
        return true;
      },
    );
  } finally {
    await rm(repoDir, { recursive: true, force: true });
  }
});

test("runTestCommand writes reports, includes invalid skills, live-smoke cases, and parity cases", async () => {
  const repoDir = await createCliFixtureRepo();
  const outputDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-cli-output-"));

  try {
    const result = await runTestCommand({
      input: repoDir,
      includeLiveSmoke: true,
      html: true,
      outputDir,
      runId: "cli-run-001",
      generatedAt: "2026-04-21T12:00:00.000Z",
      createSession: async (options) => ({
        model: options.requestedModel ?? null,
        session: createFakeSession(options.caseDefinition.caseId),
      }),
      invokePiCli: async (options) => createFakeCliInvocation(options.argv.at(-1)),
    });

    assert.equal(result.report.runId, "cli-run-001");
    assert.equal(result.report.status, "failed");
    assert.equal(result.report.invalidSkills.length, 1);
    assert.equal(result.report.skills.length, 1);
    assert.equal(result.report.skills[0].cases.length, 2);
    assert.equal(result.report.skills[0].unscoredCases.length, 1);
    assert.equal(result.report.skills[0].parityCases.length, 1);
    assert.equal(result.report.summary.caseCount, 2);
    assert.equal(result.report.summary.unscoredCaseCount, 1);
    assert.equal(result.report.summary.parityCaseCount, 1);
    assert.equal(result.report.summary.executedCaseCount, 4);
    assert.equal(result.report.skills[0].unscoredCases[0].caseId, "live-smoke-001");
    assert.equal(result.report.skills[0].unscoredCases[0].status, "passed");
    assert.equal(result.report.skills[0].cases[1].executionStatus, "failed");
    assert.equal(result.report.skills[0].parityCases[0].comparisonStatus, "matched");
    assert.equal(result.report.skills[0].parityCases[0].sdkTraceRef, "alpha::cli-parity-001::sdk");
    assert.equal(result.report.skills[0].parityCases[0].cliTraceRef, "alpha::cli-parity-001::cli");
    assert.equal(result.report.runIssues.some((issue) => issue.code === "cli.case-run-failed"), true);

    const jsonReport = JSON.parse(await readFile(result.artifacts.jsonReportPath, "utf8"));
    const htmlReport = await readFile(result.artifacts.htmlReportPath, "utf8");

    assert.equal(jsonReport.runId, "cli-run-001");
    assert.equal(jsonReport.skills[0].unscoredCases[0].reason, "not-deterministically-scored");
    assert.equal(jsonReport.skills[0].parityCases[0].comparisonStatus, "matched");
    assert.match(htmlReport, /Unscored cases/);
    assert.match(htmlReport, /live-smoke-001/);
    assert.match(htmlReport, /Parity cases/);
    assert.match(htmlReport, /cli-parity-001/);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  }
});

async function createCliFixtureRepo() {
  const repoDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-cli-fixture-"));
  const alphaDir = path.join(repoDir, "skills/alpha");
  const betaDir = path.join(repoDir, "skills/beta");

  await mkdir(alphaDir, { recursive: true });
  await mkdir(betaDir, { recursive: true });
  await writeFile(path.join(alphaDir, "SKILL.md"), "# Alpha\n", "utf8");
  await writeFile(path.join(betaDir, "SKILL.md"), "# Beta\n", "utf8");
  await writeFile(
    path.join(alphaDir, "skill.eval.ts"),
    `export default {
  skill: "alpha",
  profile: "planning",
  targetTier: 1,
  routing: {
    explicit: [{ id: "routing-explicit-001", prompt: "Use alpha explicitly." }],
    implicitPositive: [],
    adjacentNegative: [],
  },
  execution: [{
    id: "execution-001",
    prompt: "Create a plan.",
    expected: {
      text: { include: ["## Plan"] },
    },
  }],
  cliParity: [{
    id: "cli-parity-001",
    prompt: "Run the CLI parity case.",
  }],
  liveSmoke: [{
    id: "live-smoke-001",
    prompt: "Run the live smoke case.",
    envRequired: ["API_TOKEN"],
  }],
};
`,
    "utf8",
  );
  await writeFile(
    path.join(betaDir, "skill.eval.ts"),
    `export default {
  skill: "beta",
  profile: "planning",
  targetTier: 1,
  routing: {
    explicit: [{ id: "routing-explicit-001" }],
    implicitPositive: [],
    adjacentNegative: [],
  },
};
`,
    "utf8",
  );

  return repoDir;
}

function createFakeSession(caseId) {
  const messages = [];
  let listener = () => {};

  return {
    sessionId: `session-${caseId}`,
    sessionFile: undefined,
    messages,
    subscribe(nextListener) {
      listener = nextListener;
      return () => {
        listener = () => {};
      };
    },
    async prompt() {
      if (caseId === "routing-explicit-001") {
        messages.push({ role: "assistant", content: "alpha" });
        listener({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: "alpha",
          },
        });
        return;
      }

      if (caseId === "cli-parity-001") {
        messages.push({ role: "assistant", content: "PARITY_OK" });
        listener({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: "PARITY_OK",
          },
        });
        return;
      }

      if (caseId === "live-smoke-001") {
        messages.push({ role: "assistant", content: "SMOKE_OK" });
        listener({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: "SMOKE_OK",
          },
        });
        return;
      }

      throw new Error("synthetic execution failure");
    },
    dispose() {},
  };
}

function createFakeCliInvocation(prompt) {
  if (prompt !== "Run the CLI parity case.") {
    return {
      stdout: "",
      stderr: `Unexpected CLI parity prompt: ${prompt}`,
      exitCode: 1,
    };
  }

  return {
    stdout: [
      JSON.stringify({ type: "session", id: "cli-session-123" }),
      JSON.stringify({
        type: "message_update",
        assistantMessageEvent: {
          type: "text_delta",
          delta: "PARITY_OK",
        },
      }),
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "PARITY_OK" }],
        },
      }),
    ].join("\n"),
    stderr: "",
    exitCode: 0,
  };
}
