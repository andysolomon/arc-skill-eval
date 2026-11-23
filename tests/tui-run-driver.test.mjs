import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import * as path from "node:path";
import { tmpdir } from "node:os";

import { makeCaseDone, runInProcess } from "../dist/tui/run-driver.js";

// Point Pi at an empty agent dir so these runs never read the developer's
// ~/.pi/agent. A personal default model the bundled catalog does not know
// would otherwise fail the run before discovery and change the error.
let emptyAgentDir;
let previousAgentDir;
test.before(async () => {
  emptyAgentDir = await mkdtemp(path.join(tmpdir(), "arc-tui-run-driver-agent-"));
  previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = emptyAgentDir;
});
test.after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await rm(emptyAgentDir, { recursive: true, force: true });
});

// W-000033 scenario "No dry-run available for missing runtime": a run that
// cannot even start (missing skill dir here; a preflight/model failure behaves
// identically — runEvalsCommand throws) must surface an error event and
// resolve, never reject, so the TUI returns to browse instead of crashing.
test("runInProcess surfaces a failed run as an error event, never a rejection", async () => {
  const events = [];
  const missingDir = path.join(tmpdir(), "arc-no-such-skill-dir");

  await runInProcess({ skillDir: missingDir, caseId: "fresh-case", compare: false }, (ev) => events.push(ev));

  const init = events.find((ev) => ev.type === "init");
  assert.ok(init, "an init event seeds the console");
  // evals.json is unreadable, so the seed falls back to the requested case id —
  // the dry-run console still names the case it was scoped to.
  assert.deepEqual(init.cases.map((c) => c.id), ["fresh-case"]);

  const error = events.find((ev) => ev.type === "error");
  assert.ok(error, "the failure must arrive as an error event");
  assert.match(error.message, /--case fresh-case/, "zero-case runs name the case filter that matched nothing");
  assert.ok(!events.some((ev) => ev.type === "done"), "a failed run never reports done");
});

// A run that throws before executing (unsupported flag here; a preflight /
// model-resolution failure takes the same catch path) also resolves with an
// error event instead of rejecting.
test("runInProcess turns a thrown run failure into an error event", async () => {
  const events = [];
  await runInProcess(
    { skillDir: path.join(tmpdir(), "arc-no-such-skill-dir"), caseId: null, compare: false, extraArgs: "--bogus flag" },
    (ev) => events.push(ev),
  );
  const error = events.find((ev) => ev.type === "error");
  assert.ok(error, "thrown failures surface as error events");
  assert.match(error.message, /Unsupported in-TUI run flag/);
  assert.ok(!events.some((ev) => ev.type === "done"));
});

// Esc in the run console aborts the run's signal. Ways this can fail, written
// before the code:
//   1. The driver never hands the signal to runEvalsCommand, so the case keeps
//      running (and spending tokens) and the promise waits for the model.
//   2. The abort arrives as an `error` event, so the console shows a failed
//      run instead of a cancelled one.
//   3. The abort is recorded as a case error and the run moves on to the next
//      case.
//   4. The model request stays open after the abort.
// The provider below accepts each request and never answers, so only the
// abort can end the run.
async function startHangingProvider() {
  const requests = [];
  const server = createServer((req, res) => {
    const entry = { closed: false };
    requests.push(entry);
    res.on("close", () => { entry.closed = true; });
    req.resume();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }),
  };
}

test("aborting the signal stops the in-flight case and ends with a cancelled event", async () => {
  const provider = await startHangingProvider();
  const root = await mkdtemp(path.join(tmpdir(), "arc-tui-cancel-"));
  const agentDir = path.join(root, "agent");
  const skillDir = path.join(root, "skills", "hangs");
  const previousKey = process.env.ARC_TUI_FAKE_KEY;
  try {
    await mkdir(agentDir, { recursive: true });
    await mkdir(path.join(skillDir, "evals"), { recursive: true });
    await writeFile(path.join(agentDir, "models.json"), JSON.stringify({
      providers: {
        "fake-llm": {
          baseUrl: provider.baseUrl,
          api: "openai-completions",
          apiKey: "$ARC_TUI_FAKE_KEY",
          authHeader: true,
          models: [{ id: "fake-1", contextWindow: 32000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
        },
      },
    }));
    await writeFile(path.join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "fake-llm", defaultModel: "fake-1" }));
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: hangs\ndescription: Waits.\n---\n\nReply ready.\n");
    await writeFile(path.join(skillDir, "evals", "evals.json"), JSON.stringify({
      skill_name: "hangs",
      evals: [
        { id: "first", prompt: "Ready?", assertions: [{ type: "regex-match", pattern: "ready" }] },
        { id: "second", prompt: "Ready now?", assertions: [{ type: "regex-match", pattern: "ready" }] },
      ],
    }));
    process.env.ARC_TUI_FAKE_KEY = "fake-secret";

    const events = [];
    const ac = new AbortController();
    const run = runInProcess(
      { skillDir, caseId: null, compare: false, extraArgs: `--agent-dir ${agentDir}` },
      (ev) => {
        events.push(ev);
      },
      ac.signal,
    );

    const deadline = Date.now() + 10_000;
    while (provider.requests.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    assert.equal(provider.requests.length, 1, "the first case reached the model");

    ac.abort();
    let timer;
    const settled = await Promise.race([
      run.then(() => "settled"),
      new Promise((r) => { timer = setTimeout(() => r("timeout"), 10_000); }),
    ]);
    clearTimeout(timer);
    assert.equal(settled, "settled", "the run settles soon after the abort");

    assert.equal(events.at(-1)?.type, "cancelled", "the run ends with a cancelled event");
    assert.ok(!events.some((ev) => ev.type === "error" || ev.type === "done"), "a cancelled run reports neither error nor done");
    assert.ok(!events.some((ev) => ev.type === "case-start" && ev.id === "second"), "the next case never starts");
    assert.ok(!events.some((ev) => ev.type === "case-done" && ev.errored), "the abort is not recorded as a case error");
    assert.equal(provider.requests.length, 1, "no further model requests after the abort");
    assert.ok(provider.requests[0].closed, "the in-flight model request was closed");
  } finally {
    if (previousKey === undefined) delete process.env.ARC_TUI_FAKE_KEY;
    else process.env.ARC_TUI_FAKE_KEY = previousKey;
    await provider.close();
    await rm(root, { recursive: true, force: true });
  }
});

// W-000042: errored cases arrive as a case-done carrying an error message with
// assertTotal 0 (the onProgress hook emits through makeCaseDone). The driver
// flags them at emit time so the console reducer stays simple.
test("makeCaseDone flags a message with zero assertions as errored", () => {
  const errored = makeCaseDone({ id: "boom-case", phase: "fail", assertPass: 0, assertTotal: 0, message: "runner exploded" });
  assert.equal(errored.type, "case-done");
  assert.equal(errored.errored, true, "message + assertTotal 0 is exactly the errored-case shape");
  assert.equal(errored.message, "runner exploded", "the message survives for the console to render");

  const passed = makeCaseDone({ id: "ok-case", phase: "pass", assertPass: 2, assertTotal: 2 });
  assert.ok(!passed.errored, "a normal verdict is not errored");

  const failedWithMessage = makeCaseDone({ id: "flaky-case", phase: "fail", assertPass: 1, assertTotal: 3, message: "judge said no" });
  assert.ok(!failedWithMessage.errored, "a real fail with assertions stays a fail even when it carries a message");
});
