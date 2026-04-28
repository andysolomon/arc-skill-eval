import path from "node:path";

import type { EvalTrace } from "../traces/types.js";
import type {
  ContextManifestJson,
  ContextSkillAttachment,
  ContextToolInfo,
  ToolSummaryJson,
} from "./types.js";

export const PI_BUILTIN_TOOLS: ContextToolInfo[] = [
  { name: "read", source: "builtin" },
  { name: "bash", source: "builtin" },
  { name: "edit", source: "builtin" },
  { name: "write", source: "builtin" },
  { name: "grep", source: "builtin" },
  { name: "find", source: "builtin" },
  { name: "ls", source: "builtin" },
];

export const PI_DEFAULT_ACTIVE_TOOLS = ["read", "bash", "edit", "write"];

export function buildIsolatedContextManifest(args: {
  targetSkillName: string;
  targetSkillPath: string;
  attachTargetSkill: boolean;
}): ContextManifestJson {
  const attachedSkills: ContextSkillAttachment[] = args.attachTargetSkill
    ? [{ name: args.targetSkillName, path: args.targetSkillPath, role: "target" }]
    : [];

  return {
    runtime: "pi",
    mode: "isolated",
    attached_skills: attachedSkills,
    available_tools: [...PI_BUILTIN_TOOLS],
    active_tools: [...PI_DEFAULT_ACTIVE_TOOLS],
    mcp_tools: [],
    mcp_servers: [],
    ambient: {
      extensions: false,
      skills: false,
      prompt_templates: false,
      themes: false,
      context_files: false,
    },
  };
}

export function enrichContextManifestWithTrace(
  manifest: ContextManifestJson,
  trace: EvalTrace,
): ContextManifestJson {
  const runStart = trace.raw.telemetryEntries.find((entry) => entry.kind === "run-start");
  const data = runStart?.data as Record<string, unknown> | undefined;

  if (!data) {
    return manifest;
  }

  const activeTools = normalizeStringArray(data.activeTools);
  const availableTools = normalizeTelemetryTools(data.allTools);

  if (activeTools.length === 0 && availableTools.length === 0) {
    return manifest;
  }

  const mergedAvailableTools = availableTools.length > 0 ? availableTools : manifest.available_tools;

  return {
    ...manifest,
    available_tools: mergedAvailableTools,
    active_tools: activeTools.length > 0 ? activeTools : manifest.active_tools,
    mcp_tools: mergedAvailableTools.filter(isMcpTool),
    mcp_servers: collectMcpServers(mergedAvailableTools),
  };
}

export function buildToolSummary(
  trace: EvalTrace,
  contextManifest?: ContextManifestJson,
): ToolSummaryJson {
  const mcpToolNames = new Set((contextManifest?.mcp_tools ?? []).map((tool) => tool.name));
  const mcpToolCalls = trace.observations.toolCalls.filter((toolCall) =>
    mcpToolNames.has(toolCall.toolName) || looksLikeMcpToolName(toolCall.toolName),
  );

  return {
    tool_call_count: trace.observations.toolCalls.length,
    tool_result_count: trace.observations.toolResults.length,
    tool_error_count: trace.observations.toolResults.filter((result) => result.isError).length,
    tool_calls_by_name: countBy(trace.observations.toolCalls.map((toolCall) => toolCall.toolName)),
    bash_command_count: trace.observations.bashCommands.length,
    skill_read_count: trace.observations.skillReads.length,
    skill_reads_by_name: countBy(trace.observations.skillReads.map((skillRead) => skillRead.skillName)),
    file_touch_count: trace.observations.touchedFiles.length,
    written_files: [...trace.observations.writtenFiles],
    edited_files: [...trace.observations.editedFiles],
    external_call_count: trace.observations.externalCalls.length,
    external_calls: trace.observations.externalCalls.map((call) => ({
      system: call.system,
      operation: call.operation,
      ...(call.target ? { target: call.target } : {}),
    })),
    mcp_tool_call_count: mcpToolCalls.length,
    mcp_tool_calls_by_name: countBy(mcpToolCalls.map((toolCall) => toolCall.toolName)),
  };
}

function normalizeTelemetryTools(value: unknown): ContextToolInfo[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : undefined;
    if (!name) return [];

    const sourcePath = typeof record.sourcePath === "string" ? record.sourcePath : undefined;
    const sourceLabel = typeof record.source === "string" ? record.source : undefined;
    const source = classifyToolSource({ name, sourcePath, sourceLabel });

    return [{
      name,
      source,
      ...(sourcePath ? { source_path: sourcePath } : {}),
      ...(sourceLabel ? { source_label: sourceLabel } : {}),
    }];
  });
}

function classifyToolSource(args: {
  name: string;
  sourcePath: string | undefined;
  sourceLabel: string | undefined;
}): ContextToolInfo["source"] {
  if (looksLikeMcpToolName(args.name) || looksLikeMcpSource(args.sourcePath) || looksLikeMcpSource(args.sourceLabel)) {
    return "mcp";
  }

  if (PI_BUILTIN_TOOLS.some((tool) => tool.name === args.name)) {
    return "builtin";
  }

  if (args.sourcePath || args.sourceLabel) {
    return "extension";
  }

  return "unknown";
}

function isMcpTool(tool: ContextToolInfo): boolean {
  return tool.source === "mcp" || looksLikeMcpToolName(tool.name) || looksLikeMcpSource(tool.source_path) || looksLikeMcpSource(tool.source_label);
}

function collectMcpServers(tools: ContextToolInfo[]): string[] {
  const servers = new Set<string>();

  for (const tool of tools) {
    if (!isMcpTool(tool)) continue;
    const source = tool.source_label ?? tool.source_path;
    if (!source) continue;
    servers.add(path.basename(source));
  }

  return [...servers].sort();
}

function looksLikeMcpToolName(name: string): boolean {
  return /(^mcp[:_.-]|[:_.-]mcp[:_.-]|__mcp__)/iu.test(name);
}

function looksLikeMcpSource(value: string | undefined): boolean {
  return value !== undefined && /\bmcp\b/iu.test(value);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}
