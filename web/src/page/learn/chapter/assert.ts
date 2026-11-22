import { inertHtml as ih, type Html, type HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import type { Message } from '../message';
import { callout, chapterHeader, pageStyle, sectionKicker, type Children } from './ui';

type AssertionType = Readonly<{ title: string; snippet: Children; desc: Children }>;

const deterministicTypes: ReadonlyArray<AssertionType> = [
  {
    title: 'file-exists',
    snippet: [
      '{ "type": ',
      ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['"file-exists"']),
      ', "path": ".releaserc.json" }',
    ],
    desc: [
      'passes if the path was written. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['use when']),
      ' the skill must produce a file. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-orange)' }))], ['gotcha:']),
      " assert the real output, never one the skill doesn't make.",
    ],
  },
  {
    title: 'file-absent',
    snippet: [
      '{ "type": ',
      ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['"file-absent"']),
      ', "path": ".releaserc.json" }',
    ],
    desc: [
      'passes if the path was ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['not']),
      ' written. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['use when']),
      ' a negative case must leave the repo untouched. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-orange)' }))], ['gotcha:']),
      " pair with a fixture that shouldn't trigger the skill.",
    ],
  },
  {
    title: 'regex-match',
    snippet: [
      '{ "type": ',
      ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['"regex-match"']),
      ', "pattern": "conventionalcommits" }',
    ],
    desc: [
      'passes if the pattern appears in the file. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['use when']),
      ' content must contain something specific. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-orange)' }))], ['gotcha:']),
      ' match structure, not incidental prose.',
    ],
  },
  {
    title: 'json-valid',
    snippet: [
      '{ "type": ',
      ih.span([ih.Style(sx({ color: 'var(--tt-cyan)' }))], ['"json-valid"']),
      ', "path": "evals/evals.json" }',
    ],
    desc: [
      'passes if the file parses as JSON. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['use when']),
      ' output is config or a manifest. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-orange)' }))], ['gotcha:']),
      ' add a regex-match to also check its shape.',
    ],
  },
];

const behaviorTypes: ReadonlyArray<AssertionType> = [
  {
    title: 'tool-call-required',
    snippet: [
      '{ "kind": ',
      ih.span([ih.Style(sx({ color: 'var(--tt-blue)' }))], ['"behavior"']),
      ', "method": "tool-call-required", "value": "Write" }',
    ],
    desc: [
      'passes if the run actually called that tool. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['use when']),
      ' the ',
      ih.em([], ['process']),
      ' is the claim. add ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['"match"']),
      ' to check the tool input.',
    ],
  },
  {
    title: 'tool-call-forbidden',
    snippet: [
      '{ "kind": ',
      ih.span([ih.Style(sx({ color: 'var(--tt-blue)' }))], ['"behavior"']),
      ', "method": "tool-call-forbidden", "value": "Bash" }',
    ],
    desc: [
      'passes if the tool was ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['never']),
      ' called. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-orange)' }))], ['gotcha:']),
      ' tool names are case-sensitive , ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['Write']),
      ', not ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['write']),
      '.',
    ],
  },
  {
    title: 'skill-read-required',
    snippet: [
      '{ "kind": ',
      ih.span([ih.Style(sx({ color: 'var(--tt-blue)' }))], ['"behavior"']),
      ', "method": "skill-read-required", "value": "<skill>" }',
    ],
    desc: [
      'passes if the skill was actually read from disk. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['use when']),
      ' a routing case must prove the skill loaded.',
    ],
  },
  {
    title: 'no-forbidden-files-touched',
    snippet: [
      '{ "kind": ',
      ih.span([ih.Style(sx({ color: 'var(--tt-blue)' }))], ['"safety"']),
      ', "method": "no-forbidden-files-touched", "config": { "paths": [".env"] } }',
    ],
    desc: [
      'passes if none of those paths were written or edited. ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['use when']),
      ' a run must leave sensitive files untouched.',
    ],
  },
];

// Not yet gradeable — declared honestly so authors don't write checks that
// silently never run. Track them; don't ship suites that depend on them.
const roadmap: ReadonlyArray<Readonly<{ label: string; desc: Children }>> = [
  {
    label: 'not-regex',
    desc: [
      'a pattern must NOT appear. e.g. no hardcoded ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['npm publish']),
    ],
  },
  {
    label: 'json-path',
    desc: [
      'a value at a key equals X , ',
      ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['.on == "pull_request"']),
    ],
  },
  {
    label: 'command-exit',
    desc: ["a script or the project's own test exits ", ih.span([ih.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['0'])],
  },
  { label: 'count', desc: ['exactly N matches, not merely ≥ 1'] },
];

const judgeFailures = [
  {
    title: 'self-grading',
    desc: 'the model grading its own output → pin a different --judge-model',
  },
  { title: 'vague rubric', desc: 'unmeasurable criteria → make it observable + binary' },
  {
    title: 'verdict drift',
    desc: 'nondeterministic passes → prefer deterministic; keep rubrics tight',
  },
  { title: 'wording bias', desc: 'rewarding phrasing over substance' },
];

export const view = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx(pageStyle))],
    [
      chapterHeader({ num: '04', title: 'Writing assertions' }, h),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 28, maxWidth: 820 }))],
        [
          'an assertion is a single check with a boolean result. climb the ladder and stop at the cheapest rung that proves the claim: ',
          h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], ['deterministic']),
          ' (a script reads the files) → ',
          h.span([h.Style(sx({ color: 'var(--tt-blue)' }))], ['behavior']),
          ' (the run trace is inspected) → ',
          h.span([h.Style(sx({ color: 'var(--tt-magenta)' }))], ['llm-judge']),
          ' (a rubric decides. burns tokens, keep it last).',
        ],
      ),
      sectionKicker({ style: { marginBottom: 14 } }, ['choosing a check'], h),
      h.div(
        [
          h.Style(
            sx({
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 18,
              marginBottom: 30,
            }),
          ),
        ],
        [
          h.div(
            [
              h.Style(
                sx({
                  border: '1px solid var(--tt-border-active)',
                  borderRadius: 8,
                  color: 'var(--tt-fg)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  padding: '12px 16px',
                }),
              ),
            ],
            ['can a script verify it', h.br([]), 'exactly, every time?'],
          ),
          h.div(
            [h.Style(sx({ display: 'flex', flexDirection: 'column', gap: 10 }))],
            [
              h.div(
                [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 10 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700 }))], ['yes →']),
                  h.span(
                    [
                      h.Style(
                        sx({
                          border: '1px solid var(--tt-border)',
                          borderLeft: '2px solid var(--tt-cyan)',
                          borderRadius: 6,
                          color: 'var(--tt-cyan)',
                          fontSize: 12.5,
                          padding: '8px 12px',
                        }),
                      ),
                    ],
                    ['deterministic assertion'],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 10 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-orange)', fontSize: 12, fontWeight: 700 }))], ['no  →']),
                  h.span(
                    [
                      h.Style(
                        sx({
                          border: '1px solid var(--tt-border)',
                          borderLeft: '2px solid var(--tt-magenta)',
                          borderRadius: 6,
                          color: 'var(--tt-magenta)',
                          fontSize: 12.5,
                          padding: '8px 12px',
                        }),
                      ),
                    ],
                    ['llm-judge assertion'],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      sectionKicker({}, ['deterministic types, one by one'], h),
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
          ...deterministicTypes.map((type) =>
            h.div(
              [h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }))],
              [
                h.div(
                  [h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 13, fontWeight: 700, marginBottom: 8 }))],
                  [type.title],
                ),
                h.div(
                  [
                    h.Style(
                      sx({
                        background: 'var(--tt-bg-dark)',
                        borderRadius: 5,
                        color: 'var(--tt-fg-dark)',
                        fontSize: 11.5,
                        marginBottom: 8,
                        padding: '8px 10px',
                      }),
                    ),
                  ],
                  type.snippet,
                ),
                h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55 }))], type.desc),
              ],
            ),
          ),
        ],
      ),
      sectionKicker({}, ['behavior and safety checks from the run trace'], h),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.6, marginBottom: 14, maxWidth: 820 }))],
        [
          'still deterministic. no judge. but they read what the run ',
          h.em([], ['did']),
          ' (tool calls, skill reads, touched files) instead of the files it left behind. reach for these when the ',
          h.span([h.Style(sx({ color: 'var(--tt-blue)' }))], ['process']),
          ' is the claim, before writing a prose rubric.',
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(2, 1fr)',
              marginBottom: 22,
            }),
          ),
        ],
        [
          ...behaviorTypes.map((type) =>
            h.div(
              [h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }))],
              [
                h.div(
                  [h.Style(sx({ color: 'var(--tt-blue)', fontSize: 13, fontWeight: 700, marginBottom: 8 }))],
                  [type.title],
                ),
                h.div(
                  [
                    h.Style(
                      sx({
                        background: 'var(--tt-bg-dark)',
                        borderRadius: 5,
                        color: 'var(--tt-fg-dark)',
                        fontSize: 11,
                        lineHeight: 1.5,
                        marginBottom: 8,
                        padding: '8px 10px',
                        wordBreak: 'break-word',
                      }),
                    ),
                  ],
                  type.snippet,
                ),
                h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55 }))], type.desc),
              ],
            ),
          ),
        ],
      ),
      sectionKicker({}, ['gate vs soft'], h),
      h.div(
        [
          h.Style(
            sx({
              border: '1px solid var(--tt-border)',
              borderLeft: '2px solid var(--tt-blue)',
              borderRadius: 8,
              color: 'var(--tt-comment)',
              fontSize: 12.5,
              lineHeight: 1.6,
              marginBottom: 30,
              maxWidth: 820,
              padding: '12px 15px',
            }),
          ),
        ],
        [
          'by default every failed assertion fails the run. mark one ',
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['"mustPass": false']),
          ' or ',
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['"severity": "warn"']),
          ' to make a miss ',
          h.span([h.Style(sx({ color: 'var(--tt-blue)' }))], ['soft']),
          ". it's recorded in ",
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['grading.json']),
          " but doesn't break the build. use soft for style and quality signals; run ",
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['--strict']),
          ' in CI when you want them to gate too.',
        ],
      ),
      sectionKicker({}, ['an llm-judge assertion'], h),
      h.div(
        [
          h.Style(
            sx({
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              marginBottom: 24,
              padding: '14px 16px',
            }),
          ),
        ],
        [
          h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11, marginBottom: 4 }))], ['RUBRIC']),
          h.div(
            [h.Style(sx({ color: 'var(--tt-fg)', fontSize: 13, marginBottom: 14 }))],
            ['"The response summarizes the semantic-release plugins it installed."'],
          ),
          h.div(
            [h.Style(sx({ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }))],
            [
              h.div(
                [
                  h.Style(
                    sx({
                      background: 'var(--tt-bg-dark)',
                      borderLeft: '2px solid var(--tt-green)',
                      borderRadius: 6,
                      padding: '10px 12px',
                    }),
                  ),
                ],
                [
                  h.div(
                    [h.Style(sx({ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700, marginBottom: 5 }))],
                    ['✓ pass'],
                  ),
                  h.div(
                    [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12, lineHeight: 1.5 }))],
                    ['"installs @semantic-release/commit-analyzer and release-notes-generator"'],
                  ),
                ],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      background: 'var(--tt-bg-dark)',
                      borderLeft: '2px solid var(--tt-red)',
                      borderRadius: 6,
                      padding: '10px 12px',
                    }),
                  ),
                ],
                [
                  h.div(
                    [h.Style(sx({ color: 'var(--tt-red)', fontSize: 12, fontWeight: 700, marginBottom: 5 }))],
                    ['✗ fail'],
                  ),
                  h.div(
                    [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12, lineHeight: 1.5 }))],
                    ['"Done. semantic-release is set up.". names no plugins'],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      sectionKicker({}, ['a healthy mix'], h),
      h.div(
        [
          h.Style(
            sx({
              borderRadius: 5,
              display: 'flex',
              height: 22,
              marginBottom: 10,
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
                  background: 'var(--tt-cyan)',
                  color: 'var(--tt-bg-dark)',
                  display: 'flex',
                  fontSize: 11,
                  fontWeight: 700,
                  paddingLeft: 12,
                  width: '70%',
                }),
              ),
            ],
            ['deterministic  ~70%'],
          ),
          h.div(
            [
              h.Style(
                sx({
                  alignItems: 'center',
                  background: 'var(--tt-magenta)',
                  color: 'var(--tt-bg-dark)',
                  display: 'flex',
                  fontSize: 11,
                  fontWeight: 700,
                  paddingLeft: 12,
                  width: '30%',
                }),
              ),
            ],
            ['judge  ~30%'],
          ),
        ],
      ),
      callout(
        { accent: 'orange', style: { marginBottom: 34 } },
        [
          h.span([h.Style(sx({ color: 'var(--tt-orange)', fontWeight: 700 }))], ['pin the judge.']),
          ' deterministic checks are fast, free and repeatable. lean on them. the judge is powerful for prose but slower, costs tokens, and can drift run to run, so pass ',
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['--judge-model']),
          ' explicitly and never let a model grade its own output.',
        ],
        h,
      ),
      sectionKicker({}, ['anatomy of an assertion'], h),
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
            [h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }))],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 12, fontWeight: 700, marginBottom: 8 }))],
                ['deterministic. fields'],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      background: 'var(--tt-bg-dark)',
                      borderRadius: 6,
                      fontSize: 12,
                      lineHeight: 1.9,
                      padding: '10px 12px',
                    }),
                  ),
                ],
                [
                  h.div([], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['{'])]),
                  h.div(
                    [h.Style(sx({ display: 'flex', gap: 10, paddingLeft: '2ch' }))],
                    [
                      h.span(
                        [h.Style(sx({ flex: 1, minWidth: 0 }))],
                        [
                          h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"type"']),
                          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
                          h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], ['"regex-match"']),
                          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
                        ],
                      ),
                      h.span([h.Style(sx({ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }))], ['← the check']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ display: 'flex', gap: 10, paddingLeft: '2ch' }))],
                    [
                      h.span(
                        [h.Style(sx({ flex: 1, minWidth: 0 }))],
                        [
                          h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"path"']),
                          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
                          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['"commitlint.config.js"']),
                          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
                        ],
                      ),
                      h.span([h.Style(sx({ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }))], ['← where']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx({ display: 'flex', gap: 10, paddingLeft: '2ch' }))],
                    [
                      h.span(
                        [h.Style(sx({ flex: 1, minWidth: 0 }))],
                        [
                          h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"pattern"']),
                          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
                          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['"config-conventional"']),
                        ],
                      ),
                      h.span([h.Style(sx({ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }))], ['← what']),
                    ],
                  ),
                  h.div([], [h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['}'])]),
                ],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }))],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-magenta)', fontSize: 12, fontWeight: 700, marginBottom: 8 }))],
                ['judge. a single criterion'],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      background: 'var(--tt-bg-dark)',
                      borderRadius: 6,
                      color: 'var(--tt-fg-dark)',
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      marginBottom: 8,
                      padding: '10px 12px',
                    }),
                  ),
                ],
                ['"The workflow triggers on pull_request, not push."'],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55 }))],
                ['one observable claim, graded true / false. not a paragraph, not a checklist.'],
              ),
            ],
          ),
        ],
      ),
      sectionKicker({}, ['planned checks that are not yet supported'], h),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 12, maxWidth: 820 }))],
        [
          'shapes we want but the runner does ',
          h.span([h.Style(sx({ color: 'var(--tt-orange)' }))], ['not']),
          " grade yet. don't depend on them in a suite you rely on. express the same intent today with the checks above (e.g. ",
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['not-regex']),
          ' → a ',
          h.span([h.Style(sx({ color: 'var(--tt-blue)' }))], ['command-forbidden']),
          ' or a judge claim).',
        ],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 32 }))],
        [
          ...roadmap.map((item) =>
            h.div(
              [
                h.Style(
                  sx({
                    border: '1px dashed var(--tt-border)',
                    borderRadius: 7,
                    display: 'flex',
                    fontSize: 12.5,
                    gap: 12,
                    opacity: 0.75,
                    padding: '9px 13px',
                  }),
                ),
              ],
              [
                h.span([h.Style(sx({ color: 'var(--tt-dim)', flex: 'none', width: 118 }))], [item.label]),
                h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], item.desc),
              ],
            ),
          ),
        ],
      ),
      sectionKicker({}, ['writing a good rubric'], h),
      h.div(
        [
          h.Style(
            sx({
              display: 'grid',
              gap: 12,
              gridTemplateColumns: '1fr 1fr',
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
                  borderLeft: '2px solid var(--tt-red)',
                  borderRadius: 8,
                  padding: '11px 14px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-red)', fontSize: 12, fontWeight: 700, marginBottom: 6 }))],
                ['✗ weak'],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.5 }))],
                ['"The response is good and helpful."'],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11.5, marginTop: 6 }))],
                ['subjective. two people (or two runs) disagree.'],
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
                  padding: '11px 14px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700, marginBottom: 6 }))],
                ['✓ strong'],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.5 }))],
                ['"Names each semantic-release plugin it installed."'],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11.5, marginTop: 6 }))],
                ['one observable claim, gradable the same way twice.'],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }))],
        [
          ...['one claim', 'observable', 'binary', 'about behavior, not phrasing'].map((label) =>
            h.span(
              [
                h.Style(
                  sx({
                    border: '1px solid var(--tt-border)',
                    borderRadius: 5,
                    color: 'var(--tt-fg-dark)',
                    fontSize: 11.5,
                    padding: '3px 9px',
                  }),
                ),
              ],
              [label],
            ),
          ),
        ],
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['grade hard'], h),
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
          'a PASS needs concrete evidence that quotes or references the output. never the benefit of the doubt. if the rubric says "includes a summary" and the output has a section titled Summary with one vague sentence, that\'s a ',
          h.span([h.Style(sx({ color: 'var(--tt-red)' }))], ['FAIL']),
          ". the label is there, the substance isn't. and while grading, grade the assertions themselves: too easy, too hard, or unverifiable ones get fixed for the next iteration.",
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.9,
              marginBottom: 32,
              padding: '12px 15px',
            }),
          ),
        ],
        [
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['{ ']),
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"passed"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
              h.span([h.Style(sx({ color: 'var(--tt-red)' }))], ['false']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '2ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"text"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['"Both axes are labeled"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [',']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '2ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['"evidence"']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [': ']),
              h.span(
                [h.Style(sx({ color: 'var(--tt-fg-dark)' }))],
                ['"Y-axis reads \'Revenue ($)\' but the X-axis has no label"'],
              ),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [' }']),
            ],
          ),
        ],
      ),
      sectionKicker({}, ['judge failure modes'], h),
      h.div(
        [h.Style(sx({ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }))],
        [
          ...judgeFailures.map((failure) =>
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
                      [failure.title],
                    ),
                    h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }))], [failure.desc]),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    ],
  );
