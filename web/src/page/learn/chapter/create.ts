import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx, type StyleInput } from '@/ui/sx';

import {
  createCommandFrame,
  createCommandSpinner,
  createScaffoldFrame,
  createScaffoldSpinner,
  playbackLabel,
} from '../animation';
import { Message } from '../message';
import type { CreateDemo } from '../model';
import { callout, chapterHeader, fadeStyle, pageStyle, sectionKicker, trafficDots } from './ui';

const pathChips = [
  { color: 'var(--tt-yellow)', label: 'behaviors' },
  { color: 'var(--tt-blue)', label: 'prompts' },
  { color: 'var(--tt-cyan)', label: 'assertions' },
  { color: 'var(--tt-green)', label: 'run --compare' },
  { color: 'var(--tt-magenta)', label: 'delta' },
];

const behaviorRows = [
  {
    text: 'configures semantic-release with the conventional preset',
    dim: 'outcome',
    color: 'var(--tt-green)',
  },
  { text: 'reads the skill before acting', dim: 'process', color: 'var(--tt-blue)' },
  { text: 'summarizes the plugins it installed', dim: 'style', color: 'var(--tt-magenta)' },
  {
    text: 'writes no release config for a docs-only change',
    dim: 'outcome',
    color: 'var(--tt-green)',
  },
];

const flavorCards = [
  {
    color: 'var(--tt-green)',
    label: 'explicit',
    prompt: '"Use arc-conventional-commits to set up semantic-release."',
  },
  {
    color: 'var(--tt-blue)',
    label: 'implicit',
    prompt: '"Set up automated releases driven by commit messages."',
  },
  {
    color: 'var(--tt-cyan)',
    label: 'contextual',
    prompt: '"We keep shipping wrong version bumps. Fix our release flow."',
  },
  {
    color: 'var(--tt-orange)',
    label: 'adjacent-negative',
    prompt: '"This PR only edits README.md. do I need a release?"',
  },
];

const pitfalls = [
  { title: 'fabricated files', desc: 'a file-exists on output the skill never produces' },
  { title: 'wording asserts', desc: 'failing a correct answer for paraphrasing' },
  { title: 'no negative case', desc: 'never testing where the skill should stay silent' },
  { title: 'judge overload', desc: 'using a judge where a regex would settle it' },
];

const codeColors = {
  kw: 'var(--tt-magenta)',
  fn: 'var(--tt-cyan)',
  str: 'var(--tt-green)',
  key: 'var(--tt-yellow)',
  punc: 'var(--tt-comment)',
  plain: 'var(--tt-fg-dark)',
};

const { kw, fn, str, key, punc, plain } = codeColors;

type CodeToken = Readonly<[text: string, color: string]>;
type CodeRow = Readonly<{ indent?: number; toks: ReadonlyArray<CodeToken> }>;

// The same arc-conventional-commits suite as the JSON above, authored with the
// typed builder. Kept faithful to the real arc-skill-eval/evals API.
const builderLines: ReadonlyArray<CodeRow> = [
  {
    toks: [
      ['import ', kw],
      ['{', punc],
    ],
  },
  { indent: 2, toks: [['defineSkillEval, evalCase, seeded, fileExists, regexMatch, judge,', plain]] },
  {
    toks: [
      ['} ', punc],
      ['from ', kw],
      ['"arc-skill-eval/evals"', str],
      [';', punc],
    ],
  },
  { toks: [[' ', punc]] },
  {
    toks: [
      ['export default ', kw],
      ['defineSkillEval', fn],
      ['({', punc],
    ],
  },
  {
    indent: 2,
    toks: [
      ['skill_name', key],
      [': ', punc],
      ['"arc-conventional-commits"', str],
      [',', punc],
    ],
  },
  {
    indent: 2,
    toks: [
      ['cases', key],
      [': [', punc],
    ],
  },
  {
    indent: 4,
    toks: [
      ['evalCase', fn],
      ['({', punc],
    ],
  },
  {
    indent: 6,
    toks: [
      ['id', key],
      [': ', punc],
      ['"trigger-explicit"', str],
      [',', punc],
    ],
  },
  {
    indent: 6,
    toks: [
      ['prompt', key],
      [': ', punc],
      ['"Set up semantic-release in this repo."', str],
      [',', punc],
    ],
  },
  {
    indent: 6,
    toks: [
      ['setup', key],
      [': ', punc],
      ['seeded', fn],
      ['({ ', punc],
      ['from', key],
      [': ', punc],
      ['"files/clean-repo"', str],
      [' }),', punc],
    ],
  },
  {
    indent: 6,
    toks: [
      ['assertions', key],
      [': [', punc],
    ],
  },
  {
    indent: 8,
    toks: [
      ['fileExists', fn],
      ['(', punc],
      ['".releaserc.json"', str],
      ['),', punc],
    ],
  },
  {
    indent: 8,
    toks: [
      ['regexMatch', fn],
      ['(', punc],
      ['"conventionalcommits"', str],
      ['),', punc],
    ],
  },
  {
    indent: 8,
    toks: [
      ['judge', fn],
      ['(', punc],
      ['"Summarizes the plugins it installed."', str],
      [').', punc],
      ['soft', fn],
      ['(),', punc],
    ],
  },
  { indent: 6, toks: [['],', punc]] },
  { indent: 4, toks: [['}),', punc]] },
  { indent: 2, toks: [['],', punc]] },
  { toks: [['});', punc]] },
];

const codeCardStyle: StyleInput = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.85,
  overflowX: 'auto',
  padding: '14px 16px',
};

const stepBadge = ({ num }: Readonly<{ num: string }>, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Style(
        sx({
          alignItems: 'center',
          border: '1px solid var(--tt-border-active)',
          borderRadius: 8,
          color: 'var(--tt-blue)',
          display: 'flex',
          flex: 'none',
          fontSize: 13,
          fontWeight: 700,
          height: 34,
          justifyContent: 'center',
          width: 34,
        }),
      ),
    ],
    [num],
  );

const stepCardStyle: StyleInput = {
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  flex: 1,
  minWidth: 0,
  padding: '14px 16px',
};

const stepTitleStyle: StyleInput = {
  color: 'var(--tt-fg)',
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 5,
};

const stepIntroStyle: StyleInput = {
  color: 'var(--tt-comment)',
  fontSize: 12.5,
  lineHeight: 1.6,
  marginBottom: 12,
};

export const view = (demo: CreateDemo, h: HtmlBuilder<Message>): Html => {
  const commandFrame = createCommandFrame(demo);
  const commandSpinner = createCommandSpinner(demo);
  const scaffoldFrame = createScaffoldFrame(demo);
  const scaffoldSpinner = createScaffoldSpinner(demo);
  const controlLabel = playbackLabel(demo.playback);

  return h.div(
    [h.Style(sx(pageStyle))],
    [
      chapterHeader({ num: '03', title: 'Creating an eval' }, h),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 24, maxWidth: 820 }))],
        [
          "start with a handful of prompts that pin the behaviors you care about you care about, each with a few checks. here's the whole path, worked through on a real skill: ",
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['arc-conventional-commits']),
          '.',
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 28,
            }),
          ),
        ],
        [
          ...pathChips.map((chip, index) =>
            h.div(
              [h.Style(sx({ display: 'contents' }))],
              [
                index > 0 ? h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['→']) : h.empty,
                h.span(
                  [
                    h.Style(
                      sx({
                        border: '1px solid var(--tt-border)',
                        borderRadius: 6,
                        color: chip.color,
                        fontSize: 12,
                        padding: '6px 11px',
                      }),
                    ),
                  ],
                  [chip.label],
                ),
              ],
            ),
          ),
        ],
      ),
      sectionKicker({ style: { marginBottom: 10 } }, ['watch a run'], h),
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              marginBottom: 30,
              overflow: 'hidden',
            }),
          ),
        ],
        [
          h.div(
            [
              h.Style(
                sx({
                  alignItems: 'center',
                  borderBottom: '1px solid var(--tt-border)',
                  display: 'flex',
                  gap: 6,
                  padding: '7px 12px',
                }),
              ),
            ],
            [
              ...trafficDots(h),
              h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11, marginLeft: 8 }))], ['arc-skill-eval']),
              h.span([h.Style(sx({ flex: 1 }))]),
              h.span(
                [
                  h.OnClick(Message.ClickedCreateDemoPlayback()),
                  h.Style(sx({ color: 'var(--tt-comment)', cursor: 'pointer', fontSize: 11 })),
                ],
                [controlLabel],
              ),
              h.span(
                [
                  h.OnClick(Message.ClickedCreateDemoReplay()),
                  h.Style(sx({ color: 'var(--tt-comment)', cursor: 'pointer', fontSize: 11 })),
                ],
                ['↻ replay'],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ fontSize: 12.5, lineHeight: 1.9, minHeight: 300, padding: '14px 16px' }))],
            [
              h.div(
                [h.Style(sx(fadeStyle(commandFrame.cmd)))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-fg)' }))],
                    ['arc-skill-eval create ./skills/arc-conventional-commits --compare'],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx(fadeStyle(commandFrame.read)))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' read SKILL.md · name + description ok']),
                ],
              ),
              h.div(
                [h.Style(sx(fadeStyle(commandFrame.prop)))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], ['•']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [" proposing cases from the skill's promise…"]),
                ],
              ),
              h.div(
                [h.Style(sx({ ...fadeStyle(commandFrame.c1), paddingLeft: '2ch' }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['trigger-explicit']),
                ],
              ),
              h.div(
                [h.Style(sx({ ...fadeStyle(commandFrame.c2), paddingLeft: '2ch' }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['execution-golden-path']),
                ],
              ),
              h.div(
                [h.Style(sx({ ...fadeStyle(commandFrame.c3), paddingLeft: '2ch' }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['adjacent-negative']),
                ],
              ),
              h.div(
                [h.Style(sx({ ...fadeStyle(commandFrame.runh), marginTop: 6 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-blue)' }))], ['▶ ']),
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-fg-dark)' }))],
                    ['run --compare · with_skill vs without_skill'],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ height: 26, marginTop: 2, position: 'relative' }))],
                [
                  h.div(
                    [h.Style(sx({ ...fadeStyle(commandFrame.running, 0.2), inset: 0, position: 'absolute' }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], [commandSpinner]),
                      h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' grading with_skill · without_skill…']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ ...fadeStyle(commandFrame.done), inset: 0, position: 'absolute' }))],
                    [
                      h.span(
                        [h.Style(sx({ color: 'var(--tt-green)', fontWeight: 700 }))],
                        ['✓ 3 cases · 6/6 assertions passed'],
                      ),
                    ],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx(fadeStyle(commandFrame.bar1)))],
                [
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '14ch' }))],
                    ['with_skill'],
                  ),
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['▓▓▓▓▓▓▓▓▓▓▓▓▓▓']),
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], [' 6/6']),
                ],
              ),
              h.div(
                [h.Style(sx(fadeStyle(commandFrame.bar2)))],
                [
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '14ch' }))],
                    ['without_skill'],
                  ),
                  h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], ['▓▓▓▓▓▓▓▓▓▓▓▓']),
                  h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['░░']),
                  h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], [' 5/6']),
                ],
              ),
              h.div(
                [h.Style(sx({ ...fadeStyle(commandFrame.delta, 0.45), marginTop: 6 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['delta  ']),
                  h.span([h.Style(sx({ color: 'var(--tt-green)', fontSize: 16, fontWeight: 700 }))], ['Δ +16.7%']),
                ],
              ),
              h.div(
                [h.Style(sx(fadeStyle(commandFrame.wrote)))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['wrote ']),
                  h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['evals-runs/run-7af3/']),
                ],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', gap: 16, marginBottom: 16 }))],
        [
          stepBadge({ num: '01' }, h),
          h.div(
            [h.Style(sx(stepCardStyle))],
            [
              h.div([h.Style(sx(stepTitleStyle))], ['List the behaviors that matter']),
              h.div(
                [h.Style(sx(stepIntroStyle))],
                [
                  "start from the skill's promise. write the must-pass behaviors as a checklist, and tag each with the dimension it lives in.",
                ],
              ),
              ...behaviorRows.map((row) =>
                h.div(
                  [
                    h.Style(
                      sx({
                        alignItems: 'center',
                        display: 'flex',
                        fontSize: 12.5,
                        gap: 9,
                        padding: '4px 0',
                      }),
                    ),
                  ],
                  [
                    h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓']),
                    h.span([h.Style(sx({ color: 'var(--tt-fg-dark)', flex: 1 }))], [row.text]),
                    h.span(
                      [
                        h.Style(
                          sx({
                            background: `color-mix(in srgb, ${row.color} 16%, var(--tt-bg))`,
                            borderRadius: 4,
                            color: row.color,
                            fontSize: 11,
                            padding: '2px 8px',
                          }),
                        ),
                      ],
                      [row.dim],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', gap: 16, marginBottom: 16 }))],
        [
          stepBadge({ num: '02' }, h),
          h.div(
            [h.Style(sx(stepCardStyle))],
            [
              h.div([h.Style(sx(stepTitleStyle))], ['Turn behaviors into prompts']),
              h.div(
                [h.Style(sx(stepIntroStyle))],
                ['for each behavior write a realistic prompt. cover the trigger boundary with four flavors.'],
              ),
              h.div(
                [h.Style(sx({ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, 1fr)' }))],
                [
                  ...flavorCards.map((card) =>
                    h.div(
                      [
                        h.Style(
                          sx({
                            background: 'var(--tt-bg-dark)',
                            borderLeft: `2px solid ${card.color}`,
                            borderRadius: 6,
                            padding: '9px 12px',
                          }),
                        ),
                      ],
                      [
                        h.div(
                          [h.Style(sx({ color: card.color, fontSize: 11, fontWeight: 700, marginBottom: 3 }))],
                          [card.label],
                        ),
                        h.div(
                          [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12, lineHeight: 1.5 }))],
                          [card.prompt],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', gap: 16, marginBottom: 16 }))],
        [
          stepBadge({ num: '03' }, h),
          h.div(
            [h.Style(sx(stepCardStyle))],
            [
              h.div([h.Style(sx(stepTitleStyle))], ['Attach deterministic assertions first']),
              h.div(
                [h.Style(sx(stepIntroStyle))],
                [
                  "give each case a few checks. reach for deterministic checks first; add a judge only for what scripts can't see.",
                ],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      background: 'var(--tt-bg-dark)',
                      border: '1px solid var(--tt-border)',
                      borderRadius: 8,
                      fontSize: 12.5,
                      lineHeight: 1.95,
                      padding: '13px 15px',
                    }),
                  ),
                ],
                [
                  h.div([], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['{'])]),
                  h.div(
                    [h.Style(sx({ paddingLeft: '2ch' }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"prompt"']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
                      h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['"Set up semantic-release in this repo."']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ paddingLeft: '2ch' }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"assertions"']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': [']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ display: 'flex', gap: 12, paddingLeft: '4ch' }))],
                    [
                      h.span(
                        [h.Style(sx({ flex: 1, minWidth: 0 }))],
                        [
                          h.span(
                            [h.Style(sx({ color: 'var(--tt-cyan)' }))],
                            ['{ "type": "file-exists", "path": ".releaserc.json" }'],
                          ),
                          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
                        ],
                      ),
                      h.span([h.Style(sx({ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }))], ['← deterministic']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ display: 'flex', gap: 12, paddingLeft: '4ch' }))],
                    [
                      h.span(
                        [h.Style(sx({ flex: 1, minWidth: 0 }))],
                        [
                          h.span(
                            [h.Style(sx({ color: 'var(--tt-cyan)' }))],
                            ['{ "type": "regex-match", "pattern": "conventionalcommits" }'],
                          ),
                          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
                        ],
                      ),
                      h.span([h.Style(sx({ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }))], ['← deterministic']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ display: 'flex', gap: 12, paddingLeft: '4ch' }))],
                    [
                      h.span(
                        [h.Style(sx({ flex: 1, minWidth: 0 }))],
                        [
                          h.span(
                            [h.Style(sx({ color: 'var(--tt-magenta)' }))],
                            ['"Summarizes the plugins it installed."'],
                          ),
                        ],
                      ),
                      h.span([h.Style(sx({ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }))], ['← llm-judge']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ paddingLeft: '2ch' }))],
                    [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [']'])],
                  ),
                  h.div([], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['}'])]),
                ],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', gap: 16, marginBottom: 16 }))],
        [
          stepBadge({ num: '04' }, h),
          h.div(
            [h.Style(sx(stepCardStyle))],
            [
              h.div([h.Style(sx(stepTitleStyle))], ['Run both variants']),
              h.div(
                [h.Style(sx(stepIntroStyle))],
                [
                  'the ',
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['--compare']),
                  ' flag runs each case with the skill and again without it.',
                ],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      background: 'var(--tt-bg-dark)',
                      border: '1px solid var(--tt-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      padding: '12px 15px',
                    }),
                  ),
                ],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-fg)' }))],
                    ['arc-skill-eval run ./skills/arc-conventional-commits --compare'],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginTop: 8 }))],
                [
                  'without ',
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['--compare']),
                  ' you get a single score. with it, you get the pass-rate difference the skill makes signal.',
                ],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', gap: 16, marginBottom: 28 }))],
        [
          stepBadge({ num: '05' }, h),
          h.div(
            [h.Style(sx(stepCardStyle))],
            [
              h.div([h.Style(sx(stepTitleStyle))], ['Read the delta, then grow the suite']),
              h.div(
                [h.Style(sx(stepIntroStyle))],
                ['a positive delta is your evidence. every failure you fix by hand becomes the next case.'],
              ),
              h.div(
                [h.Style(sx({ fontSize: 13, lineHeight: 2 }))],
                [
                  h.div(
                    [],
                    [
                      h.span(
                        [h.Style(sx({ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '14ch' }))],
                        ['with_skill'],
                      ),
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['▓▓▓▓▓▓▓▓▓▓▓▓▓▓']),
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], [' 6/6']),
                    ],
                  ),
                  h.div(
                    [],
                    [
                      h.span(
                        [h.Style(sx({ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '14ch' }))],
                        ['without_skill'],
                      ),
                      h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], ['▓▓▓▓▓▓▓▓▓▓▓▓']),
                      h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['░░']),
                      h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], [' 5/6']),
                    ],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ marginTop: 10 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['delta  ']),
                  h.span([h.Style(sx({ color: 'var(--tt-green)', fontSize: 18, fontWeight: 700 }))], ['Δ +16.7%']),
                ],
              ),
            ],
          ),
        ],
      ),
      sectionKicker({ style: { marginBottom: 10 } }, ['Interactive authoring'], h),
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              marginBottom: 8,
              overflow: 'hidden',
            }),
          ),
        ],
        [
          h.div(
            [
              h.Style(
                sx({
                  alignItems: 'center',
                  borderBottom: '1px solid var(--tt-border)',
                  display: 'flex',
                  gap: 6,
                  padding: '7px 12px',
                }),
              ),
            ],
            [
              ...trafficDots(h),
              h.span(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11, marginLeft: 8 }))],
                ['arc-skill-eval create --interactive'],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ fontSize: 12, lineHeight: 1.85, padding: '14px 16px' }))],
            [
              h.div(
                [],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-fg)' }))],
                    ['arc-skill-eval create ./skills/arc-conventional-commits --interactive'],
                  ),
                ],
              ),
              h.div(
                [],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' read SKILL.md · proposing 3 cases…']),
                ],
              ),
              h.div([h.Style(sx({ height: 8 }))]),
              h.div(
                [
                  h.Style(
                    sx({
                      background: 'var(--tt-bg)',
                      border: '1px solid var(--tt-border)',
                      borderRadius: 6,
                      padding: '10px 12px',
                    }),
                  ),
                ],
                [
                  h.div(
                    [],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['case 2/3  ']),
                      h.span([h.Style(sx({ color: 'var(--tt-yellow)', fontWeight: 700 }))], ['execution-golden-path']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ paddingLeft: '2ch' }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['prompt  ']),
                      h.span(
                        [h.Style(sx({ color: 'var(--tt-fg)' }))],
                        ['"Add a CI job that enforces Conventional Commits."'],
                      ),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ paddingLeft: '2ch' }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['assert  ']),
                      h.span(
                        [h.Style(sx({ color: 'var(--tt-cyan)' }))],
                        ['file-exists .github/workflows/commitlint.yml'],
                      ),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ paddingLeft: '2ch' }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [' '.repeat(8)]),
                      h.span([h.Style(sx({ color: 'var(--tt-magenta)' }))], ['llm-judge · triggers on pull_request']),
                    ],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ marginTop: 10 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['[a]']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' accept  ']),
                  h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], ['[s]']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' skip  ']),
                  h.span([h.Style(sx({ color: 'var(--tt-blue)' }))], ['[e]']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' edit   ']),
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['› ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['a']),
                  h.span([h.Style(sx({ background: 'var(--tt-fg)', color: 'var(--tt-fg)' }))], [' ']),
                ],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11.5, lineHeight: 1.6, marginBottom: 8 }))],
        [
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['--interactive']),
          ' walks each proposed case. accept / skip / edit before anything is written to ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['evals/evals.json']),
          '.',
        ],
      ),
      sectionKicker({ style: { margin: '34px 0 12px' } }, ['what makes a good case'], h),
      h.div(
        [
          h.Style(
            sx({
              display: 'grid',
              gap: 12,
              gridTemplateColumns: '1fr 1fr',
              marginBottom: 32,
            }),
          ),
        ],
        [
          h.div(
            [
              h.Style(
                sx({
                  border: '1px solid var(--tt-border)',
                  borderRadius: 8,
                  borderTop: '2px solid var(--tt-green)',
                  padding: '13px 15px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-green)', fontSize: 12.5, fontWeight: 700, marginBottom: 8 }))],
                ['do'],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.85 }))],
                [
                  h.div([], ['· one behavior per case']),
                  h.div([], ["· a realistic prompt in the user's words"]),
                  h.div([], ['· a fixed starting state (a fixture)']),
                  h.div([], ['· check artifacts & behavior, not wording']),
                ],
              ),
            ],
          ),
          h.div(
            [
              h.Style(
                sx({
                  border: '1px solid var(--tt-border)',
                  borderRadius: 8,
                  borderTop: '2px solid var(--tt-red)',
                  padding: '13px 15px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-red)', fontSize: 12.5, fontWeight: 700, marginBottom: 8 }))],
                ["don't"],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.85 }))],
                [
                  h.div([], ['· bundle five behaviors into one prompt']),
                  h.div([], ['· assert exact phrasing']),
                  h.div([], ['· depend on the network or the clock']),
                  h.div([], ['· test only the happy path']),
                ],
              ),
            ],
          ),
        ],
      ),
      sectionKicker({}, ['Use fixtures for a consistent starting state'], h),
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-comment)',
              fontSize: 12.5,
              lineHeight: 1.6,
              marginBottom: 14,
              maxWidth: 820,
            }),
          ),
        ],
        [
          'a case runs against a ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['setup']),
          ' directory copied into a fresh sandbox, so every run starts from the same place and a check means the same thing each time.',
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              marginBottom: 8,
              overflow: 'hidden',
            }),
          ),
        ],
        [
          h.div(
            [
              h.Style(
                sx({
                  alignItems: 'center',
                  borderBottom: '1px solid var(--tt-border)',
                  display: 'flex',
                  fontSize: 11,
                  gap: 8,
                  padding: '7px 12px',
                }),
              ),
            ],
            [
              h.span([h.Style(sx({ color: 'var(--tt-teal)', fontWeight: 700 }))], ['sandbox']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['execution-golden-path']),
              h.span([h.Style(sx({ flex: 1 }))]),
              h.span(
                [
                  h.OnClick(Message.ClickedCreateDemoPlayback()),
                  h.Style(sx({ color: 'var(--tt-comment)', cursor: 'pointer' })),
                ],
                [controlLabel],
              ),
              h.span(
                [
                  h.OnClick(Message.ClickedCreateDemoReplay()),
                  h.Style(sx({ color: 'var(--tt-comment)', cursor: 'pointer' })),
                ],
                ['↻ replay'],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ display: 'flex', minHeight: 264 }))],
            [
              h.div(
                [
                  h.Style(
                    sx({
                      borderRight: '1px solid var(--tt-border)',
                      flex: 1,
                      fontSize: 12.5,
                      lineHeight: 1.85,
                      minWidth: 0,
                      padding: '13px 16px',
                    }),
                  ),
                ],
                [
                  h.div(
                    [h.Style(sx({ color: 'var(--tt-comment)', marginBottom: 8 }))],
                    [
                      'prompt  ',
                      h.span(
                        [h.Style(sx({ color: 'var(--tt-fg-dark)' }))],
                        ['"Add a CI job that enforces Conventional Commits."'],
                      ),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ ...fadeStyle(scaffoldFrame.copy), marginBottom: 6 }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], ['⇄']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [' copied files/clean-repo → sandbox']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx(fadeStyle(scaffoldFrame.root, 0.3)))],
                    [h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['repo/'])],
                  ),
                  h.div(
                    [h.Style(sx(fadeStyle(scaffoldFrame.pkg, 0.3)))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
                      h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['package.json']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx(fadeStyle(scaffoldFrame.src, 0.3)))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
                      h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['src/index.js']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx(fadeStyle(scaffoldFrame.readme, 0.3)))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
                      h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['README.md']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ height: 24, margin: '2px 0', position: 'relative' }))],
                    [
                      h.div(
                        [h.Style(sx({ ...fadeStyle(scaffoldFrame.running, 0.2), inset: 0, position: 'absolute' }))],
                        [
                          h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], [scaffoldSpinner]),
                          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' agent working…']),
                        ],
                      ),
                    ],
                  ),
                  h.div(
                    [h.Style(sx(fadeStyle(scaffoldFrame.fnew1, 0.4)))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['commitlint.config.js']),
                      h.span([h.Style(sx({ color: 'var(--tt-green)', fontSize: 10 }))], ['  ＋new']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx(fadeStyle(scaffoldFrame.fnew2, 0.4)))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['.github/workflows/commitlint.yml']),
                      h.span([h.Style(sx({ color: 'var(--tt-green)', fontSize: 10 }))], ['  ＋new']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx(fadeStyle(scaffoldFrame.fnew3, 0.4)))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['└─ ']),
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['.releaserc.json']),
                      h.span([h.Style(sx({ color: 'var(--tt-green)', fontSize: 10 }))], ['  ＋new']),
                    ],
                  ),
                ],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      flex: 'none',
                      fontSize: 12,
                      lineHeight: 1.7,
                      padding: '13px 16px',
                      width: 316,
                    }),
                  ),
                ],
                [
                  h.div(
                    [
                      h.Style(
                        sx({
                          color: 'var(--tt-cyan)',
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          marginBottom: 10,
                        }),
                      ),
                    ],
                    ['ASSERTIONS'],
                  ),
                  h.div(
                    [h.Style(sx({ height: 22, marginBottom: 4, position: 'relative' }))],
                    [
                      h.div(
                        [h.Style(sx({ ...fadeStyle(scaffoldFrame.checking, 0.2), inset: 0, position: 'absolute' }))],
                        [
                          h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], [scaffoldSpinner]),
                          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [' checking files…']),
                        ],
                      ),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ ...fadeStyle(scaffoldFrame.a1), display: 'flex', gap: 8, padding: '3px 0' }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓']),
                      h.span([h.Style(sx({ color: 'var(--tt-cyan)', flex: 'none', width: 88 }))], ['file-exists']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)', minWidth: 0 }))], ['workflows/commitlint.yml']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ ...fadeStyle(scaffoldFrame.a2), display: 'flex', gap: 8, padding: '3px 0' }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓']),
                      h.span([h.Style(sx({ color: 'var(--tt-cyan)', flex: 'none', width: 88 }))], ['regex-match']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)', minWidth: 0 }))], ['config-conventional']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ ...fadeStyle(scaffoldFrame.a3), display: 'flex', gap: 8, padding: '3px 0' }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓']),
                      h.span([h.Style(sx({ color: 'var(--tt-cyan)', flex: 'none', width: 88 }))], ['json-valid']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)', minWidth: 0 }))], ['.releaserc.json']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ ...fadeStyle(scaffoldFrame.a4), display: 'flex', gap: 8, padding: '3px 0' }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓']),
                      h.span([h.Style(sx({ color: 'var(--tt-magenta)', flex: 'none', width: 88 }))], ['file-absent']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)', minWidth: 0 }))], ['.npmrc · never written']),
                    ],
                  ),
                  h.div(
                    [
                      h.Style(
                        sx({
                          ...fadeStyle(scaffoldFrame.pass, 0.45),
                          borderTop: '1px solid var(--tt-border)',
                          marginTop: 12,
                          paddingTop: 10,
                        }),
                      ),
                    ],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-green)', fontWeight: 700 }))], ['4/4 passed']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['  fixture reset for next run']),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }))],
        [
          'a negative case just points at a different fixture. e.g. ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['files/docs-only']),
          '. so "should do nothing" is testable too.',
        ],
      ),
      sectionKicker({}, ['a fuller evals.json'], h),
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.85,
              marginBottom: 32,
              padding: '14px 16px',
            }),
          ),
        ],
        [
          h.div([], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['{'])]),
          h.div(
            [h.Style(sx({ paddingLeft: '2ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"skill_name"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['"arc-conventional-commits"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '2ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"evals"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': [']),
            ],
          ),
          h.div([h.Style(sx({ paddingLeft: '4ch' }))], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['{'])]),
          h.div(
            [h.Style(sx({ paddingLeft: '6ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"id"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['"trigger-explicit"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '6ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"prompt"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['"Set up semantic-release in this repo."']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '6ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"setup"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
              h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['"files/clean-repo"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '6ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"assertions"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': [']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '8ch' }))],
            [
              h.span(
                [h.Style(sx({ color: 'var(--tt-cyan)' }))],
                ['{ "type": "file-exists", "path": ".releaserc.json" }'],
              ),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '8ch' }))],
            [
              h.span(
                [h.Style(sx({ color: 'var(--tt-cyan)' }))],
                ['{ "type": "regex-match", "pattern": "conventionalcommits" }'],
              ),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '8ch' }))],
            [h.span([h.Style(sx({ color: 'var(--tt-magenta)' }))], ['"Summarizes the plugins it installed."'])],
          ),
          h.div([h.Style(sx({ paddingLeft: '6ch' }))], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [']'])]),
          h.div(
            [h.Style(sx({ paddingLeft: '4ch' }))],
            [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['}, {'])],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '6ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"id"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['"adjacent-negative"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '6ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"prompt"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['"This PR only edits README.md. need a release?"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '6ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"setup"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
              h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['"files/docs-only"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '6ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"assertions"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': [']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '8ch' }))],
            [
              h.span(
                [h.Style(sx({ color: 'var(--tt-cyan)' }))],
                ['{ "type": "file-absent", "path": ".releaserc.json" }'],
              ),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '8ch' }))],
            [
              h.span(
                [h.Style(sx({ color: 'var(--tt-magenta)' }))],
                ['"Explains a docs-only change triggers no release."'],
              ),
            ],
          ),
          h.div([h.Style(sx({ paddingLeft: '6ch' }))], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [']'])]),
          h.div([h.Style(sx({ paddingLeft: '4ch' }))], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['}'])]),
          h.div([h.Style(sx({ paddingLeft: '2ch' }))], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [']'])]),
          h.div([], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['}'])]),
        ],
      ),
      sectionKicker({}, ['Typed builder'], h),
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-comment)',
              fontSize: 12.5,
              lineHeight: 1.6,
              marginBottom: 14,
              maxWidth: 820,
            }),
          ),
        ],
        [
          'evals.json is the runtime contract. for larger suites, you do not have to hand-write it. for larger suites, author them in typescript with ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['defineSkillEval']),
          ': type-checked helpers and one source of truth, then compile to ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['evals/evals.json']),
          ' with ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['emit']),
          '. same suite as above, authored in code:',
        ],
      ),
      h.div(
        [h.Style(sx({ ...codeCardStyle, marginBottom: 12, overflow: 'hidden' }))],
        [
          h.div(
            [
              h.Style(
                sx({
                  alignItems: 'center',
                  borderBottom: '1px solid var(--tt-border)',
                  display: 'flex',
                  gap: 6,
                  margin: '-14px -16px 12px',
                  padding: '7px 12px',
                }),
              ),
            ],
            [
              ...trafficDots(h),
              h.span(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11, marginLeft: 8 }))],
                ['evals/evals.eval.ts'],
              ),
            ],
          ),
          ...builderLines.map((line) =>
            h.div(
              [h.Style(sx({ paddingLeft: `${line.indent ?? 0}ch` }))],
              [...line.toks.map((token) => h.span([h.Style(sx({ color: token[1] }))], [token[0]]))],
            ),
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ ...codeCardStyle, lineHeight: 1.9, marginBottom: 12 }))],
        [
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
              h.span(
                [h.Style(sx({ color: 'var(--tt-fg)' }))],
                ['arc-skill-eval emit ./skills/arc-conventional-commits'],
              ),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓']),
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' wrote evals/evals.json · 3 cases']),
            ],
          ),
          h.div([h.Style(sx({ height: 8 }))]),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
              h.span(
                [h.Style(sx({ color: 'var(--tt-fg)' }))],
                ['arc-skill-eval emit ./skills/arc-conventional-commits --check'],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ display: 'flex', gap: 12 }))],
            [
              h.span(
                [h.Style(sx({ flex: 1, minWidth: 0 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' evals/evals.json is up to date']),
                ],
              ),
              h.span([h.Style(sx({ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }))], ['← guards drift in ci']),
            ],
          ),
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-comment)',
              fontSize: 12,
              lineHeight: 1.6,
              marginBottom: 16,
              maxWidth: 820,
            }),
          ),
        ],
        [
          'the same chain that sets severity also unlocks ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['scored']),
          ' judges: ',
          h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], ['judge("…").atLeast(4)']),
          ' grades the output on a 1–5 rubric and passes only at or above the bar. the score lands in ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['grading.json']),
          '. use it when a hard pass/fail is too blunt for a quality signal.',
        ],
      ),
      callout(
        { accent: 'cyan', style: { marginBottom: 32 } },
        [
          'the runner still reads ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['evals/evals.json']),
          ', never the ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['.eval.ts']),
          '. the builder is an authoring convenience, not a second runtime. wire ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['emit --check']),
          ' into ci and the build fails whenever the committed json drifts from the suite.',
        ],
        h,
      ),
      sectionKicker({}, ['common pitfalls'], h),
      h.div(
        [h.Style(sx({ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }))],
        [
          ...pitfalls.map((pitfall) =>
            h.div(
              [
                h.Style(
                  sx({
                    border: '1px solid var(--tt-border)',
                    borderRadius: 7,
                    display: 'flex',
                    gap: 9,
                    padding: '10px 13px',
                  }),
                ),
              ],
              [
                h.span([h.Style(sx({ color: 'var(--tt-red)', flex: 'none' }))], ['✗']),
                h.div(
                  [],
                  [
                    h.div(
                      [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5, fontWeight: 700 }))],
                      [pitfall.title],
                    ),
                    h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }))], [pitfall.desc]),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    ],
  );
};
