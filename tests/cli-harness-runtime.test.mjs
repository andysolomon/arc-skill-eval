import assert from "node:assert/strict";
import test from "node:test";

import { redactCliSecrets } from "../dist/runtime/cli-redact.js";

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
