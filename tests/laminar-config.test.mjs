import assert from "node:assert/strict";
import test from "node:test";

import { resolveLaminarConfig } from "../dist/index.js";

test("resolveLaminarConfig returns undefined when disabled", () => {
  assert.equal(resolveLaminarConfig({ enabled: false, env: {} }), undefined);
});

test("resolveLaminarConfig throws naming the missing key when enabled without credentials", () => {
  assert.throws(
    () => resolveLaminarConfig({ enabled: true, env: {} }),
    /LMNR_PROJECT_API_KEY/,
  );
});

test("resolveLaminarConfig returns full config when enabled with env vars", () => {
  const config = resolveLaminarConfig({
    enabled: true,
    env: {
      LMNR_PROJECT_API_KEY: "k",
      LMNR_BASE_URL: "u",
      LMNR_PROJECT_NAME: "p",
    },
  });

  assert.deepEqual(config, { apiKey: "k", baseUrl: "u", projectName: "p" });
});
