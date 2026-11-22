import { Array } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import { tabs, variants, type Tab, type Variant } from '../domain';
import { Message } from '../message';
import { diffTab } from './tabs/diff';
import { overviewTab } from './tabs/overview';
import { rawTab } from './tabs/raw';
import { responseTab } from './tabs/response';
import type { TabInput } from './tabs/shared';
import { traceTab } from './tabs/trace';

// VIEW

const variantButton = (variant: Variant, active: Variant, h: HtmlBuilder<Message>): Html => {
  const isActive = variant === active;
  return h.keyed('button')(
    variant,
    [
      h.DataAttribute('active', String(isActive)),
      h.OnClick(Message.SelectedVariant({ variant })),
      h.Type('button'),
      h.Style(
        sx({
          background: isActive ? 'var(--tt-selection)' : 'transparent',
          border: 0,
          borderRadius: 5,
          color: isActive ? (variant === 'with_skill' ? 'var(--tt-green)' : 'var(--tt-orange)') : 'var(--tt-comment)',
          cursor: 'pointer',
          fontSize: 11,
          padding: '3px 8px',
        }),
      ),
    ],
    [variant],
  );
};

const tabButton = (tab: Readonly<{ id: Tab; label: string }>, active: Tab, h: HtmlBuilder<Message>): Html => {
  const isActive = tab.id === active;
  return h.keyed('button')(
    tab.id,
    [
      ...(isActive ? [h.AriaCurrent('page')] : []),
      h.DataAttribute('active', String(isActive)),
      h.OnClick(Message.SelectedTab({ tab: tab.id })),
      h.Type('button'),
      h.Style(
        sx({
          background: 'transparent',
          border: 0,
          color: isActive ? 'var(--tt-blue)' : 'var(--tt-comment)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: isActive ? 700 : 400,
          padding: 0,
        }),
      ),
    ],
    [tab.label],
  );
};

const tabViews: Record<Tab, (input: TabInput, h: HtmlBuilder<Message>) => Html> = {
  overview: overviewTab,
  response: responseTab,
  diff: diffTab,
  trace: traceTab,
  raw: rawTab,
};

/** The selected case: header with variant switch (compare runs) and tabs, then the open tab. */
export const detail = (input: TabInput, tab: Tab, h: HtmlBuilder<Message>): Html =>
  h.section(
    [
      h.AriaLabel('Selected case details'),
      h.Style(
        sx({
          border: '1px solid var(--tt-border-active)',
          borderRadius: 8,
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
        }),
      ),
    ],
    [
      h.header(
        [
          h.Style(
            sx({
              alignItems: 'center',
              background: 'var(--tt-bg-dark)',
              borderBottom: '1px solid var(--tt-border)',
              display: 'flex',
              gap: 12,
              padding: '7px 16px',
            }),
          ),
        ],
        [
          h.h1(
            [
              h.Style(
                sx({
                  color: 'var(--tt-fg)',
                  fontSize: 14,
                  fontWeight: 700,
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }),
              ),
            ],
            [input.testCase.id],
          ),
          input.run.compare
            ? h.div(
                [h.AriaLabel('variant switch'), h.Style(sx({ display: 'inline-flex', gap: 4 }))],
                Array.map(variants, (variant) => variantButton(variant, input.variant, h)),
              )
            : h.empty,
          h.span([h.Style(sx({ flex: 1 }))]),
          h.nav(
            [h.AriaLabel('Case detail tabs'), h.Style(sx({ display: 'flex', gap: 14 }))],
            Array.map(tabs, (candidate) => tabButton(candidate, tab, h)),
          ),
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              flex: 1,
              lineHeight: 1.55,
              minHeight: 0,
              minWidth: 0,
              overflow: 'auto',
              padding: '16px 20px',
            }),
          ),
        ],
        [tabViews[tab](input, h)],
      ),
    ],
  );
