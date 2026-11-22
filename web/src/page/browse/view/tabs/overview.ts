import { Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { kicker } from '@/ui/primitives';
import { sx } from '@/ui/sx';

import { artifactRequest, readGradingEvidence, readGradingSummary, readTimingMetrics, viewArtifact } from '../../artifact';
import { deltaTag, expectedText, type DeltaTag } from '../../domain';
import type { Message } from '../../message';
import { MONO_FONT, type TabInput } from './shared';

// VIEW

const statusColor: Record<DeltaTag, string> = {
  FAIL: 'var(--tt-red)',
  PASS: 'var(--tt-green)',
  TIMEOUT: 'var(--tt-orange)',
};

const usdFormat = new Intl.NumberFormat('en-US', { currency: 'USD', maximumFractionDigits: 5, style: 'currency' });

const formatMs = (value: number): string => `${Math.round(value)}ms`;

const kpiTile = (label: string, value: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Style(
        sx({
          background: 'var(--tt-bg)',
          border: '1px solid var(--tt-border)',
          display: 'grid',
          gap: 6,
          minWidth: 0,
          padding: 12,
        }),
      ),
    ],
    [
      h.span(
        [h.Style(sx({ color: 'var(--tt-comment)', fontFamily: MONO_FONT, fontSize: 11, textTransform: 'uppercase' }))],
        [label],
      ),
      h.strong([h.Style(sx({ color: 'var(--tt-fg)', fontSize: 18, lineHeight: 1.1 }))], [value]),
    ],
  );

const textBlock = (input: TabInput, title: string, content: string, color: string, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Style(sx({ display: 'grid', gap: 8, minWidth: 0 }))],
    [
      kicker({ section: input.context.section, content: title }, h),
      h.p([h.Style(sx({ color, lineHeight: 1.55, margin: 0 }))], [content]),
    ],
  );

export const overviewTab = (input: TabInput, h: HtmlBuilder<Message>): Html => {
  const { run, testCase, variant } = input;
  const isHosted = input.context.env === 'hosted';
  const grading = viewArtifact(input.artifacts, artifactRequest(run, testCase, variant, 'grading.json'));
  const timing = viewArtifact(input.artifacts, artifactRequest(run, testCase, variant, 'timing.json'));
  const fallbackEvidence = Option.getOrElse(
    testCase.maybeFailureEvidence,
    () => 'Assertions passed with concrete evidence in grading.json.',
  );
  const tag = isHosted ? deltaTag(testCase.status) : readGradingSummary(grading.maybeJson, testCase);
  const metrics = isHosted ? testCase.metrics : readTimingMetrics(timing.maybeJson, testCase.metrics);
  const evidence = isHosted ? fallbackEvidence : readGradingEvidence(grading.maybeJson, fallbackEvidence);

  return h.div(
    [h.Style(sx({ display: 'grid', gap: 14, minWidth: 0 }))],
    [
      h.header(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg)',
              border: '1px solid var(--tt-border)',
              display: 'grid',
              gap: 10,
              padding: 14,
            }),
          ),
        ],
        [
          kicker({ section: input.context.section, content: 'grading' }, h),
          h.div(
            [h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }))],
            [
              h.strong([h.Style(sx({ color: statusColor[tag], fontSize: 22, lineHeight: 1 }))], [tag]),
              h.span(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 13 }))],
                [`${run.skill} / ${variant} / ${testCase.id}`],
              ),
            ],
          ),
          h.p(
            [h.Style(sx({ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }))],
            [Option.getOrElse(grading.maybeError, () => evidence)],
          ),
        ],
      ),
      h.div(
        [
          h.AriaLabel('browse overview kpis'),
          h.Style(
            sx({
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(4, minmax(116px, 1fr))',
              minWidth: 0,
            }),
          ),
        ],
        [
          kpiTile('tokens', metrics.tokens.toLocaleString(), h),
          kpiTile('cost', usdFormat.format(metrics.costUsd), h),
          kpiTile('latency', formatMs(metrics.latencyMs), h),
          kpiTile('ms/case', formatMs(metrics.msPerCase), h),
        ],
      ),
      textBlock(input, 'prompt', testCase.prompt, 'var(--tt-fg)', h),
      textBlock(input, 'expected', expectedText(testCase), 'var(--tt-fg-dark)', h),
      run.compare
        ? textBlock(
            input,
            'compare',
            `Benchmark difference: ${Option.getOrElse(run.maybeBenchmarkDelta, () => 0)}. Select a variant above to inspect its results.`,
            'var(--tt-fg-dark)',
            h,
          )
        : h.empty,
    ],
  );
};
