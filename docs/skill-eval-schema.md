# `skill.eval.ts` Schema Draft

## Purpose
This document defines the author-facing shape of adjacent `skill.eval.ts` files.

A participating skill provides:
- `SKILL.md`
- adjacent `skill.eval.ts`

The eval file is:
- TypeScript
- schema-only
- framework-independent at runtime
- normalized and validated by `arc-skill-eval`

## Design Rules
1. Prefer declarative data.
2. Allow imports from local sibling files when needed.
3. Avoid hard runtime dependency on the framework package.
4. Allow custom assertions only as an escape hatch.
5. Keep routing examples authored, not inferred.

---

## Conceptual Shape

```ts
export default {
  skill: "arc-planning-work",
  profile: "planning",
  targetTier: 1,
  enforcement: {
    tier: "warn",
    score: "warn",
  },
  thresholds: {
    overall: 0.85,
    routing: 0.9,
    execution: 0.8,
  },
  model: {
    provider: "anthropic",
    id: "claude-sonnet-4-5",
    thinking: "medium",
  },
  routing: {
    explicit: [],
    implicitPositive: [],
    adjacentNegative: [],
    hardNegative: [],
  },
  execution: [],
  cliParity: [],
  liveSmoke: [],
  rubric: {
    enabled: false,
  },
};
```

---

## Field Reference

## Root Fields

### `skill`
```ts
skill: string;
```
Must match the skill being evaluated.

### `profile`
```ts
profile: "planning" | "repo-mutation" | "external-api" | "orchestration";
```
Selects default scorer packs and conventions.

### `targetTier`
```ts
targetTier: 0 | 1 | 2 | 3;
```
Declares intended maturity.

### `enforcement`
```ts
enforcement?: {
  tier?: "warn" | "required";
  score?: "warn" | "required";
};
```
Controls whether tier/score gaps warn or fail.

### `thresholds`
```ts
thresholds?: {
  overall?: number;
  routing?: number;
  execution?: number;
  cliParity?: number;
  liveSmoke?: number;
};
```
Skill-level score thresholds.

### `model`
```ts
model?: {
  provider: string;
  id: string;
  thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
};
```
Optional per-skill model override above profile defaults.

### `overrides`
```ts
overrides?: {
  weights?: Partial<{
    trigger: number;
    process: number;
    outcome: number;
    style: number;
  }>;
  expectedSignals?: string[];
  forbiddenSignals?: string[];
};
```
Profile-default overrides.

---

## Routing Section

```ts
routing: {
  explicit: RoutingCase[];
  implicitPositive: RoutingCase[];
  adjacentNegative: RoutingCase[];
  hardNegative?: RoutingCase[];
};
```

### `RoutingCase`

```ts
type RoutingCase = {
  id: string;
  prompt: string;
  trialCount?: number;
  expected?: CaseExpected;
  mustPass?: MustPassAssertion[];
  notes?: string;
};
```

Routing cases should always use **stable human-authored IDs**.
The framework will also compute a derived fingerprint.

### Recommended Minimum Authoring
For a skill entering Tier 1:
- 2 explicit prompts
- 3 implicit positives
- 3 adjacent negatives
- 1 hard negative

---

## Execution Section

```ts
execution?: ExecutionCase[];
```

### `ExecutionCase`

```ts
type ExecutionCase = {
  id: string;
  lane?: "deterministic";
  prompt: string;
  fixture?: FixtureRef;
  model?: {
    provider: string;
    id: string;
    thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  };
  trialCount?: number;
  expected?: CaseExpected;
  mustPass?: MustPassAssertion[];
  customAssertions?: CustomAssertionRef[];
  notes?: string;
};
```

---

## CLI Parity Section

```ts
cliParity?: ParityCase[];
```

### `ParityCase`

```ts
type ParityCase = {
  id: string;
  prompt: string;
  fixture?: FixtureRef;
  expected?: CaseExpected;
  mustPass?: MustPassAssertion[];
  notes?: string;
};
```

These cases should be a **small golden subset**, not the whole suite.

---

## Live Smoke Section

```ts
liveSmoke?: LiveSmokeCase[];
```

### `LiveSmokeCase`

```ts
type LiveSmokeCase = {
  id: string;
  prompt: string;
  fixture?: FixtureRef;
  envRequired: string[];
  expected?: CaseExpected;
  mustPass?: MustPassAssertion[];
  notes?: string;
};
```

For `external-api` skills targeting Tier 3, at least one live smoke case is expected.

---

## Rubric Section

```ts
rubric?: {
  enabled: boolean;
  prompts?: string[];
};
```

v1 includes the extension point only. No rubric backend is required.

---

## Fixtures

### `FixtureRef`

```ts
type FixtureRef = {
  kind: "repo" | "docs" | "api";
  source: string;
  initGit?: boolean;
  setup?: string;
  teardown?: string;
  git?: GitFixtureSpec;
  external?: ExternalFixtureSpec;
  env?: Record<string, string>;
};
```

`source` may point to:
- a local fixture path adjacent to the skill
- a shared fixture ID or framework-resolved fixture path

### `GitFixtureSpec`

```ts
type GitFixtureSpec = {
  enabled: boolean;
  defaultBranch?: string;
  currentBranch?: string;
  commits?: Array<{
    message: string;
    files: Record<string, string>;
    tags?: string[];
  }>;
  dirtyFiles?: Record<string, string>;
  stagedFiles?: string[];
  remotes?: Array<{
    name: string;
    url: string;
  }>;
};
```

### `ExternalFixtureSpec`

```ts
type ExternalFixtureSpec = {
  mockServers?: Array<{
    id: string;
    routesSource: string;
    env?: Record<string, string>;
  }>;
  cliShims?: Array<{
    command: string;
    script: string;
  }>;
};
```

---

## Expectations

v1 uses **hybrid expectations**:
- profile defaults provide baseline expectations
- each case declares deltas and critical assertions

### `CaseExpected`

```ts
type CaseExpected = {
  signals?: {
    include?: string[];
    exclude?: string[];
  };
  tools?: {
    include?: string[];
    exclude?: string[];
  };
  commands?: {
    include?: string[];
    exclude?: string[];
  };
  files?: {
    include?: string[];
    exclude?: string[];
    created?: string[];
    edited?: string[];
  };
  text?: {
    include?: string[];
    exclude?: string[];
  };
  artifacts?: string[];
};
```

---

## Hard Assertions

Hard assertions fail a case regardless of weighted score.

### `MustPassAssertion`

```ts
type MustPassAssertion =
  | { type: "no-forbidden-files-touched"; paths: string[] }
  | { type: "skill-read-required"; skill: string }
  | { type: "no-live-external-calls" }
  | { type: "no-forbidden-commands"; commands: string[] }
  | { type: "custom"; ref: string };
```

---

## Custom Assertions

v1 supports custom assertions as an escape hatch.

Because eval files remain framework-independent at runtime, custom assertions should be referenced indirectly.

### `CustomAssertionRef`

```ts
type CustomAssertionRef = {
  ref: string;
};
```

Example:

```ts
customAssertions: [{ ref: "./assertions.ts#planMapsAcceptanceCriteria" }]
```

The framework can resolve and invoke that function if present.

Conceptual function contract:

```ts
type CustomAssertion = (ctx: {
  trace: unknown;
  workspaceDir: string;
  fixture: unknown;
}) => Promise<{
  pass: boolean;
  score?: number;
  message: string;
  details?: Record<string, unknown>;
}>;
```

---

## File Splitting
`skill.eval.ts` is the canonical entrypoint, but it may import sibling files.

Example:

```text
arc-planning-work/
├── SKILL.md
├── skill.eval.ts
├── routing.cases.ts
├── execution.cases.ts
├── assertions.ts
└── fixtures/
```

This allows larger skills to stay maintainable while preserving one obvious eval entrypoint.

---

## Example Minimal Contract

```ts
export default {
  skill: "arc-planning-work",
  profile: "planning",
  targetTier: 1,
  enforcement: {
    tier: "warn",
    score: "warn",
  },
  routing: {
    explicit: [
      {
        id: "routing-explicit-001",
        prompt: "Use /skill:arc-planning-work to create an implementation plan for this GitHub issue.",
        mustPass: [{ type: "skill-read-required", skill: "arc-planning-work" }],
      },
    ],
    implicitPositive: [
      {
        id: "routing-implicit-001",
        prompt: "Create an implementation plan for this tracked work item.",
      },
    ],
    adjacentNegative: [
      {
        id: "routing-negative-001",
        prompt: "Implement this issue now.",
      },
    ],
  },
  execution: [
    {
      id: "execution-001",
      prompt: "Create an implementation plan for this issue.",
      fixture: {
        kind: "docs",
        source: "./fixtures/basic-issue",
      },
      expected: {
        text: {
          include: [
            "## Implementation Plan",
            "### Tasks",
            "### Test Strategy",
          ],
        },
      },
    },
  ],
  cliParity: [],
  liveSmoke: [],
  rubric: {
    enabled: false,
  },
};
```

---

## Validation Rules to Enforce in the Framework
At minimum, the framework should validate:
- `skill` is present
- `profile` is valid
- `targetTier` is valid
- routing arrays are present for participating skills
- all case IDs are unique within the skill
- IDs are stable strings, not generated at runtime
- prompts are non-empty strings
- fixture refs are structurally valid
- thresholds are numbers in a valid range if provided
- live smoke cases declare `envRequired`
- target Tier 3 `external-api` skills define at least one live smoke case

---

## Authoring Guidance
- Start small.
- Get to Tier 0 first.
- Add deterministic execution before CLI parity.
- Use custom assertions sparingly.
- Keep most expectations declarative.
- Prefer stable fixture references and stable case IDs.

### Writing effective `expected.text.include` tokens
`expected.text.include` is a substring match against the assistant's final
text. Each entry must appear verbatim somewhere in the response, or the
check fails. That's strict — and against a real LLM it's easy to get
wrong in ways that have nothing to do with whether the skill worked.

**Pick tokens that survive paraphrasing.** Models alternate freely between
quoting and summarizing, and between sentence case and lowercase. A token
that only matches one rendering style will report false failures for the
other.

<table>
<tr><th>Avoid</th><th>Prefer</th><th>Why</th></tr>
<tr>
  <td><code>["Hello World"]</code></td>
  <td><code>["README"]</code> or <code>["Hello", "World"]</code></td>
  <td>Literal heading-quotes fail when the model summarizes instead of quoting. A token that every reasonable response mentions (the file name, the subject) is more robust.</td>
</tr>
<tr>
  <td><code>["## Implementation Plan"]</code></td>
  <td><code>["Implementation Plan"]</code></td>
  <td>Heading-marker prefixes fail when the model uses a different level or prose. Match the heading text, not the markdown syntax.</td>
</tr>
<tr>
  <td><code>["You should"]</code></td>
  <td><code>["should", "recommend"]</code></td>
  <td>Subject-pronoun phrasing fails when the model uses "you could" / "we recommend". Match the action verb, not the sentence stem.</td>
</tr>
</table>

**Rules of thumb:**

- Treat the list as "what *must* appear for the task to be considered done," not "what the ideal answer would say."
- Prefer nouns/proper nouns and action verbs over phrases.
- If you need structural expectations (e.g., "the response must have an Implementation Plan section"), consider pairing a soft `text.include: ["Implementation Plan"]` with a custom assertion that parses the actual structure.
- For execution cases, `expected.tools.include` (e.g., `["read"]`) is usually a stronger signal than `text.include`. Tool calls are deterministic; prose is not.
- When a check fails against a real run, ask whether the model behaved correctly but chose different words. If yes, loosen the token before blaming the model.
