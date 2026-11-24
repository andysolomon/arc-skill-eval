import { spawn, type ChildProcess } from "node:child_process";

import { Data, Effect } from "effect";

export interface ProcessOutput {
  stdout: string;
  stderr: string;
  /** `null` when the process was terminated by a signal. */
  exitCode: number | null;
}

export interface RunProcessOptions {
  cwd: string;
  /** Defaults to the parent's environment. */
  env?: NodeJS.ProcessEnv;
}

export class ProcessSpawnError extends Data.TaggedError("ProcessSpawnError")<{
  readonly command: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : `Failed to spawn ${this.command}: ${String(this.cause)}`;
  }
}

export const KILL_GRACE_MS = 5_000;

export const runProcess = (
  command: string,
  args: readonly string[],
  options: RunProcessOptions,
): Effect.Effect<ProcessOutput, ProcessSpawnError> =>
  Effect.callback<ProcessOutput, ProcessSpawnError>((resume) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (cause) => {
      resume(Effect.fail(new ProcessSpawnError({ command, cause })));
    });
    child.on("close", (exitCode) => {
      resume(Effect.succeed({ stdout, stderr, exitCode }));
    });

    // Runs only when the fiber is interrupted before the child closed.
    return Effect.sync(() => terminate(child));
  });

export function runProcessPromise(
  command: string,
  args: readonly string[],
  options: RunProcessOptions & { signal?: AbortSignal },
): Promise<ProcessOutput> {
  return Effect.runPromise(runProcess(command, args, options), { signal: options.signal });
}

function terminate(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }, KILL_GRACE_MS);
  timer.unref();
  child.once("close", () => clearTimeout(timer));
}
