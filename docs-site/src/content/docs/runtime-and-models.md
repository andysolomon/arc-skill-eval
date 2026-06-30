---
title: Runtime & Models
description: Configure runner and judge models, Pi defaults, Ollama Cloud, and the eval-owned runtime roadmap.
---

Skeval runs skill cases through the Pi SDK. That means model providers, API keys, default models, and thinking levels come from Pi unless you explicitly pin them at the CLI layer.

## Two model roles

A run can use two different models:

- **Runner model** — the agent that receives the prompt, skill instructions, tools, and fixture workspace.
- **Judge model** — the model used only for prose/string assertions. Deterministic assertions such as `file-exists`, `regex-match`, and `json-valid` do not call the judge.

Pin them independently:

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --model openai-codex/gpt-5.5:medium \
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
# GPT 5.5 with medium thinking.
arc-skill-eval run ./skills/hello-world \
  --model openai-codex/gpt-5.5:medium \
  --judge-model openai-codex/gpt-5.5:medium

# Ollama Cloud model ID with a colon tag.
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

Ollama model IDs commonly contain colon tags, for example `gpt-oss:20b`, `qwen3.5:cloud`, or `qwen2.5-coder:1.5b`. Skeval treats a final `:suffix` as a thinking level only when the suffix is a known thinking value such as `off`, `low`, `medium`, or `high`. Otherwise the colon stays part of the model ID.

## What happens with no model flags?

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

Use explicit `--model` and `--judge-model` in CI or dogfood runs when you want reproducible results across machines.

## Ollama Cloud low-cost lane

Ollama Cloud is a useful low-cost cloud path for smoke tests without relying on local models. A verified command is:

```bash
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

A recent run passed two of three `hello-world` cases. The failed case was normal model behavior on an ambiguous prompt, not provider setup: the model asked which name to use instead of defaulting to `Hello, world!`.

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

## Eval-owned Pi runtime

Use `--agent-dir` when you want Skeval to load Pi settings, model registry, and auth from an eval-owned runtime directory instead of the normal personal Pi agent directory:

```bash
arc-skill-eval run ./skills/hello-world \
  --agent-dir ./.arc-skill-eval/pi-agent \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

That tiny runtime can contain only the model providers and settings needed for evals:

```text
.arc-skill-eval/pi-agent/
├── models.json
└── settings.json
```

When `--agent-dir` is supplied, both the skill runner and the default LLM judge use that directory for Pi config lookup.

Benefits:

- no dependence on personal `~/.pi/agent` defaults
- reproducible team and CI runs
- no ambient skills, extensions, or prompt templates unless explicitly enabled
- provider setup that can live with the repo while secrets stay in environment variables

The next planned runtime feature is an `init-runtime` helper that writes this directory for you. See the full design note in [`docs/agent-runtime-strategy.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/agent-runtime-strategy.md).
