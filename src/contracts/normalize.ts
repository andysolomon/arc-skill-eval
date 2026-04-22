import type {
  CliShimFixture,
  CustomAssertionRef,
  EnforcementMode,
  ExecutionCase,
  ExternalFixtureSpec,
  FixtureRef,
  GitFixtureCommit,
  GitFixtureRemote,
  GitFixtureSpec,
  IncludeExclude,
  LiveSmokeCase,
  MockServerFixture,
  ModelSelection,
  MustPassAssertion,
  NormalizedEnforcementConfig,
  NormalizedOverridesConfig,
  NormalizedRubricConfig,
  NormalizedRoutingSection,
  NormalizedSkillEvalContract,
  ParityCase,
  RoutingCase,
  SkillEvalContract,
} from "./types.js";

export function normalizeSkillEvalContract(contract: SkillEvalContract): NormalizedSkillEvalContract {
  return {
    skill: contract.skill,
    profile: contract.profile,
    targetTier: contract.targetTier,
    enforcement: normalizeEnforcement(contract.enforcement),
    thresholds: cloneOptional(contract.thresholds),
    model: cloneOptionalModel(contract.model),
    overrides: normalizeOverrides(contract.overrides),
    routing: normalizeRouting(contract.routing),
    execution: normalizeExecutionCases(contract.execution),
    cliParity: normalizeParityCases(contract.cliParity),
    liveSmoke: normalizeLiveSmokeCases(contract.liveSmoke),
    rubric: normalizeRubric(contract.rubric),
  };
}

function normalizeEnforcement(value: SkillEvalContract["enforcement"]): NormalizedEnforcementConfig {
  return {
    tier: value?.tier ?? "warn",
    score: value?.score ?? "warn",
  };
}

function normalizeOverrides(value: SkillEvalContract["overrides"]): NormalizedOverridesConfig {
  return {
    weights: cloneOptional(value?.weights) ?? {},
    expectedSignals: [...(value?.expectedSignals ?? [])],
    forbiddenSignals: [...(value?.forbiddenSignals ?? [])],
  };
}

function normalizeRouting(value: SkillEvalContract["routing"]): NormalizedRoutingSection {
  return {
    explicit: value.explicit.map(cloneRoutingCase),
    implicitPositive: value.implicitPositive.map(cloneRoutingCase),
    adjacentNegative: value.adjacentNegative.map(cloneRoutingCase),
    hardNegative: (value.hardNegative ?? []).map(cloneRoutingCase),
  };
}

function normalizeExecutionCases(value: SkillEvalContract["execution"]): ExecutionCase[] {
  return (value ?? []).map(cloneExecutionCase);
}

function normalizeParityCases(value: SkillEvalContract["cliParity"]): ParityCase[] {
  return (value ?? []).map(cloneParityCase);
}

function normalizeLiveSmokeCases(value: SkillEvalContract["liveSmoke"]): LiveSmokeCase[] {
  return (value ?? []).map(cloneLiveSmokeCase);
}

function normalizeRubric(value: SkillEvalContract["rubric"]): NormalizedRubricConfig {
  return {
    enabled: value?.enabled ?? false,
    prompts: [...(value?.prompts ?? [])],
  };
}

function cloneRoutingCase(value: RoutingCase): RoutingCase {
  return cloneBaseCase(value);
}

function cloneExecutionCase(value: ExecutionCase): ExecutionCase {
  return {
    ...cloneBaseCase(value),
    lane: value.lane,
    fixture: cloneOptionalFixture(value.fixture),
    model: cloneOptionalModel(value.model),
    customAssertions: value.customAssertions?.map(cloneCustomAssertionRef),
  };
}

function cloneParityCase(value: ParityCase): ParityCase {
  return {
    ...cloneBaseCase(value),
    fixture: cloneOptionalFixture(value.fixture),
  };
}

function cloneLiveSmokeCase(value: LiveSmokeCase): LiveSmokeCase {
  return {
    ...cloneBaseCase(value),
    fixture: cloneOptionalFixture(value.fixture),
    envRequired: [...value.envRequired],
  };
}

function cloneBaseCase<T extends RoutingCase>(value: T): T;
function cloneBaseCase<T extends ExecutionCase>(value: T): T;
function cloneBaseCase<T extends ParityCase>(value: T): T;
function cloneBaseCase<T extends LiveSmokeCase>(value: T): T;
function cloneBaseCase<T extends RoutingCase | ExecutionCase | ParityCase | LiveSmokeCase>(value: T): T {
  return {
    ...value,
    expected: cloneOptionalExpected(value.expected),
    mustPass: value.mustPass?.map(cloneMustPassAssertion),
  };
}

function cloneOptionalExpected(value: RoutingCase["expected"]): RoutingCase["expected"] {
  if (value === undefined) {
    return undefined;
  }

  return {
    signals: cloneOptionalIncludeExclude(value.signals),
    tools: cloneOptionalIncludeExclude(value.tools),
    commands: cloneOptionalIncludeExclude(value.commands),
    files:
      value.files === undefined
        ? undefined
        : {
            include: value.files.include ? [...value.files.include] : undefined,
            exclude: value.files.exclude ? [...value.files.exclude] : undefined,
            created: value.files.created ? [...value.files.created] : undefined,
            edited: value.files.edited ? [...value.files.edited] : undefined,
          },
    text: cloneOptionalIncludeExclude(value.text),
    artifacts: value.artifacts ? [...value.artifacts] : undefined,
  };
}

function cloneOptionalIncludeExclude(value: IncludeExclude | undefined): IncludeExclude | undefined {
  if (value === undefined) {
    return undefined;
  }

  return {
    include: value.include ? [...value.include] : undefined,
    exclude: value.exclude ? [...value.exclude] : undefined,
  };
}

function cloneMustPassAssertion(value: MustPassAssertion): MustPassAssertion {
  switch (value.type) {
    case "no-forbidden-files-touched":
      return { ...value, paths: [...value.paths] };
    case "no-forbidden-commands":
      return { ...value, commands: [...value.commands] };
    default:
      return { ...value };
  }
}

function cloneCustomAssertionRef(value: CustomAssertionRef): CustomAssertionRef {
  return { ...value };
}

function cloneOptionalFixture(value: FixtureRef | undefined): FixtureRef | undefined {
  if (value === undefined) {
    return undefined;
  }

  return {
    ...value,
    git: cloneOptionalGitFixture(value.git),
    external: cloneOptionalExternalFixture(value.external),
    env: cloneOptional(value.env),
  };
}

function cloneOptionalGitFixture(value: GitFixtureSpec | undefined): GitFixtureSpec | undefined {
  if (value === undefined) {
    return undefined;
  }

  return {
    ...value,
    commits: value.commits?.map(cloneGitFixtureCommit),
    dirtyFiles: cloneOptional(value.dirtyFiles),
    stagedFiles: value.stagedFiles ? [...value.stagedFiles] : undefined,
    remotes: value.remotes?.map(cloneGitFixtureRemote),
  };
}

function cloneGitFixtureCommit(value: GitFixtureCommit): GitFixtureCommit {
  return {
    ...value,
    files: { ...value.files },
    tags: value.tags ? [...value.tags] : undefined,
  };
}

function cloneGitFixtureRemote(value: GitFixtureRemote): GitFixtureRemote {
  return { ...value };
}

function cloneOptionalExternalFixture(value: ExternalFixtureSpec | undefined): ExternalFixtureSpec | undefined {
  if (value === undefined) {
    return undefined;
  }

  return {
    mockServers: value.mockServers?.map(cloneMockServerFixture),
    cliShims: value.cliShims?.map(cloneCliShimFixture),
  };
}

function cloneMockServerFixture(value: MockServerFixture): MockServerFixture {
  return {
    ...value,
    env: cloneOptional(value.env),
  };
}

function cloneCliShimFixture(value: CliShimFixture): CliShimFixture {
  return { ...value };
}

function cloneOptionalModel(value: ModelSelection | undefined): ModelSelection | undefined {
  if (value === undefined) {
    return undefined;
  }

  return { ...value };
}

function cloneOptional<T extends object>(value: T | undefined): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  return { ...value };
}
