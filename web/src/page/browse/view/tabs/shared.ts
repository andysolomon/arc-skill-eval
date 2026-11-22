import type { Html, HtmlBuilder } from 'foldkit/html';

import type { AppContext } from '@/app/context';
import { sx, type StyleInput } from '@/ui/sx';

import type { ArtifactEntry } from '../../artifact';
import type { Case, Run, Variant } from '../../domain';
import type { Message } from '../../message';

/** What every detail tab reads. Hosted tabs read the case; localhost tabs read `artifacts`. */
export type TabInput = Readonly<{
  context: AppContext;
  run: Run;
  testCase: Case;
  variant: Variant;
  artifacts: ReadonlyArray<ArtifactEntry>;
}>;

export const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const gridSection = (gap: number, children: ReadonlyArray<Html>, h: HtmlBuilder<Message>): Html =>
  h.section([h.Style(sx({ display: 'grid', gap, minWidth: 0 }))], children);

/** Dashed box for "nothing to show" and daemon errors. */
export const notice = (content: string, h: HtmlBuilder<Message>, extra?: StyleInput): Html =>
  h.p(
    [
      h.Style(
        sx(
          {
            border: '1px dashed var(--tt-border-active)',
            color: 'var(--tt-comment)',
            margin: 0,
            padding: 12,
          },
          extra,
        ),
      ),
    ],
    [content],
  );
