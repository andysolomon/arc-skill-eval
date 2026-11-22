/**
 * Bridges scoped Effects to the repo's Promise + `cleanup()` contracts.
 *
 * Several stages (case workspace, runtime run, staged harness skills) acquire
 * resources that must outlive the call that created them — grading reads the
 * workspace afterwards — so they return `{ ..., cleanup }`. Writing that by
 * hand means every early `throw` must remember to clean up first, and some
 * didn't. `runScopedHandoff` runs a scoped Effect: on failure or interruption
 * every finalizer runs (reverse acquisition order) before the Promise rejects;
 * on success the open scope is handed to the caller as an idempotent release.
 */

import { Cause, Effect, Exit, Scope } from "effect";

export interface ScopedHandoff<A> {
  value: A;
  /** Runs the scope's finalizers once; later calls are no-ops. */
  release: () => Promise<void>;
}

export async function runScopedHandoff<A, E>(
  effect: Effect.Effect<A, E, Scope.Scope>,
  options: { signal?: AbortSignal } = {},
): Promise<ScopedHandoff<A>> {
  const scope = Scope.makeUnsafe();
  const exit = await Effect.runPromiseExit(Scope.provide(scope)(effect), { signal: options.signal });

  if (Exit.isFailure(exit)) {
    await Effect.runPromise(Scope.close(scope, exit));
    throw Cause.squash(exit.cause);
  }

  let released: Promise<void> | undefined;
  return {
    value: exit.value,
    release: () => (released ??= Effect.runPromise(Scope.close(scope, Exit.void))),
  };
}

/** Lift a Promise-returning cleanup into a finalizer that can never fail. */
export const releaseQuietly = (cleanup: () => Promise<unknown>): Effect.Effect<void> =>
  Effect.tryPromise(cleanup).pipe(Effect.ignore);
