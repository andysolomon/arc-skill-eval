import { Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { kicker } from '@/ui/primitives';
import { sx } from '@/ui/sx';

import { artifactRequest, viewArtifact } from '../../artifact';
import { fallbackRawJson } from '../../domain';
import type { Message } from '../../message';
import { MONO_FONT, gridSection, type TabInput } from './shared';

// VIEW

const rawText = (input: TabInput): string => {
  const { run, testCase, variant } = input;
  const fallback = fallbackRawJson(run, testCase, variant);
  if (input.context.env === 'hosted') {
    return fallback;
  }
  const grading = viewArtifact(input.artifacts, artifactRequest(run, testCase, variant, 'grading.json'));
  return Option.getOrElse(grading.maybeError, () => (grading.text === '' ? fallback : grading.text));
};

export const rawTab = (input: TabInput, h: HtmlBuilder<Message>): Html =>
  gridSection(
    10,
    [
      kicker({ section: input.context.section, content: 'raw json / grading.json' }, h),
      h.pre(
        [
          h.AriaLabel('raw artifact json'),
          h.Style(
            sx({
              background: 'var(--tt-bg)',
              border: '1px solid var(--tt-border)',
              color: 'var(--tt-fg)',
              fontFamily: MONO_FONT,
              fontSize: 12,
              lineHeight: 1.5,
              margin: 0,
              maxHeight: 560,
              overflow: 'auto',
              padding: 14,
              whiteSpace: 'pre-wrap',
            }),
          ),
        ],
        [rawText(input)],
      ),
    ],
    h,
  );
