import { Cause, Effect, Exit, Scope } from "effect";

export interface ScopedHandoff<A> {
  value: A;
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

export const releaseQuietly = (cleanup: () => Promise<unknown>): Effect.Effect<void> =>
  Effect.tryPromise(cleanup).pipe(Effect.ignore);
