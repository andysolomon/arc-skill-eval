import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { render } from "ink-testing-library";
import { createElement } from "react";

import { NewCaseForm } from "../dist/tui/NewCaseForm.js";

const sleep = (n) => new Promise((r) => setTimeout(r, n));
const waitFor = async (pred, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await sleep(10);
  }
  return false;
};

async function makeSkillDir() {
  const skillDir = await mkdtemp(path.join(tmpdir(), "arc-new-case-form-"));
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(
    path.join(skillDir, "evals", "evals.json"),
    JSON.stringify({ skill_name: "demo-skill", evals: [] }, null, 2) + "\n",
    "utf8",
  );
  return skillDir;
}

// Drive the form to a save with empty fields: enter ×3 advances through the
// case fields into assertions mode, enter there saves (placeholder assertion).
async function saveEmptyCase(stdin, lastFrame) {
  await waitFor(() => /New eval case/.test(lastFrame() ?? ""));
  await sleep(150); // let ink's useInput subscribe to stdin
  for (let i = 0; i < 3; i++) { stdin.write("\r"); await sleep(120); }
  await waitFor(() => /Assertions/.test(lastFrame() ?? ""));
  stdin.write("\r");
}

test("save offers a dry-run of the fresh case and r hands its id to onDryRun", async () => {
  const skillDir = await makeSkillDir();
  const dryRuns = [];
  const closes = [];
  const { lastFrame, stdin, unmount } = render(createElement(NewCaseForm, {
    skillDir,
    skillName: "demo-skill",
    onClose: (msg) => closes.push(msg),
    onDryRun: (caseId, msg) => dryRuns.push({ caseId, msg }),
  }));

  await saveEmptyCase(stdin, lastFrame);
  assert.ok(await waitFor(() => /dry-run/.test(lastFrame() ?? "")), "success panel should offer the dry-run");
  assert.match(lastFrame() ?? "", /appended new-case/);
  assert.equal(closes.length, 0, "the form stays open while the offer is showing");

  await sleep(120);
  stdin.write("r");
  assert.ok(await waitFor(() => dryRuns.length === 1), "r should accept the dry-run offer");
  assert.equal(dryRuns[0].caseId, "new-case");
  assert.match(dryRuns[0].msg, /appended new-case/);
  unmount();
});

test("escape from the dry-run offer closes with the save message, without a run", async () => {
  const skillDir = await makeSkillDir();
  const dryRuns = [];
  const closes = [];
  const { lastFrame, stdin, unmount } = render(createElement(NewCaseForm, {
    skillDir,
    skillName: "demo-skill",
    onClose: (msg) => closes.push(msg),
    onDryRun: (caseId, msg) => dryRuns.push({ caseId, msg }),
  }));

  await saveEmptyCase(stdin, lastFrame);
  assert.ok(await waitFor(() => /dry-run/.test(lastFrame() ?? "")));
  await sleep(120);
  stdin.write("\u001b"); // esc
  assert.ok(await waitFor(() => closes.length === 1), "esc should close the form");
  assert.match(closes[0], /appended new-case/);
  assert.equal(dryRuns.length, 0);
  unmount();
});

test("without onDryRun the form closes immediately on save (legacy behavior)", async () => {
  const skillDir = await makeSkillDir();
  const closes = [];
  const { lastFrame, stdin, unmount } = render(createElement(NewCaseForm, {
    skillDir,
    skillName: "demo-skill",
    onClose: (msg) => closes.push(msg),
  }));

  await saveEmptyCase(stdin, lastFrame);
  assert.ok(await waitFor(() => closes.length === 1), "save should close straight away");
  assert.match(closes[0], /appended new-case/);
  unmount();
});
