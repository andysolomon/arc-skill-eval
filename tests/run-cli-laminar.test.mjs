import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../dist/index.js";

// Integration: the `run` command wires CLI --laminar -> resolveLaminarConfig
// -> createLaminarSink. The missing-credentials path must fail fast (before
// any cases run, so no model/auth is needed) with a message naming the key.
test("run --laminar without LMNR_PROJECT_API_KEY fails fast naming the key", async () => {
  const previous = process.env.LMNR_PROJECT_API_KEY;
  delete process.env.LMNR_PROJECT_API_KEY;
  try {
    const result = await runCli(["run", "./skill-path-not-reached", "--laminar"]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /LMNR_PROJECT_API_KEY/);
  } finally {
    if (previous !== undefined) process.env.LMNR_PROJECT_API_KEY = previous;
  }
});
