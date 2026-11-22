import { Array } from 'effect';
import type { Document, Html, HtmlBuilder } from 'foldkit/html';

import type { AppContext } from '@/app/context';
import { envNames, sections, themeNames, type EnvName, type SectionName, type ThemeName } from '@/app/domain';
import { INSTALL_COMMAND } from '@/command';
import { Message } from '@/message';
import { Page, toContext, type Model } from '@/model';
import * as Browse from '@/page/browse';
import * as Create from '@/page/create';
import * as Learn from '@/page/learn';
import * as Review from '@/page/review';
import * as Run from '@/page/run';
import * as Workspace from '@/shell/workspace';
import { sx } from '@/ui/sx';

// HEADER

const themeMeta: Record<ThemeName, { label: string; dot: string }> = {
  tokyonight: { label: 'tn', dot: '#7aa2f7' },
  gruvbox: { label: 'gb', dot: '#fabd2f' },
  nord: { label: 'nord', dot: '#88c0d0' },
};

const envMeta: Record<EnvName, { label: string; dot: string }> = {
  hosted: { label: 'hosted', dot: 'var(--tt-cyan)' },
  localhost: { label: 'localhost', dot: 'var(--tt-green)' },
};

const pillOption = (
  config: Readonly<{ isActive: boolean; testId: string; label: string; dot: string; onClick: Message }>,
  h: HtmlBuilder<Message>,
  extraAttributes: ReadonlyArray<ReturnType<HtmlBuilder<Message>['DataAttribute']>> = [],
): Html =>
  h.button(
    [
      h.AriaChecked(config.isActive),
      h.Class('pill-toggle__option'),
      h.DataAttribute('active', String(config.isActive)),
      h.DataAttribute('testid', config.testId),
      ...extraAttributes,
      h.OnClick(config.onClick),
      h.Role('radio'),
      h.Title(config.label),
      h.Type('button'),
    ],
    [
      h.span([h.Class('pill-toggle__dot'), h.AriaHidden(true), h.Style(sx({ background: config.dot }))]),
      config.label,
    ],
  );

const sectionNav = (active: SectionName, h: HtmlBuilder<Message>): Html =>
  h.nav(
    [h.Class('section-nav'), h.AriaLabel('Sections'), h.DataAttribute('testid', 'section-nav')],
    Array.map(sections, (section) =>
      h.button(
        [
          ...(active === section.name ? [h.AriaCurrent('page')] : []),
          h.Class('section-nav__tab'),
          h.DataAttribute('active', String(active === section.name)),
          h.DataAttribute('testid', `section-nav-tab-${section.name}`),
          h.OnClick(Message.ClickedSection({ section: section.name })),
          h.Type('button'),
        ],
        [section.label],
      ),
    ),
  );

const header = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.header(
    [h.Class('global-header'), h.DataAttribute('testid', 'global-header')],
    [
      h.div(
        [h.Class('brand-lockup')],
        [h.span([h.Class('brand-lockup__glyph'), h.AriaHidden(true)], ['S']), 'arc-skill-eval'],
      ),
      h.span([h.Class('global-header__divider'), h.AriaHidden(true)]),
      sectionNav(model.section, h),
      h.span([h.Class('global-header__spacer')]),
      model.env === 'localhost'
        ? h.submodel({
            slotId: 'workspace',
            model: model.workspace,
            view: Workspace.view,
            toParentMessage: (message) => Message.GotWorkspaceMessage({ message }),
          })
        : h.empty,
      h.div(
        [h.Class('pill-toggle'), h.Role('radiogroup'), h.AriaLabel('Environment')],
        Array.map(envNames, (env) =>
          pillOption(
            {
              isActive: model.env === env,
              testId: `env-option-${env}`,
              label: envMeta[env].label,
              dot: envMeta[env].dot,
              onClick: Message.ClickedEnv({ env }),
            },
            h,
          ),
        ),
      ),
      h.div(
        [h.Class('pill-toggle'), h.Role('radiogroup'), h.AriaLabel('Theme')],
        Array.map(themeNames, (theme) =>
          pillOption(
            {
              isActive: model.theme === theme,
              testId: `theme-option-${theme}`,
              label: themeMeta[theme].label,
              dot: themeMeta[theme].dot,
              onClick: Message.ClickedTheme({ theme }),
            },
            h,
            [h.DataAttribute('theme-option', theme)],
          ),
        ),
      ),
      h.button(
        [
          h.Class('install-chip'),
          h.DataAttribute('testid', 'install-command-chip'),
          h.OnClick(Message.ClickedInstallCommand()),
          h.Title('copy install command'),
          h.Type('button'),
        ],
        [
          h.span([h.Class('install-chip__prompt')], ['$']),
          INSTALL_COMMAND,
          h.span(
            [h.Class('install-chip__status'), h.DataAttribute('copied', String(model.installCopy._tag === 'Copied'))],
            [model.installCopy._tag === 'Copied' ? '✓ copied' : '⧉'],
          ),
        ],
      ),
    ],
  );

// STATUS BAR

type StatusHint = Readonly<{ key: string; label: string }>;

const statusHints: Record<SectionName, ReadonlyArray<StatusHint>> = {
  run: [
    { key: '▶', label: 'run' },
    { key: 'R', label: 'compare' },
    { key: '1-5', label: 'nav' },
  ],
  browse: [
    { key: '↑↓', label: 'select' },
    { key: '[ ]', label: 'mode' },
    { key: 'v', label: 'raw' },
  ],
  create: [
    { key: '↑↓', label: 'case' },
    { key: 'space', label: 'toggle' },
  ],
  review: [
    { key: 'f', label: 'feedback' },
    { key: 'i', label: 'improve' },
  ],
  learn: [
    { key: '1-5', label: 'sections' },
    { key: '↕', label: 'chapters' },
  ],
};

const statusBar = (section: SectionName, h: HtmlBuilder<Message>): Html =>
  h.footer(
    [h.Class('status-bar'), h.DataAttribute('testid', 'status-bar')],
    [
      h.span([h.Class('status-bar__section')], [section]),
      ...Array.map(statusHints[section], (hint) =>
        h.span(
          [],
          [
            h.span([h.Class('status-bar__hint-key')], [hint.key]),
            h.span([h.Class('status-bar__hint-label')], [` ${hint.label}`]),
          ],
        ),
      ),
      h.span([h.Class('status-bar__spacer')]),
      h.span([h.Class('status-bar__model')], ['anthropic/claude-opus-4-5']),
      h.span([h.Class('status-bar__judge')], ['judge ministral-8b-latest']),
      h.button(
        [
          h.Class('status-bar__reset'),
          h.DataAttribute('testid', 'status-reset-hosted-data'),
          h.OnClick(Message.ClickedResetHostedData()),
          h.Type('button'),
        ],
        ['Reset hosted data'],
      ),
    ],
  );

// PAGE

const pageView = (page: Page, context: AppContext, h: HtmlBuilder<Message>): Html =>
  Page.match(page, {
    Run: ({ model }) =>
      h.submodel({
        slotId: 'page-run',
        model,
        viewInputs: context,
        view: Run.view,
        toParentMessage: (message) => Message.GotRunMessage({ message }),
      }),
    Browse: ({ model }) =>
      h.submodel({
        slotId: 'page-browse',
        model,
        viewInputs: context,
        view: Browse.view,
        toParentMessage: (message) => Message.GotBrowseMessage({ message }),
      }),
    Create: ({ model }) =>
      h.submodel({
        slotId: 'page-create',
        model,
        viewInputs: context,
        view: Create.view,
        toParentMessage: (message) => Message.GotCreateMessage({ message }),
      }),
    Review: ({ model }) =>
      h.submodel({
        slotId: 'page-review',
        model,
        viewInputs: context,
        view: Review.view,
        toParentMessage: (message) => Message.GotReviewMessage({ message }),
      }),
    Learn: ({ model }) =>
      h.submodel({
        slotId: 'page-learn',
        model,
        viewInputs: context,
        view: Learn.view,
        toParentMessage: (message) => Message.GotLearnMessage({ message }),
      }),
  });

// VIEW

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'arc-skill-eval',
  body: h.div(
    [h.Class('app-shell'), h.Id('root')],
    [header(model, h), pageView(model.page, toContext(model), h), statusBar(model.section, h)],
  ),
});
