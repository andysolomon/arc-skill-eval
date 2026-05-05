# Laminar integration research

Tracked by GitHub issue [W-000001](https://github.com/andysolomon/arc-skill-eval/issues/29).

## Recommendation

Add Laminar as an **optional observability export sink** for `arc-skill-eval` runs. Do not make Laminar required, and do not replace Skeval's local artifact tree. The local files (`assistant.md`, `outputs/`, `timing.json`, `grading.json`, `trace.json`, `tool-summary.json`, `context-manifest.json`, and compare-mode `benchmark.json`) remain canonical.

The first implementation should use Laminar tracing/manual spans, not Laminar's `evaluate()` runner. Skeval already owns eval discovery, fixture materialization, with/without-skill variants, grading, and local artifact persistence. Laminar should receive a structured projection of the completed run for dashboarding and analysis.

A later iteration can optionally use Laminar's manual evaluation API to create evaluation rows and attach scores, but that should not block the initial exporter.

## Package and API findings

Current package lookup, as of this research:

| Candidate | Result | Notes |
| --- | --- | --- |
| `@lmnr-ai/lmnr` | Current TypeScript SDK package (`0.8.22` during research) | Preferred package. Provides SDK APIs and `lmnr` CLI binary. |
| `lmnr` | Not found on npm | Do not use. |
| `@lmnr-ai/core` | Not found on npm | Do not use. |

Primary TypeScript APIs from `@lmnr-ai/lmnr`:

- `Laminar.initialize(options?)`
- `observe(options, fn, ...args)`
- `Laminar.startActiveSpan(options)` / `Laminar.startSpan(options)` / `Laminar.withSpan(span, fn)`
- `Laminar.event({ name, attributes, ... })`
- `Laminar.setSpanAttributes(...)`
- `Laminar.setSpanOutput(...)`
- `Laminar.setTraceMetadata(...)`
- `Laminar.getTraceId()`
- `Laminar.flush()` / `Laminar.shutdown()`
- `LaminarClient` for HTTP API operations such as trace tagging and manual evaluation APIs

Relevant docs checked:

- <https://laminar.sh/docs/getting-started.md>
- <https://laminar.sh/docs/sdk/typescript/instrumentation.md>
- <https://laminar.sh/docs/sdk/manual-spans.md>
- <https://laminar.sh/docs/sdk/observe.md>
- <https://laminar.sh/docs/sdk/span-methods.md>
- <https://laminar.sh/docs/sdk/trace-methods.md>
- <https://laminar.sh/docs/sdk/lifecycle.md>
- <https://laminar.sh/docs/sdk/client.md>
- <https://laminar.sh/docs/sdk/constants.md>
- <https://laminar.sh/docs/tracing/structure/manual-span-creation.md>
- <https://laminar.sh/docs/tracing/structure/flushing-and-shutdown.md>
- <https://laminar.sh/docs/tracing/structure/metadata.md>
- <https://laminar.sh/docs/tracing/structure/span-types.md>
- <https://laminar.sh/docs/tracing/otel.md>
- <https://laminar.sh/docs/evaluations/manual-evaluation.md>

## Configuration

Required configuration:

- `LMNR_PROJECT_API_KEY` or `Laminar.initialize({ projectApiKey })`

Optional configuration exposed by the SDK:

| SDK option | Default | Notes for Skeval |
| --- | --- | --- |
| `baseUrl` | `https://api.lmnr.ai` | Support env override for self-host/proxy. |
| `baseHttpUrl` | `baseUrl` | Only needed for HTTP proxy setups. |
| `httpPort` | `443` | OTLP HTTP/protobuf. |
| `grpcPort` | `8443` | OTLP/gRPC; Laminar recommends gRPC. |
| `instrumentModules` | all auto-instrumentable modules when unspecified | Skeval should start with `{}` to avoid surprising auto-instrumentation. |
| `disableBatch` | `false` | Useful for debugging; not required by default. |
| `traceExportTimeoutMillis` | `30000` | Reasonable to expose later if needed. |
| `maxExportBatchSize` | `512` | Default is fine. |
| `forceHttp` | `false` | Leave false unless a user needs HTTP/protobuf. |
| `logLevel` | `error` | Default is fine. |
| `metadata` | none | Useful for global Skeval metadata once configured. |

Recommended Skeval env names:

| Env var | Purpose |
| --- | --- |
| `LMNR_PROJECT_API_KEY` | Required only when Laminar export is explicitly enabled. |
| `LMNR_BASE_URL` | Optional Laminar/self-host base URL. |
| `LMNR_FORCE_HTTP` | Optional advanced escape hatch. |
| `LMNR_DISABLE_BATCH` | Optional debugging escape hatch. |

Do not commit API keys. A local `.env` or shell export is appropriate for manual smoke tests only.

## Initialization lifecycle

Recommended initial shape for the Laminar exporter:

```ts
import { Laminar } from '@lmnr-ai/lmnr';

Laminar.initialize({
  projectApiKey: process.env.LMNR_PROJECT_API_KEY,
  baseUrl: process.env.LMNR_BASE_URL,
  instrumentModules: {},
});

try {
  // export one or more traces
} finally {
  await Laminar.flush();
}
```

Notes:

- `Laminar.initialize()` must run once and early for auto-instrumentation. Because Skeval's initial integration should export completed artifacts manually, it can initialize inside the exporter setup path rather than at process start.
- `instrumentModules: {}` should disable automatic instrumentation. This avoids surprising traces from Pi internals or provider SDKs and keeps W-000002's provider-neutral sink contract clean.
- CLI processes should call `Laminar.flush()` near the end so batched spans are sent before exit.
- `Laminar.shutdown()` flushes and releases resources. Use it only when the process is done with all Laminar work.

## Recommended trace model

### Trace boundary

Create **one Laminar trace per Skeval case variant**.

Examples:

- Non-compare run: one trace for `case_id=1`, `variant=with_skill`.
- Compare run: two traces for the same case, one `variant=with_skill`, one `variant=without_skill`.

Reasoning:

- Case variant is the unit with independent `assistant.md`, `outputs/`, `timing.json`, `grading.json`, `trace.json`, `tool-summary.json`, and `context-manifest.json` artifacts.
- Compare mode already stores variant artifacts separately; preserving that separation in Laminar makes with/without inspection straightforward.
- Shared fields (`run_id`, `skill_name`, `case_id`) allow grouping both variants in the Laminar UI.

### Span tree

Recommended first-pass tree:

```text
skeval.case                  spanType: EVALUATION
├── skeval.executor.pi       spanType: EXECUTOR
├── skeval.tool.<tool-name>  spanType: TOOL      (optional child spans or events)
└── skeval.grading           spanType: EVALUATOR
    └── skeval.assertion     spanType: EVALUATOR (optional per-assertion spans or events)
```

Root span naming should stay low-cardinality. Put IDs in metadata/attributes, not span names.

Recommended root span:

```ts
Laminar.startActiveSpan({
  name: 'skeval.case',
  spanType: 'EVALUATION',
  metadata: {
    run_id,
    iteration,
    skill_name,
    case_id,
    variant,
    compare,
    context_mode,
  },
  tags: ['skeval', variant, grading.summary.failed === 0 ? 'pass' : 'fail'],
});
```

### Mapping table

| Skeval source | Laminar destination | Notes |
| --- | --- | --- |
| `runId` | trace metadata `run_id` | Groups all traces from one CLI run. |
| `iteration` | trace metadata `iteration` | Omit when absent. |
| `skillName` | trace metadata `skill_name`; root attr `skeval.skill.name` | Keep stable. |
| `skillDir` / `relativeSkillDir` | root attr `skeval.skill.dir` | Prefer relative paths where possible. |
| `caseId` | trace metadata `case_id`; root attr `skeval.case.id` | Stable grouping field. |
| `variant` | trace metadata `variant`; tag `with_skill`/`without_skill` | Required for compare mode. |
| `contextManifest.mode` | trace metadata `context_mode` | Useful for filtering isolated vs ambient. |
| `contextManifest.attached_skills` | root attr `skeval.context.attached_skill_count`; optional JSON output | Avoid large nested metadata. |
| `timing.duration_ms` | root attr `skeval.duration_ms`; executor span duration where possible | Laminar span duration will also exist. |
| `timing.model.provider` | attr `gen_ai.system` via `LaminarAttributes.PROVIDER` | Use Laminar constants when implementing. |
| `timing.model.id` | attr `gen_ai.request.model` / `gen_ai.response.model` | If requested/actual are the same, set both. |
| `timing.token_usage.input_tokens` | attr `gen_ai.usage.input_tokens` | Use Laminar constants. |
| `timing.token_usage.output_tokens` | attr `gen_ai.usage.output_tokens` | Use Laminar constants. |
| `timing.total_tokens` | attr `llm.usage.total_tokens` | Use Laminar constants. |
| `timing.estimated_cost_usd` | attr `gen_ai.usage.cost` | Use Laminar constants. |
| `timing.context_window_*` | attrs `skeval.context_window_tokens`, `skeval.context_window_used_percent` | Skeval-specific. |
| `grading.summary` | root attrs + grading span output | Include passed/failed/total/pass_rate/verdict. |
| `grading.assertion_results[]` | evaluator events or per-assertion EVALUATOR spans | Start with events to avoid noisy span trees. |
| `toolSummary` | root attrs + tool events/spans | Include counts by name and error count. |
| `trace.observations.toolCalls` | `TOOL` spans or events | Tool spans improve transcript view, but events are simpler if durations are unavailable. |
| `trace.observations.toolResults` | close/annotate matching tool span or add result event | Include `isError`. |
| `trace.observations.skillReads` | tool span/event attrs | Useful to distinguish skill-read behavior. |
| `trace.observations.externalCalls` | events and root counts | Useful for policy/safety review. |
| artifact paths | attrs under `skeval.artifact.*` | Prefer paths/URLs over full content. |
| `assistant.md` / prompt text | do not export by default | See privacy policy below. |

### Token/cost ambiguity

Skeval currently has aggregate usage for the Pi session, not necessarily every individual LLM call. Laminar's `LLM` span type is ideal when representing actual LLM calls. For the initial exporter, use one of these approaches:

1. Conservative: put aggregate usage attributes on the `skeval.executor.pi` span (`spanType: EXECUTOR`).
2. UI-optimized but synthetic: add a child `skeval.llm.aggregate` span (`spanType: LLM`) with aggregate usage and make it clear via `skeval.synthetic=true`.

Prefer option 1 unless Laminar dashboards require `LLM` spans for cost aggregation.

## Privacy policy for the initial exporter

Default export should be metadata-only:

- Export scores, counts, model IDs, timing, token/cost metrics, tool names, and artifact paths.
- Do **not** export full prompts, assistant text, workspace file contents, raw messages, or raw tool inputs/results by default.
- If a future flag exports content, make it explicit (for example `--laminar-include-content`) and document the data exposure clearly.

This matches Skeval's local-artifact posture: sensitive detail stays on disk unless the user opts into sending it elsewhere.

## Failure semantics

Recommended behavior:

1. Laminar disabled by default.
2. If Laminar export is explicitly enabled and required config is missing, fail fast before running eval cases with a clear config error naming `LMNR_PROJECT_API_KEY`.
3. If local artifact writing succeeds but Laminar export fails at runtime (network, timeout, invalid credentials discovered during flush), preserve local artifacts and report the export failure separately.
4. Do not count Laminar export failure as an assertion failure.
5. Optionally add a future strict mode (`--laminar-strict`) that makes export failure produce a non-zero CLI exit code.

Rationale: Laminar is an optional sink. It should not make eval execution less reliable or corrupt the canonical artifacts.

## Testing strategy

No CI test should require a real Laminar account or `LMNR_PROJECT_API_KEY`.

Recommended tests for follow-up issues:

- W-000002: fake provider-neutral sink receives complete case/variant payload.
- W-000002: disabled/default run makes zero exporter calls.
- W-000002: exporter failure preserves local artifacts and is surfaced separately.
- W-000003: CLI parser accepts explicit Laminar opt-in flag/env configuration.
- W-000003: missing config fails fast before case execution.
- W-000004: Laminar exporter unit tests use a mocked Laminar module/client or an injected adapter, not the real network.
- W-000004: compare mode exports distinguishable `with_skill` and `without_skill` metadata.
- W-000004: content-export behavior is off by default.

Dependency injection is preferred. A thin adapter around `@lmnr-ai/lmnr` can expose `initialize`, `startActiveSpan`, `event`, `flush`, and `shutdown`; tests can pass a fake adapter and assert calls.

## Open questions for implementation

- Should Skeval add a Laminar trace only, or also create Laminar evaluation rows through `LaminarClient.evals`? Recommendation: traces first; evaluation rows later.
- Should aggregate Pi usage be represented as an `EXECUTOR` span with attributes or a synthetic `LLM` span? Recommendation: start with `EXECUTOR`; revisit if dashboards need `LLM` aggregation.
- Should export failure ever fail the command? Recommendation: warning by default, optional strict mode later.
- Should artifact paths be local absolute paths or repo-relative paths? Recommendation: repo-relative when possible; include absolute output dir only in local CLI output.

## Follow-up implementation sketch

W-000002 should introduce a provider-neutral contract similar to:

```ts
export interface ObservabilitySink {
  exportCaseVariant(payload: CaseVariantExportPayload): Promise<ObservabilityExportResult>;
  flush?(): Promise<void>;
  shutdown?(): Promise<void>;
}
```

W-000004 can then implement:

```ts
export class LaminarObservabilitySink implements ObservabilitySink {
  constructor(config: LaminarConfig, adapter = realLaminarAdapter) {}
  async exportCaseVariant(payload: CaseVariantExportPayload) {
    // create root EVALUATION span
    // attach metadata, timing, grading, tool summary, artifact paths
    // add child spans/events for executor, tools, grading
  }
  async flush() {
    await Laminar.flush();
  }
}
```
