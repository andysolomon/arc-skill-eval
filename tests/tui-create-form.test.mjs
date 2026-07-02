import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { render } from "ink-testing-library";
import { createElement } from "react";

import { CreateForm } from "../dist/tui/CreateForm.js";

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

function renderForm(skillDir, { designer = stubDesigner, hasSuite = false, onClose = () => {} } = {}) {
  return render(createElement(CreateForm, { skillDir, skillName: "demo-skill", hasSuite, onClose, designer }));
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
