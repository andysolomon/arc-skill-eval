import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PiSdkExecutionCase } from "../pi/types.js";
import type { AgentRuntime, RuntimeCaseOptions, RuntimeCaseResult } from "./types.js";

export interface ReplayFixture {
  assistantText: string;
  /** Workspace files to "produce": workspace-relative path → content. */
  files?: Record<string, string>;
  /** Optional usage numbers surfaced in timing.json (defaults to zeros). */
  usage?: { inputTokens?: number; outputTokens?: number };
}

export function validateReplayFixture(value: unknown, source = "replay fixture"): ReplayFixture {
  const issues: string[] = [];
  const record = value as Record<string, unknown> | null;
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error(`${source}: expected a JSON object.`);
  }
  if (typeof record.assistantText !== "string" || record.assistantText.length === 0) {
    issues.push("`assistantText` must be a non-empty string.");
  }
  if (record.files !== undefined) {
    if (typeof record.files !== "object" || record.files === null || Array.isArray(record.files)) {
      issues.push("`files` must be an object of path → content.");
    } else {
      for (const [filePath, content] of Object.entries(record.files)) {
        if (typeof content !== "string") issues.push(`files["${filePath}"] must be a string.`);
        const rel = path.normalize(filePath);
        if (path.isAbsolute(rel) || rel.startsWith("..")) issues.push(`files["${filePath}"] must be workspace-relative.`);
      }
    }
  }
  if (issues.length > 0) throw new Error(`Invalid ${source}:\n- ${issues.join("\n- ")}`);
  return record as unknown as ReplayFixture;
}

export async function readReplayFixture(fixturePath: string): Promise<ReplayFixture> {
  const raw = await readFile(fixturePath, "utf8");
  return validateReplayFixture(JSON.parse(raw), fixturePath);
}

const REPLAY_MODEL = { provider: "replay", id: "scripted" };

export function createReplayRuntime(fixture: ReplayFixture): AgentRuntime {
  return {
    id: "replay",
    runCase: async (options) => replayCase(fixture, options),
  };
}

export async function createReplayRuntimeFromFile(fixturePath: string): Promise<AgentRuntime> {
  return createReplayRuntime(await readReplayFixture(fixturePath));
}

async function replayCase(fixture: ReplayFixture, options: RuntimeCaseOptions): Promise<RuntimeCaseResult> {
  const startedAt = new Date();
  if (!options.workspaceDir) {
    throw new Error("Replay runtime requires a prepared workspaceDir (run-case always provides one).");
  }
  const workspaceRoot = path.resolve(options.workspaceDir);

  for (const [relPath, content] of Object.entries(fixture.files ?? {})) {
    const destination = path.resolve(workspaceRoot, relPath);
    if (path.relative(workspaceRoot, destination).startsWith("..")) {
      throw new Error(`Replay fixture file escapes the workspace: ${relPath}`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }

  const finishedAt = new Date();
  const inputTokens = fixture.usage?.inputTokens ?? 0;
  const outputTokens = fixture.usage?.outputTokens ?? 0;
  const caseDefinition = toCompatibilityExecutionCase(options);
  const model = options.model ? { provider: options.model.provider, id: options.model.id } : REPLAY_MODEL;

  return {
    source: options.source,
    skill: {
      name: options.skill.name,
      relativeSkillDir: options.skill.relativeSkillDir,
      profile: "repo-mutation",
      targetTier: 1,
    },
    caseDefinition,
    workspaceDir: workspaceRoot,
    agentDir: options.agentDir ?? "",
    sessionDir: "",
    fixture: null,
    model,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    session: {
      sessionId: `replay-${options.case.caseId}`,
      sessionFile: "",
      assistantText: fixture.assistantText,
      messages: [
        { role: "user", content: options.case.prompt },
        { role: "assistant", content: fixture.assistantText },
      ],
      events: [],
    },
    usage: {
      model,
      thinkingLevel: options.model?.thinking ?? null,
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd: 0,
      contextWindowTokens: null,
      contextWindowUsedPercent: null,
    },
    contextManifest: {
      runtime: "pi",
      mode: options.contextMode ?? "isolated",
      agent_dir: options.agentDir ?? "",
      attached_skills: [],
      available_tools: [],
      active_tools: [],
      mcp_tools: [],
      mcp_servers: [],
      ambient: {
        extensions: false,
        skills: false,
        prompt_templates: false,
        themes: false,
        context_files: false,
      },
    },
    telemetry: null,
    cleanup: async () => ({ fixture: null, environment: { agentDirRemoved: false } }),
  };
}

function toCompatibilityExecutionCase(options: RuntimeCaseOptions): PiSdkExecutionCase {
  return {
    kind: "execution",
    lane: "execution-deterministic",
    caseId: options.case.caseId,
    prompt: options.case.prompt,
    skillName: options.case.skillName,
    contractModel: undefined,
    definition: {
      id: options.case.caseId,
      prompt: options.case.prompt,
      fixture: undefined,
    },
  };
}
