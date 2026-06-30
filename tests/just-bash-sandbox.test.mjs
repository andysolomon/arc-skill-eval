import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createJustBashCodingTools } from "../dist/index.js";

async function withWorkspace(run) {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-sandbox-"));
  try {
    await run(workspaceDir);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

function bashTool(workspaceDir, env = {}) {
  const tools = createJustBashCodingTools(workspaceDir, env);
  const bash = tools.find((tool) => tool.name === "bash");
  assert.ok(bash, "expected a bash tool in the sandbox tool set");
  return bash;
}

function toolText(result) {
  return result.content.map((part) => part.text ?? "").join("");
}

test("createJustBashCodingTools exposes the standard coding tool set", async () => {
  await withWorkspace(async (workspaceDir) => {
    const tools = createJustBashCodingTools(workspaceDir, {});
    const names = tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ["bash", "edit", "read", "write"]);
  });
});

test("sandboxed bash runs in the virtual shell and writes into the workspace", async () => {
  await withWorkspace(async (workspaceDir) => {
    const bash = bashTool(workspaceDir);
    const result = await bash.execute("call-1", {
      command: "echo hello-sandbox > out.txt && cat out.txt",
    });

    assert.match(toolText(result), /hello-sandbox/);
    const onDisk = await readFile(path.join(workspaceDir, "out.txt"), "utf8");
    assert.equal(onDisk.trim(), "hello-sandbox");
  });
});

test("sandboxed bash confines absolute paths to the workspace root", async () => {
  await withWorkspace(async (workspaceDir) => {
    const bash = bashTool(workspaceDir);
    // An absolute path inside the sandbox maps to the ReadWriteFs root,
    // i.e. the workspace dir — it must not escape to the real host FS.
    await bash.execute("call-1", { command: "echo escaped > /escape.txt" });

    const contained = await readFile(path.join(workspaceDir, "escape.txt"), "utf8");
    assert.equal(contained.trim(), "escaped");

    // The real host root must be untouched.
    await assert.rejects(access("/escape.txt", fsConstants.F_OK));
  });
});

test("sandboxed bash does not require host npm/git (no heavyweight setup)", async () => {
  await withWorkspace(async (workspaceDir) => {
    const bash = bashTool(workspaceDir);
    // just-bash provides core unix builtins; this proves the agent can run
    // shell logic without the host shell. (npm/git mocks arrive in W-000022.)
    const result = await bash.execute("call-1", {
      command: "mkdir -p nested && echo built > nested/file.txt && cat nested/file.txt",
    });

    assert.match(toolText(result), /built/);
    const onDisk = await readFile(path.join(workspaceDir, "nested", "file.txt"), "utf8");
    assert.equal(onDisk.trim(), "built");
  });
});
