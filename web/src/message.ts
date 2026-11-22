import { Schema } from 'effect';
import { defineMessageUnion } from 'foldkit/message';

import { EnvName, SectionName, ThemeName } from '@/app/domain';
import * as Browse from '@/page/browse';
import * as Create from '@/page/create';
import * as Learn from '@/page/learn';
import * as Review from '@/page/review';
import * as Run from '@/page/run';
import * as Workspace from '@/shell/workspace';

export const Message = defineMessageUnion({
  ClickedSection: { section: SectionName },
  PressedSectionKey: { section: SectionName },
  ClickedTheme: { theme: ThemeName },
  ClickedEnv: { env: EnvName },
  ClickedInstallCommand: {},
  CompletedCopyInstallCommand: {},
  CompletedWaitBeforeResetInstallCopy: {},
  ClickedResetHostedData: {},
  CompletedConfirmResetHostedData: { confirmed: Schema.Boolean },
  CompletedResetHostedData: {},
  CompletedApplyDocumentAttributes: {},
  CompletedSavePreferences: {},
  GotWorkspaceMessage: { message: Workspace.Message },
  GotRunMessage: { message: Run.Message },
  GotBrowseMessage: { message: Browse.Message },
  GotCreateMessage: { message: Create.Message },
  GotReviewMessage: { message: Review.Message },
  GotLearnMessage: { message: Learn.Message },
});
export type Message = typeof Message.Type;
