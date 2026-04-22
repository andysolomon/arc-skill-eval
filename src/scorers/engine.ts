import path from "node:path";

import type {
  CustomAssertionRef,
  MustPassAssertion,
  NoForbiddenCommandsAssertion,
  NoForbiddenFilesTouchedAssertion,
  NormalizedSkillEvalContract,
  SkillReadRequiredAssertion,
} from "../contracts/types.js";
import type { WorkspaceFileSnapshot, WorkspaceSnapshot } from "../fixtures/types.js";
import type { PiSdkRunnableCase } from "../pi/types.js";
import type { EvalTrace } from "../traces/types.js";
import { loadCustomAssertion } from "./custom-assertions.js";
import { collectCanonicalSignals, resolveSignalDimension } from "./signals.js";
import type {
  AggregateScoreSummary,
  CanonicalSignalsSnapshot,
  CustomAssertionContext,
  DeterministicCaseScoreInput,
  DeterministicCaseScoreResult,
  DeterministicSkillScoreInput,
  DeterministicSkillScoreResult,
  HardAssertionResult,
  ScoreCheckResult,
  ScoreDimension,
  ScoreDimensionResult,
  ScoreWeights,
  ThresholdStatus,
} from "./types.js";
import { SCORE_DIMENSIONS } from "./types.js";
import { resolveScoreWeights } from "./weights.js";
import { captureCurrentWorkspaceSnapshot } from "./workspace.js";

export async function scoreDeterministicCase(
  input: DeterministicCaseScoreInput,
): Promise<DeterministicCaseScoreResult> {
  ensureDeterministicCase(input.caseDefinition);

  const weights = resolveScoreWeights(input.contract.profile, input.contract.overrides.weights);
  const deferredExpectations = input.caseDefinition.definition.expected?.artifacts?.length ? ["artifacts"] : [];
  const signals = collectCanonicalSignals(input.trace);
  const hardAssertions = await evaluateHardAssertions(input, signals);
  const checksByDimension = createEmptyChecksByDimension();

  addRoutingHeuristicChecks(input, signals, checksByDimension.trigger);
  addSignalChecks(input.contract, input.caseDefinition, signals, checksByDimension);
  addToolChecks(input.trace, input.caseDefinition, checksByDimension.process);
  addCommandChecks(input.trace, input.caseDefinition, checksByDimension.process);
  addTextChecks(input.trace, input.caseDefinition, checksByDimension.outcome);
  await addFileChecks(input, checksByDimension.outcome);
  await addSoftCustomAssertionChecks(input, checksByDimension.outcome);

  const dimensions = buildDimensionResults(weights, checksByDimension);
  const score = computeWeightedCaseScore(dimensions);
  const hardPassed = hardAssertions.every((assertion) => assertion.passed);
  const executionStatus = input.executionStatus ?? "completed";

  return {
    caseId: input.caseDefinition.caseId,
    lane: input.caseDefinition.lane,
    kind: input.caseDefinition.kind,
    executionStatus,
    hardPassed,
    passed: hardPassed && executionStatus === "completed",
    score,
    scorePercent: toPercent(score),
    dimensions,
    hardAssertions,
    signals,
    deferredExpectations,
  };
}

export async function scoreDeterministicSkill(
  input: DeterministicSkillScoreInput,
): Promise<DeterministicSkillScoreResult> {
  const weights = resolveScoreWeights(input.contract.profile, input.contract.overrides.weights);
  const cases: DeterministicCaseScoreResult[] = [];

  for (const caseInput of input.cases) {
    ensureDeterministicCase(caseInput.caseDefinition);
    cases.push(
      await scoreDeterministicCase({
        contract: input.contract,
        caseDefinition: caseInput.caseDefinition,
        trace: caseInput.trace,
        workspace: caseInput.workspace,
        skillFiles: input.skillFiles,
        executionStatus: caseInput.executionStatus,
      }),
    );
  }

  const routingCases = cases.filter((result) => result.kind === "routing");
  const executionCases = cases.filter((result) => result.kind === "execution");
  const enforcement = input.contract.enforcement.score;

  return {
    skill: {
      skill: input.contract.skill,
      profile: input.contract.profile,
      targetTier: input.contract.targetTier,
    },
    weights,
    thresholds: input.contract.thresholds,
    cases,
    lanes: {
      routing: summarizeAggregate("routing", routingCases, input.contract.thresholds?.routing ?? null, enforcement),
      execution: summarizeAggregate("execution", executionCases, input.contract.thresholds?.execution ?? null, enforcement),
      overall: summarizeAggregate("overall", cases, input.contract.thresholds?.overall ?? null, enforcement),
    },
  };
}

function ensureDeterministicCase(caseDefinition: PiSdkRunnableCase): void {
  if (caseDefinition.kind === "live-smoke" || caseDefinition.kind === "cli-parity") {
    throw new Error(`Case ${caseDefinition.caseId} is not part of deterministic scoring.`);
  }
}

function createEmptyChecksByDimension(): Record<ScoreDimension, ScoreCheckResult[]> {
  return {
    trigger: [],
    process: [],
    outcome: [],
    style: [],
  };
}

function addRoutingHeuristicChecks(
  input: DeterministicCaseScoreInput,
  signals: CanonicalSignalsSnapshot,
  checks: ScoreCheckResult[],
): void {
  if (input.caseDefinition.kind !== "routing") {
    return;
  }

  const engaged = hasSignal(signals, "target-skill-engaged");
  const positiveLane =
    input.caseDefinition.lane === "routing-explicit" || input.caseDefinition.lane === "routing-implicit-positive";
  const passed = positiveLane ? engaged : !engaged;

  checks.push({
    code: "routing.target-skill-engagement",
    label: "routing target-skill engagement",
    passed,
    score: passed ? 1 : 0,
    message: positiveLane
      ? engaged
        ? "Target skill engagement observed for positive routing lane."
        : "Expected target skill engagement for positive routing lane."
      : engaged
        ? "Target skill engagement observed in a negative routing lane."
        : "Target skill engagement was absent as expected for negative routing lane.",
    expected: positiveLane ? true : false,
    actual: engaged,
    details: {
      lane: input.caseDefinition.lane,
    },
  });
}

function addSignalChecks(
  contract: NormalizedSkillEvalContract,
  caseDefinition: PiSdkRunnableCase,
  signals: CanonicalSignalsSnapshot,
  checksByDimension: Record<ScoreDimension, ScoreCheckResult[]>,
): void {
  const includeSignals = uniqueStrings([
    ...contract.overrides.expectedSignals,
    ...(caseDefinition.definition.expected?.signals?.include ?? []),
  ]);
  const excludeSignals = uniqueStrings([
    ...contract.overrides.forbiddenSignals,
    ...(caseDefinition.definition.expected?.signals?.exclude ?? []),
  ]);

  for (const signal of includeSignals) {
    const passed = hasSignal(signals, signal);
    checksByDimension[resolveSignalDimension(signal)].push({
      code: "signals.include",
      label: `signal include ${signal}`,
      passed,
      score: passed ? 1 : 0,
      message: passed ? `Observed required signal ${signal}.` : `Missing required signal ${signal}.`,
      expected: true,
      actual: passed,
      details: { signal },
    });
  }

  for (const signal of excludeSignals) {
    const passed = !hasSignal(signals, signal);
    checksByDimension[resolveSignalDimension(signal)].push({
      code: "signals.exclude",
      label: `signal exclude ${signal}`,
      passed,
      score: passed ? 1 : 0,
      message: passed ? `Signal ${signal} was absent as expected.` : `Forbidden signal ${signal} was observed.`,
      expected: false,
      actual: !passed,
      details: { signal },
    });
  }
}

function addToolChecks(trace: EvalTrace, caseDefinition: PiSdkRunnableCase, checks: ScoreCheckResult[]): void {
  const usedTools = new Set(trace.observations.toolCalls.map((toolCall) => toolCall.toolName));

  for (const toolName of caseDefinition.definition.expected?.tools?.include ?? []) {
    const passed = usedTools.has(toolName);
    checks.push({
      code: "tools.include",
      label: `tool include ${toolName}`,
      passed,
      score: passed ? 1 : 0,
      message: passed ? `Observed required tool ${toolName}.` : `Missing required tool ${toolName}.`,
      expected: true,
      actual: passed,
      details: { toolName },
    });
  }

  for (const toolName of caseDefinition.definition.expected?.tools?.exclude ?? []) {
    const passed = !usedTools.has(toolName);
    checks.push({
      code: "tools.exclude",
      label: `tool exclude ${toolName}`,
      passed,
      score: passed ? 1 : 0,
      message: passed ? `Tool ${toolName} was absent as expected.` : `Forbidden tool ${toolName} was observed.`,
      expected: false,
      actual: !passed,
      details: { toolName },
    });
  }
}

function addCommandChecks(trace: EvalTrace, caseDefinition: PiSdkRunnableCase, checks: ScoreCheckResult[]): void {
  const executedCommands = new Set(trace.observations.bashCommands.map(normalizeCommand));

  for (const command of caseDefinition.definition.expected?.commands?.include ?? []) {
    const normalizedCommand = normalizeCommand(command);
    const passed = executedCommands.has(normalizedCommand);
    checks.push({
      code: "commands.include",
      label: `command include ${command}`,
      passed,
      score: passed ? 1 : 0,
      message: passed ? `Observed required command ${command}.` : `Missing required command ${command}.`,
      expected: true,
      actual: passed,
      details: { command },
    });
  }

  for (const command of caseDefinition.definition.expected?.commands?.exclude ?? []) {
    const normalizedCommand = normalizeCommand(command);
    const passed = !executedCommands.has(normalizedCommand);
    checks.push({
      code: "commands.exclude",
      label: `command exclude ${command}`,
      passed,
      score: passed ? 1 : 0,
      message: passed ? `Command ${command} was absent as expected.` : `Forbidden command ${command} was observed.`,
      expected: false,
      actual: !passed,
      details: { command },
    });
  }
}

function addTextChecks(trace: EvalTrace, caseDefinition: PiSdkRunnableCase, checks: ScoreCheckResult[]): void {
  const assistantText = trace.observations.assistantText;

  for (const snippet of caseDefinition.definition.expected?.text?.include ?? []) {
    const passed = assistantText.includes(snippet);
    checks.push({
      code: "text.include",
      label: `text include ${snippet}`,
      passed,
      score: passed ? 1 : 0,
      message: passed ? `Assistant output included ${JSON.stringify(snippet)}.` : `Assistant output was missing ${JSON.stringify(snippet)}.`,
      expected: true,
      actual: passed,
      details: { snippet },
    });
  }

  for (const snippet of caseDefinition.definition.expected?.text?.exclude ?? []) {
    const passed = !assistantText.includes(snippet);
    checks.push({
      code: "text.exclude",
      label: `text exclude ${snippet}`,
      passed,
      score: passed ? 1 : 0,
      message: passed
        ? `Assistant output excluded ${JSON.stringify(snippet)} as expected.`
        : `Assistant output included forbidden text ${JSON.stringify(snippet)}.`,
      expected: false,
      actual: !passed,
      details: { snippet },
    });
  }
}

async function addFileChecks(input: DeterministicCaseScoreInput, checks: ScoreCheckResult[]): Promise<void> {
  const expectedFiles = input.caseDefinition.definition.expected?.files;

  if (!expectedFiles) {
    return;
  }

  if (!input.workspace) {
    const allPaths = [
      ...(expectedFiles.include ?? []),
      ...(expectedFiles.exclude ?? []),
      ...(expectedFiles.created ?? []),
      ...(expectedFiles.edited ?? []),
    ];

    for (const expectedPath of allPaths) {
      checks.push(createMissingWorkspaceCheck(expectedPath));
    }

    return;
  }

  const finalSnapshot = await captureCurrentWorkspaceSnapshot(input.workspace.workspaceDir);
  const finalFiles = toSnapshotMap(finalSnapshot);
  const initialFiles = input.workspace.initialSnapshot ? toSnapshotMap(input.workspace.initialSnapshot) : null;

  for (const expectedPath of expectedFiles.include ?? []) {
    const normalizedPath = normalizeWorkspaceRelativePath(expectedPath);
    const passed = finalFiles.has(normalizedPath);
    checks.push({
      code: "files.include",
      label: `file include ${normalizedPath}`,
      passed,
      score: passed ? 1 : 0,
      message: passed ? `Final workspace contains ${normalizedPath}.` : `Final workspace is missing ${normalizedPath}.`,
      expected: true,
      actual: passed,
      details: { path: normalizedPath },
    });
  }

  for (const expectedPath of expectedFiles.exclude ?? []) {
    const normalizedPath = normalizeWorkspaceRelativePath(expectedPath);
    const passed = !finalFiles.has(normalizedPath);
    checks.push({
      code: "files.exclude",
      label: `file exclude ${normalizedPath}`,
      passed,
      score: passed ? 1 : 0,
      message: passed ? `Final workspace excludes ${normalizedPath} as expected.` : `Final workspace still contains ${normalizedPath}.`,
      expected: false,
      actual: !passed,
      details: { path: normalizedPath },
    });
  }

  for (const expectedPath of expectedFiles.created ?? []) {
    const normalizedPath = normalizeWorkspaceRelativePath(expectedPath);

    if (!initialFiles) {
      checks.push(createMissingInitialSnapshotCheck("files.created", normalizedPath));
      continue;
    }

    const passed = finalFiles.has(normalizedPath) && !initialFiles.has(normalizedPath);
    checks.push({
      code: "files.created",
      label: `file created ${normalizedPath}`,
      passed,
      score: passed ? 1 : 0,
      message: passed
        ? `File ${normalizedPath} exists in the final workspace and was absent initially.`
        : `File ${normalizedPath} was not newly created in the final workspace.`,
      expected: true,
      actual: passed,
      details: { path: normalizedPath },
    });
  }

  for (const expectedPath of expectedFiles.edited ?? []) {
    const normalizedPath = normalizeWorkspaceRelativePath(expectedPath);

    if (!initialFiles) {
      checks.push(createMissingInitialSnapshotCheck("files.edited", normalizedPath));
      continue;
    }

    const initial = initialFiles.get(normalizedPath);
    const final = finalFiles.get(normalizedPath);
    const passed = Boolean(initial && final && initial.sha256 !== final.sha256);
    checks.push({
      code: "files.edited",
      label: `file edited ${normalizedPath}`,
      passed,
      score: passed ? 1 : 0,
      message: passed
        ? `File ${normalizedPath} changed between the initial and final workspace snapshots.`
        : `File ${normalizedPath} did not change between the initial and final workspace snapshots.`,
      expected: true,
      actual: passed,
      details: { path: normalizedPath },
    });
  }
}

async function addSoftCustomAssertionChecks(
  input: DeterministicCaseScoreInput,
  checks: ScoreCheckResult[],
): Promise<void> {
  if (input.caseDefinition.kind !== "execution") {
    return;
  }

  for (const assertionRef of input.caseDefinition.definition.customAssertions ?? []) {
    checks.push(await evaluateSoftCustomAssertion(input, assertionRef));
  }
}

async function evaluateSoftCustomAssertion(
  input: DeterministicCaseScoreInput,
  assertionRef: CustomAssertionRef,
): Promise<ScoreCheckResult> {
  if (!input.skillFiles) {
    return {
      code: "custom.soft",
      label: `custom assertion ${assertionRef.ref}`,
      passed: false,
      score: 0,
      message: `Unable to resolve custom assertion ${assertionRef.ref} without discovered skill file metadata.`,
      details: { ref: assertionRef.ref },
    };
  }

  try {
    const assertion = await loadCustomAssertion({
      skillFiles: input.skillFiles,
      ref: assertionRef.ref,
    });
    const outcome = await assertion(createCustomAssertionContext(input));
    const score = clampScore(outcome.score ?? (outcome.pass ? 1 : 0));

    return {
      code: "custom.soft",
      label: `custom assertion ${assertionRef.ref}`,
      passed: outcome.pass,
      score,
      message: outcome.message,
      details: {
        ref: assertionRef.ref,
        ...(outcome.details ?? {}),
      },
    };
  } catch (error) {
    return {
      code: "custom.soft",
      label: `custom assertion ${assertionRef.ref}`,
      passed: false,
      score: 0,
      message: error instanceof Error ? error.message : `Custom assertion ${assertionRef.ref} failed to load.`,
      details: {
        ref: assertionRef.ref,
      },
    };
  }
}

async function evaluateHardAssertions(
  input: DeterministicCaseScoreInput,
  signals: CanonicalSignalsSnapshot,
): Promise<HardAssertionResult[]> {
  const assertions = input.caseDefinition.definition.mustPass ?? [];
  const results: HardAssertionResult[] = [];

  for (const assertion of assertions) {
    results.push(await evaluateHardAssertion(input, assertion, signals));
  }

  return results;
}

async function evaluateHardAssertion(
  input: DeterministicCaseScoreInput,
  assertion: MustPassAssertion,
  signals: CanonicalSignalsSnapshot,
): Promise<HardAssertionResult> {
  switch (assertion.type) {
    case "no-forbidden-files-touched":
      return evaluateNoForbiddenFilesTouchedAssertion(input.trace, assertion);
    case "skill-read-required":
      return evaluateSkillReadRequiredAssertion(input.trace, assertion, signals);
    case "no-live-external-calls":
      return {
        type: assertion.type,
        passed: input.trace.observations.externalCalls.length === 0,
        message:
          input.trace.observations.externalCalls.length === 0
            ? "No external calls were observed."
            : "External calls were observed in a deterministic lane.",
        details:
          input.trace.observations.externalCalls.length === 0
            ? undefined
            : { externalCalls: input.trace.observations.externalCalls },
      };
    case "no-forbidden-commands":
      return evaluateNoForbiddenCommandsAssertion(input.trace, assertion);
    case "custom":
      return await evaluateCustomHardAssertion(input, assertion.ref);
    default:
      return {
        type: "unsupported",
        passed: false,
        message: `Unsupported hard assertion type ${(assertion satisfies never) as never}`,
      };
  }
}

function evaluateNoForbiddenFilesTouchedAssertion(
  trace: EvalTrace,
  assertion: NoForbiddenFilesTouchedAssertion,
): HardAssertionResult {
  const touchedFiles = new Set(trace.observations.touchedFiles.map((entry) => normalizeWorkspaceRelativePath(entry.path)));
  const forbiddenMatches = assertion.paths.map(normalizeWorkspaceRelativePath).filter((pathValue) => touchedFiles.has(pathValue));

  return {
    type: assertion.type,
    passed: forbiddenMatches.length === 0,
    message:
      forbiddenMatches.length === 0
        ? "No forbidden files were touched."
        : `Forbidden files were touched: ${forbiddenMatches.join(", ")}.`,
    details: forbiddenMatches.length === 0 ? undefined : { paths: forbiddenMatches },
  };
}

function evaluateSkillReadRequiredAssertion(
  trace: EvalTrace,
  assertion: SkillReadRequiredAssertion,
  signals: CanonicalSignalsSnapshot,
): HardAssertionResult {
  const skillRead =
    assertion.skill === trace.identity.skill.name
      ? hasSignal(signals, "target-skill-read")
      : trace.observations.skillReads.some((entry) => entry.skillName === assertion.skill);

  return {
    type: assertion.type,
    passed: skillRead,
    message: skillRead ? `Observed SKILL.md read for ${assertion.skill}.` : `Missing SKILL.md read for ${assertion.skill}.`,
    details: { skill: assertion.skill },
  };
}

function evaluateNoForbiddenCommandsAssertion(
  trace: EvalTrace,
  assertion: NoForbiddenCommandsAssertion,
): HardAssertionResult {
  const executedCommands = new Set(trace.observations.bashCommands.map(normalizeCommand));
  const forbiddenMatches = assertion.commands.map(normalizeCommand).filter((command) => executedCommands.has(command));

  return {
    type: assertion.type,
    passed: forbiddenMatches.length === 0,
    message:
      forbiddenMatches.length === 0
        ? "No forbidden commands were observed."
        : `Forbidden commands were observed: ${forbiddenMatches.join(", ")}.`,
    details: forbiddenMatches.length === 0 ? undefined : { commands: forbiddenMatches },
  };
}

async function evaluateCustomHardAssertion(
  input: DeterministicCaseScoreInput,
  ref: string,
): Promise<HardAssertionResult> {
  if (!input.skillFiles) {
    return {
      type: "custom",
      passed: false,
      message: `Unable to resolve custom hard assertion ${ref} without discovered skill file metadata.`,
      details: { ref },
    };
  }

  try {
    const assertion = await loadCustomAssertion({
      skillFiles: input.skillFiles,
      ref,
    });
    const outcome = await assertion(createCustomAssertionContext(input));

    return {
      type: "custom",
      passed: outcome.pass,
      message: outcome.message,
      details: {
        ref,
        ...(outcome.details ?? {}),
      },
    };
  } catch (error) {
    return {
      type: "custom",
      passed: false,
      message: error instanceof Error ? error.message : `Custom hard assertion ${ref} failed to load.`,
      details: { ref },
    };
  }
}

function buildDimensionResults(
  weights: ScoreWeights,
  checksByDimension: Record<ScoreDimension, ScoreCheckResult[]>,
): Record<ScoreDimension, ScoreDimensionResult> {
  return Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => {
      const checks = checksByDimension[dimension];
      const score = checks.length > 0 ? mean(checks.map((check) => check.score)) : null;

      return [
        dimension,
        {
          dimension,
          applicable: checks.length > 0,
          weight: weights[dimension],
          checkCount: checks.length,
          score,
          scorePercent: toPercent(score),
          checks,
        },
      ];
    }),
  ) as Record<ScoreDimension, ScoreDimensionResult>;
}

function computeWeightedCaseScore(dimensions: Record<ScoreDimension, ScoreDimensionResult>): number | null {
  let totalWeight = 0;
  let weightedTotal = 0;

  for (const dimension of SCORE_DIMENSIONS) {
    const result = dimensions[dimension];

    if (result.score === null || result.weight <= 0) {
      continue;
    }

    totalWeight += result.weight;
    weightedTotal += result.score * result.weight;
  }

  if (totalWeight === 0) {
    return null;
  }

  return weightedTotal / totalWeight;
}

function summarizeAggregate(
  lane: AggregateScoreSummary["lane"],
  cases: DeterministicCaseScoreResult[],
  threshold: number | null,
  enforcement: AggregateScoreSummary["enforcement"],
): AggregateScoreSummary {
  const scoredCases = cases.filter((result) => result.score !== null);
  const score = scoredCases.length > 0 ? mean(scoredCases.map((result) => result.score as number)) : null;
  const thresholdPassed = score !== null && threshold !== null ? score >= threshold : null;

  return {
    lane,
    caseCount: cases.length,
    scoredCaseCount: scoredCases.length,
    passedCaseCount: cases.filter((result) => result.passed).length,
    failedCaseCount: cases.filter((result) => !result.passed).length,
    score,
    scorePercent: toPercent(score),
    threshold,
    thresholdPercent: toPercent(threshold),
    thresholdPassed,
    enforcement,
    status: resolveThresholdStatus(score, threshold, thresholdPassed, enforcement),
  };
}

function resolveThresholdStatus(
  score: number | null,
  threshold: number | null,
  thresholdPassed: boolean | null,
  enforcement: AggregateScoreSummary["enforcement"],
): ThresholdStatus {
  if (score === null || threshold === null || thresholdPassed === null) {
    return "not_applicable";
  }

  if (thresholdPassed) {
    return "passed";
  }

  return enforcement === "required" ? "failed" : "warn";
}

function createCustomAssertionContext(input: DeterministicCaseScoreInput): CustomAssertionContext {
  return {
    trace: input.trace,
    workspaceDir: input.workspace?.workspaceDir ?? input.trace.identity.source.repositoryRoot,
    fixture: input.workspace?.fixture ?? null,
  };
}

function normalizeCommand(value: string): string {
  return value.trim();
}

function normalizeWorkspaceRelativePath(value: string): string {
  const normalized = value.split("\\").join("/");
  return path.posix.normalize(normalized).replace(/^\.\//u, "");
}

function hasSignal(signals: CanonicalSignalsSnapshot, signal: string): boolean {
  return Boolean(signals.matched[signal]);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function toSnapshotMap(snapshot: WorkspaceSnapshot): Map<string, WorkspaceFileSnapshot> {
  return new Map(snapshot.files.map((entry) => [normalizeWorkspaceRelativePath(entry.path), entry]));
}

function createMissingWorkspaceCheck(pathValue: string): ScoreCheckResult {
  const normalizedPath = normalizeWorkspaceRelativePath(pathValue);

  return {
    code: "files.workspace-missing",
    label: `file check ${normalizedPath}`,
    passed: false,
    score: 0,
    message: `Workspace context is required to score file expectation ${normalizedPath}.`,
    details: { path: normalizedPath },
  };
}

function createMissingInitialSnapshotCheck(code: string, pathValue: string): ScoreCheckResult {
  return {
    code,
    label: `${code} ${pathValue}`,
    passed: false,
    score: 0,
    message: `An initial workspace snapshot is required to score ${code} for ${pathValue}.`,
    details: { path: pathValue },
  };
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function toPercent(value: number | null): number | null {
  return value === null ? null : value * 100;
}
