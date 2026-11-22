import { Option, Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

import { DEFAULT_ASSIST_MODEL, Draft, Step, defaultDraft } from './domain';

// HYDRATION

/** The saved draft loads in `init`; nothing is saved until it has landed. */
export const Hydration = defineTaggedUnion({
  Loading: {},
  Loaded: {},
});
export type Hydration = typeof Hydration.Type;

// WRITE

/** Whether the current draft has been written (downloaded or applied). Any edit re-arms it. */
export const DraftWrite = defineTaggedUnion({
  Unwritten: {},
  Written: {},
});
export type DraftWrite = typeof DraftWrite.Type;

export const StagedPlan = Schema.Struct({
  planId: Schema.String,
  stagingPath: Schema.String,
  diffText: Schema.String,
});
export type StagedPlan = typeof StagedPlan.Type;

/** Localhost write: stage a plan with the daemon, then apply or discard it. */
export const Stage = defineTaggedUnion({
  Idle: {},
  Staging: {},
  Staged: { plan: StagedPlan },
  Committing: { plan: StagedPlan },
  Committed: { maybePath: Schema.Option(Schema.String) },
  Cancelling: { plan: StagedPlan },
  Cancelled: {},
  Failed: { error: Schema.String, maybePlan: Schema.Option(StagedPlan) },
});
export type Stage = typeof Stage.Type;

// SUGGEST

export const SuggestTarget = defineTaggedUnion({
  Behavior: {},
  Dimension: { rowId: Schema.String },
  Prompt: { rowId: Schema.String },
  Flavor: { rowId: Schema.String },
  Assertion: { rowId: Schema.String },
});
export type SuggestTarget = typeof SuggestTarget.Type;

export const Suggest = defineTaggedUnion({
  Idle: {},
  Pending: { target: SuggestTarget },
  Failed: { error: Schema.String },
});
export type Suggest = typeof Suggest.Type;

// DRAFT BANNER (localhost)

export const BannerActivity = defineTaggedUnion({
  Idle: {},
  Generating: {},
  LoadingEvals: {},
});
export type BannerActivity = typeof BannerActivity.Type;

export const BannerResult = Schema.Struct({ skill: Schema.String, count: Schema.Number });
export type BannerResult = typeof BannerResult.Type;

export const Banner = Schema.Struct({
  maybeSelectedSkillId: Schema.Option(Schema.String),
  activity: BannerActivity,
  maybeDrafted: Schema.Option(BannerResult),
  maybeLoaded: Schema.Option(BannerResult),
  maybeDraftError: Schema.Option(Schema.String),
  maybeLoadError: Schema.Option(Schema.String),
});
export type Banner = typeof Banner.Type;

export const initialBanner: Banner = {
  maybeSelectedSkillId: Option.none(),
  activity: BannerActivity.Idle(),
  maybeDrafted: Option.none(),
  maybeLoaded: Option.none(),
  maybeDraftError: Option.none(),
  maybeLoadError: Option.none(),
};

// MODEL

export const Model = Schema.Struct({
  hydration: Hydration,
  step: Step,
  draft: Draft,
  write: DraftWrite,
  stage: Stage,
  suggest: Suggest,
  assistModel: Schema.String,
  /** Skill folder an "edit existing evals" load came from; writes go back there. */
  maybeEditTargetPath: Schema.Option(Schema.String),
  banner: Banner,
});
export type Model = typeof Model.Type;

export const initialModel: Model = {
  hydration: Hydration.Loading(),
  step: 'behaviors',
  draft: defaultDraft,
  write: DraftWrite.Unwritten(),
  stage: Stage.Idle(),
  suggest: Suggest.Idle(),
  assistModel: DEFAULT_ASSIST_MODEL,
  maybeEditTargetPath: Option.none(),
  banner: initialBanner,
};

export const isSameSuggestTarget = (left: SuggestTarget, right: SuggestTarget): boolean =>
  left._tag === right._tag && ('rowId' in left ? 'rowId' in right && left.rowId === right.rowId : true);

export const isSuggestPending = (suggest: Suggest, target: SuggestTarget): boolean =>
  suggest._tag === 'Pending' && isSameSuggestTarget(suggest.target, target);

export const maybeStagedPlan = (stage: Stage): Option.Option<StagedPlan> =>
  Stage.match(stage, {
    Idle: () => Option.none(),
    Staging: () => Option.none(),
    Staged: ({ plan }) => Option.some(plan),
    Committing: ({ plan }) => Option.some(plan),
    Committed: () => Option.none(),
    Cancelling: ({ plan }) => Option.some(plan),
    Cancelled: () => Option.none(),
    Failed: ({ maybePlan }) => maybePlan,
  });

export const isWriteInFlight = (stage: Stage): boolean =>
  stage._tag === 'Staging' || stage._tag === 'Committing' || stage._tag === 'Cancelling';
