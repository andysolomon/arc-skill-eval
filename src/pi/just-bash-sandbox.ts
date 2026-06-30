import { Bash, ReadWriteFs } from "just-bash";
import { createCodingTools } from "@mariozechner/pi-coding-agent";

/**
 * Build the Pi coding tool set for a `just-bash` sandboxed run.
 *
 * The agent's `bash` tool is delegated to an in-process {@link Bash}
 * virtual shell instead of the host shell, so command execution stays
 * isolated — no host `npm`/`git`/network and no "heavyweight local
 * setup" required. The virtual filesystem is a {@link ReadWriteFs}
 * rooted at the case workspace (an `mkdtemp` directory), so:
 *
 *   - files the skill creates land in the same temp workspace that the
 *     real-FS `read`/`edit`/`write` tools use, keeping all tools
 *     consistent, and they are captured by the existing
 *     `cp(workspaceDir -> outputs/)` artifact copy with no extra step;
 *   - the repository working tree is never touched (the workspace is a
 *     throwaway temp dir).
 *
 * Only the `bash` tool is swapped; `read`/`edit`/`write` keep their
 * default real-FS behavior against the same workspace directory.
 *
 * Note: `just-bash` ships core unix builtins but NOT `npm`/`npx`/`git`.
 * Deterministic mocks for those external commands are added in
 * W-000022 via `just-bash` custom commands.
 */
export function createJustBashCodingTools(
  workspaceDir: string,
  env: Record<string, string>,
): ReturnType<typeof createCodingTools> {
  const bash = new Bash({
    fs: new ReadWriteFs({ root: workspaceDir }),
    // Inside the virtual filesystem, "/" is the ReadWriteFs root, which
    // maps to `workspaceDir` on the real disk.
    cwd: "/",
    env,
  });

  return createCodingTools(workspaceDir, {
    bash: {
      operations: {
        async exec(command, _cwd, options) {
          const result = await bash.exec(command, { signal: options.signal });

          // The pi bash tool consumes streamed chunks; just-bash returns
          // the full output at once, so emit stdout then stderr.
          if (result.stdout) options.onData(Buffer.from(result.stdout, "utf8"));
          if (result.stderr) options.onData(Buffer.from(result.stderr, "utf8"));

          return { exitCode: result.exitCode };
        },
      },
    },
  });
}
