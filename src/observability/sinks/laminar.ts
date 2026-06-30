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
 * Flattened, conservative trace record sent to Laminar for a single
 * case-variant. This intentionally carries metadata + artifact PATHS
 * only — never full assistant text, prompts, or file contents.
 */
export interface LaminarCaseVariantRecord {
  /** Trace/span name; includes the variant so the two runs are visually distinct. */
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
  /** Tool-summary counts. */
  tool_call_count: number;
  tool_error_count: number;
  mcp_tool_call_count: number;
  file_touch_count: number;
  external_call_count: number;
  /** Artifact paths (paths only — not contents). */
  artifact_paths: ObservabilityArtifactPaths;
  /** Free-form attribute bag mirroring the above for trace backends that key on attributes. */
  attributes: Record<string, string | number | boolean | null>;
}

/**
 * Minimal injectable client port. The real implementation is constructed
 * lazily via a dynamic import of the optional `@lmnr-ai/lmnr` package; tests
 * inject a mock that captures records.
 */
export interface LaminarTraceClient {
  exportCaseVariant(record: LaminarCaseVariantRecord): Promise<void>;
}

/**
 * Minimal local description of the optional `@lmnr-ai/lmnr` SDK surface we
 * touch. Declared locally so typecheck passes without the package installed.
 */
interface LaminarModule {
  Laminar: {
    initialize(options: {
      projectApiKey: string;
      baseUrl?: string;
      projectName?: string;
    }): unknown;
  };
  observe?: unknown;
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
    tool_call_count: tool_summary.tool_call_count,
    tool_error_count: tool_summary.tool_error_count,
    mcp_tool_call_count: tool_summary.mcp_tool_call_count,
    file_touch_count: tool_summary.file_touch_count,
    external_call_count: tool_summary.external_call_count,
    artifact_paths: payload.artifact_paths,
    attributes,
  };
}

const MISSING_SDK_MESSAGE =
  'Laminar sink requires the optional "@lmnr-ai/lmnr" package, which is not installed. ' +
  "Install it (e.g. `npm install @lmnr-ai/lmnr`) or inject a client via " +
  "createLaminarSink(config, { client }).";

/**
 * Lazily construct a real Laminar-backed client by dynamically importing the
 * optional `@lmnr-ai/lmnr` package. The import specifier is assigned to a
 * variable so the TypeScript compiler does not attempt module resolution at
 * build time (the package is an optional peer dependency).
 */
async function createRealClient(
  config: LaminarSinkConfig,
): Promise<LaminarTraceClient> {
  const specifier = "@lmnr-ai/lmnr";
  let mod: LaminarModule;
  try {
    mod = (await import(specifier)) as unknown as LaminarModule;
  } catch {
    throw new Error(MISSING_SDK_MESSAGE);
  }

  if (!mod?.Laminar || typeof mod.Laminar.initialize !== "function") {
    throw new Error(MISSING_SDK_MESSAGE);
  }

  mod.Laminar.initialize({
    projectApiKey: config.apiKey,
    baseUrl: config.baseUrl,
    projectName: config.projectName,
  });

  return {
    async exportCaseVariant(record: LaminarCaseVariantRecord): Promise<void> {
      const observe = mod.observe as
        | ((options: { name: string }, fn: () => void) => Promise<void> | void)
        | undefined;
      if (typeof observe === "function") {
        await observe({ name: record.name }, () => {
          /* span body intentionally empty: attributes carry the data */
        });
      }
    },
  };
}

/**
 * Create a provider-neutral observability sink that exports each
 * case-variant to Laminar as a flattened trace record (metadata +
 * artifact paths only). A client may be injected for tests; otherwise a
 * real client is lazily constructed on first export.
 */
export function createLaminarSink(
  config: LaminarSinkConfig,
  deps?: { client?: LaminarTraceClient },
): ObservabilitySink {
  let client: LaminarTraceClient | undefined = deps?.client;

  async function resolveClient(): Promise<LaminarTraceClient> {
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
  };
}
