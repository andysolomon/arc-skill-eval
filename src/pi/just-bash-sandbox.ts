import { posix } from "node:path";

import { Bash, defineCommand, ReadWriteFs } from "just-bash";
import { createCodingTools } from "@mariozechner/pi-coding-agent";

import type { SandboxCommandMock } from "../contracts/types.js";

/**
 * External commands that get a no-op success mock by default so common
 * skills can run under the sandbox without per-case configuration.
 * Per-case `sandboxMocks` override these.
 */
const DEFAULT_MOCK_COMMANDS = ["npm", "npx", "git"] as const;

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
 * `just-bash` ships core unix builtins but NOT `npm`/`npx`/`git`. Those
 * are provided as deterministic custom commands: a no-op success mock by
 * default, overridable per case via `mocks` to return specific
 * stdout/stderr/exit codes and file effects.
 */
export function createJustBashCodingTools(
  workspaceDir: string,
  env: Record<string, string>,
  mocks: SandboxCommandMock[] = [],
): ReturnType<typeof createCodingTools> {
  const bash = new Bash({
    fs: new ReadWriteFs({ root: workspaceDir }),
    // Inside the virtual filesystem, "/" is the ReadWriteFs root, which
    // maps to `workspaceDir` on the real disk.
    cwd: "/",
    env,
    customCommands: buildMockedCommands(mocks),
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

/**
 * Resolve default + per-case mocks into `just-bash` custom commands.
 * Per-case mocks override the no-op defaults for the same command name.
 */
function buildMockedCommands(mocks: SandboxCommandMock[]) {
  const byName = new Map<string, SandboxCommandMock>();
  for (const command of DEFAULT_MOCK_COMMANDS) {
    byName.set(command, { command });
  }
  for (const mock of mocks) {
    byName.set(mock.command, mock);
  }

  return Array.from(byName.values(), (mock) => defineCommand(mock.command, async (_args, ctx) => {
    for (const file of mock.files ?? []) {
      const target = posix.isAbsolute(file.path)
        ? file.path
        : posix.join(ctx.cwd, file.path);
      const dir = posix.dirname(target);
      if (dir && dir !== ".") {
        await ctx.fs.mkdir(dir, { recursive: true });
      }
      await ctx.fs.writeFile(target, file.content);
    }

    return {
      stdout: mock.stdout ?? "",
      stderr: mock.stderr ?? "",
      exitCode: mock.exitCode ?? 0,
    };
  }));
}
