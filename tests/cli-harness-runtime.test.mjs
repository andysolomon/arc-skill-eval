import assert from "node:assert/strict";
import test from "node:test";

import { assertCliHarnessSandboxSupported } from "../dist/runtime/cli-harness.js";
import { buildCliProcessForensics, buildRedactedStderrPreview, redactCliSecrets } from "../dist/runtime/cli-redact.js";

test("redactCliSecrets masks common secret patterns", () => {
  const input =
    "CURSOR_API_KEY=supersecret sk-abcdefghijklmnopqrstuvwxyz123456 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0";
  const redacted = redactCliSecrets(input);
  assert.match(redacted, /CURSOR_API_KEY= \[REDACTED\]/);
  assert.match(redacted, /sk-\[REDACTED\]/);
  assert.match(redacted, /Authorization: Bearer \[REDACTED\]/);
  assert.doesNotMatch(redacted, /supersecret/);
  assert.doesNotMatch(redacted, /sk-abcdefghijklmnopqrstuvwxyz123456/);
});

test("buildCliProcessForensics never includes raw stderr", () => {
  const stderr = "ANTHROPIC_API_KEY=leak-value\nnoise";
  const forensics = buildCliProcessForensics("test-process", 1, stderr, []);
  assert.equal(forensics.stderrBytes, Buffer.byteLength(stderr, "utf8"));
  assert.ok(forensics.stderrPreviewRedacted.includes("[REDACTED]"));
  assert.equal(forensics.stderr, undefined);
  assert.ok(buildRedactedStderrPreview(stderr).length <= 400);
});

test("assertCliHarnessSandboxSupported rejects non-none sandbox modes", () => {
  assert.throws(
    () => assertCliHarnessSandboxSupported("codex", "just-bash"),
    /Runtime "codex" does not support --sandbox just-bash/,
  );
  assert.doesNotThrow(() => assertCliHarnessSandboxSupported("codex", undefined));
  assert.doesNotThrow(() => assertCliHarnessSandboxSupported("codex", "none"));
});
