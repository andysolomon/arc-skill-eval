/**
 * Pure program definition: Flags (saved preferences, loaded before the first
 * render) and init. entry.ts boots the runtime.
 */

import { Effect, Schema } from 'effect';
import { Command, type Runtime, type Update } from 'foldkit';

import { EnvName, SectionName, ThemeName, defaultTheme, isEnvName, isThemeName } from '@/app/domain';
import { ApplyDocumentAttributes } from '@/command';
import { Message } from '@/message';
import { InstallCopy, toContext, type Model } from '@/model';
import { loadPreferences, savePreferences } from '@/persistence/effect';
import * as Workspace from '@/shell/workspace';
import { initPage } from '@/update';

export { Model } from '@/model';
export { Message } from '@/message';
export { update } from '@/update';
export { view } from '@/view';
export { subscriptions } from '@/subscription';

// FLAGS

export const Flags = Schema.Struct({
  theme: ThemeName,
  env: EnvName,
  section: SectionName,
  workspaceRoot: Schema.String,
  workspaceFavorites: Schema.Array(Schema.String),
});
export type Flags = typeof Flags.Type;

const LEGACY_THEME_STORAGE_KEY = 'arc-pi-theme';

const documentEnv = (): EnvName => {
  const env = document.documentElement.dataset.env;
  return isEnvName(env) ? env : 'hosted';
};

/** A theme saved by the pre-IndexedDB app wins once, then moves into preferences. */
const migrateLegacyTheme = Effect.sync(() => {
  const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (legacy === null) {
    return undefined;
  }
  window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  return isThemeName(legacy) ? legacy : undefined;
}).pipe(Effect.catch(() => Effect.succeed(undefined)));

export const flags: Effect.Effect<Flags> = Effect.gen(function* () {
  const legacyTheme = yield* migrateLegacyTheme;
  if (legacyTheme !== undefined) {
    yield* savePreferences({ theme: legacyTheme });
  }
  const prefs = yield* loadPreferences;
  return {
    theme: legacyTheme ?? prefs.theme,
    env: prefs.env,
    section: prefs.section,
    workspaceRoot: prefs.workspaceRoot ?? '',
    workspaceFavorites: prefs.workspaceFavorites,
  };
}).pipe(
  Effect.catch(() =>
    Effect.succeed({
      theme: defaultTheme,
      env: documentEnv(),
      section: 'run' as const,
      workspaceRoot: '',
      workspaceFavorites: [],
    }),
  ),
);

// INIT

export const init: Runtime.ApplicationInit<Model, Message, Flags> = (flags): Update.Return<Model, Message> => {
  const workspaceInit = Workspace.init(flags.workspaceRoot, flags.workspaceFavorites);
  const shell = {
    theme: flags.theme,
    env: flags.env,
    section: flags.section,
    workspace: workspaceInit.model,
    installCopy: InstallCopy.Idle(),
  };
  const pageInit = initPage(flags.section, toContext(shell));

  return {
    model: { ...shell, page: pageInit.model },
    commands: [
      ApplyDocumentAttributes({ theme: flags.theme, env: flags.env }),
      ...Command.mapMessages(workspaceInit.commands, (message) => Message.GotWorkspaceMessage({ message })),
      ...(pageInit.commands ?? []),
    ],
  };
};
