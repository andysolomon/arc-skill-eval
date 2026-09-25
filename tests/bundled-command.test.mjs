import assert from "node:assert/strict";
import test from "node:test";

import { bundledCommand } from "../dist/cli/bundled-command.js";

test("bundledCommand resolves hello-world and arc-creating-evals", async () => {
  const hello = await bundledCommand({ skillName: "hello-world" });
  assert.equal(hello.entries.length, 1);
  assert.match(hello.entries[0].path, /skills[\\/]hello-world$/);

  const creating = await bundledCommand({ skillName: "arc-creating-evals" });
  assert.equal(creating.entries.length, 1);
  assert.match(creating.entries[0].path, /skills[\\/]arc-creating-evals$/);
});
