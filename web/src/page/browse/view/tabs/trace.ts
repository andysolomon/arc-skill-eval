import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { kicker } from '@/ui/primitives';
import { sx } from '@/ui/sx';

import {
  artifactRequest,
  attachedSkillNames,
  countEntries,
  externalCallLabels,
  stringList,
  viewArtifact,
} from '../../artifact';
import { traceTurns, type CaseStatus, type TraceTurn } from '../../domain';
import { field, jsonRecord } from '../../json';
import type { Message } from '../../message';
import { MONO_FONT, gridSection, notice, type TabInput } from './shared';

// VIEW

const statusColor: Record<CaseStatus, string> = {
  fail: 'var(--tt-red)',
  partial: 'var(--tt-yellow)',
  pass: 'var(--tt-green)',
  timeout: 'var(--tt-orange)',
};

const turnCard = (turn: TraceTurn, index: number, h: HtmlBuilder<Message>): Html =>
  h.keyed('article')(
    turn.id,
    [
      h.Style(
        sx({
          background: 'var(--tt-bg)',
          border: '1px solid var(--tt-border)',
          display: 'grid',
          gap: 8,
          padding: 12,
        }),
      ),
    ],
    [
      h.header(
        [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 10 }))],
        [
          h.span([h.Style(sx({ color: 'var(--tt-comment)', fontFamily: MONO_FONT, fontSize: 12 }))], [`turn ${index + 1}`]),
          h.strong([h.Style(sx({ color: statusColor[turn.status], fontSize: 14 }))], [turn.label]),
        ],
      ),
      h.p([h.Style(sx({ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }))], [turn.summary]),
    ],
  );

const hostedTrace = (input: TabInput, h: HtmlBuilder<Message>): Html =>
  gridSection(
    12,
    [
      kicker({ section: input.context.section, content: 'trace' }, h),
      h.div(
        [h.Style(sx({ display: 'grid', gap: 10 }))],
        Array.map(traceTurns(input.testCase), (turn, index) => turnCard(turn, index, h)),
      ),
    ],
    h,
  );

const card = (title: string, input: TabInput, body: ReadonlyArray<Html>, h: HtmlBuilder<Message>): Html =>
  h.article(
    [h.Style(sx({ background: 'var(--tt-bg)', border: '1px solid var(--tt-border)', padding: 12 }))],
    [kicker({ section: input.context.section, content: title }, h), ...body],
  );

const cardLine = (content: string, h: HtmlBuilder<Message>): Html =>
  h.p([h.Style(sx({ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: '8px 0 0' }))], [content]);

const joinedOrNone = (items: ReadonlyArray<string>): string => (Array.isReadonlyArrayEmpty(items) ? 'none' : items.join(', '));

const localTrace = (input: TabInput, h: HtmlBuilder<Message>): Html => {
  const { run, testCase, variant } = input;
  const toolSummaryArtifact = viewArtifact(input.artifacts, artifactRequest(run, testCase, variant, 'tool-summary.json'));
  const contextManifestArtifact = viewArtifact(
    input.artifacts,
    artifactRequest(run, testCase, variant, 'context-manifest.json'),
  );
  const toolSummary = Option.flatMap(toolSummaryArtifact.maybeJson, jsonRecord);
  const contextManifest = Option.flatMap(contextManifestArtifact.maybeJson, jsonRecord);
  const toolCalls = countEntries(field(toolSummary, 'tool_calls_by_name'));
  const skillReads = Array.map(countEntries(field(toolSummary, 'skill_reads_by_name')), ([name, count]) => `${name} x${count}`);
  const attachedSkills = attachedSkillNames(field(contextManifest, 'attached_skills'));
  const touched = [
    ...externalCallLabels(field(toolSummary, 'external_calls')),
    ...stringList(field(toolSummary, 'written_files')),
    ...stringList(field(toolSummary, 'edited_files')),
  ];

  return gridSection(
    12,
    Option.match(toolSummaryArtifact.maybeError, {
      onSome: (error) => [kicker({ section: input.context.section, content: `trace / ${variant}` }, h), notice(error, h)],
      onNone: () => [
        kicker({ section: input.context.section, content: `trace / ${variant}` }, h),
        card(
          'tool calls',
          input,
          Array.map(
            Array.isReadonlyArrayEmpty(toolCalls) ? [['none', 0] as const] : toolCalls,
            ([name, count]) =>
              h.keyed('p')(name, [h.Style(sx({ color: 'var(--tt-fg-dark)', margin: '8px 0 0' }))], [`${name} x${count}`]),
          ),
          h,
        ),
        card('skill reads', input, [cardLine(joinedOrNone([...skillReads, ...attachedSkills]), h)], h),
        card('external calls and files', input, [cardLine(joinedOrNone(touched), h)], h),
      ],
    }),
    h,
  );
};

export const traceTab = (input: TabInput, h: HtmlBuilder<Message>): Html =>
  input.context.env === 'hosted' ? hostedTrace(input, h) : localTrace(input, h);
