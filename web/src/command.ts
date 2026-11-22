import { Duration, Effect, Schema } from 'effect';
import { Command } from 'foldkit';

import { EnvName, SectionName, ThemeName } from '@/app/domain';
import { Message } from '@/message';
import { resetHostedData } from '@/persistence/db';
import { savePreferences } from '@/persistence/effect';

export const INSTALL_COMMAND = 'npm i -g arc-skill-eval';
const INSTALL_COPIED_MS = 1400;

/** The theme and env live on <html data-theme data-env> so CSS tokens can switch on them. */
export const ApplyDocumentAttributes = Command.define('ApplyDocumentAttributes', {
  args: { theme: ThemeName, env: EnvName },
  messages: [Message.CompletedApplyDocumentAttributes],
  execute: ({ theme, env }) =>
    Effect.sync(() => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.env = env;
      return Message.CompletedApplyDocumentAttributes();
    }),
});

export const SaveShellPreferences = Command.define('SaveShellPreferences', {
  args: {
    theme: Schema.optional(ThemeName),
    env: Schema.optional(EnvName),
    section: Schema.optional(SectionName),
  },
  messages: [Message.CompletedSavePreferences],
  execute: (patch) => savePreferences(patch).pipe(Effect.as(Message.CompletedSavePreferences())),
});

export const CopyInstallCommand = Command.define('CopyInstallCommand', {
  messages: [Message.CompletedCopyInstallCommand],
  execute: Effect.tryPromise(() => navigator.clipboard.writeText(INSTALL_COMMAND)).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedCopyInstallCommand()),
  ),
});

export const WaitBeforeResetInstallCopy = Command.define('WaitBeforeResetInstallCopy', {
  messages: [Message.CompletedWaitBeforeResetInstallCopy],
  interrupt: true,
  execute: Effect.sleep(Duration.millis(INSTALL_COPIED_MS)).pipe(Effect.as(Message.CompletedWaitBeforeResetInstallCopy())),
});

export const ConfirmResetHostedData = Command.define('ConfirmResetHostedData', {
  messages: [Message.CompletedConfirmResetHostedData],
  execute: Effect.sync(() => Message.CompletedConfirmResetHostedData({ confirmed: window.confirm('Reset hosted data?') })),
});

export const ResetHostedDataAndReload = Command.define('ResetHostedDataAndReload', {
  messages: [Message.CompletedResetHostedData],
  execute: Effect.tryPromise(() => resetHostedData()).pipe(
    Effect.ignore,
    Effect.andThen(
      Effect.sync(() => {
        window.location.reload();
        return Message.CompletedResetHostedData();
      }),
    ),
  ),
});
