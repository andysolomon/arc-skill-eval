import { tmpdir } from "node:os";
import { createPiSessionBootstrap } from "../../../../dist/pi/session-adapter.js";
import { runtimeName } from "../runner.mjs";

async function defaultModels() {
  try {
    const { settingsManager } = await createPiSessionBootstrap({ runtimeDir: tmpdir() });
    const provider = settingsManager.getDefaultProvider();
    const id = settingsManager.getDefaultModel();
    const model = provider && id ? `${provider}/${id}` : null;
    return { model, judgeModel: model };
  } catch {
    return { model: null, judgeModel: null };
  }
}

export async function handleHealth(request, response, context) {
  if (request.method !== "GET" || context.url.pathname !== "/health") {
    return false;
  }

  const runtime = runtimeName();
  const defaults = runtime === "replay"
    ? { model: "replay/scripted", judgeModel: "replay/scripted" }
    : await defaultModels();
  context.sendJson(response, 200, {
    ok: true,
    version: context.version,
    runtime,
    ...defaults,
  });
  return true;
}
