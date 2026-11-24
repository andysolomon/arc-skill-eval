import { Schema } from 'effect';
import { defineMessageUnion } from 'foldkit/message';
import { defineTaggedUnion } from 'foldkit/schema';

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

export const DaemonInfo = defineTaggedUnion({
  Unknown: {},
  Offline: {},
  Online: {
    runtime: Schema.String,
    maybeModel: Schema.Option(Schema.String),
    maybeJudgeModel: Schema.Option(Schema.String),
  },
});
export type DaemonInfo = typeof DaemonInfo.Type;

export const WorkspaceSnapshot = Schema.Struct({
  daemon: DaemonInfo,
  root: Schema.String,
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
  RequestedSection: { section: SectionName },
});
export type PageOutMessage = typeof PageOutMessage.Type;
