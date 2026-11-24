import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { kicker } from '@/ui/primitives';
import { sx } from '@/ui/sx';

import { artifactRequest, viewArtifact } from '../../artifact';
import { responseText } from '../../domain';
import type { Message } from '../../message';
import { gridSection, notice, type TabInput } from './shared';

// VIEW

const markdownLine = (line: string, h: HtmlBuilder<Message>): Html => {
  if (line.startsWith('### ')) {
    return h.h4([h.Style(sx({ fontSize: 15, margin: '10px 0 4px' }))], [line.slice(4)]);
  }
  if (line.startsWith('## ')) {
    return h.h3([h.Style(sx({ fontSize: 17, margin: '12px 0 6px' }))], [line.slice(3)]);
  }
  if (line.startsWith('# ')) {
    return h.h2([h.Style(sx({ fontSize: 19, margin: '12px 0 6px' }))], [line.slice(2)]);
  }
  if (line.startsWith('- ')) {
    return h.p([h.Style(sx({ margin: '4px 0 4px 14px' }))], [line]);
  }
  return h.p([h.Style(sx({ margin: line === '' ? '8px 0' : '0 0 8px' }))], [line === '' ? ' ' : line]);
};

export const responseTab = (input: TabInput, h: HtmlBuilder<Message>): Html => {
  const { run, testCase, variant } = input;
  const assistant =
    input.context.env === 'hosted'
      ? { text: '', maybeError: Option.none<string>() }
      : viewArtifact(input.artifacts, artifactRequest(run, testCase, variant, 'assistant.md'));
  const text = assistant.text === '' ? responseText(testCase) : assistant.text;

  return gridSection(
    10,
    [
      kicker({ section: input.context.section, content: `assistant.md / ${variant}` }, h),
      text.trim().length > 0 && Option.isNone(assistant.maybeError)
        ? h.article(
            [
              h.Style(
                sx({
                  background: 'var(--tt-bg)',
                  border: '1px solid var(--tt-border)',
                  color: 'var(--tt-fg)',
                  lineHeight: 1.6,
                  maxHeight: 520,
                  overflow: 'auto',
                  padding: 14,
                }),
              ),
            ],
            Array.map(text.split('\n'), (line) => markdownLine(line, h)),
          )
        : notice(
            Option.getOrElse(assistant.maybeError, () => 'No assistant response was recorded for this variant.'),
            h,
          ),
    ],
    h,
  );
};
