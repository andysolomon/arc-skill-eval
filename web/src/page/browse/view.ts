import { Array, Option } from 'effect';
import { Submodel } from 'foldkit';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { AppContext } from '@/app/context';
import { skillPicker } from '@/ui/primitives';
import { sx } from '@/ui/sx';

import { Message } from './message';
import { HostedRuns, activeSelection, skillIds, visibleRuns, type Model, type Selection } from './model';
import { caseList } from './view/caseList';
import { detail } from './view/detail';
import { emptyState } from './view/emptyState';
import { runsRail } from './view/runsRail';

// VIEW

const sourceNote = (context: AppContext, h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.Style(sx({ color: 'var(--tt-comment)' }))],
    context.env === 'hosted'
      ? [
          'Browsing imported runs. Import run JSON in ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['Review']),
          ' to add results.',
        ]
      : ['Reading ', h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['./evals-runs']), ' from disk.'],
  );

const skillBar = (model: Model, context: AppContext, ids: ReadonlyArray<string>, h: HtmlBuilder<Message>): Html =>
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
      h.span(
        [h.Style(sx({ color: context.env === 'hosted' ? 'var(--tt-cyan)' : 'var(--tt-green)', fontWeight: 700 }))],
        [context.env === 'hosted' ? 'Hosted' : 'Localhost'],
      ),
      skillPicker(
        {
          label: 'browsing',
          skillIds: ids,
          selectedSkillId: Option.getOrUndefined(model.maybeSkillId),
          onSelectSkill: (skillId) => Message.SelectedSkill({ skillId }),
        },
        h,
      ),
      sourceNote(context, h),
    ],
  );

const results = (model: Model, context: AppContext, selection: Selection, h: HtmlBuilder<Message>): Html =>
  h.section(
    [
      h.AriaLabel('Browse run results'),
      h.Style(sx({ display: 'flex', flex: 1, gap: 10, minHeight: 0, minWidth: 0, padding: 14 })),
    ],
    [
      h.div(
        [h.Style(sx({ display: 'flex', flex: 'none', flexDirection: 'column', gap: 10, minHeight: 0, width: 326 }))],
        [
          runsRail(visibleRuns(model, context), selection.run.id, h),
          caseList(selection.run.cases, selection.testCase.id, h),
        ],
      ),
      detail(
        { context, run: selection.run, testCase: selection.testCase, variant: model.variant, artifacts: model.artifacts },
        model.tab,
        h,
      ),
    ],
  );

const isLoadingImports = (model: Model, context: AppContext): boolean =>
  context.env === 'hosted' && HostedRuns.match(model.hostedRuns, { Loading: () => true, Loaded: () => false });

export const view = Submodel.defineView<Model, Message, AppContext>((model, context, h) => {
  const ids = skillIds(model, context);
  const maybeSelection = activeSelection(model, context);
  return h.main(
    [
      h.Class('app-main'),
      h.DataAttribute('screen-label', `browse (${context.env})`),
      ...(Option.isSome(maybeSelection) ? [h.DataAttribute('testid', 'browse-app')] : []),
      h.Style(sx({ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, padding: 0 })),
    ],
    [
      Array.isReadonlyArrayNonEmpty(ids) ? skillBar(model, context, ids, h) : h.empty,
      Option.match(maybeSelection, {
        onSome: (selection) => results(model, context, selection, h),
        onNone: () => (isLoadingImports(model, context) ? h.empty : emptyState(context.env, h)),
      }),
    ],
  );
});
