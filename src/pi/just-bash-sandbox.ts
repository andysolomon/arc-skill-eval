import path, { posix } from "node:path";

import { Bash, defineCommand, MountableFs, OverlayFs, ReadWriteFs } from "just-bash";
import { createCodingTools } from "@earendil-works/pi-coding-agent";

import type { SandboxCommandMock } from "../contracts/types.js";

/**
 * External commands that get a no-op success mock by default so common
 * skills can run under the sandbox without per-case configuration.
 * Per-case `sandboxMocks` override these.
 */
const DEFAULT_MOCK_COMMANDS = ["npm", "npx", "git"] as const;

export interface JustBashSandboxOptions {
  /**
   * Host directories the agent may read but not change, mounted at their
   * real paths. Use this for the target skill (and any extra skills) so a
   * skill can still read the files it bundles, such as templates.
   */
  readOnlyPaths?: string[];
}

/**
 * Build the Pi coding tool set for a `just-bash` sandboxed run.
 *
 * Every tool (`bash`, `read`, `write`, and `edit`) goes through one
 * in-process virtual filesystem, so the agent sees a single, consistent
 * view and cannot touch the host outside the case workspace:
 *
 *   - `/` is the case workspace (an `mkdtemp` directory). An absolute path
 *     such as `/tmp/out/index.html` lands at `<workspace>/tmp/out/index.html`:
 *     still isolated, and still captured by the `cp(workspaceDir -> outputs/)`
 *     artifact copy.
 *   - The workspace is also mounted at its real host path, and the shell
 *     starts there. That matches the cwd Pi reports in the system prompt and
 *     the paths Pi's file tools resolve relative paths against.
 *   - Each `readOnlyPaths` directory is mounted read-only at its real path.
 *   - Nothing else on the host is visible. `..` and `~` resolve inside the
 *     virtual root.
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
  options: JustBashSandboxOptions = {},
): ReturnType<typeof createCodingTools> {
  const workspaceRoot = path.resolve(workspaceDir);
  const fs = createSandboxFs(workspaceRoot, options.readOnlyPaths ?? []);
  const bash = new Bash({
    fs,
    cwd: workspaceRoot,
    env,
    customCommands: buildMockedCommands(mocks),
  });

  // Pi's file tools resolve paths against `workspaceRoot` on the host and
  // hand us absolute host-style paths. The virtual filesystem understands
  // the same paths, so they pass through unchanged.
  const readFile = (absolutePath: string) =>
    withHostPath(absolutePath, async () => Buffer.from(await fs.readFileBuffer(toSandboxPath(absolutePath))));
  const access = (absolutePath: string) =>
    withHostPath(absolutePath, async () => {
      const stat = await fs.stat(toSandboxPath(absolutePath));
      if (stat.isDirectory) throw new Error(`EISDIR: illegal operation on a directory, read '${absolutePath}'`);
    });
  const writeFile = (absolutePath: string, content: string) =>
    withHostPath(absolutePath, () => fs.writeFile(toSandboxPath(absolutePath), content));

  return createCodingTools(workspaceRoot, {
    bash: {
      operations: {
        async exec(command, _cwd, execOptions) {
          let result: { stdout: string; stderr: string; exitCode: number };
          try {
            result = await bash.exec(command, { signal: execOptions.signal });
          } catch (error) {
            // just-bash throws for some filesystem errors (e.g. writing to a
            // read-only mount). Report them to the model like a shell would.
            const message = error instanceof Error ? error.message : String(error);
            execOptions.onData(Buffer.from(`bash: ${message}\n`, "utf8"));
            return { exitCode: 1 };
          }

          // The pi bash tool consumes streamed chunks; just-bash returns
          // the full output at once, so emit stdout then stderr.
          if (result.stdout) execOptions.onData(Buffer.from(result.stdout, "utf8"));
          if (result.stderr) execOptions.onData(Buffer.from(result.stderr, "utf8"));

          return { exitCode: result.exitCode };
        },
      },
    },
    read: {
      operations: {
        readFile,
        access,
        detectImageMimeType: async (absolutePath) => detectImageMimeType(await readFile(absolutePath)),
      },
    },
    write: {
      operations: {
        writeFile,
        mkdir: (dir) => withHostPath(dir, () => fs.mkdir(toSandboxPath(dir), { recursive: true })),
      },
    },
    edit: {
      operations: { readFile, writeFile, access },
    },
  });
}

function createSandboxFs(workspaceRoot: string, readOnlyPaths: string[]): MountableFs {
  const fs = new MountableFs({ base: new ReadWriteFs({ root: workspaceRoot }) });
  fs.mount(toSandboxPath(workspaceRoot), new ReadWriteFs({ root: workspaceRoot }));

  for (const dir of outermostDirs(readOnlyPaths)) {
    // Skip anything overlapping the workspace: it is already writable there,
    // and a read-only mount around it would hide it.
    if (isSameOrInside(dir, workspaceRoot) || isSameOrInside(workspaceRoot, dir)) continue;
    fs.mount(toSandboxPath(dir), new OverlayFs({ root: dir, mountPoint: "/", readOnly: true }));
  }

  return fs;
}

/** Resolve, dedupe, and drop directories nested inside another one (mounts cannot nest). */
function outermostDirs(dirs: string[]): string[] {
  const resolved = [...new Set(dirs.map((dir) => path.resolve(dir)))].sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  for (const dir of resolved) {
    if (dir === path.parse(dir).root) continue;
    if (!kept.some((parent) => isSameOrInside(dir, parent))) kept.push(dir);
  }
  return kept;
}

function isSameOrInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Host absolute path -> virtual POSIX path (identical on POSIX hosts). */
function toSandboxPath(hostPath: string): string {
  const resolved = path.resolve(hostPath);
  if (path.sep === "/") return resolved;
  const { root } = path.parse(resolved);
  return posix.join("/", resolved.slice(root.length).split(path.sep).join("/"));
}

/**
 * Run a virtual filesystem call, rewriting errors to name the path the model
 * used. Mounted filesystems report paths relative to their mount point.
 */
async function withHostPath<T>(hostPath: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const rewritten = new Error(error.message.replace(/'[^']*'$/u, `'${hostPath}'`));
    (rewritten as Error & { code?: unknown }).code = (error as Error & { code?: unknown }).code;
    throw rewritten;
  }
}

/** Mime type for the image formats Pi's read tool supports, from magic bytes. */
function detectImageMimeType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
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
