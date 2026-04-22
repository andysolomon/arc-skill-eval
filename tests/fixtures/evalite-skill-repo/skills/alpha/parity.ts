import type { ParityCase } from "../../../../../src/contracts/types.js";

export const parityCases: ParityCase[] = [
  {
    id: "parity-echo-readme",
    prompt:
      "Read README.md in your current workspace and reply with its first heading.",
    fixture: {
      kind: "repo",
      source: "./fixtures/hello-world",
    },
  },
];
