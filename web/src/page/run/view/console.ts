/** Localhost: the right-hand console — command preview, live progress, benchmark. */

import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import { commandFlags } from '../composer';
import { RunState, elapsedSec, isRunning, maybeRunId, progressRows, type Benchmark } from '../lifecycle';
import { Message } from '../message';
import type { Model } from '../model';
import type { ProgressRow } from '../runEvent';
import { asciiBar, spinnerGlyph } from './glyph';

const NBSP = ' ';
const BAR_WIDTH = 16;

const sectionKicker = (content: string, h: HtmlBuilder<Message>): Html =>
  h.div([h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 12, fontWeight: 700, marginBottom: 5 }))], [content]);

const commandPreview = (model: Model, h: HtmlBuilder<Message>): Html => {
  const { workspaceRoot } = model.composer;
  return h.div(
    [h.Style(sx({ marginBottom: 14 }))],
    [
      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
      h.span(
        [h.Style(sx({ color: 'var(--tt-fg)' }))],
        [`arc-skill-eval run ${workspaceRoot === '' ? './skills/<pick a workspace>' : workspaceRoot}`],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', paddingLeft: 16 }))],
        [commandFlags(model.composer).join('  ')],
      ),
    ],
  );
};

const idleHint = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ color: 'var(--tt-comment)', padding: '6px 0' }))],
    [
      'Select ',
      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['▶ Run']),
      ' to start. Comparison mode grades ',
      h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], ['with_skill']),
      ' and ',
      h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], ['without_skill']),
      ', then reports the difference.',
    ],
  );

const runningLine = (spinner: string, seconds: number, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ color: 'var(--tt-cyan)', marginBottom: 10 }))],
    [
      `${spinner} running with_skill · without_skill `,
      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [`· elapsed ${seconds.toFixed(1)}s`]),
    ],
  );

const completeLine = (benchmark: Benchmark, seconds: number, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ color: 'var(--tt-green)', fontWeight: 700, marginBottom: 10 }))],
    [
      `✓ run complete${NBSP.repeat(3)}${benchmark.passed}/${benchmark.total} passed${NBSP.repeat(3)}${seconds.toFixed(1)}s`,
    ],
  );

const progressLine = (row: ProgressRow, isActive: boolean, spinner: string, h: HtmlBuilder<Message>): Html => {
  const isSettled = row.totalAssertions > 0 && row.assertionsPassed + row.assertionsFailed >= row.totalAssertions;
  const isFailed = row.assertionsFailed > 0;
  const glyph = isFailed ? '✗' : isSettled ? '✓' : isActive ? spinner : '◐';
  const glyphColor = isFailed
    ? 'var(--tt-red)'
    : isSettled
      ? 'var(--tt-green)'
      : isActive
        ? 'var(--tt-cyan)'
        : 'var(--tt-orange)';

  return h.keyed('div')(
    row.caseId,
    [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 12, height: 25 }))],
    [
      h.span([h.AriaHidden(true), h.Style(sx({ color: glyphColor, fontWeight: 700, width: 12 }))], [glyph]),
      h.span(
        [
          h.Style(
            sx({
              color: 'var(--tt-fg-dark)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              width: 280,
            }),
          ),
        ],
        [row.caseId],
      ),
      h.span(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12 }))],
        [`${row.assertionsPassed}/${row.totalAssertions === 0 ? '?' : row.totalAssertions} assert`],
      ),
    ],
  );
};

const barRow = (
  config: Readonly<{ label: string; passed: number; total: number; color: string }>,
  h: HtmlBuilder<Message>,
): Html => {
  const bar = asciiBar(config.passed, config.total, BAR_WIDTH);
  return h.div(
    [],
    [
      h.span(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '15ch' }))],
        [config.label],
      ),
      h.span([h.Style(sx({ color: config.color }))], [bar.fill]),
      h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], [bar.rest]),
      h.span([h.Style(sx({ color: config.color }))], [`${NBSP}${config.passed}/${config.total}`]),
    ],
  );
};

const benchmarkView = (benchmark: Benchmark, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const { total } = benchmark;
  const withPassed = Option.getOrElse(benchmark.maybeWithSkill, () => benchmark.passed);
  const withoutPassed = Option.getOrElse(benchmark.maybeWithoutSkill, () => Math.max(0, total - benchmark.passed));
  const delta = Option.getOrElse(benchmark.maybeDelta, () =>
    total > 0 ? ((withPassed - withoutPassed) / total) * 100 : 0,
  );
  const deltaLabel = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
  const isExitOk = benchmark.exitCode === 0;

  return [
    h.div([h.Style(sx({ background: 'var(--tt-border)', height: 1, margin: '18px 0' }))]),
    h.div(
      [h.Style(sx({ alignItems: 'baseline', display: 'flex', gap: 10, marginBottom: 7 }))],
      [
        h.span([h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 12, fontWeight: 700 }))], ['BENCHMARK']),
        h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12 }))], ['without → with_skill']),
      ],
    ),
    h.div(
      [h.Style(sx({ lineHeight: 2 }))],
      [
        barRow({ label: 'with_skill', passed: withPassed, total, color: 'var(--tt-green)' }, h),
        barRow({ label: 'without_skill', passed: withoutPassed, total, color: 'var(--tt-orange)' }, h),
      ],
    ),
    h.div(
      [h.Style(sx({ margin: '14px 0' }))],
      [
        h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [`delta${NBSP.repeat(3)}`]),
        h.span(
          [
            h.Style(
              sx({ color: delta > 0 ? 'var(--tt-green)' : 'var(--tt-comment)', fontSize: 24, fontWeight: 700 }),
            ),
          ],
          [`Δ ${deltaLabel}`],
        ),
      ],
    ),
    h.div(
      [],
      [
        h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [`exit code${NBSP.repeat(2)}`]),
        h.span(
          [h.Style(sx({ color: isExitOk ? 'var(--tt-green)' : 'var(--tt-red)', fontWeight: 700 }))],
          [String(benchmark.exitCode)],
        ),
        h.span(
          [h.Style(sx({ color: 'var(--tt-dim)' }))],
          [`${NBSP.repeat(2)}${isExitOk ? 'all assertions passed' : '≥1 assertion failed'}`],
        ),
      ],
    ),
    h.div(
      [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, marginTop: 16 }))],
      [
        'wrote ',
        h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], [benchmark.artifactPath]),
        ' · ',
        h.a(
          [h.Href('#'), h.OnClick(Message.ClickedInspectInBrowse(), { defaultAction: 'Prevent' })],
          ['inspect in browse →'],
        ),
      ],
    ),
  ];
};

export const consoleView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const { run } = model;
  const spinner = spinnerGlyph(model.spinnerFrame);
  const seconds = elapsedSec(run);
  const isActive = isRunning(run);

  return h.section(
    [
      h.AriaLabel('Run console localhost'),
      h.Style(
        sx({
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }),
      ),
    ],
    [
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              borderBottom: '1px solid var(--tt-border)',
              color: 'var(--tt-comment)',
              fontSize: 12,
              padding: '7px 14px',
            }),
          ),
        ],
        [
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)', fontWeight: 700 }))], ['console']),
          ': ',
          Option.getOrElse(maybeRunId(run), () => 'no run yet'),
        ],
      ),
      h.div(
        [h.Style(sx({ flex: 1, lineHeight: 1.6, overflow: 'auto', padding: '16px 20px' }))],
        [
          sectionKicker('COMMAND', h),
          commandPreview(model, h),
          ...RunState.match(run, {
            Idle: () => [idleHint(h)],
            Starting: () => [runningLine(spinner, seconds, h)],
            Streaming: () => [runningLine(spinner, seconds, h)],
            Done: ({ benchmark }) => [completeLine(benchmark, seconds, h)],
          }),
          h.div(
            [h.AriaLabel('run progress')],
            Array.map(progressRows(run), (row) => progressLine(row, isActive, spinner, h)),
          ),
          ...RunState.match(run, {
            Idle: () => [],
            Starting: () => [],
            Streaming: () => [],
            Done: ({ benchmark }) => benchmarkView(benchmark, h),
          }),
        ],
      ),
    ],
  );
};
