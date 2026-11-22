import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
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

test("a sandboxMock returns configured stdout/exit code and writes file effects", async () => {
  await withWorkspace(async (workspaceDir) => {
    const tools = createJustBashCodingTools(workspaceDir, {}, [
      {
        command: "npm",
        stdout: "added 1 package\n",
        exitCode: 0,
        files: [{ path: "node_modules/.installed", content: "ok" }],
      },
    ]);
    const bash = tools.find((tool) => tool.name === "bash");
    const result = await bash.execute("call-1", { command: "npm install && echo done" });

    assert.match(toolText(result), /added 1 package/);
    assert.match(toolText(result), /done/);
    const effect = await readFile(path.join(workspaceDir, "node_modules", ".installed"), "utf8");
    assert.equal(effect, "ok");
  });
});

test("a sandboxMock can model a non-zero exit code", async () => {
  await withWorkspace(async (workspaceDir) => {
    const tools = createJustBashCodingTools(workspaceDir, {}, [
      { command: "npm", stderr: "boom\n", exitCode: 1 },
    ]);
    const bash = tools.find((tool) => tool.name === "bash");
    const result = await bash.execute("call-1", { command: 'npm ci; echo "exit=$?"' });

    assert.match(toolText(result), /boom/);
    assert.match(toolText(result), /exit=1/);
  });
});

// Failure modes for the file tools under `just-bash` (issue #236):
//   1. read/write/edit resolve absolute paths on the host, so the model can
//      write outside the case workspace (e.g. host /tmp) or read host files.
//   2. bash and the file tools disagree on what `/`, the cwd, or the
//      workspace's host path mean, so a file one writes the other can't see.
//   3. `..` and `~` in tool paths resolve to host paths outside the workspace.
//   4. The target skill's own files become unreadable, so skills that bundle
//      templates break; or they stay writable and the model edits the source.
//   5. A blocked write makes the virtual shell throw instead of returning a
//      non-zero exit code to the model.
//   6. Images on virtual paths are sniffed on the host, so reads fail.
function toolNamed(tools, name) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `expected a ${name} tool in the sandbox tool set`);
  return tool;
}

async function withHostDir(run) {
  const dir = await mkdtemp(path.join(tmpdir(), "arc-skill-eval-host-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function exists(target) {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test("sandboxed write to an absolute host path lands inside the workspace", async () => {
  await withWorkspace(async (workspaceDir) => {
    const tools = createJustBashCodingTools(workspaceDir, {});
    const name = `arc-skill-eval-escape-${process.pid}-${Date.now()}`;
    await toolNamed(tools, "write").execute("call-1", { path: `/tmp/${name}/f.txt`, content: "contained" });

    assert.equal(await exists(`/tmp/${name}`), false, "host /tmp must not be written");
    assert.equal(await readFile(path.join(workspaceDir, "tmp", name, "f.txt"), "utf8"), "contained");

    const viaBash = await toolNamed(tools, "bash").execute("call-2", { command: `cat /tmp/${name}/f.txt` });
    assert.match(toolText(viaBash), /contained/);
  });
});

test("sandboxed write rejects `..` and `~` escapes from the workspace", async () => {
  await withWorkspace(async (workspaceDir) => {
    const tools = createJustBashCodingTools(workspaceDir, {});
    const name = `arc-skill-eval-dotdot-${process.pid}-${Date.now()}.txt`;
    await toolNamed(tools, "write").execute("call-1", { path: `../${name}`, content: "x" });
    await toolNamed(tools, "write").execute("call-2", { path: `~/${name}`, content: "y" });

    assert.equal(await exists(path.join(path.dirname(workspaceDir), name)), false);
    assert.equal(await exists(path.join(homedir(), name)), false);
  });
});

test("sandboxed read and edit cannot reach host files outside the workspace", async () => {
  await withWorkspace(async (workspaceDir) => {
    await withHostDir(async (hostDir) => {
      const hostFile = path.join(hostDir, "secret.txt");
      await writeFile(hostFile, "host-secret");
      const tools = createJustBashCodingTools(workspaceDir, {});

      await assert.rejects(toolNamed(tools, "read").execute("call-1", { path: hostFile }));
      await assert.rejects(
        toolNamed(tools, "edit").execute("call-2", {
          path: hostFile,
          edits: [{ oldText: "host-secret", newText: "edited" }],
        }),
      );
      assert.equal(await readFile(hostFile, "utf8"), "host-secret");
    });
  });
});

test("sandboxed bash and file tools agree on cwd, relative paths, and the workspace path", async () => {
  await withWorkspace(async (workspaceDir) => {
    const tools = createJustBashCodingTools(workspaceDir, {});
    const bash = toolNamed(tools, "bash");

    assert.equal(toolText(await bash.execute("call-1", { command: "pwd" })).trim(), workspaceDir);

    await toolNamed(tools, "write").execute("call-2", { path: "rel.txt", content: "from-write" });
    await bash.execute("call-3", { command: "echo from-bash > made-by-bash.txt" });

    const listing = toolText(await bash.execute("call-4", {
      command: `cat rel.txt /rel.txt ${workspaceDir}/rel.txt`,
    }));
    assert.equal(listing, "from-write".repeat(3));

    const read = await toolNamed(tools, "read").execute("call-5", { path: path.join(workspaceDir, "made-by-bash.txt") });
    assert.match(toolText(read), /from-bash/);
    const readRoot = await toolNamed(tools, "read").execute("call-6", { path: "/made-by-bash.txt" });
    assert.match(toolText(readRoot), /from-bash/);

    await toolNamed(tools, "edit").execute("call-7", {
      path: "/rel.txt",
      edits: [{ oldText: "from-write", newText: "edited" }],
    });
    assert.equal(await readFile(path.join(workspaceDir, "rel.txt"), "utf8"), "edited");
  });
});

test("sandboxed tools can read the skill's files but not change them", async () => {
  await withWorkspace(async (workspaceDir) => {
    await withHostDir(async (skillDir) => {
      const template = path.join(skillDir, "template.html");
      await writeFile(template, "<p>template</p>");
      const tools = createJustBashCodingTools(workspaceDir, {}, [], { readOnlyPaths: [skillDir] });
      const bash = toolNamed(tools, "bash");

      assert.match(toolText(await toolNamed(tools, "read").execute("call-1", { path: template })), /template/);
      assert.match(toolText(await bash.execute("call-2", { command: `cat ${template}` })), /template/);

      await assert.rejects(toolNamed(tools, "write").execute("call-3", { path: template, content: "overwritten" }));
      await assert.rejects(
        toolNamed(tools, "edit").execute("call-4", {
          path: template,
          edits: [{ oldText: "template", newText: "edited" }],
        }),
      );
      const blocked = toolText(await bash.execute("call-5", {
        command: `echo overwritten > ${template}; echo "exit=$?"`,
      }).catch((error) => ({ content: [{ text: String(error.message) }] })));
      assert.match(blocked, /exit=[1-9]|read-only/i);

      assert.equal(await readFile(template, "utf8"), "<p>template</p>");
      // Copying a bundled file into the workspace still works.
      await bash.execute("call-6", { command: `cp ${template} page.html` });
      assert.equal(await readFile(path.join(workspaceDir, "page.html"), "utf8"), "<p>template</p>");
    });
  });
});

test("sandboxed read returns images stored on virtual paths", async () => {
  await withWorkspace(async (workspaceDir) => {
    // 1x1 transparent PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    await mkdir(path.join(workspaceDir, "tmp"), { recursive: true });
    await writeFile(path.join(workspaceDir, "tmp", "dot.png"), png);
    const tools = createJustBashCodingTools(workspaceDir, {});

    const result = await toolNamed(tools, "read").execute("call-1", { path: "/tmp/dot.png" });
    assert.ok(result.content.some((part) => part.type === "image"), "expected an image content part");
  });
});
