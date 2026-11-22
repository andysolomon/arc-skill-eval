import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { kicker } from '@/ui/primitives';
import { sx } from '@/ui/sx';

import { artifactRequest, viewArtifact } from '../../artifact';
import { expectedText, responseText, type Variant } from '../../domain';
import type { Message } from '../../message';
import { MONO_FONT, gridSection, notice, type TabInput } from './shared';

// VIEW

type DiffRow = Readonly<{ sign: string; text: string; tone: string }>;

const rowsForArm = (expected: string, response: string, arm: Variant, isHosted: boolean): ReadonlyArray<DiffRow> =>
  arm === 'with_skill'
    ? [
        { sign: '-', text: expected, tone: 'var(--tt-red)' },
        { sign: '+', text: response, tone: 'var(--tt-green)' },
      ]
    : [
        { sign: '-', text: expected, tone: 'var(--tt-red)' },
        {
          sign: ' ',
          text: isHosted ? 'The imported JSON does not include the without_skill response.' : response,
          tone: 'var(--tt-comment)',
        },
      ];

const diffRow = (row: DiffRow, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Style(
        sx({
          color: row.tone,
          display: 'grid',
          gap: 8,
          gridTemplateColumns: '16px minmax(0, 1fr)',
          whiteSpace: 'pre-wrap',
        }),
      ),
    ],
    [h.span([], [row.sign]), h.span([], [row.text])],
  );

const armResponse = (input: TabInput, arm: Variant): string => {
  if (input.context.env === 'hosted') {
    return responseText(input.testCase);
  }
  const artifact = viewArtifact(input.artifacts, artifactRequest(input.run, input.testCase, arm, 'assistant.md'));
  return Option.getOrElse(artifact.maybeError, () =>
    artifact.text === '' ? responseText(input.testCase) : artifact.text,
  );
};

const armPanel = (input: TabInput, arm: Variant, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    arm,
    [
      h.AriaLabel(`${arm} response diff`),
      h.Style(
        sx({
          background: 'var(--tt-bg)',
          border: arm === input.variant ? '1px solid var(--tt-border-active)' : '1px solid var(--tt-border)',
          fontFamily: MONO_FONT,
          fontSize: 12,
          lineHeight: 1.5,
          maxHeight: 520,
          overflow: 'auto',
          padding: 12,
        }),
      ),
    ],
    Array.map(
      rowsForArm(expectedText(input.testCase), armResponse(input, arm), arm, input.context.env === 'hosted'),
      (row) => diffRow(row, h),
    ),
  );

const arms: ReadonlyArray<Variant> = ['without_skill', 'with_skill'];

export const diffTab = (input: TabInput, h: HtmlBuilder<Message>): Html =>
  input.run.compare
    ? gridSection(
        12,
        [
          kicker({ section: input.context.section, content: `diff / ${input.variant}` }, h),
          h.div(
            [h.Style(sx({ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }))],
            Array.map(arms, (arm) => armPanel(input, arm, h)),
          ),
        ],
        h,
      )
    : gridSection(
        10,
        [
          kicker({ section: input.context.section, content: 'diff' }, h),
          notice('This run has no comparison results.', h, { lineHeight: 1.5 }),
        ],
        h,
      );
