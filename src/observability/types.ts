import type { GradingJson, TimingJson, EvalRunVariant } from "../evals/types.js";
import type { EvalTrace } from "../traces/types.js";

export type EvalContextMode = "isolated" | "ambient";

export type ContextSkillRole = "target" | "extra" | "ambient";

export interface ContextSkillAttachment {
  name: string;
  path: string;
  role: ContextSkillRole;
}

export type ContextToolSource = "builtin" | "extension" | "mcp" | "unknown";

export interface ContextToolInfo {
  name: string;
  source: ContextToolSource;
  source_path?: string;
  source_label?: string;
}

export interface ContextManifestJson {
  runtime: "pi";
  /** Effective Pi agent directory used for this run. */
  agent_dir?: string;
  mode: EvalContextMode;
  attached_skills: ContextSkillAttachment[];
  available_tools: ContextToolInfo[];
  active_tools: string[];
  mcp_tools: ContextToolInfo[];
  mcp_servers: string[];
  ambient: {
    extensions: boolean;
    skills: boolean;
    prompt_templates: boolean;
    themes: boolean;
    context_files: boolean;
  };
}

export interface ToolSummaryJson {
  tool_call_count: number;
  tool_result_count: number;
  tool_error_count: number;
  tool_calls_by_name: Record<string, number>;
  bash_command_count: number;
  skill_read_count: number;
  skill_reads_by_name: Record<string, number>;
  file_touch_count: number;
  written_files: string[];
  edited_files: string[];
  external_call_count: number;
  external_calls: Array<{
    system: string;
    operation: string;
    target?: string;
  }>;
  mcp_tool_call_count: number;
  mcp_tool_calls_by_name: Record<string, number>;
}

export type ObservabilityExportStatus = "success" | "skipped" | "failed";

export interface ObservabilityExportResult {
  sink: string;
  status: ObservabilityExportStatus;
  message?: string;
}

export interface ObservabilityArtifactPaths {
  assistant: string;
  outputs: string;
  timing: string;
  grading: string;
  trace: string;
  tool_summary: string;
  context_manifest: string;
}

export interface ObservabilityCaseVariantPayload {
  run_id: string;
  iteration?: string;
  skill: {
    name: string;
    dir: string;
  };
  case_id: string;
  variant: EvalRunVariant;
  timing: TimingJson;
  grading_summary: GradingJson["summary"];
  grading: GradingJson;
  trace: EvalTrace;
  tool_summary: ToolSummaryJson;
  context_manifest: ContextManifestJson;
  artifact_paths: ObservabilityArtifactPaths;
}

export interface ObservabilitySink {
  name: string;
  exportCaseVariant(payload: ObservabilityCaseVariantPayload): Promise<ObservabilityExportResult | void> | ObservabilityExportResult | void;
}
