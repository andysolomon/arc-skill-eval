import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ModelSelection } from "../contracts/types.js";
import { CliCommandError } from "./types.js";

export interface PiCompletionOptions {
  prompt: string;
  purpose: string;
  model?: ModelSelection;
  agentDir?: string;
}

export interface PiCompletionResult {
  text: string;
  model: { provider: string; id: string };
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

export async function invokePiCompletion(options: PiCompletionOptions): Promise<string> {
  return (await invokePiCompletionDetailed(options)).text;
}

export async function invokePiCompletionDetailed(options: PiCompletionOptions): Promise<PiCompletionResult> {
  const pi = await import("@earendil-works/pi-coding-agent");

  const credentialsAgentDir = options.agentDir ? path.resolve(options.agentDir) : pi.getAgentDir();
  const settingsManager = pi.SettingsManager.create(process.cwd(), credentialsAgentDir);
  const modelRuntime = await pi.ModelRuntime.create({
    authPath: path.join(credentialsAgentDir, "auth.json"),
    modelsPath: path.join(credentialsAgentDir, "models.json"),
  });
  const defaultProvider = settingsManager.getDefaultProvider();
  const defaultModel = settingsManager.getDefaultModel();
  const configuredModel = options.model
    ? modelRuntime.getModel(options.model.provider, options.model.id)
    : defaultProvider && defaultModel
      ? modelRuntime.getModel(defaultProvider, defaultModel)
      : (await modelRuntime.getAvailable())[0];

  if (!configuredModel) {
    throw new CliCommandError(options.model
      ? `Unable to resolve ${options.purpose} model ${options.model.provider}/${options.model.id}.`
      : `Unable to resolve a configured model for ${options.purpose}. Pass --model or configure Pi defaults.`);
  }

  if (!(await modelRuntime.getAuth(configuredModel))) {
    throw new CliCommandError(
      `Unable to authenticate ${options.purpose} model ${configuredModel.provider}/${configuredModel.id}: ` +
        `no credentials configured for ${configuredModel.provider}. Run \`pi\` and /login, or set the provider's API key.`,
    );
  }

  const thinking = options.model?.thinking ?? settingsManager.getDefaultThinkingLevel();
  const isolatedCwd = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-completion-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(isolatedCwd);
    const response = await modelRuntime.completeSimple(
      configuredModel,
      {
        messages: [{ role: "user", content: options.prompt, timestamp: Date.now() }],
      },
      {
        reasoning: thinking && thinking !== "off" ? thinking as never : undefined,
      },
    );

    // Pi reports a provider failure as an error stop reason with empty content, not a throw.
    const text = response.content
      .filter((item): item is { type: "text"; text: string } => item.type === "text")
      .map((item) => item.text)
      .join("");
    if (text.length === 0) {
      const stopReason = (response as { stopReason?: unknown }).stopReason;
      const errorMessage = (response as { errorMessage?: unknown }).errorMessage;
      throw new CliCommandError(
        `${options.purpose} model ${configuredModel.provider}/${configuredModel.id} returned no output` +
          (stopReason === "error" && typeof errorMessage === "string" ? `: ${errorMessage}` : " — check provider auth/quota or pass --model."),
      );
    }
    const usage = (response as { usage?: { input?: number; output?: number; cost?: { total?: number } } }).usage;
    return {
      text,
      model: { provider: configuredModel.provider, id: configuredModel.id },
      usage: {
        inputTokens: usage?.input ?? 0,
        outputTokens: usage?.output ?? 0,
        costUsd: usage?.cost?.total ?? 0,
      },
    };
  } finally {
    process.chdir(previousCwd);
    await rm(isolatedCwd, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const source = fenceMatch?.[1]?.trim() ?? trimmed;
  const start = source.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}
