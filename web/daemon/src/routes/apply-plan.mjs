import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const plans = new Map();

function planToText(plan) {
  if (typeof plan === "string") {
    return plan;
  }

  return JSON.stringify(plan ?? {}, null, 2);
}

function resolveWorkspaceFile(workspaceRoot, fileName) {
  const root = path.resolve(workspaceRoot);
  const filePath = path.resolve(root, fileName);
  const relative = path.relative(root, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return filePath;
}

async function createPlan(request, response, context) {
  const body = await context.readJson(request);
  if (typeof body.workspaceRoot !== "string" || !body.workspaceRoot.trim()) {
    context.sendJson(response, 400, { error: "workspaceRoot is required" });
    return true;
  }

  const planId = randomUUID();
  const stagingDir = path.join(os.tmpdir(), "arc-skill-eval-daemon", planId);
  const stagingPath = path.join(stagingDir, "evals.json");
  const proposed = planToText(body.plan);
  const targetPath = resolveWorkspaceFile(body.workspaceRoot, "evals.json");
  const backupPath = resolveWorkspaceFile(body.workspaceRoot, "evals.json.bak");

  if (!targetPath || !backupPath) {
    context.sendJson(response, 400, { error: "Invalid workspaceRoot" });
    return true;
  }

  let current = "";
  try {
    current = await readFile(targetPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(stagingDir, { recursive: true });
  await writeFile(stagingPath, proposed);

  plans.set(planId, {
    planId,
    runId: body.runId ?? null,
    workspaceRoot: body.workspaceRoot,
    targetPath,
    backupPath,
    stagingPath,
    createdAt: new Date().toISOString(),
  });

  context.sendJson(response, 200, {
    planId,
    diff: {
      target: "evals.json",
      beforeBytes: Buffer.byteLength(current),
      afterBytes: Buffer.byteLength(proposed),
      changed: current !== proposed,
    },
    stagingPath,
  });
  return true;
}

async function commitPlan(response, context, planId) {
  const plan = plans.get(planId);
  if (!plan) {
    context.sendJson(response, 404, { error: "Plan not found" });
    return true;
  }

  try {
    await rename(plan.targetPath, plan.backupPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(path.dirname(plan.targetPath), { recursive: true });
  await rename(plan.stagingPath, plan.targetPath);
  plans.delete(planId);

  context.sendJson(response, 200, {
    planId,
    committed: true,
    path: plan.targetPath,
    backupPath: plan.backupPath,
  });
  return true;
}

async function cancelPlan(response, context, planId) {
  const plan = plans.get(planId);
  if (!plan) {
    context.sendJson(response, 404, { error: "Plan not found" });
    return true;
  }

  await rm(path.dirname(plan.stagingPath), { recursive: true, force: true });
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
