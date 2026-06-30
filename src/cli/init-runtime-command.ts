import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { CliCommandError } from "./types.js";

export interface InitRuntimeCommandOptions {
  targetDir: string;
  provider: string;
  model: string;
  force?: boolean;
}

export interface InitRuntimeCommandResult {
  targetDir: string;
  modelsPath: string;
  settingsPath: string;
  provider: string;
  model: string;
  overwritten: boolean;
}

interface ProviderTemplate {
  baseUrl: string;
  api: "openai-completions";
  apiKey: string;
}

const PROVIDER_TEMPLATES: Record<string, ProviderTemplate> = {
  "ollama-cloud": {
    baseUrl: "https://ollama.com/v1",
    api: "openai-completions",
    apiKey: "OLLAMA_API_KEY",
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
    apiKey: "ollama",
  },
};

export async function initRuntimeCommand(options: InitRuntimeCommandOptions): Promise<InitRuntimeCommandResult> {
  const targetDir = path.resolve(options.targetDir);
  const provider = options.provider.trim();
  const model = options.model.trim();

  if (!provider) throw new CliCommandError("--provider must not be empty.");
  if (!model) throw new CliCommandError("--model must not be empty.");

  const template = PROVIDER_TEMPLATES[provider];
  if (!template) {
    throw new CliCommandError(
      `Unsupported provider for init-runtime: ${provider}. Supported providers: ${Object.keys(PROVIDER_TEMPLATES).join(", ")}.`,
    );
  }

  const modelsPath = path.join(targetDir, "models.json");
  const settingsPath = path.join(targetDir, "settings.json");
  const existing = await listExistingFiles([modelsPath, settingsPath]);

  if (existing.length > 0 && !options.force) {
    throw new CliCommandError(
      `Refusing to overwrite existing runtime file(s): ${existing.join(", ")}. Re-run with --force to overwrite.`,
    );
  }

  await mkdir(targetDir, { recursive: true });

  await writeFile(modelsPath, `${JSON.stringify(buildModelsJson(provider, model, template), null, 2)}\n`, "utf8");
  await writeFile(settingsPath, `${JSON.stringify(buildSettingsJson(provider, model), null, 2)}\n`, "utf8");

  return {
    targetDir,
    modelsPath,
    settingsPath,
    provider,
    model,
    overwritten: existing.length > 0,
  };
}

function buildModelsJson(provider: string, model: string, template: ProviderTemplate) {
  return {
    providers: {
      [provider]: {
        baseUrl: template.baseUrl,
        api: template.api,
        apiKey: template.apiKey,
        models: [{ id: model }],
      },
    },
  };
}

function buildSettingsJson(provider: string, model: string) {
  return {
    defaultProvider: provider,
    defaultModel: model,
    defaultThinkingLevel: "off",
  };
}

async function listExistingFiles(files: string[]): Promise<string[]> {
  const existing: string[] = [];

  for (const file of files) {
    try {
      await readFile(file);
      existing.push(file);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  }

  return existing;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
