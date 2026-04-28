import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildJudgePrompt,
  gradeEvalCase,
  parseJudgeResponse,
} from "../dist/evals/grade.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.resolve(__dirname, "fixtures", "evals-skill-repo");
const ALPHA_SKILL_DIR = path.join(FIXTURE_REPO, "skills", "alpha");

async function makeTempWorkspace() {
  const dir = await mkdtemp(path.join(tmpdir(), "arc-eval-grade-"));
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test("gradeEvalCase resolves every assertion (string + script mixture, all pass)", async () => {
  const ws = await makeTempWorkspace();
  try {
    await writeFile(path.join(ws.dir, "notes.txt"), "TODO: ship it\n", "utf-8");
    await writeFile(path.join(ws.dir, "config.json"), JSON.stringify({ enabled: true }), "utf-8");

    const judgeCalls = [];
    const judge = async (input) => {
      judgeCalls.push(input);
      return {
        results: input.assertions.map((text, i) => ({
          passed: true,
          evidence: `matched #${i}: "${text.slice(0, 20)}"`,
        })),
      };
    };

    const result = await gradeEvalCase({
      case: {
        id: "mixed-1",
        prompt: "noop",
        assertions: [
          "The assistant reports success.",
          { type: "file-exists", path: "notes.txt" },
          { type: "regex-match", pattern: "TODO", target: { file: "notes.txt" } },
          { type: "json-valid", path: "config.json" },
          "The assistant mentions the config file.",
          { type: "regex-match", pattern: "\\bsuccess\\b", flags: "i" },
        ],
      },
      workspaceDir: ws.dir,
      assistantText: "Operation completed with success. See config.json.",
      judge,
    });

    assert.equal(result.case_id, "mixed-1");
    assert.equal(result.assertion_results.length, 6);
    assert.equal(result.summary.passed, 6);
    assert.equal(result.summary.failed, 0);
    assert.equal(result.summary.total, 6);
    assert.equal(result.summary.pass_rate, 1);

    // Order preserved.
    assert.equal(result.assertion_results[0].text, "The assistant reports success.");
    assert.match(result.assertion_results[0].evidence, /matched #0/);

    assert.equal(result.assertion_results[1].text, "file-exists: notes.txt");
    assert.match(result.assertion_results[1].evidence, /Found .*notes\.txt.* bytes/);

    assert.equal(result.assertion_results[2].text, "regex-match: /TODO/ in notes.txt");
    assert.match(result.assertion_results[2].evidence, /Match near:/);

    assert.equal(result.assertion_results[3].text, "json-valid: config.json");
    assert.match(result.assertion_results[3].evidence, /Valid JSON/);

    assert.equal(result.assertion_results[4].text, "The assistant mentions the config file.");
    assert.match(result.assertion_results[4].evidence, /matched #1/);

    assert.equal(
      result.assertion_results[5].text,
      "regex-match: /\\bsuccess\\b/i in assistant-text",
    );

    // Judge was called exactly once, batching the two string assertions.
    assert.equal(judgeCalls.length, 1);
    assert.deepEqual(judgeCalls[0].assertions, [
      "The assistant reports success.",
      "The assistant mentions the config file.",
    ]);
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase supports intent-based output and workspace assertions", async () => {
  const ws = await makeTempWorkspace();
  try {
    await writeFile(path.join(ws.dir, "package.json"), JSON.stringify({ name: "demo" }), "utf-8");

    const result = await gradeEvalCase({
      case: {
        id: "intent-assertions",
        prompt: "noop",
        assertions: [
          {
            id: "package-json-exists",
            kind: "workspace",
            method: "file-exists",
            path: "package.json",
          },
          {
            id: "package-json-valid",
            kind: "workspace",
            method: "json-valid",
            path: "package.json",
          },
          {
            id: "assistant-says-done",
            kind: "output",
            method: "regex",
            pattern: "done",
            flags: "i",
          },
          {
            id: "assistant-summary",
            kind: "output",
            method: "judge",
            prompt: "The assistant summarizes the setup.",
          },
        ],
      },
      workspaceDir: ws.dir,
      assistantText: "Done configuring the repository.",
      judge: async (input) => ({
        results: input.assertions.map(() => ({ passed: true, evidence: '"Done configuring"' })),
      }),
    });

    assert.equal(result.summary.total, 4);
    assert.equal(result.summary.passed, 4);
    assert.equal(result.assertion_results[0].assertion.kind, "workspace");
    assert.equal(result.assertion_results[3].text, "The assistant summarizes the setup.");
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase handles file-exists failure: missing file", async () => {
  const ws = await makeTempWorkspace();
  try {
    const result = await gradeEvalCase({
      case: {
        id: 7,
        prompt: "noop",
        assertions: [{ type: "file-exists", path: "missing.txt" }],
      },
      workspaceDir: ws.dir,
      assistantText: "",
      judge: async () => ({ results: [] }),
    });

    assert.equal(result.case_id, "7");
    assert.equal(result.summary.passed, 0);
    assert.equal(result.summary.failed, 1);
    assert.equal(result.summary.pass_rate, 0);
    assert.equal(result.assertion_results[0].passed, false);
    assert.match(result.assertion_results[0].evidence, /No such file:.*missing\.txt/);
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase handles regex-match failure: no match", async () => {
  const ws = await makeTempWorkspace();
  try {
    await writeFile(path.join(ws.dir, "output.txt"), "nothing relevant here", "utf-8");

    const result = await gradeEvalCase({
      case: {
        id: "no-match",
        prompt: "noop",
        assertions: [
          { type: "regex-match", pattern: "NEVER_APPEARS" },
          { type: "regex-match", pattern: "NEVER_APPEARS", target: { file: "output.txt" } },
        ],
      },
      workspaceDir: ws.dir,
      assistantText: "short assistant reply",
      judge: async () => ({ results: [] }),
    });

    assert.equal(result.summary.passed, 0);
    assert.equal(result.summary.failed, 2);
    assert.equal(result.assertion_results[0].passed, false);
    assert.match(result.assertion_results[0].evidence, /No match in assistant-text/);
    assert.equal(result.assertion_results[1].passed, false);
    assert.match(result.assertion_results[1].evidence, /No match in output\.txt/);
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase handles json-valid failure: invalid JSON", async () => {
  const ws = await makeTempWorkspace();
  try {
    await writeFile(path.join(ws.dir, "broken.json"), "{ not valid json", "utf-8");

    const result = await gradeEvalCase({
      case: {
        id: "bad-json",
        prompt: "noop",
        assertions: [{ type: "json-valid", path: "broken.json" }],
      },
      workspaceDir: ws.dir,
      assistantText: "",
      judge: async () => ({ results: [] }),
    });

    assert.equal(result.summary.passed, 0);
    assert.equal(result.assertion_results[0].passed, false);
    assert.match(result.assertion_results[0].evidence, /^Parse error:/);
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase rejects path-traversal in script assertions", async () => {
  const ws = await makeTempWorkspace();
  try {
    // Create a file one level above the workspace that we'd like to probe.
    const outside = path.join(path.dirname(ws.dir), "escaped.txt");
    await writeFile(outside, "secret", "utf-8");

    const result = await gradeEvalCase({
      case: {
        id: "traversal",
        prompt: "noop",
        assertions: [
          { type: "file-exists", path: "../escaped.txt" },
          {
            type: "regex-match",
            pattern: "secret",
            target: { file: "../escaped.txt" },
          },
          { type: "json-valid", path: "../escaped.txt" },
          { type: "file-exists", path: "/etc/hosts" },
        ],
      },
      workspaceDir: ws.dir,
      assistantText: "",
      judge: async () => ({ results: [] }),
    });

    try {
      assert.equal(result.summary.passed, 0);
      assert.equal(result.summary.failed, 4);
      for (const r of result.assertion_results) {
        assert.equal(r.passed, false);
        assert.equal(r.evidence, "Path escapes workspace");
      }
    } finally {
      await rm(outside, { force: true }).catch(() => undefined);
    }
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase parses judge output into per-assertion results", async () => {
  const ws = await makeTempWorkspace();
  try {
    const judge = async () => ({
      results: [
        { passed: true, evidence: "quote: \"ready\"" },
        { passed: false, evidence: "No file reference found." },
      ],
    });

    const result = await gradeEvalCase({
      case: {
        id: 1,
        prompt: "noop",
        assertions: [
          "Assistant replies with the word 'ready'.",
          "Assistant cites a specific file.",
        ],
      },
      workspaceDir: ws.dir,
      assistantText: "Here is your response: ready",
      judge,
    });

    assert.equal(result.summary.passed, 1);
    assert.equal(result.summary.failed, 1);
    assert.equal(result.assertion_results[0].passed, true);
    assert.equal(result.assertion_results[0].evidence, 'quote: "ready"');
    assert.equal(result.assertion_results[1].passed, false);
    assert.equal(result.assertion_results[1].evidence, "No file reference found.");
    // The raw `assertion` on the result preserves the original string assertion.
    assert.equal(result.assertion_results[0].assertion, "Assistant replies with the word 'ready'.");
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase marks all string assertions failed when judge throws", async () => {
  const ws = await makeTempWorkspace();
  try {
    const judge = async () => {
      throw new Error("Pi timeout");
    };

    const result = await gradeEvalCase({
      case: {
        id: "judge-throw",
        prompt: "noop",
        assertions: ["first claim", "second claim", { type: "file-exists", path: "whatever.txt" }],
      },
      workspaceDir: ws.dir,
      assistantText: "",
      judge,
    });

    assert.equal(result.summary.total, 3);
    // String assertions failed with malformed-output evidence; script
    // assertion failed independently with its own evidence.
    assert.equal(result.assertion_results[0].passed, false);
    assert.equal(result.assertion_results[0].evidence, "Judge returned unparseable output");
    assert.equal(result.assertion_results[1].passed, false);
    assert.equal(result.assertion_results[1].evidence, "Judge returned unparseable output");
    assert.equal(result.assertion_results[2].passed, false);
    assert.match(result.assertion_results[2].evidence, /No such file/);
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase marks string assertions failed when judge returns malformed output", async () => {
  const ws = await makeTempWorkspace();
  try {
    // Wrong-shape judge output: missing 'evidence' on second entry.
    const judge = async () => ({
      results: [{ passed: true, evidence: "ok" }, { passed: true }],
    });

    const result = await gradeEvalCase({
      case: {
        id: "judge-bad-shape",
        prompt: "noop",
        assertions: ["a", "b"],
      },
      workspaceDir: ws.dir,
      assistantText: "",
      judge,
    });

    assert.equal(result.summary.passed, 0);
    assert.equal(result.summary.failed, 2);
    for (const r of result.assertion_results) {
      assert.equal(r.evidence, "Judge returned unparseable output");
    }
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase marks string assertions failed when judge returns wrong-length array", async () => {
  const ws = await makeTempWorkspace();
  try {
    const judge = async () => ({
      results: [{ passed: true, evidence: "only one entry" }],
    });

    const result = await gradeEvalCase({
      case: {
        id: "judge-wrong-length",
        prompt: "noop",
        assertions: ["a", "b", "c"],
      },
      workspaceDir: ws.dir,
      assistantText: "",
      judge,
    });

    assert.equal(result.summary.passed, 0);
    assert.equal(result.summary.failed, 3);
    for (const r of result.assertion_results) {
      assert.equal(r.evidence, "Judge returned unparseable output");
    }
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase returns null pass_rate on empty assertion list", async () => {
  const ws = await makeTempWorkspace();
  try {
    // Judge should never be called when there are no string assertions.
    let judgeCalled = false;
    const judge = async () => {
      judgeCalled = true;
      return { results: [] };
    };

    const emptyArrayResult = await gradeEvalCase({
      case: { id: 42, prompt: "noop", assertions: [] },
      workspaceDir: ws.dir,
      assistantText: "",
      judge,
    });
    assert.deepEqual(emptyArrayResult.summary, {
      passed: 0,
      failed: 0,
      total: 0,
      pass_rate: null,
    });
    assert.equal(emptyArrayResult.assertion_results.length, 0);

    const missingAssertionsResult = await gradeEvalCase({
      case: { id: 43, prompt: "noop" },
      workspaceDir: ws.dir,
      assistantText: "",
      judge,
    });
    assert.deepEqual(missingAssertionsResult.summary, {
      passed: 0,
      failed: 0,
      total: 0,
      pass_rate: null,
    });
    assert.equal(judgeCalled, false);
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase file-exists fails on directory target (not a file)", async () => {
  const ws = await makeTempWorkspace();
  try {
    await mkdir(path.join(ws.dir, "a-dir"), { recursive: true });

    const result = await gradeEvalCase({
      case: {
        id: "dir-check",
        prompt: "noop",
        assertions: [{ type: "file-exists", path: "a-dir" }],
      },
      workspaceDir: ws.dir,
      assistantText: "",
      judge: async () => ({ results: [] }),
    });

    assert.equal(result.assertion_results[0].passed, false);
    assert.match(result.assertion_results[0].evidence, /Not a file/);
  } finally {
    await ws.cleanup();
  }
});

test("gradeEvalCase works against the alpha fixture workspace for file-existing assertions", async () => {
  // Use the fixture repo as a stand-in for a "workspace dir". SKILL.md
  // exists there, so a file-exists on SKILL.md should pass.
  const result = await gradeEvalCase({
    case: {
      id: "alpha-smoke",
      prompt: "noop",
      assertions: [{ type: "file-exists", path: "SKILL.md" }],
    },
    workspaceDir: ALPHA_SKILL_DIR,
    assistantText: "",
    judge: async () => ({ results: [] }),
  });

  assert.equal(result.summary.passed, 1);
  assert.match(result.assertion_results[0].evidence, /Found .*SKILL\.md/);
});

// -----------------------------
// Judge prompt + parser (unit-level coverage for default-judge internals
// that are exercised indirectly via the main tests above).
// -----------------------------

test("buildJudgePrompt lists assertions in order and states the expected output shape", () => {
  const prompt = buildJudgePrompt({
    assistantText: "hi there",
    assertions: ["first", "second"],
  });

  assert.match(prompt, /=== ASSISTANT TEXT ===\nhi there/);
  assert.match(prompt, /1\. first/);
  assert.match(prompt, /2\. second/);
  assert.match(prompt, /exactly 2 entries/);
  assert.match(prompt, /concrete evidence/i);
});

test("parseJudgeResponse accepts bare JSON", () => {
  const raw = '{ "results": [{"passed": true, "evidence": "quote"}] }';
  const out = parseJudgeResponse(raw, 1);
  assert.deepEqual(out.results, [{ passed: true, evidence: "quote" }]);
});

test("parseJudgeResponse accepts fenced JSON", () => {
  const raw = "```json\n{\n  \"results\": [{\"passed\": false, \"evidence\": \"no\"}]\n}\n```";
  const out = parseJudgeResponse(raw, 1);
  assert.deepEqual(out.results, [{ passed: false, evidence: "no" }]);
});

test("parseJudgeResponse extracts the first JSON object when surrounded by prose", () => {
  const raw = 'Here is my answer: {"results":[{"passed":true,"evidence":"ok"}]}. Hope that helps!';
  const out = parseJudgeResponse(raw, 1);
  assert.deepEqual(out.results, [{ passed: true, evidence: "ok" }]);
});

test("parseJudgeResponse returns malformed-fallback on length mismatch", () => {
  const raw = '{"results":[{"passed":true,"evidence":"a"}]}';
  const out = parseJudgeResponse(raw, 2);
  assert.equal(out.results.length, 2);
  for (const r of out.results) {
    assert.equal(r.passed, false);
    assert.equal(r.evidence, "Judge returned unparseable output");
  }
});

test("parseJudgeResponse returns malformed-fallback on garbage input", () => {
  const out = parseJudgeResponse("this is not json at all", 3);
  assert.equal(out.results.length, 3);
  for (const r of out.results) {
    assert.equal(r.passed, false);
    assert.equal(r.evidence, "Judge returned unparseable output");
  }
});
