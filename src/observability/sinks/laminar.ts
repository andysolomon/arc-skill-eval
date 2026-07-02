import type {
  ObservabilityArtifactPaths,
  ObservabilityCaseVariantPayload,
  ObservabilityExportResult,
  ObservabilitySink,
} from "../types.js";

/**
 * Configuration for the Laminar observability sink.
 *
 * `apiKey` is required to authenticate with the Laminar ingestion API.
 * `baseUrl` and `projectName` are optional overrides.
 */
export interface LaminarSinkConfig {
  apiKey: string;
  baseUrl?: string;
  projectName?: string;
}

/**
 * Per-assertion grading verdict included in the exported datapoint output.
 * This is grading data (verdict + short evidence quote), never the full
 * assistant response, prompt, or file contents.
 */
export interface LaminarAssertionOutcome {
  text: string;
  passed: boolean;
  evidence: string;
}

/**
 * Flattened, conservative record for a single case-variant. This
 * intentionally carries metadata, grading verdicts, and artifact PATHS
 * only — never full assistant text, prompts, or file contents.
 */
export interface LaminarCaseVariantRecord {
  /** Datapoint display name; includes the variant so the two runs are visually distinct. */
  name: string;
  /** Shared run identifier so both variants group under the same run. */
  run_id: string;
  /** Optional iteration label when a case is executed multiple times. */
  iteration?: string;
  /** Skill under test. */
  skill_name: string;
  skill_dir: string;
  /** Shared case identifier so both variants group under the same case. */
  case_id: string;
  /** "with_skill" | "without_skill" — the distinguishing attribute. */
  variant: ObservabilityCaseVariantPayload["variant"];
  /** Model + provider, derived from `timing.model`. */
  model_provider: string | null;
  model_id: string | null;
  thinking_level: string | null;
  /** Token usage. */
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  /** Estimated cost in USD. */
  estimated_cost_usd: number;
  /** Wall-clock duration in milliseconds. */
  duration_ms: number;
  /** Grading pass/fail summary. */
  grading_passed: number;
  grading_failed: number;
  grading_total: number;
  grading_pass_rate: number | null;
  /** Per-assertion verdicts (text + evidence quote, never full outputs). */
  assertions: LaminarAssertionOutcome[];
  /** Tool-summary counts. */
  tool_call_count: number;
  tool_error_count: number;
  mcp_tool_call_count: number;
  file_touch_count: number;
  external_call_count: number;
  /** Artifact paths (paths only — not contents). */
  artifact_paths: ObservabilityArtifactPaths;
  /** Free-form attribute bag mirroring the above for backends that key on attributes. */
  attributes: Record<string, string | number | boolean | null>;
}

/**
 * Minimal injectable client port. The real implementation is constructed
 * lazily via a dynamic import of the optional `@lmnr-ai/lmnr` package and
 * reports to Laminar's Evaluations API; tests inject a mock that captures
 * records.
 */
export interface LaminarEvalClient {
  exportCaseVariant(record: LaminarCaseVariantRecord): Promise<void>;
  /** Dashboard URLs of the evaluations created so far, in creation order. */
  evaluationUrls?(): string[];
  /** Drain in-flight exports and await delivery. Called once at end of run. */
  shutdown?(): Promise<void>;
}

/** Sink returned by {@link createLaminarSink}; exposes created evaluation URLs. */
export interface LaminarSink extends ObservabilitySink {
  evaluationUrls(): string[];
}

function mapPayloadToRecord(
  payload: ObservabilityCaseVariantPayload,
): LaminarCaseVariantRecord {
  const { timing, grading_summary, tool_summary } = payload;
  const model = timing.model;
  const usage = timing.token_usage;

  const modelProvider = model?.provider ?? null;
  const modelId = model?.id ?? null;
  const thinkingLevel = model?.thinking ?? null;

  const name = `${payload.skill.name}/${payload.case_id} [${payload.variant}]`;

  const attributes: Record<string, string | number | boolean | null> = {
    "eval.run_id": payload.run_id,
    "eval.iteration": payload.iteration ?? null,
    "eval.skill.name": payload.skill.name,
    "eval.skill.dir": payload.skill.dir,
    "eval.case_id": payload.case_id,
    "eval.variant": payload.variant,
    "gen_ai.request.model": modelId,
    "gen_ai.system": modelProvider,
    "gen_ai.thinking_level": thinkingLevel,
    "gen_ai.usage.input_tokens": usage.input_tokens,
    "gen_ai.usage.output_tokens": usage.output_tokens,
    "gen_ai.usage.cache_read_tokens": usage.cache_read_tokens,
    "gen_ai.usage.cache_write_tokens": usage.cache_write_tokens,
    "gen_ai.usage.total_tokens": timing.total_tokens,
    "eval.estimated_cost_usd": timing.estimated_cost_usd,
    "eval.duration_ms": timing.duration_ms,
    "eval.grading.passed": grading_summary.passed,
    "eval.grading.failed": grading_summary.failed,
    "eval.grading.total": grading_summary.total,
    "eval.grading.pass_rate": grading_summary.pass_rate,
    "eval.tools.call_count": tool_summary.tool_call_count,
    "eval.tools.error_count": tool_summary.tool_error_count,
    "eval.tools.mcp_call_count": tool_summary.mcp_tool_call_count,
    "eval.tools.file_touch_count": tool_summary.file_touch_count,
    "eval.tools.external_call_count": tool_summary.external_call_count,
  };

  const assertions: LaminarAssertionOutcome[] = (payload.grading.assertion_results ?? []).map(
    (result) => ({
      text: result.text,
      passed: result.passed,
      evidence: result.evidence,
    }),
  );

  return {
    name,
    run_id: payload.run_id,
    iteration: payload.iteration,
    skill_name: payload.skill.name,
    skill_dir: payload.skill.dir,
    case_id: payload.case_id,
    variant: payload.variant,
    model_provider: modelProvider,
    model_id: modelId,
    thinking_level: thinkingLevel,
    total_tokens: timing.total_tokens,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_tokens,
    cache_write_tokens: usage.cache_write_tokens,
    estimated_cost_usd: timing.estimated_cost_usd,
    duration_ms: timing.duration_ms,
    grading_passed: grading_summary.passed,
    grading_failed: grading_summary.failed,
    grading_total: grading_summary.total,
    grading_pass_rate: grading_summary.pass_rate,
    assertions,
    tool_call_count: tool_summary.tool_call_count,
    tool_error_count: tool_summary.tool_error_count,
    mcp_tool_call_count: tool_summary.mcp_tool_call_count,
    file_touch_count: tool_summary.file_touch_count,
    external_call_count: tool_summary.external_call_count,
    artifact_paths: payload.artifact_paths,
    attributes,
  };
}

/**
 * Name of the Laminar evaluation a record belongs to. One evaluation per
 * (run, iteration, variant); the two variants of a run are sibling
 * evaluations in the same group (the skill name), which is what makes them
 * comparable side by side in the Evaluations UI.
 */
export function buildEvaluationName(record: LaminarCaseVariantRecord): string {
  const iteration = record.iteration ? ` ${record.iteration}` : "";
  return `${record.skill_name} ${record.run_id}${iteration} [${record.variant}]`;
}

/**
 * The pieces of a Laminar evaluation datapoint derived from a case-variant
 * record: input `data`, numeric `scores` (rendered as comparable metric
 * columns), the `executorOutput` shown as the datapoint's output, and
 * free-form `metadata`.
 */
export interface LaminarDatapointParts {
  data: Record<string, unknown>;
  scores: Record<string, number>;
  executorOutput: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export function buildDatapoint(record: LaminarCaseVariantRecord): LaminarDatapointParts {
  const scores: Record<string, number> = {
    passed: record.grading_passed,
    failed: record.grading_failed,
    total_tokens: record.total_tokens,
    cost_usd: record.estimated_cost_usd,
    duration_ms: record.duration_ms,
    tool_calls: record.tool_call_count,
  };
  // pass_rate is the headline score; a null rate (no gradable assertions)
  // is omitted rather than coerced to 0, which would read as a failure.
  if (record.grading_pass_rate !== null) {
    scores.pass_rate = record.grading_pass_rate;
  }

  const data: Record<string, unknown> = {
    case_id: record.case_id,
    skill: record.skill_name,
    variant: record.variant,
    model: record.model_id ? `${record.model_provider ?? "unknown"}/${record.model_id}` : null,
  };

  const executorOutput: Record<string, unknown> = {
    grading: {
      passed: record.grading_passed,
      failed: record.grading_failed,
      total: record.grading_total,
      pass_rate: record.grading_pass_rate,
    },
    assertions: record.assertions,
    artifacts: record.artifact_paths,
  };

  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record.attributes)) {
    if (value === null || value === undefined) continue;
    metadata[key] = value;
  }

  return { data, scores, executorOutput, metadata };
}

/** Map an API base URL to the Laminar dashboard origin (mirrors the SDK). */
export function laminarFrontendUrl(baseUrl?: string): string {
  const url = (baseUrl ?? "https://api.lmnr.ai").replace(/\/$/, "");
  return url === "https://api.lmnr.ai" ? "https://www.laminar.sh" : url;
}

const MISSING_SDK_MESSAGE =
  'Laminar sink requires the optional "@lmnr-ai/lmnr" package, which is not installed. ' +
  "Install it (e.g. `npm install @lmnr-ai/lmnr`) or inject a client via " +
  "createLaminarSink(config, { client }).";

/**
 * Lazily construct a real Laminar-backed client that reports to the
 * Evaluations API over plain HTTP (`LaminarClient.evals`): one evaluation
 * per (run, iteration, variant), one datapoint per case with numeric scores
 * and grading output. No OTel tracer is involved, so there is no flush /
 * batch-delivery step to get wrong — every awaited call has already reached
 * the backend when it resolves.
 *
 * The `@lmnr-ai/lmnr` SDK is an optional dependency imported on demand, so
 * non-Laminar runs never load it and installs that skip optional deps still
 * work (with a clear error).
 */
async function createRealClient(
  config: LaminarSinkConfig,
): Promise<LaminarEvalClient> {
  let sdk: typeof import("@lmnr-ai/lmnr");
  try {
    sdk = await import("@lmnr-ai/lmnr");
  } catch {
    throw new Error(MISSING_SDK_MESSAGE);
  }

  const client = new sdk.LaminarClient({
    baseUrl: config.baseUrl,
    projectApiKey: config.apiKey,
  });

  // One evaluation per (run, iteration, variant), memoized as a promise so
  // concurrent case exports for the same variant share a single init call.
  const evaluations = new Map<string, Promise<{ id: string; url: string }>>();
  const nextIndex = new Map<string, number>();
  const urls: string[] = [];

  function evaluationFor(record: LaminarCaseVariantRecord): Promise<{ id: string; url: string }> {
    const key = `${record.run_id}::${record.iteration ?? ""}::${record.variant}`;
    let pending = evaluations.get(key);
    if (!pending) {
      const groupName = config.projectName ?? record.skill_name;
      pending = client.evals
        .init(buildEvaluationName(record), groupName, {
          "eval.run_id": record.run_id,
          "eval.skill.name": record.skill_name,
          "eval.skill.dir": record.skill_dir,
          "eval.variant": record.variant,
          ...(record.iteration ? { "eval.iteration": record.iteration } : {}),
        })
        .then((created) => {
          const url = `${laminarFrontendUrl(config.baseUrl)}/project/${created.projectId}/evaluations/${created.id}`;
          urls.push(url);
          return { id: created.id, url };
        });
      evaluations.set(key, pending);
    }
    return pending;
  }

  return {
    async exportCaseVariant(record: LaminarCaseVariantRecord): Promise<void> {
      const { id: evalId } = await evaluationFor(record);
      const index = nextIndex.get(evalId) ?? 0;
      nextIndex.set(evalId, index + 1);

      const { data, scores, executorOutput, metadata } = buildDatapoint(record);
      const datapointId = await client.evals.createDatapoint({
        evalId,
        data,
        metadata,
        index,
      });
      await client.evals.updateDatapoint({
        evalId,
        datapointId,
        scores,
        executorOutput,
      });
    },
    evaluationUrls(): string[] {
      return [...urls];
    },
  };
}

/**
 * Create a provider-neutral observability sink that exports each
 * case-variant to Laminar's Evaluations API as a scored datapoint
 * (grading verdicts + metadata + artifact paths only — never full
 * assistant text). A client may be injected for tests; otherwise a real
 * client is lazily constructed on first export.
 */
export function createLaminarSink(
  config: LaminarSinkConfig,
  deps?: { client?: LaminarEvalClient },
): LaminarSink {
  let client: LaminarEvalClient | undefined = deps?.client;

  async function resolveClient(): Promise<LaminarEvalClient> {
    if (!client) {
      client = await createRealClient(config);
    }
    return client;
  }

  return {
    name: "laminar",
    async exportCaseVariant(
      payload: ObservabilityCaseVariantPayload,
    ): Promise<ObservabilityExportResult> {
      try {
        const record = mapPayloadToRecord(payload);
        const activeClient = await resolveClient();
        await activeClient.exportCaseVariant(record);
        return { sink: "laminar", status: "success" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { sink: "laminar", status: "failed", message };
      }
    },
    evaluationUrls(): string[] {
      return client?.evaluationUrls?.() ?? [];
    },
    async shutdown(): Promise<void> {
      // Only a client that was actually constructed (i.e. at least one export
      // happened, or a client was injected) needs draining.
      await client?.shutdown?.();
    },
  };
}
