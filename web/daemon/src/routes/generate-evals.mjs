import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildGuidedEvalDesignerPrompt,
  parseGuidedEvalDesignerResponse,
} from "../../../../dist/cli/guided-eval-designer.js";
import { invokePiCompletion } from "../../../../dist/cli/pi-completion.js";
import { parseSkillFrontmatter } from "../../../../dist/skills/intake.js";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function handleGenerateEvals(request, response, context) {
  if (request.method !== "POST" || context.url.pathname !== "/generate-evals") {
    return false;
  }

  try {
    const body = await context.readJson(request);
    if (typeof body.workspaceRoot !== "string" || !body.workspaceRoot.trim()) {
      throw new Error("workspaceRoot must be the path to a skill directory.");
    }

    const skillDir = path.resolve(body.workspaceRoot);
    const skillMarkdown = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    const frontmatter = parseSkillFrontmatter(skillMarkdown, skillDir);
    const prompt = buildGuidedEvalDesignerPrompt({
      skillName: frontmatter.name,
      skillDescription: frontmatter.description,
      skillMarkdown,
    });
    const model =
      body.model
      && typeof body.model.provider === "string"
      && typeof body.model.id === "string"
        ? { provider: body.model.provider, id: body.model.id }
        : undefined;
    const raw = await invokePiCompletion({
      prompt,
      purpose: "guided eval designer",
      ...(model ? { model } : {}),
    });
    const proposal = parseGuidedEvalDesignerResponse(raw, { skillName: frontmatter.name });

    context.sendJson(response, 200, { ok: true, ...proposal });
  } catch (error) {
    context.sendJson(response, 400, { ok: false, error: errorMessage(error) });
  }

  return true;
}
