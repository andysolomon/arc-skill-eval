import { tmpdir } from "node:os";
import { createPiSessionBootstrap } from "../../../../dist/pi/session-adapter.js";
import { runtimeName } from "../runner.mjs";

/**
 * The models a run uses when the composer leaves model and judge on
 * "default": the default model in Pi's settings (PI_CODING_AGENT_DIR, or
 * ~/.pi/agent), and the same model for the judge, which is what the library
 * falls back to. Null when Pi has no default model configured.
 */
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

  // The replay runtime (the test seam) runs every case as replay/scripted,
  // and the judge falls back to the model that ran the case.
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
