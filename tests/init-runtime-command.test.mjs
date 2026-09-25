import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CliCommandError, initRuntimeCommand } from "../dist/index.js";

test("initRuntimeCommand writes minimal Ollama Cloud runtime without storing secrets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-init-runtime-"));
  const targetDir = path.join(root, ".arc-skill-eval", "pi-agent");

  try {
    const result = await initRuntimeCommand({
      targetDir,
      provider: "ollama-cloud",
      model: "gpt-oss:20b",
    });

    assert.equal(result.targetDir, path.resolve(targetDir));
    assert.equal(result.overwritten, false);

    const models = JSON.parse(await readFile(path.join(targetDir, "models.json"), "utf8"));
    assert.deepEqual(models, {
      providers: {
        "ollama-cloud": {
          baseUrl: "https://ollama.com/v1",
          api: "openai-completions",
          apiKey: "OLLAMA_API_KEY",
          models: [{ id: "gpt-oss:20b" }],
        },
      },
    });
    assert(!JSON.stringify(models).includes("sk-"));

    const settings = JSON.parse(await readFile(path.join(targetDir, "settings.json"), "utf8"));
    assert.deepEqual(settings, {
      defaultProvider: "ollama-cloud",
      defaultModel: "gpt-oss:20b",
      defaultThinkingLevel: "off",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("initRuntimeCommand refuses to overwrite existing runtime files without force", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-init-runtime-"));
  const targetDir = path.join(root, "pi-agent");

  try {
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, "models.json"), "do not replace", "utf8");

    await assert.rejects(
      () => initRuntimeCommand({ targetDir, provider: "ollama-cloud", model: "gpt-oss:20b" }),
      CliCommandError,
    );

    assert.equal(await readFile(path.join(targetDir, "models.json"), "utf8"), "do not replace");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
