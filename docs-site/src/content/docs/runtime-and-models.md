---
title: Runtime and models
description: Configure runner and judge models, Pi defaults, Ollama Cloud, eval-owned runtime directories, and optional non-Pi harnesses.
---

Skeval uses the Pi SDK by default. Pi supplies model providers, API keys, default models, and thinking levels unless you override them with CLI flags.

Optional CLI harnesses (`--runtime codex`, `claude-code`, `cursor-agent`, or `copilot`) run the same `evals.json` without Pi. They use credentials from environment variables or the harness's login. See [Multi-harness runtimes](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/multi-harness-runtimes.md).

CLI harnesses do **not** support `--sandbox just-bash` (use `--runtime pi-sdk` for sandboxed bash). Harness stderr is redacted in traces; a non-zero CLI exit code fails the case even when partial assistant text was parsed.

## Two model roles

A run can use two different models:

- The runner model receives the prompt, skill instructions, tools, and fixture workspace.
- The judge model grades prose assertions. Deterministic assertions such as `file-exists`, `regex-match`, and `json-valid` do not call it.

Pin them independently:

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --model openai-codex/gpt-6-luna:medium \
  --judge-model mistral/ministral-8b-latest
```

If `--judge-model` is omitted, prose assertions use the same configured model path as the runner.

## Provider/model syntax

Model flags use Pi's provider/model form:

```text
--model <provider/model[:thinking]>
--judge-model <provider/model[:thinking]>
```

Examples:

```bash
# GPT-6 Luna with medium thinking.
arc-skill-eval run ./skills/hello-world \
  --model openai-codex/gpt-6-luna:medium \
  --judge-model openai-codex/gpt-6-luna:medium

# Ollama Cloud model ID with a colon tag.
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

Ollama model IDs commonly contain colon tags, for example `gpt-oss:20b`, `qwen3.5:cloud`, or `qwen2.5-coder:1.5b`. Skeval treats a final `:suffix` as a thinking level only when the suffix is a known thinking value such as `off`, `low`, `medium`, or `high`. Otherwise the colon stays part of the model ID.

## Defaults without model flags

When no model flags are supplied, Skeval inherits Pi defaults from the configured Pi agent settings, normally:

```text
~/.pi/agent/settings.json
```

A minimal settings file looks like this:

```json
{
  "defaultProvider": "ollama-cloud",
  "defaultModel": "gpt-oss:20b",
  "defaultThinkingLevel": "off"
}
```

Set `--model` and `--judge-model` in CI or shared runs to use the same models across machines.

## Ollama Cloud

Use Ollama Cloud for smoke tests that should not depend on a local model:

```bash
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

In one run, two of three `hello-world` cases passed. The failed case asked for a name instead of defaulting to `Hello, world!`; provider setup had succeeded.

## Direct Ollama Cloud provider config

Set your key in the environment:

```bash
export OLLAMA_API_KEY=...
```

Then add an `ollama-cloud` provider to Pi's `models.json`:

```json
{
  "providers": {
    "ollama-cloud": {
      "baseUrl": "https://ollama.com/v1",
      "api": "openai-completions",
      "apiKey": "OLLAMA_API_KEY",
      "models": [
        { "id": "gpt-oss:20b" },
        { "id": "ministral-3:3b" },
        { "id": "gemma3:4b" }
      ]
    }
  }
}
```

The `apiKey` value is the environment variable name. Do not commit literal API keys.

## Bundled Pi SDK and model catalog

Skeval runs cases through the Pi SDK it bundles (`@earendil-works/pi-coding-agent`), not through the `pi` CLI you have installed. Model IDs resolve against the bundled SDK's model catalog, plus any `models.json` in the Pi agent directory.

`run` checks the runner model, and `--judge-model` if you pass one, before any case starts. If the model isn't in the catalog, or its provider has no credentials, the run stops with one error. For an unknown model, that error lists the models Pi knows for the provider. A model that resolves but that the provider rejects at request time, such as `model_not_found` for your account, still fails each case. In that case the summary prints the error once, lists the affected cases, and the run exits non-zero.

If the `pi` CLI on your `PATH` is a different major version than the bundled SDK, `run` prints a warning. Their model catalogs can differ, so a model that works in `pi` may not resolve here.

### Models newer than the bundled catalog

To use a model the bundled catalog doesn't know yet, register it on the built-in provider in an eval-owned `models.json`. Copy the shape of a neighbouring model from the same provider. For example, to add an `openai-codex` model:

```json
{
  "providers": {
    "openai-codex": {
      "baseUrl": "https://chatgpt.com/backend-api",
      "api": "openai-codex-responses",
      "models": [
        {
          "id": "gpt-6.3-sol",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 272000,
          "maxTokens": 128000
        }
      ]
    }
  }
}
```

Put it in an eval-owned agent directory, and symlink `auth.json` to your normal Pi login so the provider stays authenticated:

```bash
mkdir -p ./.arc-skill-eval/pi-agent
# save the JSON above as ./.arc-skill-eval/pi-agent/models.json
ln -s ~/.pi/agent/auth.json ./.arc-skill-eval/pi-agent/auth.json

arc-skill-eval run ./skills/hello-world \
  --agent-dir ./.arc-skill-eval/pi-agent \
  --model openai-codex/gpt-6.3-sol:medium
```

`gpt-6.3-sol` is a placeholder; use the model ID your provider offers. This is a stopgap. Upgrading arc-skill-eval picks up a newer catalog.

## Eval-owned Pi runtime

Create an eval-owned runtime with `init-runtime`:

```bash
arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \
  --provider ollama-cloud \
  --model gpt-oss:20b
```

The command writes `models.json` and `settings.json`, refuses to overwrite existing files unless `--force` is supplied, and references `OLLAMA_API_KEY` instead of storing a literal secret.

Use `--agent-dir` when you want Skeval to load Pi settings, model registry, and auth from an eval-owned runtime directory instead of the normal personal Pi agent directory:

```bash
arc-skill-eval run ./skills/hello-world \
  --agent-dir ./.arc-skill-eval/pi-agent \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

The runtime can contain only the providers and settings required by the suite:

```text
.arc-skill-eval/pi-agent/
├── models.json
└── settings.json
```

When `--agent-dir` is supplied, both the skill runner and the default LLM judge use that directory for Pi config lookup. `run` preflights the directory before case execution and reports missing `models.json`, `settings.json`, provider/model entries, or required API-key environment variables once with an `init-runtime` remediation.

This setup provides:

- no dependence on personal `~/.pi/agent` defaults
- reproducible team and CI runs
- no ambient skills, extensions, or prompt templates unless explicitly enabled
- provider setup that can live with the repo while secrets stay in environment variables

See the full design note in [`docs/agent-runtime-strategy.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/agent-runtime-strategy.md).
