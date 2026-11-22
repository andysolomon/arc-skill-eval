import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import { countDraft } from '../domain';
import { Message } from '../message';
import { isWriteInFlight, maybeStagedPlan, type Model, type StagedPlan } from '../model';
import { stepHeader, tinted } from './common';

const statCardStyle = {
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  flex: '1 1 40%',
  minWidth: 118,
  padding: '12px 16px',
} as const;

const greenButtonBackground = 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))';

const stats = (model: Model, h: HtmlBuilder<Message>): Html => {
  const counts = countDraft(model.draft);
  const entries: ReadonlyArray<Readonly<{ label: string; value: number; tint: string }>> = [
    { label: 'cases', value: counts.cases, tint: 'var(--tt-fg)' },
    { label: 'assertions', value: counts.assertions, tint: 'var(--tt-fg)' },
    { label: 'deterministic', value: counts.deterministic, tint: 'var(--tt-cyan)' },
    { label: 'judge', value: counts.judge, tint: 'var(--tt-magenta)' },
  ];
  return h.div(
    [h.Style(sx({ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }))],
    Array.map(entries, (stat) =>
      h.section(
        [h.AriaLabel(`${stat.label} count`), h.Style(sx(statCardStyle))],
        [
          h.div(
            [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11, textTransform: 'uppercase' }))],
            [stat.label],
          ),
          h.div([h.Style(sx({ color: stat.tint, fontSize: 22, fontWeight: 700 }))], [String(stat.value)]),
        ],
      ),
    ),
  );
};

const runCommand = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.AriaLabel('run command'),
      h.Style(
        sx({
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 16,
          padding: '12px 15px',
        }),
      ),
    ],
    [
      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
      h.span(
        [h.Style(sx({ color: 'var(--tt-fg)' }))],
        [`arc-skill-eval run ./skills/${model.draft.skill || 'my-skill'} --compare`],
      ),
    ],
  );

const writeLabel = (model: Model): string =>
  model.stage._tag === 'Staging'
    ? 'staging evals/evals.json…'
    : model.write._tag === 'Written'
      ? '✓ wrote evals/evals.json'
      : 'write evals/evals.json';

const writeRow = (model: Model, h: HtmlBuilder<Message>): Html => {
  const isInFlight = isWriteInFlight(model.stage);
  return h.div(
    [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 12 }))],
    [
      h.button(
        [
          h.DataAttribute('testid', 'write-evals-json'),
          h.Disabled(isInFlight),
          h.OnClick(Message.ClickedWriteEvalsJson()),
          h.Type('button'),
          h.Style(
            sx({
              alignItems: 'center',
              background: greenButtonBackground,
              border: '1px solid var(--tt-green)',
              borderRadius: 7,
              color: 'var(--tt-green)',
              cursor: isInFlight ? 'wait' : 'pointer',
              display: 'inline-flex',
              fontWeight: 700,
              gap: 8,
              height: 40,
              justifyContent: 'center',
              padding: '0 18px',
            }),
          ),
        ],
        [writeLabel(model)],
      ),
      model.write._tag === 'Written'
        ? h.a(
            [
              h.Href('#'),
              h.OnClick(Message.ClickedOpenRunConsole(), { defaultAction: 'Prevent' }),
              h.Style(sx({ fontSize: 13 })),
            ],
            ['Open the run console →'],
          )
        : h.empty,
    ],
  );
};

const stagingDiff = (plan: StagedPlan, isInFlight: boolean, h: HtmlBuilder<Message>): Html =>
  h.section(
    [
      h.AriaLabel('staging diff'),
      h.Style(
        sx({
          border: '1px solid var(--tt-green)',
          borderRadius: 8,
          display: 'grid',
          gap: 10,
          marginTop: 16,
          padding: 12,
        }),
      ),
    ],
    [
      h.span(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12 }))],
        ['staged ', plan.planId, ' at ', plan.stagingPath],
      ),
      h.pre(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 6,
              color: 'var(--tt-fg-dark)',
              fontSize: 12,
              margin: 0,
              overflow: 'auto',
              padding: 10,
              whiteSpace: 'pre-wrap',
            }),
          ),
        ],
        [plan.diffText],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', gap: 8, justifyContent: 'flex-end' }))],
        [
          h.button(
            [
              h.Disabled(isInFlight),
              h.OnClick(Message.ClickedApplyChanges()),
              h.Type('button'),
              h.Style(
                sx({
                  background: greenButtonBackground,
                  border: '1px solid var(--tt-green)',
                  borderRadius: 7,
                  color: 'var(--tt-green)',
                  cursor: isInFlight ? 'wait' : 'pointer',
                  fontWeight: 700,
                  padding: '7px 14px',
                }),
              ),
            ],
            ['Apply changes'],
          ),
          h.button(
            [
              h.Disabled(isInFlight),
              h.OnClick(Message.ClickedDiscardChanges()),
              h.Type('button'),
              h.Style(
                sx({
                  background: 'transparent',
                  border: '1px solid var(--tt-border)',
                  borderRadius: 7,
                  color: 'var(--tt-fg-dark)',
                  cursor: isInFlight ? 'wait' : 'pointer',
                  padding: '7px 14px',
                }),
              ),
            ],
            ['Discard changes'],
          ),
        ],
      ),
    ],
  );

const stageNotices = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  model.stage._tag === 'Committed'
    ? h.div(
        [h.Role('status'), h.Style(sx({ color: 'var(--tt-green)', fontSize: 12.5, marginTop: 12 }))],
        [
          '✓ wrote evals.json',
          ...Option.match(Option.filter(model.stage.maybePath, (path) => path !== ''), {
            onNone: () => [],
            onSome: (path) => [` to ${path}`],
          }),
        ],
      )
    : h.empty,
  model.stage._tag === 'Failed' && model.stage.error !== ''
    ? h.div(
        [h.Role('alert'), h.Style(sx({ color: 'var(--tt-red)', fontSize: 12.5, marginTop: 12 }))],
        ['✗ ', model.stage.error],
      )
    : h.empty,
];

export const stepReview = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      ...stepHeader(
        {
          kicker: 'step 04',
          title: 'Review & run',
          intro: [
            'Review the suite, then write it to evals/evals.json. Run with',
            ' ',
            tinted('--compare', 'var(--tt-fg)', h),
            ' to compare results with and without the skill.',
          ],
          introMarginBottom: 22,
        },
        h,
      ),
      stats(model, h),
      runCommand(model, h),
      writeRow(model, h),
      Option.match(maybeStagedPlan(model.stage), {
        onNone: () => h.empty,
        onSome: (plan) => stagingDiff(plan, isWriteInFlight(model.stage), h),
      }),
      ...stageNotices(model, h),
      h.div(
        [
          h.Style(
            sx({
              borderTop: '1px solid var(--tt-border)',
              color: 'var(--tt-comment)',
              fontSize: 12,
              lineHeight: 1.6,
              marginTop: 20,
              paddingTop: 14,
            }),
          ),
        ],
        ['After the run, review failed cases and add cases for behavior that the suite does not yet cover.'],
      ),
    ],
  );
