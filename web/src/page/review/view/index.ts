import { Array, Option } from 'effect';
import { Submodel } from 'foldkit';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { AppContext } from '@/app/context';
import { skillPicker } from '@/ui/primitives';
import { sx } from '@/ui/sx';

import { Message } from '../message';
import type { Model } from '../model';
import { selectedRun, showsLocalHeader, skillIds, visibleRuns } from '../selectors';
import { feedbackAside } from './feedback';
import { importPanel } from './importPanel';
import { runsRail } from './runs';
import { summary } from './summary';

const reviewingPicker = (model: Model, offeredSkillIds: ReadonlyArray<string>, h: HtmlBuilder<Message>): Html =>
  skillPicker(
    {
      label: 'reviewing',
      skillIds: offeredSkillIds,
      selectedSkillId: Option.getOrUndefined(model.maybeSelectedSkillId),
      onSelectSkill: (skillId) => Message.SelectedSkill({ skillId }),
    },
    h,
  );

const localHeader = (model: Model, offeredSkillIds: ReadonlyArray<string>, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Style(
        sx({
          alignItems: 'center',
          borderBottom: '1px solid var(--tt-border)',
          display: 'flex',
          flex: 'none',
          flexWrap: 'wrap',
          fontSize: 12,
          gap: 8,
          padding: '9px 16px',
        }),
      ),
    ],
    [
      h.span([h.Style(sx({ color: 'var(--tt-green)', fontWeight: 700 }))], ['Localhost']),
      reviewingPicker(model, offeredSkillIds, h),
      h.span(
        [h.Style(sx({ color: 'var(--tt-comment)' }))],
        ['Runs under ', h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['./evals-runs']), '. Pick one on the left.'],
      ),
    ],
  );

const envHeader = (
  model: Model,
  context: AppContext,
  offeredSkillIds: ReadonlyArray<string>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Style(
        sx({
          alignItems: 'center',
          borderBottom: '1px solid var(--tt-border)',
          display: 'flex',
          flex: 'none',
          gap: 8,
          padding: '9px 16px',
        }),
      ),
    ],
    [
      h.span([h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 12, fontWeight: 700 }))], [context.env]),
      reviewingPicker(model, offeredSkillIds, h),
    ],
  );

export const view = Submodel.defineView<Model, Message, AppContext>((model, context, h) => {
  const maybeRun = selectedRun(model, context);
  const hasRuns = Option.isSome(maybeRun);
  const offeredSkillIds = skillIds(model, context);
  const isLocalHeader = showsLocalHeader(model, context);

  return h.main(
    [
      h.Class('app-main'),
      h.DataAttribute('testid', hasRuns ? 'review-app' : 'review-empty-state'),
      h.Style(
        sx({ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', padding: 0 }),
      ),
    ],
    [
      isLocalHeader
        ? localHeader(model, offeredSkillIds, h)
        : h.div([h.Style(sx({ flex: 'none', padding: hasRuns ? '16px 16px 0' : 16 }))], [importPanel(model, h)]),
      Array.isReadonlyArrayNonEmpty(offeredSkillIds) && !isLocalHeader
        ? envHeader(model, context, offeredSkillIds, h)
        : h.empty,
      Option.match(maybeRun, {
        onNone: () => h.empty,
        onSome: (run) =>
          h.section(
            [
              h.AriaLabel('Review workspace'),
              h.Style(sx({ display: 'flex', flex: 1, gap: 12, minHeight: 0, padding: 16 })),
            ],
            [
              runsRail(visibleRuns(model, context), run.id, model.maybeNowMillis, h),
              summary(run, model.maybeSelectedCaseId, h),
              feedbackAside(model, run, context.env, h),
            ],
          ),
      }),
    ],
  );
});
