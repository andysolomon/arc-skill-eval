import {
  extractJsonObject,
  invokePiCompletion,
} from "../../../../dist/cli/pi-completion.js";

const behaviorDimensions = new Set(["outcome", "process", "style", "efficiency"]);
const promptFlavors = new Set(["explicit", "implicit", "contextual", "adjacent-negative"]);
const assertionKinds = new Set([
  "file-exists",
  "file-absent",
  "regex-match",
  "json-valid",
  "judge",
]);

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseResponse(raw) {
  const json = extractJsonObject(raw);
  if (!json) {
    throw new Error("The model did not return a JSON object.");
  }

  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The model returned an invalid JSON object.");
  }

  return parsed;
}

function modelFromBody(body) {
  if (!body.model) {
    return undefined;
  }

  if (
    typeof body.model !== "object"
    || typeof body.model.provider !== "string"
    || typeof body.model.id !== "string"
  ) {
    throw new Error("model must include string provider and id values.");
  }

  return { provider: body.model.provider, id: body.model.id };
}

function behaviorPrompt(skill, context) {
  const existing = Array.isArray(context.existing)
    ? context.existing.filter((item) => typeof item === "string" && item.trim())
    : [];

  return [
    "You are designing an eval suite for an agent skill.",
    `Skill: ${skill || "unnamed skill"}`,
    "Propose exactly ONE concrete must-pass behavior that this skill should be tested for.",
    "It must be distinct from the existing behaviors and describe an observable result or practice.",
    'Choose dim from exactly: "outcome", "process", "style", or "efficiency".',
    "Return STRICT JSON only, with no markdown or commentary:",
    '{"behavior":{"text":"one must-pass behavior","dim":"outcome"}}',
    `Existing behaviors: ${JSON.stringify(existing)}`,
  ].join("\n");
}

function promptPrompt(skill, context) {
  return [
    "You are designing an eval case for an agent skill.",
    `Skill: ${skill || "unnamed skill"}`,
    `Behavior to exercise: ${String(context.behavior ?? "")}`,
    `Behavior dimension: ${String(context.dim ?? "outcome")}`,
    `Prompt flavor: ${String(context.flavor ?? "explicit")}`,
    "Write exactly ONE realistic end-user request, in the user's own words, that exercises the behavior in that flavor.",
    "Do not explain the prompt and do not describe what an evaluator should do.",
    "Return STRICT JSON only, with no markdown or commentary:",
    '{"prompt":"the realistic end-user request"}',
  ].join("\n");
}

function dimensionPrompt(skill, context) {
  return [
    "You are classifying an eval behavior for an agent skill.",
    `Skill: ${skill || "unnamed skill"}`,
    `Behavior: ${String(context.behavior ?? "")}`,
    'Classify this behavior into EXACTLY one dimension:',
    '- "outcome": the task completes and the right artifact exists',
    '- "process": it triggered the skill and took the intended steps',
    '- "style": the output follows the conventions the skill promises',
    '- "efficiency": it got there without thrashing on tool calls or tokens',
    "Return STRICT JSON only, with no markdown or commentary:",
    '{"dim":"outcome"}',
  ].join("\n");
}

function flavorPrompt(skill, context) {
  return [
    "You are classifying an eval prompt (a user request) for an agent skill.",
    `Skill: ${skill || "unnamed skill"}`,
    `Behavior under test: ${String(context.behavior ?? "")}`,
    `User prompt: ${String(context.prompt ?? "")}`,
    "Classify this prompt into EXACTLY one flavor:",
    '- "explicit": names the skill directly',
    '- "implicit": describes the scenario without naming the skill',
    '- "contextual": a noisy, realistic ask with distractions around the real request',
    '- "adjacent-negative": a nearby request the skill should NOT fire for',
    "Return STRICT JSON only, with no markdown or commentary:",
    '{"flavor":"explicit"}',
  ].join("\n");
}

function assertionPrompt(skill, context) {
  return [
    "You are designing one pass/fail assertion for an agent-skill eval case.",
    `Skill: ${skill || "unnamed skill"}`,
    `Behavior: ${String(context.behavior ?? "")}`,
    `End-user prompt: ${String(context.prompt ?? "")}`,
    'Choose kind from exactly: "file-exists", "file-absent", "regex-match", "json-valid", or "judge".',
    "For judge, val is one specific observable rubric claim. For deterministic kinds, val is the relative path or regex pattern.",
    "Return STRICT JSON only, with no markdown or commentary:",
    '{"assertion":{"kind":"judge","val":"one observable pass/fail rubric claim"}}',
  ].join("\n");
}

async function makeSuggestion(body) {
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const model = modelFromBody(body);
  const prompts = {
    behavior: () => behaviorPrompt(body.skill, context),
    prompt: () => promptPrompt(body.skill, context),
    assertion: () => assertionPrompt(body.skill, context),
    dimension: () => dimensionPrompt(body.skill, context),
    flavor: () => flavorPrompt(body.skill, context),
  };
  const raw = await invokePiCompletion({
    prompt: prompts[body.kind](),
    purpose: `${body.kind} suggestion`,
    ...(model ? { model } : {}),
  });
  const parsed = parseResponse(raw);

  if (body.kind === "behavior") {
    const behavior = parsed.behavior;
    if (
      !behavior
      || typeof behavior !== "object"
      || typeof behavior.text !== "string"
      || !behavior.text.trim()
    ) {
      throw new Error("The model returned an invalid behavior suggestion.");
    }

    return {
      behavior: {
        text: behavior.text.trim(),
        dim: behaviorDimensions.has(behavior.dim) ? behavior.dim : "outcome",
      },
    };
  }

  if (body.kind === "prompt") {
    if (typeof parsed.prompt !== "string" || !parsed.prompt.trim()) {
      throw new Error("The model returned an invalid prompt suggestion.");
    }
    return { prompt: parsed.prompt.trim() };
  }

  if (body.kind === "dimension") {
    return {
      dim: behaviorDimensions.has(parsed.dim) ? parsed.dim : "outcome",
    };
  }

  if (body.kind === "flavor") {
    return {
      flavor: promptFlavors.has(parsed.flavor) ? parsed.flavor : "explicit",
    };
  }

  const assertion = parsed.assertion;
  if (
    !assertion
    || typeof assertion !== "object"
    || typeof assertion.val !== "string"
    || !assertion.val.trim()
  ) {
    throw new Error("The model returned an invalid assertion suggestion.");
  }

  return {
    assertion: {
      kind: assertionKinds.has(assertion.kind) ? assertion.kind : "judge",
      val: assertion.val.trim(),
    },
  };
}

export async function handleSuggest(request, response, context) {
  if (request.method !== "POST" || context.url.pathname !== "/suggest") {
    return false;
  }

  try {
    const body = await context.readJson(request);
    if (!["behavior", "prompt", "assertion", "dimension", "flavor"].includes(body.kind)) {
      context.sendJson(response, 400, { ok: false, error: "Invalid suggestion kind." });
      return true;
    }

    const suggestion = await makeSuggestion(body);
    context.sendJson(response, 200, { ok: true, ...suggestion });
  } catch (error) {
    context.sendJson(response, 400, { ok: false, error: errorMessage(error) });
  }

  return true;
}
