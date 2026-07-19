# Agent runtime strategy: Pi-mini vs custom agent

_Last updated: 2026-06-18_

## Current state

`arc-skill-eval` currently uses the Pi SDK as its agent runtime. That has been a good default because Pi already provides:

- model/provider registry
- provider auth handling
- skills/resource loading
- built-in coding tools (`read`, `bash`, `edit`, `write`)
- session event streams
- token/cost/model metadata
- prompt execution loop

We also now have a working low-cost cloud lane through Ollama Cloud:

```bash
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

Observed result on 2026-06-18:

- Model: `ollama-cloud/gpt-oss:20b`
- Suite: `skills/hello-world`
- Cases: 2/3 passed
- Assertions: 6/9 passed
- Failure cause: model asked a clarifying question for the ambiguous default-world prompt instead of writing `greeting.txt`
- Infra status: successful — model resolved, ran, produced trace/tokens, and judge executed

This proves the issue is no longer provider setup. It is normal eval/model behavior.

## Important discovery: Ollama model IDs contain colons

Ollama model IDs commonly use tags such as `gpt-oss:20b`, `glm-5.2:cloud`, and `qwen2.5-coder:1.5b`. `arc-skill-eval` originally interpreted `provider/model:tag` as `provider/model:thinking`, which broke Ollama-style IDs.

Fixed in commit:

```text
582d184 fix: support colon-tagged model ids
```

Current parser behavior:

- `openai-codex/gpt-5.5:medium` -> model `gpt-5.5`, thinking `medium`
- `ollama-cloud/gpt-oss:20b` -> model `gpt-oss:20b`, no thinking
- `ollama/qwen3.5:cloud:medium` -> model `qwen3.5:cloud`, thinking `medium`

## Option A — Keep using Pi, but make a tiny eval-only Pi instance

This is the recommended next step.

### What “tiny Pi instance” means

A tiny Pi instance is not a fork of Pi. It is an eval-owned Pi config directory and runtime profile with:

- minimal `models.json`
- minimal `settings.json`
- no ambient skills/extensions/prompt templates/themes
- only the model providers needed for evals
- explicit runner and judge model pins
- temp session directories per run

`arc-skill-eval` defaults to isolated context for skills/tools. With `--agent-dir`, model registry, settings, and auth lookup can also come from an eval-owned Pi agent directory instead of the user's main Pi agent dir.

### CLI

`--agent-dir` is supported for `run` and points both the skill runner and default LLM judge at an eval-owned Pi config/runtime directory:

```bash
arc-skill-eval run ./skills/hello-world \
  --agent-dir ./.arc-skill-eval/pi-agent \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

Initializer:

```bash
arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \
  --provider ollama-cloud \
  --model gpt-oss:20b
```

### Example tiny `models.json`

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

Pi resolves `apiKey` values by first checking environment variables, so `"apiKey": "OLLAMA_API_KEY"` reads `process.env.OLLAMA_API_KEY` when set.

### Example tiny `settings.json`

```json
{
  "defaultProvider": "ollama-cloud",
  "defaultModel": "gpt-oss:20b",
  "defaultThinkingLevel": "off"
}
```

### Benefits

- Fastest path from current implementation
- Keeps Pi's tool loop, skills, sessions, and model registry
- Lets us avoid touching global `~/.pi/agent` during CI or local experiments
- Makes eval runs more reproducible
- Already implemented: `agentDir` is threaded through CLI -> run command -> `runEvalCase` -> Pi SDK runner and default LLM judge

### Caveats

- Still depends on Pi SDK internals
- Some Pi APIs changed across versions already, so dependency upgrades can require adaptation
- We inherit Pi's model API abstractions, which may not match every provider perfectly

## Option B — Build our own minimal agent runtime

This is attractive long-term, but it should be a deliberate project. A skill-eval runner needs less than a full coding agent, but still more than a single LLM call.

### Minimum viable custom runtime

A custom runtime would need:

1. **Model adapter layer**
   - OpenAI-compatible chat/completions
   - Anthropic Messages
   - Ollama local/cloud
   - maybe Mistral/Gemini later

2. **Tool loop**
   - model emits tool call
   - runner executes tool
   - result appended to conversation
   - repeat until final answer or budget exhausted

3. **Tools**
   - read file
   - write file
   - edit file
   - bash command
   - maybe grep/find/list

4. **Skill loader**
   - parse `SKILL.md` frontmatter
   - attach skill instructions to system/developer context
   - optionally support resources/references/scripts

5. **Safety sandbox**
   - workspace boundary enforcement
   - path traversal prevention
   - command allow/deny policy
   - no secret leakage in artifacts

6. **Trace format**
   - tool calls
   - model messages
   - token usage
   - timing
   - final assistant text
   - touched files

7. **Provider-neutral usage/cost accounting**
   - input/output/cache tokens when available
   - cost table or zero-cost fallback

### Benefits

- Full control over behavior and traces
- No Pi dependency churn
- Could be optimized specifically for evals rather than interactive coding
- Easier to make CI-friendly and deterministic

### Costs / risks

- Rebuilding an agent loop is non-trivial
- Tool calling differs across providers
- Bash/edit safety is easy to get wrong
- Skill loading semantics could drift from real agents
- The `with_skill` / `without_skill` signal is less valuable if our custom runtime behaves unlike the user's actual agent

## Recommendation

Do **Option A first**: add first-class eval-owned Pi runtime support.

Why:

1. We already have working Pi-backed evals.
2. We just proved Ollama Cloud works through Pi with `gpt-oss:20b`.
3. The main pain is configuration isolation, not lack of an agent loop.
4. A tiny Pi instance makes CI and dogfood reproducible.
5. It keeps the product focused on its core magic power: authoring and running skill evals.

Then explore Option B behind an experimental runtime interface.

## Proposed architecture

See [ADR-0001: Defer AgentRuntime expansion](./adr/ADR-0001-defer-agent-runtime-expansion.md) for why broader runtime expansion (custom tool loop, CLI `--runtime` flag) is deferred while the seam ships in minimal form.

Introduce a runtime abstraction without replacing Pi yet:

```ts
export interface AgentRuntime {
  id: EvalTraceRuntime;
  runCase(options: RuntimeCaseOptions): Promise<RuntimeCaseResult>;
}
```

Initial implementations:

- `PiAgentRuntime` — current behavior
- `MiniPiAgentRuntime` — Pi SDK with explicit eval-owned `agentDir`
- `CustomOpenAiCompatRuntime` — future experimental minimal tool loop

CLI shape:

```bash
arc-skill-eval run ./skill --runtime pi
arc-skill-eval run ./skill --runtime pi --agent-dir ./.arc-skill-eval/pi-agent
arc-skill-eval run ./skill --runtime custom-openai-compat --base-url ... --api-key-env ...
```

## Concrete next implementation steps

1. Add `--agent-dir <path>` to `arc-skill-eval run`.
2. Thread `agentDir` to runner and grader.
3. Stop hard-coding `getAgentDir()` for model registry/auth when an eval `agentDir` is supplied.
4. Add docs for `.arc-skill-eval/pi-agent/models.json`.
5. Add an Ollama Cloud smoke doc using `ollama-cloud/gpt-oss:20b`.
6. Add a test proving `--agent-dir` reaches the Pi SDK session factory.
7. Only after this lands, spike a custom OpenAI-compatible runtime for deterministic-heavy evals.

## Current Ollama Cloud setup notes

Working direct provider config:

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

Required shell state:

```bash
export OLLAMA_API_KEY="..."
```

Verify model resolution:

```bash
pi --list-models ollama-cloud
```

Verify with `arc-skill-eval`:

```bash
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

Interpretation of partial pass:

- Partial pass is okay for provider smoke.
- `hello-world/default-world` is ambiguous enough that `gpt-oss:20b` asks for a name.
- This is a useful model-quality signal, not a provider failure.
