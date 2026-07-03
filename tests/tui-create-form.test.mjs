import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { render } from "ink-testing-library";
import { createElement } from "react";

import { CreateForm, parseModelInput } from "../dist/tui/CreateForm.js";

const sleep = (n) => new Promise((r) => setTimeout(r, n));
const waitFor = async (pred, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await sleep(10);
  }
  return false;
};

const exists = (p) => access(p).then(() => true, () => false);

const SKILL_MD = `---
name: demo-skill
description: Demonstrates guided create in tests.
---

# Demo skill
`;

const stubDesigner = async () => ({
  evals: {
    version: "1",
    skill_name: "demo-skill",
    evals: [
      { id: "proposed-one", description: "first proposed case", prompt: "p1", expected_output: "e1", assertions: [{ type: "file-exists", path: "a.md" }] },
      { id: "proposed-two", description: "second proposed case", prompt: "p2", expected_output: "e2", assertions: ["Judged claim."] },
    ],
  },
  fixtureInputs: [],
  rationale: ["covers the golden path"],
});

async function makeSkillDir() {
  const skillDir = await mkdtemp(path.join(tmpdir(), "arc-create-form-"));
  await writeFile(path.join(skillDir, "SKILL.md"), SKILL_MD, "utf8");
  return skillDir;
}

function renderForm(skillDir, { designer = stubDesigner, hasSuite = false, onClose = () => {}, recentModels } = {}) {
  return render(createElement(CreateForm, { skillDir, skillName: "demo-skill", hasSuite, onClose, designer, recentModels }));
}

test("accepting a reviewed proposal writes evals.json and closes with the path", async () => {
  const skillDir = await makeSkillDir();
  const closes = [];
  const { lastFrame, stdin, unmount } = renderForm(skillDir, { onClose: (msg) => closes.push(msg) });

  await waitFor(() => /Create eval suite/.test(lastFrame() ?? ""));
  await sleep(150); // let ink's useInput subscribe
  stdin.write("g");
  assert.ok(await waitFor(() => /Proposal/.test(lastFrame() ?? "")), "review phase should show the proposal");
  assert.match(lastFrame() ?? "", /proposed-one/);
  assert.match(lastFrame() ?? "", /proposed-two/);
  assert.match(lastFrame() ?? "", /covers the golden path/);
  assert.equal(await exists(path.join(skillDir, "evals", "evals.json")), false, "nothing written during review");

  await sleep(120);
  stdin.write("\r"); // accept
  assert.ok(await waitFor(() => closes.length === 1), "accept should close the form");
  assert.match(closes[0], /wrote .*evals\.json \(2 cases\)/);
  assert.equal(await exists(path.join(skillDir, "evals", "evals.json")), true);
  unmount();
});

test("rejecting the proposal writes nothing", async () => {
  const skillDir = await makeSkillDir();
  const closes = [];
  const { lastFrame, stdin, unmount } = renderForm(skillDir, { onClose: (msg) => closes.push(msg) });

  await waitFor(() => /Create eval suite/.test(lastFrame() ?? ""));
  await sleep(150);
  stdin.write("g");
  assert.ok(await waitFor(() => /Proposal/.test(lastFrame() ?? "")));
  await sleep(120);
  stdin.write("\u001b"); // esc = reject
  assert.ok(await waitFor(() => closes.length === 1));
  assert.match(closes[0], /rejected .*nothing written/);
  assert.equal(await exists(path.join(skillDir, "evals", "evals.json")), false);
  unmount();
});

test("a designer failure renders a dismissible error panel instead of crashing", async () => {
  const skillDir = await makeSkillDir();
  const closes = [];
  const { lastFrame, stdin, unmount } = renderForm(skillDir, {
    designer: async () => { throw new Error("model unavailable: pass --model"); },
    onClose: (msg) => closes.push(msg),
  });

  await waitFor(() => /Create eval suite/.test(lastFrame() ?? ""));
  await sleep(150);
  stdin.write("g");
  assert.ok(await waitFor(() => /model unavailable/.test(lastFrame() ?? "")), "error panel should show the designer failure");
  await sleep(120);
  stdin.write("\u001b"); // esc dismisses
  assert.ok(await waitFor(() => closes.length === 1));
  unmount();
});

test("parseModelInput follows the run CLI's --model rules", () => {
  assert.deepEqual(parseModelInput("anthropic/claude-haiku-4-5"), { provider: "anthropic", id: "claude-haiku-4-5" });
  assert.deepEqual(parseModelInput("anthropic/claude-opus-4:high"), { provider: "anthropic", id: "claude-opus-4", thinking: "high" });
  // an unknown :suffix stays part of the model id — mirrors run-driver's parseModel
  assert.deepEqual(parseModelInput("openai/gpt-5:turbo"), { provider: "openai", id: "gpt-5:turbo" });
  assert.throws(() => parseModelInput("no-slash"), /Invalid model/);
  assert.throws(() => parseModelInput("provider/"), /Invalid model/);
  assert.throws(() => parseModelInput("anthropic/:high"), /Invalid model/);
});

test("m sets a designer model shown in confirm and the generating line", async () => {
  const skillDir = await makeSkillDir();
  let release;
  const gate = new Promise((r) => { release = r; });
  const slowDesigner = async () => { await gate; return stubDesigner(); };
  const { lastFrame, stdin, unmount } = renderForm(skillDir, { designer: slowDesigner });

  try {
    await waitFor(() => /Create eval suite/.test(lastFrame() ?? ""));
    await sleep(150);
    stdin.write("m");
    assert.ok(await waitFor(() => /Designer model/.test(lastFrame() ?? "")), "model entry line should open");
    await sleep(120);
    stdin.write("anthropic/claude-haiku-4-5");
    await sleep(120);
    stdin.write("\r"); // submit the model line
    assert.ok(await waitFor(() => /model: anthropic\/claude-haiku-4-5/.test(lastFrame() ?? "")), "confirm should show the chosen model");
    await sleep(120);
    stdin.write("g");
    // The 72-col box can wrap this line, so match the two pieces separately.
    assert.ok(
      await waitFor(() => /designing eval suite/.test(lastFrame() ?? "") && /\(anthropic\/claude-haiku-4-5\)/.test(lastFrame() ?? "")),
      "generating line should show the model label",
    );
    release();
    assert.ok(await waitFor(() => /Proposal/.test(lastFrame() ?? "")));
  } finally {
    release(); // a failed assert must not leave the gate pending and hang the runner
    unmount();
  }
});

test("the model entry prefills with the first recent model", async () => {
  const skillDir = await makeSkillDir();
  const { lastFrame, stdin, unmount } = renderForm(skillDir, { recentModels: ["openai/gpt-5:high", "anthropic/claude-haiku-4-5"] });

  await waitFor(() => /Create eval suite/.test(lastFrame() ?? ""));
  await sleep(150);
  stdin.write("m");
  assert.ok(await waitFor(() => /openai\/gpt-5:high/.test(lastFrame() ?? "")), "entry should prefill with the first recent model");
  await sleep(120);
  stdin.write("\r"); // accept the prefill as-is
  assert.ok(await waitFor(() => /model: openai\/gpt-5:high/.test(lastFrame() ?? "")));
  unmount();
});

test("an invalid model shows an inline error and generation does not start", async () => {
  const skillDir = await makeSkillDir();
  let designerCalls = 0;
  const countingDesigner = async () => { designerCalls += 1; return stubDesigner(); };
  const { lastFrame, stdin, unmount } = renderForm(skillDir, { designer: countingDesigner });

  await waitFor(() => /Create eval suite/.test(lastFrame() ?? ""));
  await sleep(150);
  stdin.write("m");
  assert.ok(await waitFor(() => /Designer model/.test(lastFrame() ?? "")));
  await sleep(120);
  stdin.write("not-a-model");
  await sleep(120);
  stdin.write("\r");
  assert.ok(await waitFor(() => /Invalid model: not-a-model/.test(lastFrame() ?? "")), "inline error should render");
  assert.match(lastFrame() ?? "", /Designer model/); // still in the entry line
  assert.doesNotMatch(lastFrame() ?? "", /designing eval suite/);
  assert.equal(designerCalls, 0, "generation must not start on invalid input");
  await sleep(120);
  stdin.write("\u001b"); // ESC back to confirm without a model
  assert.ok(await waitFor(() => /deterministic starter/.test(lastFrame() ?? "")));
  assert.doesNotMatch(lastFrame() ?? "", /model: /);
  unmount();
});

test("space excludes the selected case and accept writes only included cases", async () => {
  const skillDir = await makeSkillDir();
  const closes = [];
  const { lastFrame, stdin, unmount } = renderForm(skillDir, { onClose: (msg) => closes.push(msg) });

  await waitFor(() => /Create eval suite/.test(lastFrame() ?? ""));
  await sleep(150);
  stdin.write("g");
  assert.ok(await waitFor(() => /Proposal/.test(lastFrame() ?? "")));
  await sleep(120);
  stdin.write(" "); // exclude proposed-one (cursor starts on the first case)
  assert.ok(await waitFor(() => /\(1\/2 cases\)/.test(lastFrame() ?? "")), "accept hint should count included cases");
  await sleep(120);
  stdin.write("\r"); // accept
  assert.ok(await waitFor(() => closes.length === 1), "accept should close the form");
  assert.match(closes[0], /wrote .*evals\.json \(1 cases\)/);
  const written = JSON.parse(await readFile(path.join(skillDir, "evals", "evals.json"), "utf8"));
  assert.deepEqual(written.evals.map((c) => c.id), ["proposed-two"]);
  unmount();
});

test("excluding every case blocks accept with an inline message and writes nothing", async () => {
  const skillDir = await makeSkillDir();
  const closes = [];
  const { lastFrame, stdin, unmount } = renderForm(skillDir, { onClose: (msg) => closes.push(msg) });

  await waitFor(() => /Create eval suite/.test(lastFrame() ?? ""));
  await sleep(150);
  stdin.write("g");
  assert.ok(await waitFor(() => /Proposal/.test(lastFrame() ?? "")));
  await sleep(120);
  stdin.write(" "); // exclude proposed-one
  await sleep(120);
  stdin.write("\u001b[B"); // down arrow to proposed-two
  await sleep(120);
  stdin.write(" "); // exclude proposed-two
  assert.ok(await waitFor(() => /\(0\/2 cases\)/.test(lastFrame() ?? "")));
  await sleep(120);
  stdin.write("\r"); // accept must be blocked
  assert.ok(await waitFor(() => /at least one case must be included/.test(lastFrame() ?? "")), "inline message should render");
  assert.equal(closes.length, 0, "the form must stay open");
  assert.equal(await exists(path.join(skillDir, "evals", "evals.json")), false, "nothing written");
  await sleep(120);
  stdin.write(" "); // re-including a case clears the message
  assert.ok(await waitFor(() => /\(1\/2 cases\)/.test(lastFrame() ?? "")));
  assert.doesNotMatch(lastFrame() ?? "", /at least one case must be included/);
  unmount();
});

test("generation shows a progress state before the proposal arrives", async () => {
  const skillDir = await makeSkillDir();
  let release;
  const gate = new Promise((r) => { release = r; });
  const slowDesigner = async () => { await gate; return stubDesigner(); };
  const { lastFrame, stdin, unmount } = renderForm(skillDir, { designer: slowDesigner });

  await waitFor(() => /Create eval suite/.test(lastFrame() ?? ""));
  await sleep(150);
  stdin.write("g");
  assert.ok(await waitFor(() => /designing eval suite/.test(lastFrame() ?? "")), "progress state should render while the designer runs");
  release();
  assert.ok(await waitFor(() => /Proposal/.test(lastFrame() ?? "")));
  unmount();
});
