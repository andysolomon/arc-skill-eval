import type { ExecutionCase } from "../../../../../src/contracts/types.js";

export const executionCases: ExecutionCase[] = [
  {
    id: "execution-read-readme",
    prompt:
      "Read README.md in your current workspace and reply with a one-sentence summary.",
    fixture: {
      kind: "repo",
      source: "./fixtures/hello-world",
    },
    expected: {
      tools: { include: ["read"] },
      text: { include: ["Hello World"] },
    },
  },
];
