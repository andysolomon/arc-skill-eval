import { Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

import type { AppContext } from '@/app/context';
import { EnvName, SectionName, ThemeName } from '@/app/domain';
import * as Browse from '@/page/browse';
import * as Create from '@/page/create';
import * as Learn from '@/page/learn';
import * as Review from '@/page/review';
import * as Run from '@/page/run';
import * as Workspace from '@/shell/workspace';

export const Page = defineTaggedUnion({
  Run: { model: Run.Model },
  Browse: { model: Browse.Model },
  Create: { model: Create.Model },
  Review: { model: Review.Model },
  Learn: { model: Learn.Model },
});
export type Page = typeof Page.Type;

export const InstallCopy = defineTaggedUnion({
  Idle: {},
  Copied: {},
});
export type InstallCopy = typeof InstallCopy.Type;

export const Model = Schema.Struct({
  theme: ThemeName,
  env: EnvName,
  section: SectionName,
  workspace: Workspace.Model,
  installCopy: InstallCopy,
  page: Page,
});
export type Model = typeof Model.Type;

export const toContext = (model: Pick<Model, 'env' | 'theme' | 'section' | 'workspace'>): AppContext => ({
  env: model.env,
  theme: model.theme,
  section: model.section,
  workspace: Workspace.toSnapshot(model.workspace),
});
