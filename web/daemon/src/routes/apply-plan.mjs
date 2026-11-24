import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { improveCommand, validateEvalsJsonValue } from "../../../../dist/index.js";
import { resolveInWorkspace, resolveUnder } from "../workspaces.mjs";

const plans = new Map();

const WEB_FEEDBACK_FILE = "web-feedback.json";

class PlanError extends Error {}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function readText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeAtomically(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, filePath);
}

async function skillFolder(skillDir) {
  const resolved = await resolveInWorkspace(typeof skillDir === "string" ? skillDir : "");
  if (!existsSync(path.join(resolved, "SKILL.md"))) {
    throw new PlanError(`${resolved} has no SKILL.md. Choose a skill folder to write evals/evals.json into.`);
  }
  return resolved;
}

function stagingDir(planId) {
  return path.join(os.tmpdir(), "arc-skill-eval-daemon", planId);
}

async function stageEvals(body, planId) {
  const skillDir = await skillFolder(body.skillDir);
  const targetPath = path.join(skillDir, "evals", "evals.json");
  await resolveInWorkspace(targetPath, { mustExist: false });

  try {
    validateEvalsJsonValue(body.evals, "the eval suite");
  } catch (error) {
    throw new PlanError(errorMessage(error));
  }

  const proposed = `${JSON.stringify(body.evals, null, 2)}\n`;
  const current = await readText(targetPath);
  const stagingPath = path.join(stagingDir(planId), "evals.json");
  await mkdir(path.dirname(stagingPath), { recursive: true });
  await writeFile(stagingPath, proposed, "utf8");

  return {
    plan: { kind: "evals", targetPath, stagingPath },
    diff: {
      target: "evals/evals.json",
      path: targetPath,
      beforeBytes: Buffer.byteLength(current),
      afterBytes: Buffer.byteLength(proposed),
      changed: current !== proposed,
    },
  };
}

async function commitEvals(plan) {
  await resolveInWorkspace(plan.targetPath, { mustExist: false });
  await writeAtomically(plan.targetPath, await readFile(plan.stagingPath, "utf8"));
  return { path: plan.targetPath };
}

async function gradingFor(caseDir) {
  const flat = await readJsonFile(path.join(caseDir, "grading.json"));
  if (flat) {
    return { caseId: flat.case_id, variants: [{ name: "run", grading_summary: flat.summary ?? null }] };
  }

  const withSkill = await readJsonFile(path.join(caseDir, "with_skill", "grading.json"));
  const withoutSkill = await readJsonFile(path.join(caseDir, "without_skill", "grading.json"));
  if (!withSkill) {
    return null;
  }
  return {
    caseId: withSkill.case_id,
    variants: [
      { name: "with_skill", grading_summary: withSkill.summary ?? null },
      ...(withoutSkill ? [{ name: "without_skill", grading_summary: withoutSkill.summary ?? null }] : []),
    ],
  };
}

async function buildFeedback(runDir, notes) {
  const entries = await readdir(runDir, { withFileTypes: true });
  const cases = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const grading = await gradingFor(path.join(runDir, entry.name));
    if (!grading) {
      continue;
    }
    const caseNotes = notes
      .filter((note) => note.caseId === null || note.caseId === entry.name)
      .map((note) => note.note);
    if (caseNotes.length === 0) {
      continue;
    }
    cases.push({
      case_id: typeof grading.caseId === "string" ? grading.caseId : entry.name,
      notes: caseNotes.join("\n"),
      variants: grading.variants,
    });
  }

  if (cases.length === 0) {
    throw new PlanError("None of the notes match a graded case in this run.");
  }

  return { schema_version: "1", run_dir: ".", source: "arc-skill-eval web app", cases };
}

function readNotes(value) {
  if (!Array.isArray(value)) {
    throw new PlanError("notes must be a list of feedback notes.");
  }
  const notes = value
    .filter((item) => item && typeof item.note === "string" && item.note.trim() !== "")
    .map((item) => ({
      caseId: typeof item.caseId === "string" && item.caseId !== "" ? item.caseId : null,
      note: item.note.trim(),
    }));
  if (notes.length === 0) {
    throw new PlanError("At least one feedback note is required.");
  }
  return notes;
}

async function stageImprove(body, planId) {
  const skillDir = await skillFolder(body.skillDir);
  const evalsPath = path.join(skillDir, "evals", "evals.json");
  if (!existsSync(evalsPath)) {
    throw new PlanError("This skill has no evals/evals.json to improve.");
  }
  if (typeof body.runId !== "string" || body.runId === "") {
    throw new PlanError("runId is required.");
  }
  const runDir = await resolveUnder(path.join(skillDir, "evals-runs"), [body.runId]);
  const feedback = await buildFeedback(runDir, readNotes(body.notes));

  const staging = stagingDir(planId);
  const stagedEvals = path.join(staging, "evals", "evals.json");
  const stagedFeedback = path.join(staging, "run", "feedback.json");
  const current = await readFile(evalsPath, "utf8");
  await mkdir(path.dirname(stagedEvals), { recursive: true });
  await mkdir(path.dirname(stagedFeedback), { recursive: true });
  await writeFile(stagedEvals, current, "utf8");
  await writeFile(stagedFeedback, `${JSON.stringify(feedback, null, 2)}\n`, "utf8");

  let result;
  try {
    result = await improveCommand({ feedbackPath: stagedFeedback, apply: true });
  } catch (error) {
    throw new PlanError(errorMessage(error));
  }
  const proposed = await readFile(stagedEvals, "utf8");

  return {
    plan: { kind: "improve", runDir, evalsPath, feedback, stagingPath: stagedEvals },
    diff: {
      target: "evals/evals.json",
      path: evalsPath,
      command: "arc-skill-eval improve --apply",
      beforeBytes: Buffer.byteLength(current),
      afterBytes: Buffer.byteLength(proposed),
      changed: current !== proposed,
      suggestions: result.suggestions.map((suggestion) => ({
        caseId: suggestion.caseId,
        kind: suggestion.kind,
        recommendation: suggestion.recommendation,
      })),
    },
  };
}

async function commitImprove(plan) {
  const feedbackPath = path.join(plan.runDir, WEB_FEEDBACK_FILE);
  await resolveInWorkspace(feedbackPath, { mustExist: false });
  await writeFile(feedbackPath, `${JSON.stringify(plan.feedback, null, 2)}\n`, "utf8");
  const result = await improveCommand({ feedbackPath, apply: true });
  return { path: result.evalsJsonPath, feedbackPath, suggestions: result.suggestions.length };
}

async function createPlan(request, response, context) {
  const body = await context.readJson(request);
  const planId = randomUUID();

  let staged;
  try {
    if (body.kind === "evals") {
      staged = await stageEvals(body, planId);
    } else if (body.kind === "improve") {
      staged = await stageImprove(body, planId);
    } else {
      throw new PlanError('kind must be "evals" or "improve".');
    }
  } catch (error) {
    await rm(stagingDir(planId), { recursive: true, force: true });
    if (error instanceof PlanError || error.name === "AccessError") {
      context.sendJson(response, 400, { ok: false, error: error.message });
      return true;
    }
    throw error;
  }

  plans.set(planId, { planId, createdAt: new Date().toISOString(), ...staged.plan });
  context.sendJson(response, 200, {
    planId,
    diff: staged.diff,
    stagingPath: staged.plan.stagingPath,
  });
  return true;
}

async function commitPlan(response, context, planId) {
  const plan = plans.get(planId);
  if (!plan) {
    context.sendJson(response, 404, { ok: false, error: "Plan not found" });
    return true;
  }

  let result;
  try {
    result = plan.kind === "evals" ? await commitEvals(plan) : await commitImprove(plan);
  } catch (error) {
    context.sendJson(response, 400, { ok: false, error: errorMessage(error) });
    return true;
  }

  plans.delete(planId);
  await rm(stagingDir(planId), { recursive: true, force: true });
  context.sendJson(response, 200, { planId, committed: true, ...result });
  return true;
}

async function cancelPlan(response, context, planId) {
  const plan = plans.get(planId);
  if (!plan) {
    context.sendJson(response, 404, { ok: false, error: "Plan not found" });
    return true;
  }

  await rm(stagingDir(planId), { recursive: true, force: true });
  plans.delete(planId);

  context.sendJson(response, 200, {
    planId,
    cancelled: true,
  });
  return true;
}

export async function handleApplyPlan(request, response, context) {
  if (request.method === "POST" && context.url.pathname === "/apply-plan") {
    return createPlan(request, response, context);
  }

  const actionMatch = /^\/apply-plan\/([^/]+)\/(commit|cancel)$/.exec(context.url.pathname);
  if (request.method === "POST" && actionMatch) {
    const planId = decodeURIComponent(actionMatch[1]);
    const action = actionMatch[2];
    return action === "commit"
      ? commitPlan(response, context, planId)
      : cancelPlan(response, context, planId);
  }

  return false;
}
