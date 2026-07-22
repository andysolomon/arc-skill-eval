function normalizeSkillName(workspaceRoot, behaviors) {
  const behavior = Array.isArray(behaviors) ? behaviors[0] : null;
  if (typeof behavior === "string" && behavior.trim()) {
    return behavior.trim();
  }

  if (typeof workspaceRoot === "string" && workspaceRoot.trim()) {
    return workspaceRoot.trim().split(/[\\/]/).filter(Boolean).at(-1) ?? "workspace";
  }

  return "workspace";
}

export async function handleGenerateEvals(request, response, context) {
  if (request.method !== "POST") {
    return false;
  }

  if (context.url.pathname !== "/generate-evals") {
    return false;
  }

  const body = await context.readJson(request);
  const skillName = normalizeSkillName(body.workspaceRoot, body.behaviors);

  context.sendJson(response, 200, {
    evals: {
      skills: [
        {
          name: skillName,
        },
      ],
      evals: [
        {
          skill: skillName,
          cases: [],
        },
      ],
    },
  });
  return true;
}
