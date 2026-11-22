import { inertHtml as ih, type Html, type HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import type { Message } from '../message';
import { callout, chapterHeader, pageStyle, sectionKicker } from './ui';

const deltaCards = [
  {
    accent: 'var(--tt-green)',
    titleColor: 'var(--tt-green)',
    title: 'Δ > 0',
    desc: 'the skill improved results on these cases. keep it.',
  },
  {
    accent: 'var(--tt-comment)',
    titleColor: 'var(--tt-fg-dark)',
    title: 'Δ ≈ 0',
    desc: 'redundant here, or the model already knew. maybe the case is too easy to separate them.',
  },
  {
    accent: 'var(--tt-red)',
    titleColor: 'var(--tt-red)',
    title: 'Δ < 0',
    desc: 'the skill reduced results. inspect the trace for a wrong trigger or conflict.',
  },
];

const patternCards = [
  {
    tag: [
      ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['✓ with']),
      ' · ',
      ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['✓ without']),
    ],
    title: 'always passes → remove it',
    desc: 'the base model handles it fine. it inflates the pass rate without measuring the skill.',
  },
  {
    tag: [
      ih.span([ih.Style(sx({ color: 'var(--tt-red)' }))], ['✗ with']),
      ' · ',
      ih.span([ih.Style(sx({ color: 'var(--tt-red)' }))], ['✗ without']),
    ],
    title: 'always fails → investigate it',
    desc: 'the assertion is broken, the case is too hard, or it checks the wrong thing. fix before the next iteration.',
  },
  {
    tag: [
      ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['✓ with']),
      ' · ',
      ih.span([ih.Style(sx({ color: 'var(--tt-red)' }))], ['✗ without']),
    ],
    title: "the skill's value → study it",
    desc: 'inspect which instruction changed the result and protect it in the skill.',
  },
  {
    tag: [
      ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['✓']),
      ' then ',
      ih.span([ih.Style(sx({ color: 'var(--tt-red)' }))], ['✗']),
      ' run to run',
    ],
    title: 'flaky → tighten instructions',
    desc: 'inconsistent verdicts mean the instructions are ambiguous enough to be read differently each run. add an example.',
  },
];

export const view = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx(pageStyle))],
    [
      chapterHeader({ num: '05', title: 'The with / without signal' }, h),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 28, maxWidth: 820 }))],
        [
          'the single most useful number arc-skill-eval produces is the ',
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['delta']),
          ' between running a case with the skill and without it. a positive delta shows the skill improved the measured result.',
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              marginBottom: 30,
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
                  maxWidth: 190,
                  padding: '12px 14px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-yellow)', fontSize: 12, fontWeight: 700, marginBottom: 3 }))],
                ['one prompt'],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 11.5, lineHeight: 1.45 }))],
                ['"Set up semantic-release."'],
              ),
            ],
          ),
          h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 18 }))], ['→']),
          h.div(
            [h.Style(sx({ display: 'flex', flexDirection: 'column', gap: 10 }))],
            [
              h.div(
                [
                  h.Style(
                    sx({
                      alignItems: 'center',
                      border: '1px solid var(--tt-border)',
                      borderLeft: '2px solid var(--tt-green)',
                      borderRadius: 6,
                      display: 'flex',
                      gap: 10,
                      padding: '9px 13px',
                    }),
                  ),
                ],
                [
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700, width: 96 }))],
                    ['with_skill'],
                  ),
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['▓▓▓▓▓▓▓▓']),
                  h.span([h.Style(sx({ color: 'var(--tt-green)', fontWeight: 700 }))], ['6/6']),
                ],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      alignItems: 'center',
                      border: '1px solid var(--tt-border)',
                      borderLeft: '2px solid var(--tt-orange)',
                      borderRadius: 6,
                      display: 'flex',
                      gap: 10,
                      padding: '9px 13px',
                    }),
                  ),
                ],
                [
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-orange)', fontSize: 12, fontWeight: 700, width: 96 }))],
                    ['without_skill'],
                  ),
                  h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], ['▓▓▓▓▓▓']),
                  h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['▓▓']),
                  h.span([h.Style(sx({ color: 'var(--tt-orange)', fontWeight: 700 }))], ['5/6']),
                ],
              ),
            ],
          ),
          h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 18 }))], ['→']),
          h.div(
            [
              h.Style(
                sx({
                  border: '1px solid var(--tt-green)',
                  borderRadius: 8,
                  padding: '12px 18px',
                  textAlign: 'center',
                }),
              ),
            ],
            [
              h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11 }))], ['delta']),
              h.div([h.Style(sx({ color: 'var(--tt-green)', fontSize: 22, fontWeight: 700 }))], ['+16.7%']),
            ],
          ),
        ],
      ),
      sectionKicker({ style: { marginBottom: 10 } }, ['how the delta is computed'], h),
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.95,
              marginBottom: 30,
              padding: '14px 16px',
            }),
          ),
        ],
        [
          h.div(
            [],
            [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['delta = pass_rate(with) − pass_rate(without)'])],
          ),
          h.div([], [h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['      = 6/6 − 5/6'])]),
          h.div([], [h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['      = 1.000 − 0.833'])]),
          h.div(
            [],
            [h.span([h.Style(sx({ color: 'var(--tt-green)', fontWeight: 700 }))], ['      = +0.167   (+16.7%)'])],
          ),
        ],
      ),
      sectionKicker({}, ['reading the delta'], h),
      h.div(
        [
          h.Style(
            sx({
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(3, 1fr)',
              marginBottom: 20,
            }),
          ),
        ],
        [
          ...deltaCards.map((card) =>
            h.div(
              [
                h.Style(
                  sx({
                    border: '1px solid var(--tt-border)',
                    borderRadius: 8,
                    borderTop: `2px solid ${card.accent}`,
                    padding: '12px 14px',
                  }),
                ),
              ],
              [
                h.div(
                  [h.Style(sx({ color: card.titleColor, fontSize: 13, fontWeight: 700, marginBottom: 5 }))],
                  [card.title],
                ),
                h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55 }))], [card.desc]),
              ],
            ),
          ),
        ],
      ),
      sectionKicker(
        { style: { marginBottom: 14 } },
        [
          'Δ across a suite ',
          h.span(
            [
              h.Style(
                sx({
                  color: 'var(--tt-comment)',
                  fontWeight: 400,
                  letterSpacing: 0,
                  textTransform: 'none',
                }),
              ),
            ],
            ['. illustrative'],
          ),
        ],
        h,
      ),
      h.div(
        [
          h.Style(
            sx({
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              marginBottom: 8,
              padding: '18px 20px 12px',
            }),
          ),
        ],
        [
          h.div(
            [h.Style(sx({ alignItems: 'stretch', display: 'flex', gap: 26, height: 170 }))],
            [
              h.div(
                [h.Style(sx({ display: 'flex', flex: 1, flexDirection: 'column' }))],
                [
                  h.div(
                    [h.Style(sx({ alignItems: 'flex-end', display: 'flex', flex: 1, justifyContent: 'center' }))],
                    [h.div([h.Style(sx({ color: 'var(--tt-green)', fontSize: 11, marginBottom: 3 }))], ['+33%'])],
                  ),
                  h.div(
                    [h.Style(sx({ alignItems: 'flex-end', display: 'flex', flex: 1, justifyContent: 'center' }))],
                    [
                      h.div([
                        h.Style(
                          sx({
                            background: 'var(--tt-green)',
                            borderRadius: '3px 3px 0 0',
                            height: '100%',
                            width: 38,
                          }),
                        ),
                      ]),
                    ],
                  ),
                  h.div([h.Style(sx({ background: 'var(--tt-border-active)', height: 1 }))]),
                  h.div([h.Style(sx({ flex: 1 }))]),
                ],
              ),
              h.div(
                [h.Style(sx({ display: 'flex', flex: 1, flexDirection: 'column' }))],
                [
                  h.div(
                    [h.Style(sx({ alignItems: 'flex-end', display: 'flex', flex: 1, justifyContent: 'center' }))],
                    [h.div([h.Style(sx({ color: 'var(--tt-green)', fontSize: 11, marginBottom: 3 }))], ['+17%'])],
                  ),
                  h.div(
                    [h.Style(sx({ alignItems: 'flex-end', display: 'flex', flex: 1, justifyContent: 'center' }))],
                    [
                      h.div([
                        h.Style(
                          sx({
                            background: 'var(--tt-green)',
                            borderRadius: '3px 3px 0 0',
                            height: '52%',
                            width: 38,
                          }),
                        ),
                      ]),
                    ],
                  ),
                  h.div([h.Style(sx({ background: 'var(--tt-border-active)', height: 1 }))]),
                  h.div([h.Style(sx({ flex: 1 }))]),
                ],
              ),
              h.div(
                [h.Style(sx({ display: 'flex', flex: 1, flexDirection: 'column' }))],
                [
                  h.div([h.Style(sx({ flex: 1 }))]),
                  h.div(
                    [h.Style(sx({ alignItems: 'flex-end', display: 'flex', flex: 1, justifyContent: 'center' }))],
                    [
                      h.div([
                        h.Style(
                          sx({
                            background: 'var(--tt-comment)',
                            borderRadius: 2,
                            height: 4,
                            width: 38,
                          }),
                        ),
                      ]),
                    ],
                  ),
                  h.div([h.Style(sx({ background: 'var(--tt-border-active)', height: 1 }))]),
                  h.div(
                    [
                      h.Style(
                        sx({
                          alignItems: 'flex-start',
                          display: 'flex',
                          flex: 1,
                          justifyContent: 'center',
                        }),
                      ),
                    ],
                    [h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11, marginTop: 3 }))], ['0%'])],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ display: 'flex', flex: 1, flexDirection: 'column' }))],
                [
                  h.div([h.Style(sx({ flex: 1 }))]),
                  h.div([h.Style(sx({ flex: 1 }))]),
                  h.div([h.Style(sx({ background: 'var(--tt-border-active)', height: 1 }))]),
                  h.div(
                    [
                      h.Style(
                        sx({
                          alignItems: 'flex-start',
                          display: 'flex',
                          flex: 1,
                          justifyContent: 'center',
                        }),
                      ),
                    ],
                    [
                      h.div([
                        h.Style(
                          sx({
                            background: 'var(--tt-red)',
                            borderRadius: '0 0 3px 3px',
                            height: '52%',
                            width: 38,
                          }),
                        ),
                      ]),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ alignItems: 'flex-start', display: 'flex', justifyContent: 'center' }))],
                    [h.div([h.Style(sx({ color: 'var(--tt-red)', fontSize: 11, marginTop: 3 }))], ['−17%'])],
                  ),
                ],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ display: 'flex', gap: 26, marginTop: 8 }))],
            [
              ...['trigger', 'golden-path', 'adjacent-neg', 'edge-case'].map((label) =>
                h.div(
                  [
                    h.Style(
                      sx({
                        color: 'var(--tt-fg-dark)',
                        flex: 1,
                        fontSize: 11,
                        textAlign: 'center',
                      }),
                    ),
                  ],
                  [label],
                ),
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }))],
        [
          'a negative delta identifies a case where the skill hurt results. use ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['--extra-skill']),
          " to load a distractor and confirm your skill doesn't fight a neighbor (e.g. release-please vs conventional-commits).",
        ],
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['the cost of the win'], h),
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
          'the delta says what the skill buys; ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['benchmark.json']),
          ' also says what it costs . extra time and tokens vs the baseline. read them together.',
        ],
      ),
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
                  borderLeft: '2px solid var(--tt-green)',
                  borderRadius: 8,
                  padding: '13px 15px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-green)', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }))],
                ['✓ worth it'],
              ),
              h.div(
                [h.Style(sx({ fontSize: 13, lineHeight: 1.8 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['Δ +50 pts']),
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [' for ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['+13s · +1.7k tokens']),
                ],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5, marginTop: 4 }))],
                ['a big lift for a small cost. the skill earns its context.'],
              ),
            ],
          ),
          h.div(
            [
              h.Style(
                sx({
                  border: '1px solid var(--tt-border)',
                  borderLeft: '2px solid var(--tt-red)',
                  borderRadius: 8,
                  padding: '13px 15px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-red)', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }))],
                ['✗ probably not'],
              ),
              h.div(
                [h.Style(sx({ fontSize: 13, lineHeight: 1.8 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['Δ +2 pts']),
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [' for ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['2× tokens']),
                ],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5, marginTop: 4 }))],
                ['marginal gain, doubled cost. trim the skill or cut it.'],
              ),
            ],
          ),
        ],
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['patterns across the suite'], h),
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
          'aggregate numbers hide things. after each iteration, sort the assertions by how they behaved in both configurations:',
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              display: 'grid',
              gap: 10,
              gridTemplateColumns: '1fr 1fr',
              marginBottom: 14,
            }),
          ),
        ],
        [
          ...patternCards.map((card) =>
            h.div(
              [h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 7, padding: '11px 13px' }))],
              [
                h.div(
                  [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 4 }))],
                  [h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11 }))], card.tag)],
                ),
                h.div([h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5, fontWeight: 700 }))], [card.title]),
                h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }))], [card.desc]),
              ],
            ),
          ),
        ],
      ),
      callout(
        { accent: 'magenta' },
        [
          h.span([h.Style(sx({ color: 'var(--tt-magenta)', fontWeight: 700 }))], ['comparing two versions? go blind.']),
          ' give both outputs to a judge without saying which came from which version and let it score organization, formatting, and polish on its own rubric. two outputs can pass the same assertions and still differ in quality. blind comparison catches that without bias.',
        ],
        h,
      ),
    ],
  );
