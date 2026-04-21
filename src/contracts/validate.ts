import {
  ENFORCEMENT_VALUES,
  EXECUTION_LANE_VALUES,
  FIXTURE_KIND_VALUES,
  MUST_PASS_ASSERTION_TYPES,
  PROFILE_VALUES,
  TARGET_TIER_VALUES,
  THINKING_LEVEL_VALUES,
  type CaseExpected,
  type CustomAssertionRef,
  type EnforcementConfig,
  type ExternalFixtureSpec,
  type FixtureRef,
  type GitFixtureSpec,
  type IncludeExclude,
  type LiveSmokeCase,
  type ModelSelection,
  type MustPassAssertion,
  type OverridesConfig,
  type ParityCase,
  type RoutingCase,
  type RoutingSection,
  type RubricConfig,
  type SkillEvalContract,
  type ThresholdConfig,
  type ValidationIssue,
  type ValidationResult,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

const ROOT_PATH = "$";

export class SkillEvalContractValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(formatValidationIssues(issues));
    this.name = "SkillEvalContractValidationError";
    this.issues = issues;
  }
}

export function validateSkillEvalContract(input: unknown): ValidationResult<SkillEvalContract> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    pushIssue(issues, ROOT_PATH, "contract.invalid_type", "Contract must be an object.");
    return { ok: false, issues };
  }

  validateSkill(input.skill, "skill", issues);
  validateEnum(input.profile, "profile", PROFILE_VALUES, issues);
  validateEnum(input.targetTier, "targetTier", TARGET_TIER_VALUES, issues);
  validateEnforcement(input.enforcement, "enforcement", issues);
  validateThresholds(input.thresholds, "thresholds", issues);
  validateModelSelection(input.model, "model", issues);
  validateOverrides(input.overrides, "overrides", issues);

  const seenCaseIds = new Map<string, string>();
  validateRouting(input.routing, "routing", issues, seenCaseIds);
  validateExecutionCases(input.execution, "execution", issues, seenCaseIds);
  validateParityCases(input.cliParity, "cliParity", issues, seenCaseIds);
  validateLiveSmokeCases(input.liveSmoke, "liveSmoke", issues, seenCaseIds);
  validateRubric(input.rubric, "rubric", issues);

  if (input.profile === "external-api" && input.targetTier === 3) {
    const liveSmoke = input.liveSmoke;
    if (!Array.isArray(liveSmoke) || liveSmoke.length === 0) {
      pushIssue(
        issues,
        "liveSmoke",
        "liveSmoke.required_for_tier3_external_api",
        "Tier 3 external-api skills must define at least one live smoke case.",
      );
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: input as unknown as SkillEvalContract, issues: [] };
}

export function assertValidSkillEvalContract(input: unknown): SkillEvalContract {
  const result = validateSkillEvalContract(input);

  if (!result.ok) {
    throw new SkillEvalContractValidationError(result.issues);
  }

  return result.value;
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues.map((issue) => `- ${issue.path}: ${issue.message} [${issue.code}]`).join("\n");
}

function validateSkill(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!validateNonEmptyString(value, path, issues, "skill.required", "Skill name is required.")) {
    return;
  }

  if (value.includes("\n")) {
    pushIssue(issues, path, "skill.invalid", "Skill name must be a single-line string.");
  }
}

function validateRouting(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seenCaseIds: Map<string, string>,
): void {
  if (!isRecord(value)) {
    pushIssue(issues, path, "routing.required", "Routing configuration is required.");
    return;
  }

  validateRoutingCaseArray(value.explicit, `${path}.explicit`, issues, seenCaseIds, true);
  validateRoutingCaseArray(value.implicitPositive, `${path}.implicitPositive`, issues, seenCaseIds, true);
  validateRoutingCaseArray(value.adjacentNegative, `${path}.adjacentNegative`, issues, seenCaseIds, true);
  validateRoutingCaseArray(value.hardNegative, `${path}.hardNegative`, issues, seenCaseIds, false);
}

function validateExecutionCases(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seenCaseIds: Map<string, string>,
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, path, "execution.invalid_type", "Execution cases must be an array.");
    return;
  }

  value.forEach((entry, index) => {
    const casePath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      pushIssue(issues, casePath, "execution.case.invalid_type", "Execution case must be an object.");
      return;
    }

    validateBaseCase(entry, casePath, issues, seenCaseIds);
    validateEnum(entry.lane, `${casePath}.lane`, EXECUTION_LANE_VALUES, issues, false);
    validateFixtureRef(entry.fixture, `${casePath}.fixture`, issues);
    validateModelSelection(entry.model, `${casePath}.model`, issues);
    validateCustomAssertionRefs(entry.customAssertions, `${casePath}.customAssertions`, issues);
  });
}

function validateParityCases(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seenCaseIds: Map<string, string>,
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, path, "cliParity.invalid_type", "CLI parity cases must be an array.");
    return;
  }

  value.forEach((entry, index) => {
    const casePath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      pushIssue(issues, casePath, "cliParity.case.invalid_type", "CLI parity case must be an object.");
      return;
    }

    validateBaseCase(entry, casePath, issues, seenCaseIds);
    validateFixtureRef(entry.fixture, `${casePath}.fixture`, issues);
  });
}

function validateLiveSmokeCases(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seenCaseIds: Map<string, string>,
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, path, "liveSmoke.invalid_type", "Live smoke cases must be an array.");
    return;
  }

  value.forEach((entry, index) => {
    const casePath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      pushIssue(issues, casePath, "liveSmoke.case.invalid_type", "Live smoke case must be an object.");
      return;
    }

    validateBaseCase(entry, casePath, issues, seenCaseIds);
    validateFixtureRef(entry.fixture, `${casePath}.fixture`, issues);
    validateStringArray(
      entry.envRequired,
      `${casePath}.envRequired`,
      issues,
      true,
      "liveSmoke.envRequired.required",
      "Live smoke cases must declare envRequired.",
      true,
    );
  });
}

function validateRoutingCaseArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seenCaseIds: Map<string, string>,
  required: boolean,
): void {
  if (value === undefined) {
    if (required) {
      pushIssue(issues, path, "routing.lane.required", "Routing lane is required.");
    }
    return;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, path, "routing.lane.invalid_type", "Routing lane must be an array.");
    return;
  }

  value.forEach((entry, index) => {
    const casePath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      pushIssue(issues, casePath, "routing.case.invalid_type", "Routing case must be an object.");
      return;
    }

    validateBaseCase(entry, casePath, issues, seenCaseIds);
  });
}

function validateBaseCase(
  value: UnknownRecord,
  path: string,
  issues: ValidationIssue[],
  seenCaseIds: Map<string, string>,
): void {
  const idPath = `${path}.id`;
  if (validateNonEmptyString(value.id, idPath, issues, "case.id.required", "Case id is required.")) {
    if (/\s/.test(value.id)) {
      pushIssue(issues, idPath, "case.id.invalid", "Case id must not contain whitespace.");
    }

    const previousPath = seenCaseIds.get(value.id);
    if (previousPath) {
      pushIssue(
        issues,
        idPath,
        "case.id.duplicate",
        `Case id \"${value.id}\" duplicates ${previousPath}.`,
      );
    } else {
      seenCaseIds.set(value.id, idPath);
    }
  }

  validateNonEmptyString(value.prompt, `${path}.prompt`, issues, "case.prompt.required", "Case prompt is required.");

  if (value.trialCount !== undefined) {
    if (
      typeof value.trialCount !== "number" ||
      !Number.isInteger(value.trialCount) ||
      value.trialCount <= 0
    ) {
      pushIssue(
        issues,
        `${path}.trialCount`,
        "case.trialCount.invalid",
        "trialCount must be a positive integer.",
      );
    }
  }

  validateOptionalString(value.notes, `${path}.notes`, issues, "case.notes.invalid", "Notes must be a string.");
  validateCaseExpected(value.expected, `${path}.expected`, issues);
  validateMustPassAssertions(value.mustPass, `${path}.mustPass`, issues);
}

function validateEnforcement(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, "enforcement.invalid_type", "Enforcement must be an object.");
    return;
  }

  validateEnum(value.tier, `${path}.tier`, ENFORCEMENT_VALUES, issues, false);
  validateEnum(value.score, `${path}.score`, ENFORCEMENT_VALUES, issues, false);
}

function validateThresholds(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, "thresholds.invalid_type", "Thresholds must be an object.");
    return;
  }

  validateUnitIntervalNumber(value.overall, `${path}.overall`, issues);
  validateUnitIntervalNumber(value.routing, `${path}.routing`, issues);
  validateUnitIntervalNumber(value.execution, `${path}.execution`, issues);
  validateUnitIntervalNumber(value.cliParity, `${path}.cliParity`, issues);
  validateUnitIntervalNumber(value.liveSmoke, `${path}.liveSmoke`, issues);
}

function validateModelSelection(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, "model.invalid_type", "Model selection must be an object.");
    return;
  }

  validateNonEmptyString(value.provider, `${path}.provider`, issues, "model.provider.required", "Model provider is required.");
  validateNonEmptyString(value.id, `${path}.id`, issues, "model.id.required", "Model id is required.");
  validateEnum(value.thinking, `${path}.thinking`, THINKING_LEVEL_VALUES, issues, false);
}

function validateOverrides(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, "overrides.invalid_type", "Overrides must be an object.");
    return;
  }

  if (value.weights !== undefined) {
    if (!isRecord(value.weights)) {
      pushIssue(issues, `${path}.weights`, "overrides.weights.invalid_type", "Weights must be an object.");
    } else {
      validateNonNegativeNumber(value.weights.trigger, `${path}.weights.trigger`, issues);
      validateNonNegativeNumber(value.weights.process, `${path}.weights.process`, issues);
      validateNonNegativeNumber(value.weights.outcome, `${path}.weights.outcome`, issues);
      validateNonNegativeNumber(value.weights.style, `${path}.weights.style`, issues);
    }
  }

  validateStringArray(
    value.expectedSignals,
    `${path}.expectedSignals`,
    issues,
    false,
    "overrides.expectedSignals.invalid",
    "expectedSignals must be an array of non-empty strings.",
  );
  validateStringArray(
    value.forbiddenSignals,
    `${path}.forbiddenSignals`,
    issues,
    false,
    "overrides.forbiddenSignals.invalid",
    "forbiddenSignals must be an array of non-empty strings.",
  );
}

function validateFixtureRef(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, "fixture.invalid_type", "Fixture must be an object.");
    return;
  }

  validateEnum(value.kind, `${path}.kind`, FIXTURE_KIND_VALUES, issues);
  validateNonEmptyString(value.source, `${path}.source`, issues, "fixture.source.required", "Fixture source is required.");

  if (value.initGit !== undefined && typeof value.initGit !== "boolean") {
    pushIssue(issues, `${path}.initGit`, "fixture.initGit.invalid", "initGit must be a boolean.");
  }

  validateOptionalString(value.setup, `${path}.setup`, issues, "fixture.setup.invalid", "setup must be a string.");
  validateOptionalString(value.teardown, `${path}.teardown`, issues, "fixture.teardown.invalid", "teardown must be a string.");
  validateStringRecord(value.env, `${path}.env`, issues, "fixture.env.invalid", "Fixture env must be a string-to-string map.");
  validateGitFixtureSpec(value.git, `${path}.git`, issues);
  validateExternalFixtureSpec(value.external, `${path}.external`, issues);
}

function validateGitFixtureSpec(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, "fixture.git.invalid_type", "Git fixture config must be an object.");
    return;
  }

  if (typeof value.enabled !== "boolean") {
    pushIssue(issues, `${path}.enabled`, "fixture.git.enabled.required", "Git fixture config must declare enabled.");
  }

  validateOptionalString(
    value.defaultBranch,
    `${path}.defaultBranch`,
    issues,
    "fixture.git.defaultBranch.invalid",
    "defaultBranch must be a string.",
  );
  validateOptionalString(
    value.currentBranch,
    `${path}.currentBranch`,
    issues,
    "fixture.git.currentBranch.invalid",
    "currentBranch must be a string.",
  );
  validateStringRecord(
    value.dirtyFiles,
    `${path}.dirtyFiles`,
    issues,
    "fixture.git.dirtyFiles.invalid",
    "dirtyFiles must be a string-to-string map.",
  );
  validateStringArray(
    value.stagedFiles,
    `${path}.stagedFiles`,
    issues,
    false,
    "fixture.git.stagedFiles.invalid",
    "stagedFiles must be an array of non-empty strings.",
  );

  if (value.commits !== undefined) {
    if (!Array.isArray(value.commits)) {
      pushIssue(issues, `${path}.commits`, "fixture.git.commits.invalid_type", "commits must be an array.");
    } else {
      value.commits.forEach((commit, index) => {
        const commitPath = `${path}.commits[${index}]`;
        if (!isRecord(commit)) {
          pushIssue(issues, commitPath, "fixture.git.commit.invalid_type", "Commit must be an object.");
          return;
        }

        validateNonEmptyString(
          commit.message,
          `${commitPath}.message`,
          issues,
          "fixture.git.commit.message.required",
          "Commit message is required.",
        );
        validateStringRecord(
          commit.files,
          `${commitPath}.files`,
          issues,
          "fixture.git.commit.files.required",
          "Commit files must be a string-to-string map.",
          true,
        );
        validateStringArray(
          commit.tags,
          `${commitPath}.tags`,
          issues,
          false,
          "fixture.git.commit.tags.invalid",
          "Commit tags must be an array of non-empty strings.",
        );
      });
    }
  }

  if (value.remotes !== undefined) {
    if (!Array.isArray(value.remotes)) {
      pushIssue(issues, `${path}.remotes`, "fixture.git.remotes.invalid_type", "remotes must be an array.");
    } else {
      value.remotes.forEach((remote, index) => {
        const remotePath = `${path}.remotes[${index}]`;
        if (!isRecord(remote)) {
          pushIssue(issues, remotePath, "fixture.git.remote.invalid_type", "Remote must be an object.");
          return;
        }

        validateNonEmptyString(
          remote.name,
          `${remotePath}.name`,
          issues,
          "fixture.git.remote.name.required",
          "Remote name is required.",
        );
        validateNonEmptyString(
          remote.url,
          `${remotePath}.url`,
          issues,
          "fixture.git.remote.url.required",
          "Remote url is required.",
        );
      });
    }
  }
}

function validateExternalFixtureSpec(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, "fixture.external.invalid_type", "External fixture config must be an object.");
    return;
  }

  if (value.mockServers !== undefined) {
    if (!Array.isArray(value.mockServers)) {
      pushIssue(
        issues,
        `${path}.mockServers`,
        "fixture.external.mockServers.invalid_type",
        "mockServers must be an array.",
      );
    } else {
      value.mockServers.forEach((server, index) => {
        const serverPath = `${path}.mockServers[${index}]`;
        if (!isRecord(server)) {
          pushIssue(issues, serverPath, "fixture.external.mockServer.invalid_type", "Mock server must be an object.");
          return;
        }

        validateNonEmptyString(
          server.id,
          `${serverPath}.id`,
          issues,
          "fixture.external.mockServer.id.required",
          "Mock server id is required.",
        );
        validateNonEmptyString(
          server.routesSource,
          `${serverPath}.routesSource`,
          issues,
          "fixture.external.mockServer.routesSource.required",
          "Mock server routesSource is required.",
        );
        validateStringRecord(
          server.env,
          `${serverPath}.env`,
          issues,
          "fixture.external.mockServer.env.invalid",
          "Mock server env must be a string-to-string map.",
        );
      });
    }
  }

  if (value.cliShims !== undefined) {
    if (!Array.isArray(value.cliShims)) {
      pushIssue(issues, `${path}.cliShims`, "fixture.external.cliShims.invalid_type", "cliShims must be an array.");
    } else {
      value.cliShims.forEach((shim, index) => {
        const shimPath = `${path}.cliShims[${index}]`;
        if (!isRecord(shim)) {
          pushIssue(issues, shimPath, "fixture.external.cliShim.invalid_type", "CLI shim must be an object.");
          return;
        }

        validateNonEmptyString(
          shim.command,
          `${shimPath}.command`,
          issues,
          "fixture.external.cliShim.command.required",
          "CLI shim command is required.",
        );
        validateNonEmptyString(
          shim.script,
          `${shimPath}.script`,
          issues,
          "fixture.external.cliShim.script.required",
          "CLI shim script is required.",
        );
      });
    }
  }
}

function validateCaseExpected(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, "expected.invalid_type", "Expected config must be an object.");
    return;
  }

  validateIncludeExclude(value.signals, `${path}.signals`, issues);
  validateIncludeExclude(value.tools, `${path}.tools`, issues);
  validateIncludeExclude(value.commands, `${path}.commands`, issues);
  validateIncludeExclude(value.text, `${path}.text`, issues);

  if (value.files !== undefined) {
    if (!isRecord(value.files)) {
      pushIssue(issues, `${path}.files`, "expected.files.invalid_type", "Expected files config must be an object.");
    } else {
      validateIncludeExclude(value.files, `${path}.files`, issues);
      validateStringArray(
        value.files.created,
        `${path}.files.created`,
        issues,
        false,
        "expected.files.created.invalid",
        "files.created must be an array of non-empty strings.",
      );
      validateStringArray(
        value.files.edited,
        `${path}.files.edited`,
        issues,
        false,
        "expected.files.edited.invalid",
        "files.edited must be an array of non-empty strings.",
      );
    }
  }

  validateStringArray(
    value.artifacts,
    `${path}.artifacts`,
    issues,
    false,
    "expected.artifacts.invalid",
    "Artifacts must be an array of non-empty strings.",
  );
}

function validateIncludeExclude(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, "includeExclude.invalid_type", "Expected section must be an object.");
    return;
  }

  validateStringArray(
    value.include,
    `${path}.include`,
    issues,
    false,
    `${path}.include.invalid`,
    "include must be an array of non-empty strings.",
  );
  validateStringArray(
    value.exclude,
    `${path}.exclude`,
    issues,
    false,
    `${path}.exclude.invalid`,
    "exclude must be an array of non-empty strings.",
  );
}

function validateMustPassAssertions(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, path, "mustPass.invalid_type", "mustPass must be an array.");
    return;
  }

  value.forEach((assertion, index) => {
    const assertionPath = `${path}[${index}]`;
    if (!isRecord(assertion)) {
      pushIssue(issues, assertionPath, "mustPass.entry.invalid_type", "mustPass assertion must be an object.");
      return;
    }

    if (!validateEnum(assertion.type, `${assertionPath}.type`, MUST_PASS_ASSERTION_TYPES, issues)) {
      return;
    }

    switch (assertion.type) {
      case "no-forbidden-files-touched":
        validateStringArray(
          assertion.paths,
          `${assertionPath}.paths`,
          issues,
          true,
          "mustPass.paths.required",
          "paths must be an array of non-empty strings.",
          true,
        );
        break;
      case "skill-read-required":
        validateNonEmptyString(
          assertion.skill,
          `${assertionPath}.skill`,
          issues,
          "mustPass.skill.required",
          "skill is required for skill-read-required assertions.",
        );
        break;
      case "no-live-external-calls":
        break;
      case "no-forbidden-commands":
        validateStringArray(
          assertion.commands,
          `${assertionPath}.commands`,
          issues,
          true,
          "mustPass.commands.required",
          "commands must be an array of non-empty strings.",
          true,
        );
        break;
      case "custom":
        validateNonEmptyString(
          assertion.ref,
          `${assertionPath}.ref`,
          issues,
          "mustPass.ref.required",
          "ref is required for custom assertions.",
        );
        break;
      default:
        pushIssue(
          issues,
          `${assertionPath}.type`,
          "mustPass.type.invalid",
          `Unsupported mustPass assertion type: ${String(assertion.type)}.`,
        );
    }
  });
}

function validateCustomAssertionRefs(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, path, "customAssertions.invalid_type", "customAssertions must be an array.");
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      pushIssue(issues, entryPath, "customAssertions.entry.invalid_type", "custom assertion ref must be an object.");
      return;
    }

    validateNonEmptyString(
      entry.ref,
      `${entryPath}.ref`,
      issues,
      "customAssertions.ref.required",
      "Custom assertion ref is required.",
    );
  });
}

function validateRubric(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, "rubric.invalid_type", "Rubric config must be an object.");
    return;
  }

  if (typeof value.enabled !== "boolean") {
    pushIssue(issues, `${path}.enabled`, "rubric.enabled.required", "Rubric enabled must be a boolean.");
  }

  validateStringArray(
    value.prompts,
    `${path}.prompts`,
    issues,
    false,
    "rubric.prompts.invalid",
    "Rubric prompts must be an array of non-empty strings.",
  );
}

function validateOptionalString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  code: string,
  message: string,
): void {
  if (value !== undefined && typeof value !== "string") {
    pushIssue(issues, path, code, message);
  }
}

function validateNonEmptyString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  code: string,
  message: string,
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(issues, path, code, message);
    return false;
  }

  return true;
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  required: boolean,
  code: string,
  message: string,
  requireAtLeastOne = false,
): value is string[] {
  if (value === undefined) {
    if (required) {
      pushIssue(issues, path, code, message);
    }
    return false;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, path, code, message);
    return false;
  }

  if (requireAtLeastOne && value.length === 0) {
    pushIssue(issues, path, code, message);
    return false;
  }

  let valid = true;
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      pushIssue(issues, `${path}[${index}]`, code, message);
      valid = false;
    }
  });

  return valid;
}

function validateStringRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  code: string,
  message: string,
  required = false,
): void {
  if (value === undefined) {
    if (required) {
      pushIssue(issues, path, code, message);
    }
    return;
  }

  if (!isRecord(value)) {
    pushIssue(issues, path, code, message);
    return;
  }

  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey.trim().length === 0 || typeof entryValue !== "string") {
      pushIssue(issues, `${path}.${entryKey || "<empty>"}`, code, message);
    }
  }
}

function validateUnitIntervalNumber(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    pushIssue(issues, path, "number.out_of_range", "Value must be a number between 0 and 1.");
  }
}

function validateNonNegativeNumber(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    pushIssue(issues, path, "number.negative", "Value must be a non-negative number.");
  }
}

function validateEnum<T extends readonly (string | number)[]>(
  value: unknown,
  path: string,
  allowed: T,
  issues: ValidationIssue[],
  required = true,
): value is T[number] {
  if (value === undefined) {
    if (required) {
      pushIssue(
        issues,
        path,
        "enum.required",
        `Value is required and must be one of: ${allowed.join(", ")}.`,
      );
    }
    return false;
  }

  if (!allowed.includes(value as T[number])) {
    pushIssue(
      issues,
      path,
      "enum.invalid",
      `Value must be one of: ${allowed.join(", ")}.`,
    );
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(issues: ValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}
