import assert from "node:assert/strict";
import test from "node:test";
import * as path from "node:path";
import { tmpdir } from "node:os";

import { runInProcess } from "../dist/tui/run-driver.js";

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
