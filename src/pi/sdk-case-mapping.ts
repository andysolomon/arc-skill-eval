import type {
  ExecutionCase,
  LiveSmokeCase,
  ModelSelection,
  NormalizedSkillEvalContract,
  ParityCase,
  RoutingCase,
} from "../contracts/types.js";
import type {
  PiSdkExecutionCase,
  PiSdkLiveSmokeCase,
  PiSdkParityCase,
  PiSdkRunnableCase,
  PiSdkRoutingCase,
} from "./types.js";

/** Internal owner for Pi eval case conversion, selection, and model precedence. */
export function collectPiSdkRunnableCases(contract: NormalizedSkillEvalContract): PiSdkRunnableCase[] {
  return [
    ...contract.routing.explicit.map((definition) => toRoutingCase(contract, "routing-explicit", definition)),
    ...contract.routing.implicitPositive.map((definition) => toRoutingCase(contract, "routing-implicit-positive", definition)),
    ...contract.routing.adjacentNegative.map((definition) => toRoutingCase(contract, "routing-adjacent-negative", definition)),
    ...contract.routing.hardNegative.map((definition) => toRoutingCase(contract, "routing-hard-negative", definition)),
    ...contract.execution.map((definition) => toExecutionCase(contract, definition)),
    ...contract.cliParity.map((definition) => toParityCase(contract, definition)),
    ...contract.liveSmoke.map((definition) => toLiveSmokeCase(contract, definition)),
  ];
}

export function findPiSdkRunnableCase(
  contract: NormalizedSkillEvalContract,
  caseId: string,
): PiSdkRunnableCase | undefined {
  return collectPiSdkRunnableCases(contract).find((caseDefinition) => caseDefinition.caseId === caseId);
}

export function resolveRequestedModel(
  contract: NormalizedSkillEvalContract,
  caseDefinition: PiSdkRunnableCase,
  override: ModelSelection | undefined,
): ModelSelection | undefined {
  if (override !== undefined) {
    return override;
  }

  if (caseDefinition.kind === "execution" && caseDefinition.definition.model !== undefined) {
    return caseDefinition.definition.model;
  }

  return contract.model;
}

export function selectPiSdkCases(
  allCases: PiSdkRunnableCase[],
  selectedCaseIds: string[] | undefined,
): PiSdkRunnableCase[] {
  if (selectedCaseIds === undefined || selectedCaseIds.length === 0) {
    return allCases;
  }

  const casesById = new Map(allCases.map((caseDefinition) => [caseDefinition.caseId, caseDefinition]));
  const selectedCases: PiSdkRunnableCase[] = [];

  for (const caseId of selectedCaseIds) {
    const caseDefinition = casesById.get(caseId);

    if (!caseDefinition) {
      throw new Error(`Unknown Pi SDK case id: ${caseId}`);
    }

    selectedCases.push(caseDefinition);
  }

  return selectedCases;
}

function toRoutingCase(
  contract: NormalizedSkillEvalContract,
  lane: PiSdkRoutingCase["lane"],
  definition: RoutingCase,
): PiSdkRoutingCase {
  return {
    kind: "routing",
    lane,
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: contract.model,
    definition,
  };
}

function toExecutionCase(
  contract: NormalizedSkillEvalContract,
  definition: ExecutionCase,
): PiSdkExecutionCase {
  return {
    kind: "execution",
    lane: "execution-deterministic",
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: contract.model,
    definition,
  };
}

function toParityCase(
  contract: NormalizedSkillEvalContract,
  definition: ParityCase,
): PiSdkParityCase {
  return {
    kind: "cli-parity",
    lane: "cli-parity",
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: contract.model,
    definition,
  };
}

function toLiveSmokeCase(
  contract: NormalizedSkillEvalContract,
  definition: LiveSmokeCase,
): PiSdkLiveSmokeCase {
  return {
    kind: "live-smoke",
    lane: "live-smoke",
    caseId: definition.id,
    prompt: definition.prompt,
    skillName: contract.skill,
    contractModel: contract.model,
    definition,
  };
}
