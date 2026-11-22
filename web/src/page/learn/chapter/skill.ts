import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import type { Message } from '../message';
import { callout, chapterHeader, pageStyle, sectionKicker } from './ui';

const disclosureRows = [
  {
    color: 'var(--tt-blue)',
    label: 'metadata',
    tokens: '~40 tok',
    width: '5%',
    when: 'always in context',
  },
  {
    color: 'var(--tt-green)',
    label: 'SKILL.md body',
    tokens: '~700 tok',
    width: '32%',
    when: 'loaded on trigger',
  },
  {
    color: 'var(--tt-magenta)',
    label: 'bundled files',
    tokens: 'many k',
    width: '100%',
    when: 'only when read',
  },
];

const matchRows = [
  {
    selected: true,
    name: 'arc-conventional-commits',
    verdict: 'selected',
  },
  {
    selected: false,
    name: 'release-please',
    verdict: 'near miss',
  },
  {
    selected: false,
    name: 'arc-changelog',
    verdict: 'unrelated',
  },
];

const bodyRows = [
  { label: 'when to use', desc: 'the situations, restated for the agent mid-task' },
  { label: 'steps', desc: 'the procedure, in order' },
  { label: 'examples', desc: 'concrete input → output pairs' },
  { label: 'edge cases', desc: 'what to do when the input is weird or out of scope' },
  { label: 'references', desc: 'pointers to bundled files, loaded only when read' },
];

export const view = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx(pageStyle))],
    [
      chapterHeader({ num: '02', title: 'Anatomy of a skill' }, h),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 30, maxWidth: 800 }))],
        [
          "a skill is a folder the agent pulls into context when it's relevant. exactly one file is required. ",
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['SKILL.md']),
          ". and everything else (scripts, references, an eval suite) is optional and loaded only when it's needed.",
        ],
      ),
      sectionKicker({}, ['SKILL.md, annotated'], h),
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              fontSize: 12.5,
              lineHeight: 2,
              marginBottom: 14,
              padding: '16px 18px',
            }),
          ),
        ],
        [
          h.div([h.Style(sx({ color: 'var(--tt-comment)' }))], ['---']),
          h.div(
            [h.Style(sx({ display: 'flex', gap: 14 }))],
            [
              h.span(
                [h.Style(sx({ flex: 1, minWidth: 0 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['name']),
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['arc-conventional-commits']),
                ],
              ),
              h.span(
                [h.Style(sx({ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }))],
                ['← matched against the request'],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ display: 'flex', gap: 14 }))],
            [
              h.span(
                [h.Style(sx({ flex: 1, minWidth: 0 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['description']),
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['Set up & enforce Conventional']),
                ],
              ),
              h.span([h.Style(sx({ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }))], ['← the trigger signal']),
            ],
          ),
          h.div([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['  Commits. Use when a repo needs release']),
          h.div([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['  automation or commit-message rules.']),
          h.div([h.Style(sx({ color: 'var(--tt-comment)' }))], ['---']),
          h.div(
            [h.Style(sx({ display: 'flex', gap: 14 }))],
            [
              h.span(
                [h.Style(sx({ color: 'var(--tt-fg-dark)', flex: 1, minWidth: 0 }))],
                ['# When to use / steps / examples…'],
              ),
              h.span([h.Style(sx({ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }))], ['← body: loaded on trigger']),
            ],
          ),
        ],
      ),
      callout(
        { accent: 'orange', style: { marginBottom: 32 } },
        [
          h.span(
            [h.Style(sx({ color: 'var(--tt-orange)', fontWeight: 700 }))],
            ['name and description control invocation.'],
          ),
          " they're the only part always in context, so they alone decide whether the skill fires. write the description for the situations it should trigger in. not just what it does.",
        ],
        h,
      ),
      sectionKicker({ style: { marginBottom: 16 } }, ['progressive disclosure. what loads, when'], h),
      h.div(
        [h.Style(sx({ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }))],
        [
          ...disclosureRows.map((row) =>
            h.div(
              [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 14 }))],
              [
                h.span(
                  [
                    h.Style(
                      sx({
                        color: row.color,
                        flex: 'none',
                        fontSize: 13,
                        fontWeight: 700,
                        width: 118,
                      }),
                    ),
                  ],
                  [row.label],
                ),
                h.span(
                  [
                    h.Style(
                      sx({
                        color: 'var(--tt-comment)',
                        flex: 'none',
                        fontSize: 11.5,
                        textAlign: 'right',
                        width: 62,
                      }),
                    ),
                  ],
                  [row.tokens],
                ),
                h.div(
                  [
                    h.Style(
                      sx({
                        background: 'var(--tt-bg-dark)',
                        borderRadius: 4,
                        flex: 1,
                        height: 16,
                        overflow: 'hidden',
                      }),
                    ),
                  ],
                  [h.div([h.Style(sx({ background: row.color, height: '100%', width: row.width }))])],
                ),
                h.span(
                  [h.Style(sx({ color: 'var(--tt-comment)', flex: 'none', fontSize: 11.5, width: 132 }))],
                  [row.when],
                ),
              ],
            ),
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 30 }))],
        [
          'the agent pays for what it uses. cheap metadata is always present so matching is fast; the heavier material only enters context once the skill is actually in play.',
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
              padding: '14px 16px',
            }),
          ),
        ],
        [
          h.div([], [h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['arc-conventional-commits/'])]),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['SKILL.md']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['            name + description + instructions']),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['reference/preset.md']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['  read on demand']),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['scripts/check.sh']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['     deterministic helper']),
            ],
          ),
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['└─ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['evals/evals.json']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['     the eval suite ']),
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['← what we grade']),
            ],
          ),
        ],
      ),
      sectionKicker({ style: { margin: '34px 0 8px' } }, ['write the invocation description'], h),
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
          'a description does two jobs: say ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['what']),
          ' the skill does, and name the ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['situations']),
          " it should fire in. the second is the part most people forget. and it's what makes the difference between a skill that triggers and one that sits unused.",
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
                  borderLeft: '2px solid var(--tt-red)',
                  borderRadius: 8,
                  padding: '12px 14px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-red)', fontSize: 12, fontWeight: 700, marginBottom: 6 }))],
                ['✗ too vague'],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      background: 'var(--tt-bg-dark)',
                      borderRadius: 5,
                      color: 'var(--tt-fg-dark)',
                      fontSize: 12,
                      marginBottom: 7,
                      padding: '8px 10px',
                    }),
                  ),
                ],
                ['"Helps with commits."'],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }))],
                ["no situations, no nouns the request will contain. the agent can't tell when to reach for it."],
              ),
            ],
          ),
          h.div(
            [
              h.Style(
                sx({
                  border: '1px solid var(--tt-border)',
                  borderLeft: '2px solid var(--tt-green)',
                  borderRadius: 8,
                  padding: '12px 14px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700, marginBottom: 6 }))],
                ['✓ specific + situational'],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      background: 'var(--tt-bg-dark)',
                      borderRadius: 5,
                      color: 'var(--tt-fg-dark)',
                      fontSize: 12,
                      marginBottom: 7,
                      padding: '8px 10px',
                    }),
                  ),
                ],
                [
                  '"Set up & enforce Conventional Commits. semantic-release, commitlint, release automation. Use when a repo needs versioned releases or commit rules."',
                ],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }))],
                ['verbs + nouns + the moments it applies.'],
              ),
            ],
          ),
        ],
      ),
      sectionKicker({ style: { marginBottom: 14 } }, ['how matching works'], h),
      h.div(
        [
          h.Style(
            sx({
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              marginBottom: 12,
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
                  maxWidth: 230,
                  padding: '11px 14px',
                }),
              ),
            ],
            [
              h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11, marginBottom: 3 }))], ['request']),
              h.div(
                [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12, lineHeight: 1.45 }))],
                ['"Automate our releases from commit messages."'],
              ),
            ],
          ),
          h.div(
            [
              h.Style(
                sx({
                  alignItems: 'center',
                  color: 'var(--tt-comment)',
                  display: 'flex',
                  flexDirection: 'column',
                  fontSize: 11,
                }),
              ),
            ],
            [
              h.span([], ['compared vs']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 16 }))], ['→']),
              h.span([], ['name+description']),
            ],
          ),
          h.div(
            [
              h.Style(
                sx({
                  display: 'flex',
                  flex: 1,
                  flexDirection: 'column',
                  gap: 6,
                  minWidth: 240,
                }),
              ),
            ],
            [
              ...matchRows.map((row) =>
                h.div(
                  [
                    h.Style(
                      sx({
                        alignItems: 'center',
                        border: '1px solid var(--tt-border)',
                        borderLeft: row.selected ? '2px solid var(--tt-green)' : '1px solid var(--tt-border)',
                        borderRadius: 6,
                        display: 'flex',
                        gap: 9,
                        padding: '7px 11px',
                      }),
                    ),
                  ],
                  [
                    h.span(
                      [
                        h.Style(
                          sx({
                            color: row.selected ? 'var(--tt-green)' : 'var(--tt-dim)',
                            fontWeight: row.selected ? 700 : 400,
                          }),
                        ),
                      ],
                      [row.selected ? '✓' : '✗'],
                    ),
                    h.span(
                      [
                        h.Style(
                          sx({
                            color: row.selected ? 'var(--tt-fg)' : 'var(--tt-comment)',
                            flex: 1,
                            fontSize: 12.5,
                          }),
                        ),
                      ],
                      [row.name],
                    ),
                    h.span(
                      [
                        h.Style(
                          sx({
                            color: row.selected ? 'var(--tt-green)' : 'var(--tt-dim)',
                            fontSize: 11,
                          }),
                        ),
                      ],
                      [row.verdict],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }))],
        [
          'only metadata is compared, so the description is the whole pitch. once a skill wins, its SKILL.md body loads and the agent follows it.',
        ],
      ),
      sectionKicker({}, ['inside the body'], h),
      h.div(
        [
          h.Style(
            sx({
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              marginBottom: 14,
              overflow: 'hidden',
            }),
          ),
        ],
        [
          ...bodyRows.map((row, index) =>
            h.div(
              [
                h.Style(
                  sx({
                    borderBottom: index < bodyRows.length - 1 ? '1px solid var(--tt-dim)' : undefined,
                    display: 'flex',
                    fontSize: 12.5,
                    gap: 12,
                    padding: '9px 14px',
                  }),
                ),
              ],
              [
                h.span([h.Style(sx({ color: 'var(--tt-yellow)', flex: 'none', width: 96 }))], [row.label]),
                h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [row.desc]),
              ],
            ),
          ),
        ],
      ),
      callout(
        { accent: 'teal' },
        [
          h.span([h.Style(sx({ color: 'var(--tt-teal)', fontWeight: 700 }))], ['keep the body lean.']),
          ' everything in SKILL.md loads on every trigger. push depth into ',
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['reference/']),
          ' files the agent opens only when it needs them, and let evals catch what the instructions miss.',
        ],
        h,
      ),
    ],
  );
