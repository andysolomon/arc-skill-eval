import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import type { EvalAssertion, EvalCase, EvalsJsonFile } from "../evals/types.js";
import { CliCommandError } from "./types.js";

export interface CreateInteractivePrompt {
  message?(text: string): void | Promise<void>;
  confirm(message: string, defaultValue: boolean): Promise<boolean>;
  input(message: string, defaultValue: string): Promise<string>;
  close?(): void | Promise<void>;
}

export interface InteractiveCreateOptions {
  prompt?: CreateInteractivePrompt;
  rationale?: string;
  fixtureInputs?: string[];
}

export async function reviewCreateProposalInteractively(
  evals: EvalsJsonFile,
  options: InteractiveCreateOptions = {},
): Promise<EvalsJsonFile> {
  const prompt = options.prompt ?? createReadlinePrompt();
  const selectedCases: EvalCase[] = [];

  await prompt.message?.(renderInteractiveIntro(evals, options));

  for (const evalCase of evals.evals) {
    await prompt.message?.(renderCaseForReview(evalCase));
    const includeCase = await prompt.confirm(`Include case ${String(evalCase.id)}?`, true);
    if (!includeCase) continue;

    const editedPrompt = await prompt.input(`Prompt for ${String(evalCase.id)}`, evalCase.prompt);
    const editedExpectedOutput = evalCase.expected_output === undefined
      ? undefined
      : await prompt.input(`Expected output for ${String(evalCase.id)}`, evalCase.expected_output);
    const assertions = await reviewAssertionsInteractively(evalCase, prompt);

    selectedCases.push({
      ...evalCase,
      prompt: editedPrompt,
      expected_output: editedExpectedOutput,
      assertions,
    });
  }

  await prompt.close?.();

  if (selectedCases.length === 0) {
    throw new CliCommandError("Interactive create requires at least one selected eval case.");
  }

  return {
    ...evals,
    evals: selectedCases,
  };
}

async function reviewAssertionsInteractively(evalCase: EvalCase, prompt: CreateInteractivePrompt): Promise<EvalAssertion[] | undefined> {
  const assertions = evalCase.assertions ?? [];
  if (assertions.length === 0) return evalCase.assertions;

  const selectedAssertions: EvalAssertion[] = [];
  for (const assertion of assertions) {
    await prompt.message?.(`Assertion: ${formatAssertion(assertion)}`);
    const includeAssertion = await prompt.confirm(`Include assertion ${assertionId(assertion)} for ${String(evalCase.id)}?`, true);
    if (!includeAssertion) continue;
    selectedAssertions.push(await editAssertionInteractively(assertion, prompt));
  }

  return selectedAssertions;
}

async function editAssertionInteractively(assertion: EvalAssertion, prompt: CreateInteractivePrompt): Promise<EvalAssertion> {
  if (typeof assertion === "string") {
    return await prompt.input("Assertion text", assertion);
  }

  if ("type" in assertion) {
    if (assertion.type === "regex-match") {
      const pattern = await prompt.input("Regex assertion pattern", assertion.pattern);
      return { ...assertion, pattern };
    }
    return assertion;
  }

  if (assertion.kind === "output" && assertion.prompt !== undefined) {
    const assertionPrompt = await prompt.input(`Judge assertion ${assertion.id}`, assertion.prompt);
    return { ...assertion, prompt: assertionPrompt };
  }

  if (assertion.kind === "workspace" && assertion.pattern !== undefined) {
    const pattern = await prompt.input(`Workspace assertion ${assertion.id} pattern`, assertion.pattern);
    return { ...assertion, pattern };
  }

  return assertion;
}

function renderInteractiveIntro(evals: EvalsJsonFile, options: InteractiveCreateOptions): string {
  const lines = [
    `Interactive guided eval creation for ${evals.skill_name}`,
    "Review each proposed case, edit prompts, and choose assertions before writing evals.json.",
  ];

  if (options.rationale) {
    lines.push("", "Rationale:", options.rationale);
  }

  lines.push("", "Proposed cases:", ...evals.evals.map((evalCase) => `- ${String(evalCase.id)}: ${evalCase.description ?? "No description"}`));

  if (options.fixtureInputs && options.fixtureInputs.length > 0) {
    lines.push("", "Fixture inputs:", ...options.fixtureInputs.map((fixture) => `- ${fixture}`));
  }

  return lines.join("\n");
}

function renderCaseForReview(evalCase: EvalCase): string {
  return [
    "",
    `Case: ${String(evalCase.id)}`,
    evalCase.description ? `Description: ${evalCase.description}` : undefined,
    `Prompt: ${evalCase.prompt}`,
    evalCase.expected_output ? `Expected output: ${evalCase.expected_output}` : undefined,
    `Assertions: ${(evalCase.assertions ?? []).map(assertionId).join(", ") || "none"}`,
  ].filter((line): line is string => line !== undefined).join("\n");
}

function formatAssertion(assertion: EvalAssertion): string {
  if (typeof assertion === "string") return assertion;
  if ("type" in assertion) {
    if ("path" in assertion) return `${assertion.type} ${assertion.path}`;
    return assertion.type;
  }
  if (assertion.kind === "output" && assertion.method === "judge") return `${assertion.id}: ${assertion.prompt ?? "judge assertion"}`;
  if ("path" in assertion && assertion.path) return `${assertion.id}: ${assertion.kind}/${assertion.method} ${assertion.path}`;
  return `${assertion.id}: ${assertion.kind}/${assertion.method}`;
}

function assertionId(assertion: EvalAssertion): string {
  if (typeof assertion === "string") return assertion.slice(0, 40) || "string-assertion";
  if ("type" in assertion) return assertion.type;
  return assertion.id;
}

function createReadlinePrompt(): CreateInteractivePrompt {
  const rl = createInterface({ input, output });
  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      rl.close();
    }
  };

  process.once("beforeExit", close);

  return {
    message(text) {
      output.write(`${text}\n`);
    },
    async confirm(message, defaultValue) {
      const suffix = defaultValue ? "Y/n" : "y/N";
      while (true) {
        const answer = (await rl.question(`${message} [${suffix}] `)).trim().toLowerCase();
        if (!answer) return defaultValue;
        if (answer === "y" || answer === "yes") return true;
        if (answer === "n" || answer === "no") return false;
        output.write("Please answer yes or no.\n");
      }
    },
    async input(message, defaultValue) {
      const answer = await rl.question(`${message}\n[Enter to keep] ${defaultValue}\n> `);
      return answer.trim() ? answer : defaultValue;
    },
    close,
  };
}
