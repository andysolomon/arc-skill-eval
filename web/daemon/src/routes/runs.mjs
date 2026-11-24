import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ModelRequestError, modelFromRequest } from "../model-selection.mjs";
import { abortRun, readSuiteCases, startRun } from "../runner.mjs";
import { createRun, getRun } from "../state.mjs";
import { AccessError, resolveInWorkspace, resolveUnder } from "../workspaces.mjs";
import { resolveWorkspaceRef, scanSkills } from "./workspace.mjs";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
]);

async function listSubdirs(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => path.join(dirPath, entry.name));
  } catch {
    return [];
  }
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readTextFile(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function caseStatusFromSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return "fail";
  }

  const passed = summary.passed ?? 0;
  const total = summary.total ?? 0;

  if (passed === total) {
    return "pass";
  }

  if (passed === 0) {
    return "fail";
  }

  return "partial";
}

function runStatusFromCases(cases) {
  if (cases.some((testCase) => testCase.status === "fail")) {
    return "fail";
  }

  if (cases.some((testCase) => testCase.status === "timeout")) {
    return "timeout";
  }

  if (cases.some((testCase) => testCase.status === "partial")) {
    return "partial";
  }

  return "pass";
}

async function loadEvalPrompts(skillPath) {
  const prompts = new Map();
  const evals = await readJsonFile(path.join(skillPath, "evals", "evals.json"));

  if (!evals || !Array.isArray(evals.evals)) {
    return prompts;
  }

  for (const entry of evals.evals) {
    if (entry && typeof entry.id === "string" && typeof entry.prompt === "string") {
      prompts.set(entry.id, entry.prompt);
    }
  }

  return prompts;
}

async function parseCaseDir(caseDirPath, caseDirName, prompts) {
  let artifactDirPath = caseDirPath;
  let grading = await readJsonFile(path.join(artifactDirPath, "grading.json"));
  let withoutGrading = null;

  if (!grading) {
    artifactDirPath = path.join(caseDirPath, "with_skill");
    grading = await readJsonFile(path.join(artifactDirPath, "grading.json"));
    withoutGrading = await readJsonFile(
      path.join(caseDirPath, "without_skill", "grading.json"),
    );
  }

  if (!grading || typeof grading !== "object") {
    return null;
  }

  const caseId = typeof grading.case_id === "string" ? grading.case_id : caseDirName;
  const summary = grading.summary ?? {};
  const reviewCase = {
    id: caseDirName,
    prompt: prompts.get(caseId) ?? caseDirName,
    status: caseStatusFromSummary(summary),
  };

  if (typeof summary.passed === "number") {
    reviewCase.withPassed = summary.passed;
  }

  if (typeof summary.total === "number") {
    reviewCase.withTotal = summary.total;
  }

  if (withoutGrading && typeof withoutGrading === "object") {
    const withoutSummary = withoutGrading.summary ?? {};

    if (typeof withoutSummary.passed === "number") {
      reviewCase.withoutPassed = withoutSummary.passed;
    }

    if (typeof withoutSummary.total === "number") {
      reviewCase.withoutTotal = withoutSummary.total;
    }
  }

  if (Array.isArray(grading.assertion_results)) {
    const failed = grading.assertion_results.find(
      (result) => result && result.passed === false,
    );

    if (failed) {
      const evidence =
        typeof failed.evidence === "string"
          ? failed.evidence
          : typeof failed.text === "string"
            ? failed.text
            : undefined;

      if (evidence) {
        reviewCase.failureEvidence = evidence;
      }
    }
  }

  const output = await readTextFile(path.join(artifactDirPath, "assistant.md"));
  if (output !== null) {
    reviewCase.output = output;
  }

  return reviewCase;
}

async function parseRunDir(skillPath, skillId, runDirPath, runDirName) {
  const caseDirs = await listSubdirs(runDirPath);
  const prompts = await loadEvalPrompts(skillPath);
  const cases = [];

  for (const caseDirPath of caseDirs) {
    const reviewCase = await parseCaseDir(
      caseDirPath,
      path.basename(caseDirPath),
      prompts,
    );

    if (reviewCase) {
      cases.push(reviewCase);
    }
  }

  if (cases.length === 0) {
    return null;
  }

  let totalCost = 0;
  let hasCost = false;

  for (const caseDirPath of caseDirs) {
    const timingPaths = [
      path.join(caseDirPath, "timing.json"),
      path.join(caseDirPath, "with_skill", "timing.json"),
      path.join(caseDirPath, "without_skill", "timing.json"),
    ];

    for (const timingPath of timingPaths) {
      const timing = await readJsonFile(timingPath);

      if (timing && typeof timing.estimated_cost_usd === "number") {
        totalCost += timing.estimated_cost_usd;
        hasCost = true;
      }
    }
  }

  let finishedAt;
  try {
    finishedAt = (await stat(runDirPath)).mtime.toISOString();
  } catch {
    finishedAt = new Date().toISOString();
  }

  const run = {
    id: runDirName,
    skill: skillId,
    workspaceRoot: skillPath,
    finishedAt,
    status: runStatusFromCases(cases),
    compare: caseDirs.some((caseDirPath) => existsSync(path.join(caseDirPath, "with_skill", "grading.json"))),
    cases,
  };

  const evalsJson = await readJsonFile(path.join(skillPath, "evals", "evals.json"));
  if (evalsJson) {
    run.evalsJson = evalsJson;
  }

  if (hasCost) {
    run.cost = totalCost;
  }

  return run;
}

async function listRunDirs(evalsRunsPath) {
  const runDirs = [];

  for (const entryPath of await listSubdirs(evalsRunsPath)) {
    if (path.basename(entryPath).startsWith("iteration-")) {
      for (const runDirPath of await listSubdirs(entryPath)) {
        runDirs.push({
          path: runDirPath,
          id: path.relative(evalsRunsPath, runDirPath),
        });
      }
      continue;
    }

    runDirs.push({
      path: entryPath,
      id: path.basename(entryPath),
    });
  }

  return runDirs;
}

async function listRunsFromDisk(resolvedPath, skillId) {
  const skills = (await scanSkills(resolvedPath))
    .filter((skill) => !skillId || skill.id === skillId);
  const runs = [];

  for (const skill of skills) {
    const evalsRunsPath = path.join(skill.path, "evals-runs");

    if (!existsSync(evalsRunsPath)) {
      continue;
    }

    for (const runDir of await listRunDirs(evalsRunsPath)) {
      const run = await parseRunDir(
        skill.path,
        skill.id,
        runDir.path,
        runDir.id,
      );

      if (run) {
        runs.push(run);
      }
    }
  }

  runs.sort((left, right) => right.id.localeCompare(left.id));
  return runs;
}

async function sendArtifact(request, response, context, match) {
  const [runId, caseId, kind] = match.slice(1, 4).map(decodeURIComponent);
  const root = getRun(runId)?.workspaceRoot ?? context.url.searchParams.get("root")?.trim();

  if (!root) {
    context.sendJson(response, 404, { error: "Artifact not found" });
    return true;
  }

  const skillDir = await resolveInWorkspace(root);
  let filePath;
  try {
    filePath = await resolveUnder(path.join(skillDir, "evals-runs"), [runId, caseId, kind]);
  } catch (error) {
    if (error instanceof AccessError) {
      context.sendJson(response, 404, { error: "Artifact not found" });
      return true;
    }
    throw error;
  }

  const file = await stat(filePath).catch(() => null);
  if (!file?.isFile()) {
    context.sendJson(response, 404, { error: "Artifact not found" });
    return true;
  }

  response.writeHead(200, {
    "content-type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
    "content-length": file.size,
  });
  createReadStream(filePath).pipe(response);
  return true;
}

const compareModes = new Set(["off", "on"]);
const contextModes = new Set(["isolated", "ambient"]);
const sandboxModes = new Set(["none", "just-bash"]);

class RunRequestError extends Error {}

async function runRequest(body) {
  const skillDir = await resolveInWorkspace(typeof body.workspaceRoot === "string" ? body.workspaceRoot : "");
  if (!existsSync(path.join(skillDir, "evals", "evals.json"))) {
    throw new RunRequestError("This skill has no evals/evals.json to run. Author an eval suite first.");
  }

  let suite;
  try {
    suite = await readSuiteCases(skillDir);
  } catch (error) {
    throw new RunRequestError(error instanceof Error ? error.message : String(error));
  }

  const caseId = typeof body.case === "string" && body.case !== "*" && body.case !== "" ? body.case : null;
  const cases = caseId === null ? suite : suite.filter((evalCase) => evalCase.id === caseId);
  if (cases.length === 0) {
    throw new RunRequestError(
      caseId === null ? "evals/evals.json has no cases." : `evals/evals.json has no case with id ${caseId}.`,
    );
  }

  const compare = body.compare ?? "off";
  if (!compareModes.has(compare)) {
    throw new RunRequestError(`compare must be one of ${[...compareModes].join(", ")}.`);
  }
  const contextMode = body.contextMode ?? "isolated";
  if (!contextModes.has(contextMode)) {
    throw new RunRequestError(`contextMode must be one of ${[...contextModes].join(", ")}.`);
  }
  const sandbox = body.sandbox ?? "none";
  if (!sandboxModes.has(sandbox)) {
    throw new RunRequestError(`sandbox must be one of ${[...sandboxModes].join(", ")}.`);
  }
  const iteration = body.iteration ?? 1;
  if (!Number.isInteger(iteration) || iteration < 1) {
    throw new RunRequestError("iteration must be a whole number of 1 or more.");
  }

  const extraSkills = Array.isArray(body.extraSkill) ? body.extraSkill : [];
  const extraSkillPaths = [];
  for (const extraSkill of extraSkills) {
    if (typeof extraSkill !== "string" || extraSkill.trim() === "") {
      throw new RunRequestError("Each extra skill must be a folder path.");
    }
    extraSkillPaths.push(await resolveInWorkspace(path.resolve(skillDir, extraSkill.trim())));
  }

  return {
    skillDir,
    cases,
    caseIds: caseId === null ? [] : [caseId],
    model: modelFromRequest(body.model, "model"),
    judgeModel: modelFromRequest(body.judgeModel, "judgeModel"),
    compare: compare !== "off",
    extraSkillPaths,
    contextMode,
    sandbox,
    ...(iteration === 1 ? {} : { iteration: String(iteration) }),
  };
}

async function postRun(request, response, context) {
  const body = await context.readJson(request);
  let options;
  try {
    options = await runRequest(body);
  } catch (error) {
    if (error instanceof RunRequestError || error instanceof ModelRequestError || error instanceof AccessError) {
      context.sendJson(response, 400, { error: error.message });
      return true;
    }
    throw error;
  }

  const runId = createRun({
    workspaceRoot: options.skillDir,
    options: {
      case: body.case ?? "*",
      model: body.model ?? null,
      judgeModel: body.judgeModel ?? null,
      compare: body.compare ?? "off",
      extraSkill: options.extraSkillPaths,
      iteration: body.iteration ?? 1,
      contextMode: options.contextMode,
      sandbox: options.sandbox,
    },
  });
  startRun(runId, options);

  context.sendJson(response, 201, {
    runId,
    wsUrl: `ws://localhost:${context.port}/runs/${encodeURIComponent(runId)}`,
  });
  return true;
}

export async function handleRuns(request, response, context) {
  if (request.method === "POST" && context.url.pathname === "/runs") {
    return postRun(request, response, context);
  }

  if (request.method === "GET" && context.url.pathname === "/runs") {
    const root = context.url.searchParams.get("root")?.trim();
    const skill = context.url.searchParams.get("skill")?.trim();

    if (!root) {
      context.sendJson(response, 400, { error: "missing root query parameter" });
      return true;
    }

    const resolution = await resolveWorkspaceRef(root);

    if (!resolution.exists) {
      context.sendJson(response, 200, {
        ok: false,
        root,
        error: resolution.error,
        runs: [],
      });
      return true;
    }

    const workspaceDir = await resolveInWorkspace(resolution.resolvedPath);
    context.sendJson(response, 200, {
      ok: true,
      root,
      ...(skill ? { skill } : {}),
      runs: await listRunsFromDisk(workspaceDir, skill),
    });
    return true;
  }

  const runStateMatch = /^\/runs\/([^/]+)$/.exec(context.url.pathname);
  if (runStateMatch && (request.method === "GET" || request.method === "DELETE")) {
    const runId = decodeURIComponent(runStateMatch[1]);
    const run = getRun(runId);
    if (!run) {
      context.sendJson(response, 404, { error: "Run not found" });
      return true;
    }

    if (request.method === "DELETE") {
      const cancelling = abortRun(runId);
      context.sendJson(response, 202, { runId, cancelling, status: run.status });
      return true;
    }

    const { terminalFrame, ...state } = run;
    context.sendJson(response, 200, state);
    return true;
  }

  const artifactMatch = /^\/runs\/([^/]+)\/artifacts\/([^/]+)\/(.+)$/.exec(context.url.pathname);
  if (request.method === "GET" && artifactMatch) {
    return sendArtifact(request, response, context, artifactMatch);
  }

  return false;
}
