import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import { piFrame, piSpinner, piToolName, piTools, playbackLabel } from '../animation';
import { Message } from '../message';
import type { PiDemo } from '../model';
import { callout, chapterHeader, fadeStyle, pageStyle, sectionKicker, trafficDots } from './ui';

const providers = ['anthropic', 'openai', 'google', 'mistral', 'xai', 'ollama / ollama-cloud', 'deepseek', 'groq'];

export const view = (demo: PiDemo, h: HtmlBuilder<Message>): Html => {
  const pi = piFrame(demo);
  const tools = piTools(demo);
  const spinner = piSpinner(demo);
  const toolName = piToolName(demo);

  return h.div(
    [h.Style(sx(pageStyle))],
    [
      chapterHeader({ num: '07', title: 'The Pi runtime' }, h),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 28, maxWidth: 820 }))],
        [
          'every case executes through the ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['Pi']),
          ' coding agent (',
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['@earendil-works/pi-coding-agent']),
          '). the choice is philosophical as much as technical: an agent is ',
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['an llm, a loop, and enough tokens']),
          '. in code, that means a tool registry, an inner loop, and a parser. production complexity is engineering, not architecture.',
        ],
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['why a small harness'], h),
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
          'an eval is only as trustworthy as the machinery between the prompt and the trace. a small, legible runtime means the artifacts describe the ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ["skill's"]),
          " behavior, not a framework's.",
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
                  gap: 6,
                  padding: '7px 12px',
                }),
              ),
            ],
            [
              ...trafficDots(h),
              h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11, marginLeft: 8 }))], ['the pi loop']),
              h.span([h.Style(sx({ flex: 1 }))]),
              h.span(
                [
                  h.OnClick(Message.ClickedPiDemoPlayback()),
                  h.Style(sx({ color: 'var(--tt-comment)', cursor: 'pointer', fontSize: 11 })),
                ],
                [playbackLabel(demo.playback)],
              ),
              h.span(
                [
                  h.OnClick(Message.ClickedPiDemoReplay()),
                  h.Style(sx({ color: 'var(--tt-comment)', cursor: 'pointer', fontSize: 11 })),
                ],
                ['↻ replay'],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ padding: '16px 16px 6px' }))],
            [
              h.div(
                [
                  h.Style(
                    sx({
                      alignItems: 'center',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 14,
                      marginBottom: 12,
                    }),
                  ),
                ],
                [
                  h.div(
                    [
                      h.Style(
                        sx({
                          ...fadeStyle(pi.prompt),
                          background: 'var(--tt-bg)',
                          border: '1px solid var(--tt-border)',
                          borderRadius: 8,
                          padding: '11px 14px',
                        }),
                      ),
                    ],
                    [
                      h.div(
                        [
                          h.Style(
                            sx({
                              color: 'var(--tt-yellow)',
                              fontSize: 12,
                              fontWeight: 700,
                              marginBottom: 2,
                            }),
                          ),
                        ],
                        ['prompt + skill'],
                      ),
                      h.div(
                        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11.5 }))],
                        ['the case, in a fresh sandbox'],
                      ),
                    ],
                  ),
                  h.span([h.Style(sx({ ...fadeStyle(pi.arrow1), color: 'var(--tt-comment)', fontSize: 16 }))], ['→']),
                  h.div(
                    [
                      h.Style(
                        sx({
                          ...fadeStyle(pi.loop),
                          background: 'var(--tt-bg)',
                          border: '1px solid var(--tt-border-active)',
                          borderRadius: 8,
                          padding: '11px 14px',
                        }),
                      ),
                    ],
                    [
                      h.div(
                        [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 6 }))],
                        [
                          h.span(
                            [h.Style(sx({ color: 'var(--tt-blue)', fontSize: 12, fontWeight: 700 }))],
                            ['the loop'],
                          ),
                          h.span([h.Style(sx({ color: 'var(--tt-dim)', fontSize: 11 }))], ['↺ until done']),
                        ],
                      ),
                      h.div(
                        [h.Style(sx({ display: 'flex', gap: 6 }))],
                        [
                          ...tools.map((tool) =>
                            h.span(
                              [
                                h.Style(
                                  sx({
                                    background: tool.bg,
                                    border: `1px solid ${tool.border}`,
                                    borderRadius: 5,
                                    color: tool.color,
                                    fontSize: 11,
                                    padding: '2px 8px',
                                    transition: 'all .2s',
                                  }),
                                ),
                              ],
                              [tool.label],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  h.span([h.Style(sx({ ...fadeStyle(pi.arrow2), color: 'var(--tt-comment)', fontSize: 16 }))], ['→']),
                  h.div(
                    [
                      h.Style(
                        sx({
                          ...fadeStyle(pi.art),
                          background: 'var(--tt-bg)',
                          border: '1px solid var(--tt-green)',
                          borderRadius: 8,
                          padding: '11px 14px',
                        }),
                      ),
                    ],
                    [
                      h.div(
                        [
                          h.Style(
                            sx({
                              color: 'var(--tt-green)',
                              fontSize: 12,
                              fontWeight: 700,
                              marginBottom: 2,
                            }),
                          ),
                        ],
                        ['artifacts'],
                      ),
                      h.div(
                        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11.5 }))],
                        ['outputs/ · trace · grading'],
                      ),
                    ],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ fontSize: 12, lineHeight: 1.9, minHeight: 78 }))],
                [
                  h.div(
                    [h.Style(sx({ height: 22, position: 'relative' }))],
                    [
                      h.div(
                        [h.Style(sx({ ...fadeStyle(pi.running, 0.2), inset: 0, position: 'absolute' }))],
                        [
                          h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], [spinner]),
                          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [' llm turn → ']),
                          h.span([h.Style(sx({ color: 'var(--tt-cyan)' }))], [toolName]),
                          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [' · result feeds the next turn…']),
                        ],
                      ),
                      h.div(
                        [h.Style(sx({ ...fadeStyle(pi.done), inset: 0, position: 'absolute' }))],
                        [
                          h.span([h.Style(sx({ color: 'var(--tt-green)', fontWeight: 700 }))], ['✓ done']),
                          h.span(
                            [h.Style(sx({ color: 'var(--tt-comment)' }))],
                            [' · the model stopped calling tools and the artifacts are written'],
                          ),
                        ],
                      ),
                    ],
                  ),
                  h.div(
                    [h.Style(sx(fadeStyle(pi.l1)))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['every tool call, in order → ']),
                      h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['trace.json']),
                    ],
                  ),
                  h.div(
                    [h.Style(sx(fadeStyle(pi.l2)))],
                    [
                      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['tokens · cost · context used → ']),
                      h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['timing.json']),
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
        ["that's the whole story, with nothing hidden in a framework layer. when a check fails, the trace explains it."],
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['one flag, any model'], h),
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-comment)',
              fontSize: 12.5,
              lineHeight: 1.6,
              marginBottom: 12,
              maxWidth: 820,
            }),
          ),
        ],
        [
          "arc-skill-eval inherits Pi's provider registry, so the runner and the judge can each pin any configured model, or fall back to Pi's default when unpinned.",
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
              lineHeight: 1.9,
              marginBottom: 12,
              padding: '12px 15px',
            }),
          ),
        ],
        [
          h.div(
            [],
            [
              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
              h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['arc-skill-eval run ./skills/my-skill --compare \\']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '4ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['--model anthropic/claude-opus-4-5 \\']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['        # runs the case']),
            ],
          ),
          h.div(
            [h.Style(sx({ paddingLeft: '4ch' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['--judge-model mistral/ministral-8b-latest']),
              h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['  # grades the prose']),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }))],
        [
          ...providers.map((label) =>
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
      callout(
        { accent: 'orange', style: { marginBottom: 32 } },
        [
          h.span(
            [h.Style(sx({ color: 'var(--tt-orange)', fontWeight: 700 }))],
            ["the judge defaults to the runner's model."],
          ),
          " that means the model grades its own output. that is fine for smoke tests but biased for anything you'll act on. pin ",
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['--judge-model']),
          ' to a different model when the verdict matters. a small cheap judge (ministral-8b) grades tight rubrics well.',
        ],
        h,
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['an eval-owned runtime for reproducible runs'], h),
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-comment)',
              fontSize: 12.5,
              lineHeight: 1.6,
              marginBottom: 12,
              maxWidth: 820,
            }),
          ),
        ],
        [
          'by default the runner uses your personal Pi config (',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['~/.pi/agent']),
          "). for team and CI runs, that's a hidden variable. your default model isn't your teammate's. ",
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['init-runtime']),
          ' creates a tiny config the eval owns instead:',
        ],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }))],
        [
          h.div(
            [
              h.Style(
                sx({
                  background: 'var(--tt-bg-dark)',
                  border: '1px solid var(--tt-border)',
                  borderRadius: 8,
                  flex: 1,
                  fontSize: 12.5,
                  lineHeight: 1.9,
                  minWidth: 320,
                  padding: '12px 15px',
                }),
              ),
            ],
            [
              h.div(
                [],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-fg)' }))],
                    ['arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \\'],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ paddingLeft: '4ch' }))],
                [
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-fg-dark)' }))],
                    ['--provider ollama-cloud --model gpt-oss:20b'],
                  ),
                ],
              ),
              h.div([h.Style(sx({ height: 6 }))]),
              h.div(
                [],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['arc-skill-eval run ./skills/my-skill \\']),
                ],
              ),
              h.div(
                [h.Style(sx({ paddingLeft: '4ch' }))],
                [h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['--agent-dir ./.arc-skill-eval/pi-agent'])],
              ),
            ],
          ),
          h.div(
            [
              h.Style(
                sx({
                  background: 'var(--tt-bg-dark)',
                  border: '1px solid var(--tt-border)',
                  borderRadius: 8,
                  flex: 'none',
                  fontSize: 12.5,
                  lineHeight: 1.9,
                  padding: '12px 15px',
                  width: 300,
                }),
              ),
            ],
            [
              h.div([], [h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['.arc-skill-eval/pi-agent/'])]),
              h.div(
                [],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['├─ ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['models.json']),
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['    providers']),
                ],
              ),
              h.div(
                [],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['└─ ']),
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['settings.json']),
                  h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], ['  defaults']),
                ],
              ),
              h.div(
                [
                  h.Style(
                    sx({
                      color: 'var(--tt-comment)',
                      fontSize: 11.5,
                      lineHeight: 1.55,
                      marginTop: 8,
                    }),
                  ),
                ],
                [
                  "that's the whole runtime. keys stay out of it. reference secrets by env-var name (",
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['"apiKey": "OLLAMA_API_KEY"']),
                  '), never literal values.',
                ],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }))],
        [
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['run']),
          ' preflights the directory before executing anything. missing models.json, provider entries, or API-key env vars are reported once, with the ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['init-runtime']),
          ' fix named. a cheap lane like ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['ollama-cloud/gpt-oss:20b']),
          " makes good smoke tests; save the frontier model for the runs you'll act on.",
        ],
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['isolated by default: context modes'], h),
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-comment)',
              fontSize: 12.5,
              lineHeight: 1.6,
              marginBottom: 12,
              maxWidth: 820,
            }),
          ),
        ],
        ['the eval must measure the skill, not your personal setup, so by default nothing ambient is loaded.'],
      ),
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
                  borderLeft: '2px solid var(--tt-green)',
                  borderRadius: 8,
                  padding: '13px 15px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 6 }))],
                [
                  h.span(
                    [h.Style(sx({ color: 'var(--tt-green)', fontSize: 13, fontWeight: 700 }))],
                    ['--context-mode isolated'],
                  ),
                  h.span(
                    [
                      h.Style(
                        sx({
                          border: '1px solid var(--tt-border)',
                          borderRadius: 4,
                          color: 'var(--tt-comment)',
                          fontSize: 11,
                          padding: '1px 6px',
                        }),
                      ),
                    ],
                    ['default'],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }))],
                [
                  'no ambient Pi skills, extensions, prompt templates, themes, or context files. the model sees the target skill (plus any --extra-skill distractors) and nothing else.',
                ],
              ),
            ],
          ),
          h.div(
            [
              h.Style(
                sx({
                  border: '1px solid var(--tt-border)',
                  borderLeft: '2px solid var(--tt-cyan)',
                  borderRadius: 8,
                  padding: '13px 15px',
                }),
              ),
            ],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 13, fontWeight: 700, marginBottom: 6 }))],
                ['--context-mode ambient'],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }))],
                [
                  'opt in to your normal Pi loadout: extension tools, MCP-style tools, and configured resources. use it to test how the skill behaves in a crowded context.',
                ],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }))],
        [
          'either way, the resolved loadout is recorded in ',
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['context-manifest.json']),
          ', so when a skill misfires, you can see everything else that was in context.',
        ],
      ),
      sectionKicker({ style: { marginBottom: 6 } }, ['where bash runs'], h),
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
            [h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }))],
            [
              h.div(
                [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 6 }))],
                [
                  h.span([h.Style(sx({ color: 'var(--tt-fg)', fontSize: 13, fontWeight: 700 }))], ['--sandbox none']),
                  h.span(
                    [
                      h.Style(
                        sx({
                          border: '1px solid var(--tt-border)',
                          borderRadius: 4,
                          color: 'var(--tt-comment)',
                          fontSize: 11,
                          padding: '1px 6px',
                        }),
                      ),
                    ],
                    ['default'],
                  ),
                ],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }))],
                [
                  'the case runs in a temp workspace on your machine, with a real shell and real npm. use it for skills whose commands must actually work.',
                ],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }))],
            [
              h.div(
                [h.Style(sx({ color: 'var(--tt-teal)', fontSize: 13, fontWeight: 700, marginBottom: 6 }))],
                ['--sandbox just-bash'],
              ),
              h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }))],
                [
                  'bash executes in an in-process virtual shell rooted at the case workspace. it never reaches the host shell or touches the repo tree. ',
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['npm']),
                  ' / ',
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['npx']),
                  ' / ',
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['git']),
                  ' resolve to deterministic mocks you can shape per case with ',
                  h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], ['sandboxMocks']),
                  '.',
                ],
              ),
            ],
          ),
        ],
      ),
      callout(
        { accent: 'teal' },
        [
          h.span(
            [h.Style(sx({ color: 'var(--tt-teal)', fontWeight: 700 }))],
            ['mocks make flaky checks deterministic.'],
          ),
          ' if a case only needs ',
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['npm install']),
          ' to "succeed", a mock that returns exit 0 and drops ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['node_modules/.installed']),
          " tests the skill's behavior without the network, the registry, or the clock.",
        ],
        h,
      ),
    ],
  );
};
