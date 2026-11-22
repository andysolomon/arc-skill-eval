import { Array, Option } from 'effect';
import { inertHtml as ih, type Html, type HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import { chapterNumber, learnChapters, type ChapterId } from '../chapterList';
import { Message } from '../message';
import { callout, chapterHeader, pageStyle, sectionKicker } from './ui';

const flowSteps = [
  { color: 'var(--tt-yellow)', title: 'a prompt', desc: 'a realistic request' },
  { color: 'var(--tt-blue)', title: 'a captured run', desc: 'trace + artifacts' },
  { color: 'var(--tt-cyan)', title: 'a set of checks', desc: 'deterministic + judged' },
  { color: 'var(--tt-green)', title: 'a score', desc: 'comparable over time' },
];

const dimensionCards = [
  {
    accent: 'var(--tt-green)',
    title: 'outcome',
    desc: "did the task complete and produce the right artifact? this is the one you can't skip.",
    example: [
      'e.g. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-teal)' }))], ['.releaserc.json']),
      ' is written and valid',
    ],
    checked: [
      'checked with ',
      ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['file-exists']),
      ' · ',
      ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['json-valid']),
    ],
  },
  {
    accent: 'var(--tt-blue)',
    title: 'process',
    desc: 'did it trigger the skill and take the intended steps. not a lucky shortcut?',
    example: [
      'e.g. reads SKILL.md, runs commitlint. not a raw ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg)' }))], ['npm publish']),
    ],
    checked: [
      'checked with ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['trace.json']),
      ' · ',
      ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['not-regex']),
    ],
  },
  {
    accent: 'var(--tt-magenta)',
    title: 'style',
    desc: 'does the output read the way the skill promises. the conventions, tone, shape?',
    example: ['e.g. commit subjects read ', ih.span([ih.Style(sx({ color: 'var(--tt-fg)' }))], ['type: summary'])],
    checked: [
      'checked with ',
      ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['regex-match']),
      ' · ',
      ih.span([ih.Style(sx({ color: 'var(--tt-magenta)' }))], ['judge']),
    ],
  },
  {
    accent: 'var(--tt-yellow)',
    title: 'efficiency',
    desc: 'did it get there without thrashing? a right answer that costs 40 tool calls is a regression.',
    example: ['e.g. ≤ 8 tool calls, under ', ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['$0.15'])],
    checked: [
      'checked with ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['timing.json']),
      ' · ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['tool-summary']),
    ],
  },
];

const triggerCards = [
  {
    accent: 'var(--tt-green)',
    title: 'explicit',
    desc: 'names the skill directly. proves direct usage keeps working as you edit. your smoke test.',
    example: '"Use arc-conventional-commits to set up releases."',
    passes: ['passes when it ', ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['fires and does the task'])],
  },
  {
    accent: 'var(--tt-blue)',
    title: 'implicit',
    desc: 'describes the scenario without naming it. the real test of whether your description earns the trigger.',
    example: '"Automate releases from our commit messages."',
    passes: [
      "passes when it's ",
      ih.span([ih.Style(sx({ color: 'var(--tt-blue)' }))], ['selected on description alone']),
    ],
  },
  {
    accent: 'var(--tt-cyan)',
    title: 'contextual',
    desc: 'a realistic, noisy prompt with distractions around the real ask. closest to production.',
    example: '"Our version bumps are a mess. sort out the release flow."',
    passes: [
      'passes when it fires ',
      ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['and produces the right structure']),
    ],
  },
  {
    accent: 'var(--tt-orange)',
    title: 'adjacent-negative',
    desc: 'a nearby request it should NOT fire for. catches false positives. the boundary most skills leak at.',
    example: '"This PR only edits README. do I need a release?"',
    passes: [
      'passes when it ',
      ih.span([ih.Style(sx({ color: 'var(--tt-orange)' }))], ['stays out and writes nothing']),
    ],
  },
];

const loopSteps = [
  { color: 'var(--tt-green)', label: 'create' },
  { color: 'var(--tt-blue)', label: 'run' },
  { color: 'var(--tt-yellow)', label: 'review' },
  { color: 'var(--tt-magenta)', label: 'improve' },
];

const loopCommands = [
  {
    color: 'var(--tt-green)',
    label: 'create',
    desc: 'scaffold a starter suite. deterministic, guided, or interactive.',
  },
  { color: 'var(--tt-blue)', label: 'run', desc: 'execute cases; --compare grades with_skill vs without_skill.' },
  { color: 'var(--tt-teal)', label: 'audit', desc: 'deterministic skill-quality checks. no model tokens.' },
  { color: 'var(--tt-fg)', label: 'browse', desc: 'a four-panel run browser over the artifacts.' },
  { color: 'var(--tt-yellow)', label: 'review', desc: 'a static report; capture human notes in feedback.json.' },
  {
    color: 'var(--tt-magenta)',
    label: 'improve',
    desc: 'turn feedback + failures into proposed changes. nothing written without --apply.',
  },
];

const runArtifacts = [
  'grading.json',
  'timing.json',
  'trace.json',
  'tool-summary.json',
  'context-manifest.json',
  'benchmark.json',
];

const references = [
  { href: 'https://agentskills.io/skill-creation/evaluating-skills', label: 'agentskills.io · evaluating skills' },
  { href: 'https://platform.claude.com/docs/en/agents-and-tools/agent-skills', label: 'Anthropic · Agent Skills' },
  { href: 'https://developers.openai.com/blog/eval-skills', label: 'OpenAI · testing agent skills' },
];

type DeepDive = Readonly<{ id: ChapterId; num: string; label: string; desc: string }>;

const deepDives: ReadonlyArray<DeepDive> = Array.map(
  Array.filter(learnChapters, (chapter) => chapter.id !== 'overview'),
  (chapter) => ({
    id: chapter.id,
    num: chapterNumber(chapter.id),
    label: chapter.label,
    desc: Option.getOrElse(chapter.maybeDesc, () => ''),
  }),
);

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ';

const deepDiveCard = (card: DeepDive, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    card.id,
    [
      h.Class('learn-deep-dive'),
      h.OnClick(Message.ClickedDeepDive({ chapterId: card.id })),
      h.OnKeyDownPreventDefault((key) =>
        isActivationKey(key)
          ? Option.some(Message.PressedDeepDiveActivationKey({ chapterId: card.id }))
          : Option.none(),
      ),
      h.Role('button'),
      h.Tabindex(0),
      h.Style(
        sx({
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          cursor: 'pointer',
          padding: '14px 16px',
        }),
      ),
    ],
    [
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 9, marginBottom: 5 }))],
        [
          h.span([h.Style(sx({ color: 'var(--tt-dim)', fontSize: 11, fontWeight: 700 }))], [card.num]),
          h.span([h.Style(sx({ color: 'var(--tt-fg)', fontSize: 13.5, fontWeight: 700 }))], [card.label]),
          h.span([h.Style(sx({ flex: 1 }))]),
          h.span([h.Style(sx({ color: 'var(--tt-blue)' }))], ['→']),
        ],
      ),
      h.div([h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.55 }))], [card.desc]),
    ],
  );

export const view = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx(pageStyle))],
    [
      chapterHeader({ num: '01', title: 'What arc-skill-eval is for' }, h),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 36, maxWidth: 820 }))],
        [
          "when you iterate on a skill, it's hard to tell whether you improved it or just changed its behavior. one version feels faster, another seems more reliable. then a regression slips in: the skill doesn't trigger, skips a required step, or leaves extra files behind. ",
          h.span(
            [h.Style(sx({ color: 'var(--tt-fg)' }))],
            ['arc-skill-eval replaces "does this feel better?" with evidence'],
          ),
          ' . run the skill, capture what happened, and grade it against a small set of checks you can compare over time.',
        ],
      ),
      sectionKicker({}, ['first, what a skill is'], h),
      h.div(
        [h.Style(sx({ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 36 }))],
        [
          h.div(
            [
              h.Style(
                sx({
                  color: 'var(--tt-fg-dark)',
                  flex: 1,
                  fontSize: 13,
                  lineHeight: 1.7,
                  minWidth: 330,
                }),
              ),
            ],
            [
              'a skill is a folder with a ',
              h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['SKILL.md']),
              ' , yaml frontmatter (',
              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['name']),
              ' + ',
              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['description']),
              ") plus markdown instructions, and optional scripts and resources. the name and description control invocation: they're what the agent matches a request against to decide ",
              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['whether']),
              ' to trigger the skill and pull the rest into context. progressive disclosure keeps it cheap. metadata is always loaded, instructions load on trigger, bundled files only when read.',
            ],
          ),
          h.div(
            [
              h.Style(
                sx({
                  background: 'var(--tt-bg-dark)',
                  border: '1px solid var(--tt-border)',
                  borderRadius: 8,
                  flex: 1,
                  fontSize: 12.5,
                  lineHeight: 1.85,
                  minWidth: 330,
                  padding: '14px 16px',
                }),
              ),
            ],
            [
              h.div([h.Style(sx({ color: 'var(--tt-comment)' }))], ['---']),
              h.div(
                [],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['name']),
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['arc-conventional-commits']),
                ],
              ),
              h.div(
                [],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['description']),
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['what it does']),
                ],
              ),
              h.div(
                [],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['  + ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['when the agent should use it.']),
                ],
              ),
              h.div([h.Style(sx({ color: 'var(--tt-comment)' }))], ['---']),
              h.div([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['# instructions the agent follows…']),
            ],
          ),
        ],
      ),
      sectionKicker({}, ['what an eval is'], h),
      h.div(
        [
          h.Style(
            sx({
              alignItems: 'stretch',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 12,
            }),
          ),
        ],
        [
          ...flowSteps.map((step, index) =>
            h.div(
              [h.Style(sx({ display: 'contents' }))],
              [
                index > 0 ? h.span([h.Style(sx({ alignSelf: 'center', color: 'var(--tt-comment)' }))], ['→']) : h.empty,
                h.div(
                  [
                    h.Style(
                      sx({
                        border: '1px solid var(--tt-border)',
                        borderRadius: 8,
                        flex: 1,
                        minWidth: 150,
                        padding: '12px 14px',
                      }),
                    ),
                  ],
                  [
                    h.div(
                      [h.Style(sx({ color: step.color, fontSize: 13, fontWeight: 700, marginBottom: 3 }))],
                      [step.title],
                    ),
                    h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }))], [step.desc]),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.6, marginBottom: 36 }))],
        [
          "in practice it's a lightweight end-to-end test: run the agent, record what happened, score the result against a few rules.",
        ],
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['define success first'], h),
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
          'before writing the skill, write down what success means in terms you can measure. keep the list small and must-pass. the behaviors you care about most, across four dimensions.',
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(2, 1fr)',
              marginBottom: 36,
            }),
          ),
        ],
        [
          ...dimensionCards.map((card) =>
            h.div(
              [
                h.Style(
                  sx({
                    border: '1px solid var(--tt-border)',
                    borderRadius: 8,
                    borderTop: `2px solid ${card.accent}`,
                    padding: '14px 15px',
                  }),
                ),
              ],
              [
                h.div(
                  [h.Style(sx({ color: card.accent, fontSize: 13, fontWeight: 700, marginBottom: 5 }))],
                  [card.title],
                ),
                h.div(
                  [
                    h.Style(
                      sx({
                        color: 'var(--tt-comment)',
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        marginBottom: 8,
                      }),
                    ),
                  ],
                  [card.desc],
                ),
                h.div(
                  [
                    h.Style(
                      sx({
                        color: 'var(--tt-fg-dark)',
                        fontSize: 12,
                        lineHeight: 1.5,
                        marginBottom: 8,
                      }),
                    ),
                  ],
                  card.example,
                ),
                h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11.5 }))], card.checked),
              ],
            ),
          ),
        ],
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['does it trigger?'], h),
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
          "invocation depends on the name + description. test that the skill fires when it should , and holds back when it shouldn't. these become your starter cases.",
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(2, 1fr)',
              marginBottom: 36,
            }),
          ),
        ],
        [
          ...triggerCards.map((card) =>
            h.div(
              [
                h.Style(
                  sx({
                    border: '1px solid var(--tt-border)',
                    borderLeft: `2px solid ${card.accent}`,
                    borderRadius: 8,
                    padding: '13px 15px',
                  }),
                ),
              ],
              [
                h.div(
                  [h.Style(sx({ fontSize: 13, marginBottom: 5 }))],
                  [h.span([h.Style(sx({ color: card.accent, fontWeight: 700 }))], [card.title])],
                ),
                h.div(
                  [
                    h.Style(
                      sx({
                        color: 'var(--tt-comment)',
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        marginBottom: 8,
                      }),
                    ),
                  ],
                  [card.desc],
                ),
                h.div(
                  [
                    h.Style(
                      sx({
                        background: 'var(--tt-bg-dark)',
                        borderRadius: 5,
                        color: 'var(--tt-fg-dark)',
                        fontSize: 12,
                        lineHeight: 1.45,
                        marginBottom: 6,
                        padding: '7px 10px',
                      }),
                    ),
                  ],
                  [card.example],
                ),
                h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11.5 }))], card.passes),
              ],
            ),
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 20 }))],
        [
          h.div(
            [h.Style(sx({ flex: 1, minWidth: 360 }))],
            [
              sectionKicker({}, ['layered grading'], h),
              h.div(
                [
                  h.Style(
                    sx({
                      border: '1px solid var(--tt-border)',
                      borderRadius: 8,
                      marginBottom: 8,
                      padding: 14,
                    }),
                  ),
                ],
                [
                  h.div(
                    [h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 13, fontWeight: 700, marginBottom: 4 }))],
                    ['1 · deterministic. first'],
                  ),
                  h.div(
                    [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }))],
                    [
                      'scripts check what actually happened: files written, patterns matched, json parsed. fast, free, repeatable, explainable.',
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
                      marginBottom: 10,
                      padding: 14,
                    }),
                  ),
                ],
                [
                  h.div(
                    [
                      h.Style(
                        sx({
                          color: 'var(--tt-magenta)',
                          fontSize: 13,
                          fontWeight: 700,
                          marginBottom: 4,
                        }),
                      ),
                    ],
                    ['2 · llm-judge. where rules fall short'],
                  ),
                  h.div(
                    [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }))],
                    [
                      "a rubric grades prose and conventions the scripts can't. pin --judge-model so a model doesn't grade its own output.",
                    ],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ display: 'flex', flexWrap: 'wrap', gap: 6 }))],
                [
                  ...['file-exists', 'regex-match', 'json-valid', 'file-absent'].map((label) =>
                    h.span(
                      [
                        h.Style(
                          sx({
                            border: '1px solid var(--tt-border)',
                            borderRadius: 5,
                            color: 'var(--tt-cyan)',
                            fontSize: 11.5,
                            padding: '3px 8px',
                          }),
                        ),
                      ],
                      [label],
                    ),
                  ),
                  h.span(
                    [
                      h.Style(
                        sx({
                          border: '1px solid var(--tt-border)',
                          borderRadius: 5,
                          color: 'var(--tt-magenta)',
                          fontSize: 11.5,
                          padding: '3px 8px',
                        }),
                      ),
                    ],
                    ['llm-judge'],
                  ),
                ],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ flex: 1, minWidth: 360 }))],
            [
              sectionKicker({}, ['compare with and without the skill'], h),
              h.div(
                [h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 8, padding: 16 }))],
                [
                  h.div(
                    [
                      h.Style(
                        sx({
                          color: 'var(--tt-fg-dark)',
                          fontSize: 12.5,
                          lineHeight: 1.6,
                          marginBottom: 12,
                        }),
                      ),
                    ],
                    [
                      'run each case ',
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['with_skill']),
                      ' and again ',
                      h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], ['without_skill']),
                      '. the delta is the evidence the skill earned its place. not a vibe.',
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ fontSize: 13, lineHeight: 1.95 }))],
                    [
                      h.div(
                        [],
                        [
                          h.span(
                            [h.Style(sx({ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '15ch' }))],
                            ['with_skill'],
                          ),
                          h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['▓▓▓▓▓▓▓▓▓▓▓▓▓▓']),
                          h.span([h.Style(sx({ color: 'var(--tt-green)' }))], [' 3/3']),
                        ],
                      ),
                      h.div(
                        [],
                        [
                          h.span(
                            [h.Style(sx({ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '15ch' }))],
                            ['without_skill'],
                          ),
                          h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], ['▓▓▓▓▓']),
                          h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['░░░░░░░░░']),
                          h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], [' 1/3']),
                        ],
                      ),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ marginTop: 12 }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['delta  ']),
                      h.span([h.Style(sx({ color: 'var(--tt-green)', fontSize: 20, fontWeight: 700 }))], ['Δ +16.7%']),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      callout(
        { accent: 'orange', style: { marginBottom: 36, padding: '13px 16px' } },
        [
          h.span(
            [h.Style(sx({ color: 'var(--tt-orange)', fontSize: 13, fontWeight: 700 }))],
            ['behavior, not wording.'],
          ),
          " assert observable behavior and artifacts, not incidental phrasing. a correct answer that paraphrases shouldn't fail. reserve exact-wording checks for real contracts: a commit message, cli output, a safety disclaimer.",
        ],
        h,
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['small suites, grown from failures'], h),
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-fg-dark)',
              fontSize: 13,
              lineHeight: 1.7,
              marginBottom: 36,
              maxWidth: 820,
            }),
          ),
        ],
        [
          "you don't need a benchmark. ",
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['10–20 prompts']),
          ' is enough to surface regressions and confirm improvements. start tiny; every manual fix you make while building becomes a new case. so the suite turns into a living record of what the skill must keep getting right.',
        ],
      ),
      sectionKicker({}, ['the loop'], h),
      h.div(
        [
          h.Style(
            sx({
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 16,
            }),
          ),
        ],
        [
          ...loopSteps.map((step, index) =>
            h.div(
              [h.Style(sx({ display: 'contents' }))],
              [
                index > 0 ? h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['→']) : h.empty,
                h.span(
                  [
                    h.Style(
                      sx({
                        border: '1px solid var(--tt-border)',
                        borderRadius: 7,
                        color: step.color,
                        fontSize: 13,
                        fontWeight: 700,
                        padding: '7px 13px',
                      }),
                    ),
                  ],
                  [step.label],
                ),
              ],
            ),
          ),
          h.span([h.Style(sx({ color: 'var(--tt-dim)', marginLeft: 6 }))], ['↺ repeat']),
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              display: 'grid',
              gap: '8px 24px',
              gridTemplateColumns: 'repeat(2, 1fr)',
              marginBottom: 36,
            }),
          ),
        ],
        [
          ...loopCommands.map((command) =>
            h.div(
              [h.Style(sx({ display: 'flex', fontSize: 12.5, gap: 12, lineHeight: 1.5, padding: '5px 0' }))],
              [
                h.span([h.Style(sx({ color: command.color, fontWeight: 700, minWidth: 64 }))], [command.label]),
                h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [command.desc]),
              ],
            ),
          ),
        ],
      ),
      sectionKicker({}, ['what a run writes'], h),
      h.div(
        [h.Style(sx({ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }))],
        [
          ...runArtifacts.map((label) =>
            h.span(
              [
                h.Style(
                  sx({
                    border: '1px solid var(--tt-border)',
                    borderRadius: 5,
                    color: 'var(--tt-fg-dark)',
                    fontSize: 11.5,
                    padding: '4px 9px',
                  }),
                ),
              ],
              [label],
            ),
          ),
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              borderTop: '1px solid var(--tt-border)',
              color: 'var(--tt-comment)',
              fontSize: 12.5,
              lineHeight: 1.7,
              marginTop: 20,
              paddingTop: 16,
            }),
          ),
        ],
        [
          "the on-disk format follows Anthropic's published skill-eval standard; the methodology , layered grading, small suites that grow from real failures, the with-skill / without-skill comparison as compare with and without the skill. is inspired by OpenAI's work on testing agent skills. the runtime is ",
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['Pi']),
          ': an llm, a loop, and enough tokens.',
        ],
      ),
      sectionKicker({ style: { margin: '34px 0 12px' } }, ['more detail'], h),
      h.div(
        [h.Style(sx({ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, 1fr)' }))],
        [...Array.map(deepDives, (card) => deepDiveCard(card, h))],
      ),
      h.div(
        [
          h.Style(
            sx({
              borderTop: '1px solid var(--tt-border)',
              color: 'var(--tt-dim)',
              fontSize: 11,
              lineHeight: 1.7,
              marginTop: 34,
              paddingTop: 14,
            }),
          ),
        ],
        [
          'references: ',
          ...references.map((reference, index) =>
            h.span(
              [],
              [
                index > 0 ? ' · ' : h.empty,
                h.a([h.Href(reference.href), h.Rel('noopener'), h.Target('_blank')], [reference.label]),
              ],
            ),
          ),
        ],
      ),
    ],
  );
