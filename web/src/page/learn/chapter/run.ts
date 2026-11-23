import { inertHtml as ih, type Html, type HtmlBuilder } from 'foldkit/html';

import { sx, type StyleInput } from '@/ui/sx';

import type { Message } from '../message';
import { chapterHeader, pageStyle, sectionKicker, type Children } from './ui';

const artifactCards: ReadonlyArray<Readonly<{ title: string; titleColor?: string; desc: string; snippet: Children }>> =
  [
    {
      title: 'grading.json',
      desc: 'assertion results + evidence',
      snippet: [
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], ['{ ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"passed"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['true']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [', ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"type"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['"file-exists"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [' }']),
      ],
    },
    {
      title: 'timing.json',
      desc: 'duration, tokens, cost',
      snippet: [
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], ['{ ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"duration_ms"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['12420']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [', ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"cost"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['0.11']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [' }']),
      ],
    },
    {
      title: 'trace.json',
      desc: 'ordered tool calls',
      snippet: [
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], ['[ { ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"tool"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['"bash"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [', ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"ok"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['true']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [' } … ]']),
      ],
    },
    {
      title: 'tool-summary.json',
      desc: 'counts per tool',
      snippet: [
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], ['{ ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"read"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['2']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [', ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"bash"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['3']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [' }']),
      ],
    },
    {
      title: 'context-manifest.json',
      desc: 'what entered context',
      snippet: [
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], ['{ ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"skill_reads"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['1']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [', ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"files"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['4']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [' }']),
      ],
    },
    {
      title: 'benchmark.json',
      titleColor: 'var(--tt-magenta)',
      desc: 'the with / without delta',
      snippet: [
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], ['{ ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"with"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['"6/6"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [', ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-yellow)' }))], ['"delta"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
        ih.span([ih.Style(sx({ color: 'var(--tt-green)' }))], ['"+16.7%"']),
        ih.span([ih.Style(sx({ color: 'var(--tt-comment)' }))], [' }']),
      ],
    },
  ];

const browserPanelStyle: StyleInput = {
  border: '1px solid var(--tt-border)',
  borderRadius: 6,
  overflow: 'hidden',
};

const browserPanelHeaderStyle: StyleInput = {
  background: 'var(--tt-bg)',
  borderBottom: '1px solid var(--tt-border)',
  color: 'var(--tt-fg-dark)',
  padding: '2px 8px',
};

export const view = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx(pageStyle))],
    [
      chapterHeader({ num: '06', title: 'Anatomy of a run' }, h),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 28, maxWidth: 820 }))],
        [
          'every run writes a self-contained folder under ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['evals-runs/']),
          '. diff two folders to see what changed between iterations; open one in ',
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['browse']),
          ' to inspect it case by case.',
        ],
      ),
      sectionKicker({}, ['on disk'], h),
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              fontSize: 12.5,
              lineHeight: 1.9,
              marginBottom: 30,
              padding: '14px 16px',
            }),
          ),
        ],
        [
          h.div([], [h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['evals-runs/run-7af3/'])]),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-magenta)' }))], ['benchmark.json']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['         with vs without · the delta']),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['trigger-explicit/']),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['│  ├─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['grading.json']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['       per-assertion pass/fail + evidence']),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['│  ├─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['timing.json']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['        duration · tokens · cost']),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['│  ├─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['trace.json']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['         every tool call, in order']),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['│  ├─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['tool-summary.json']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['  counts per tool']),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['│  └─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['context-manifest.json']),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['└─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['…one directory per case']),
            ],
          ),
        ],
      ),
      sectionKicker({}, ['the artifacts'], h),
      h.div(
        [
          h.Style(
            sx({
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(2, 1fr)',
              marginBottom: 30,
            }),
          ),
        ],
        [
          ...artifactCards.map((card) =>
            h.div(
              [h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '12px 14px' }))],
              [
                h.div(
                  [
                    h.Style(
                      sx({
                        color: card.titleColor ?? 'var(--tt-fg)',
                        fontSize: 12.5,
                        fontWeight: 700,
                        marginBottom: 5,
                      }),
                    ),
                  ],
                  [card.title],
                ),
                h.div(
                  [
                    h.Style(
                      sx({
                        color: 'var(--tt-comment)',
                        fontSize: 12,
                        lineHeight: 1.5,
                        marginBottom: 7,
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
                        fontSize: 11.5,
                        padding: '6px 9px',
                      }),
                    ),
                  ],
                  card.snippet,
                ),
              ],
            ),
          ),
        ],
      ),
      sectionKicker({ style: { marginBottom: 10 } }, ['the run browser'], h),
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
              h.span([h.Style(sx({ color: 'var(--tt-teal)', fontWeight: 700 }))], ['browse']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['run-7af3 · arc-conventional-commits']),
            ],
          ),
          h.div(
            [h.Style(sx({ display: 'flex', fontSize: 11, gap: 8, padding: 10 }))],
            [
              h.div(
                [
                  h.Style(
                    sx({
                      display: 'flex',
                      flex: 'none',
                      flexDirection: 'column',
                      gap: 6,
                      width: 184,
                    }),
                  ),
                ],
                [
                  h.div(
                    [h.Style(sx(browserPanelStyle))],
                    [
                      h.div([h.Style(sx(browserPanelHeaderStyle))], ['Skills']),
                      h.div(
                        [h.Style(sx({ padding: '3px 8px' }))],
                        [
                          h.div(
                            [],
                            [
                              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['arc-conventional-commits']),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                  h.div(
                    [
                      h.Style(
                        sx({
                          border: '1px solid var(--tt-border-active)',
                          borderRadius: 6,
                          overflow: 'hidden',
                        }),
                      ),
                    ],
                    [
                      h.div(
                        [
                          h.Style(
                            sx({
                              background: 'var(--tt-bg)',
                              borderBottom: '1px solid var(--tt-border)',
                              color: 'var(--tt-blue)',
                              padding: '2px 8px',
                            }),
                          ),
                        ],
                        ['Cases'],
                      ),
                      h.div(
                        [h.Style(sx({ padding: '3px 8px' }))],
                        [
                          h.div(
                            [h.Style(sx({ background: 'var(--tt-selection)', borderRadius: 3, padding: '0 3px' }))],
                            [
                              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['trigger-explicit']),
                            ],
                          ),
                          h.div(
                            [],
                            [
                              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['execution-golden-path']),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                  h.div(
                    [h.Style(sx(browserPanelStyle))],
                    [
                      h.div([h.Style(sx(browserPanelHeaderStyle))], ['Assertions']),
                      h.div(
                        [h.Style(sx({ padding: '3px 8px' }))],
                        [
                          h.div(
                            [],
                            [
                              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                              h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], ['file-exists']),
                            ],
                          ),
                          h.div(
                            [],
                            [
                              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                              h.span([h.Style(sx({ color: 'var(--tt-magenta)' }))], ['llm-judge']),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                  h.div(
                    [h.Style(sx(browserPanelStyle))],
                    [
                      h.div([h.Style(sx(browserPanelHeaderStyle))], ['Runs']),
                      h.div(
                        [h.Style(sx({ padding: '3px 8px' }))],
                        [
                          h.div(
                            [],
                            [
                              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['dogfood-1 ']),
                              h.span([h.Style(sx({ color: 'var(--tt-magenta)' }))], ['⇄']),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      border: '1px solid var(--tt-border)',
                      borderRadius: 6,
                      flex: 1,
                      lineHeight: 1.7,
                      minWidth: 0,
                      padding: '10px 12px',
                    }),
                  ),
                ],
                [
                  h.div([h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 10, fontWeight: 700 }))], ['PROMPT']),
                  h.div(
                    [h.Style(sx({ color: 'var(--tt-fg)', marginBottom: 8 }))],
                    ['Set up semantic-release in this repo.'],
                  ),
                  h.div(
                    [h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 10, fontWeight: 700 }))],
                    ['GRADING  ', h.span([h.Style(sx({ color: 'var(--tt-green)', fontWeight: 400 }))], ['3/3 passed'])],
                  ),
                  h.div(
                    [],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                      h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], ['file-exists']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [' .releaserc.json']),
                    ],
                  ),
                  h.div(
                    [],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                      h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], ['regex-match']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [' conventionalcommits']),
                    ],
                  ),
                  h.div(
                    [],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['✓ ']),
                      h.span([h.Style(sx({ color: 'var(--tt-magenta)' }))], ['llm-judge']),
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [' summarizes plugins']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ marginTop: 8 }))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['with ']),
                      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['▓▓▓▓▓▓']),
                      h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' 3/3  ']),
                      h.span([h.Style(sx({ color: 'var(--tt-green)', fontWeight: 700 }))], ['Δ +16.7%']),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11.5, lineHeight: 1.6 }))],
        [
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['browse']),
          ' reads these files into the four-panel viewer. ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['review']),
          ' renders the same run as a static report and captures your notes in ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['feedback.json']),
          ', which ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['improve']),
          ' reads.',
        ],
      ),
    ],
  );
