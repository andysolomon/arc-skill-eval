/**
 * What every page can read from the shell, and what it can ask the shell to
 * do. Pages receive {@link AppContext} as Submodel view inputs and as an
 * argument to `init`, `update` and `contextChanged`; they talk back through
 * {@link PageOutMessage}.
 */

import { Schema } from 'effect';
import { defineMessageUnion } from 'foldkit/message';

import { EnvName, SectionName, ThemeName } from './domain';

export const WorkspaceSkill = Schema.Struct({
  id: Schema.String,
  role: Schema.Option(Schema.Literals(['target', 'distractor'])),
  name: Schema.Option(Schema.String),
  description: Schema.Option(Schema.String),
  path: Schema.Option(Schema.String),
  hasEvals: Schema.Boolean,
});
export type WorkspaceSkill = typeof WorkspaceSkill.Type;

export const WorkspaceStatus = Schema.Literals(['loading', 'live', 'offline']);
export type WorkspaceStatus = typeof WorkspaceStatus.Type;

/** Read-only view of the shell's workspace for pages. */
export const WorkspaceSnapshot = Schema.Struct({
  /** The reference the user picked (path or GitHub URL); empty when none. */
  root: Schema.String,
  /** Skills the daemon found (sample list while the daemon is offline). */
  skills: Schema.Array(WorkspaceSkill),
  status: WorkspaceStatus,
  maybeResolvedPath: Schema.Option(Schema.String),
  maybeSource: Schema.Option(Schema.Literals(['local', 'github'])),
  maybeError: Schema.Option(Schema.String),
});
export type WorkspaceSnapshot = typeof WorkspaceSnapshot.Type;

export const AppContext = Schema.Struct({
  env: EnvName,
  theme: ThemeName,
  section: SectionName,
  workspace: WorkspaceSnapshot,
});
export type AppContext = typeof AppContext.Type;

export const PageOutMessage = defineMessageUnion({
  /** Switch the active section (e.g. an empty state's "go to review" button). */
  RequestedSection: { section: SectionName },
});
export type PageOutMessage = typeof PageOutMessage.Type;
