import { usePiAnimation } from '../useLearnAnimations';
import { Callout, ChapterHeader, fadeStyle, pageStyle, SectionKicker, TrafficDots } from './ui';

const providers = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'xai',
  'ollama / ollama-cloud',
  'deepseek',
  'groq',
];

export const ChapterPi = () => {
  const { pi, piTools, piSpin, piToolName, controlLabel, toggle, replay } = usePiAnimation();

  return (
    <div style={pageStyle}>
      <ChapterHeader num="07" title="The Pi runtime" />
      <div
        style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 28, maxWidth: 820 }}
      >
        every case executes through the <span style={{ color: 'var(--tt-teal)' }}>Pi</span>{' '}
        coding agent (
        <span style={{ color: 'var(--tt-fg)' }}>@mariozechner/pi-coding-agent</span>). the choice
        is philosophical as much as technical: an agent is{' '}
        <span style={{ color: 'var(--tt-fg)' }}>an llm, a loop, and enough tokens</span>. a tool
        registry, an inner loop, and a parser. production complexity is engineering, not
        architecture.
      </div>

      <SectionKicker style={{ marginBottom: 6 }}>why a small harness</SectionKicker>
      <div
        style={{
          color: 'var(--tt-comment)',
          fontSize: 12.5,
          lineHeight: 1.6,
          marginBottom: 14,
          maxWidth: 820,
        }}
      >
        an eval is only as trustworthy as the machinery between the prompt and the trace. a
        small, legible runtime means the artifacts describe the{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>skill&apos;s</span> behavior. not a
        framework&apos;s.
      </div>
      <div
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          marginBottom: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            borderBottom: '1px solid var(--tt-border)',
            display: 'flex',
            gap: 6,
            padding: '7px 12px',
          }}
        >
          <TrafficDots />
          <span style={{ color: 'var(--tt-comment)', fontSize: 11, marginLeft: 8 }}>
            the pi loop
          </span>
          <span style={{ flex: 1 }} />
          <span
            onClick={toggle}
            style={{ color: 'var(--tt-comment)', cursor: 'pointer', fontSize: 11 }}
          >
            {controlLabel}
          </span>
          <span
            onClick={replay}
            style={{ color: 'var(--tt-comment)', cursor: 'pointer', fontSize: 11 }}
          >
            ↻ replay
          </span>
        </div>
        <div style={{ padding: '16px 16px 6px' }}>
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 14,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                ...fadeStyle(pi.prompt),
                background: 'var(--tt-bg)',
                border: '1px solid var(--tt-border)',
                borderRadius: 8,
                padding: '11px 14px',
              }}
            >
              <div
                style={{
                  color: 'var(--tt-yellow)',
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 2,
                }}
              >
                prompt + skill
              </div>
              <div style={{ color: 'var(--tt-comment)', fontSize: 11.5 }}>
                the case, in a fresh sandbox
              </div>
            </div>
            <span
              style={{ ...fadeStyle(pi.arrow1), color: 'var(--tt-comment)', fontSize: 16 }}
            >
              →
            </span>
            <div
              style={{
                ...fadeStyle(pi.loop),
                background: 'var(--tt-bg)',
                border: '1px solid var(--tt-border-active)',
                borderRadius: 8,
                padding: '11px 14px',
              }}
            >
              <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 6 }}>
                <span style={{ color: 'var(--tt-blue)', fontSize: 12, fontWeight: 700 }}>
                  the loop
                </span>
                <span style={{ color: 'var(--tt-dim)', fontSize: 11 }}>↺ until done</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {piTools.map((tool) => (
                  <span
                    key={tool.label}
                    style={{
                      background: tool.bg,
                      border: `1px solid ${tool.border}`,
                      borderRadius: 5,
                      color: tool.color,
                      fontSize: 11,
                      padding: '2px 8px',
                      transition: 'all .2s',
                    }}
                  >
                    {tool.label}
                  </span>
                ))}
              </div>
            </div>
            <span
              style={{ ...fadeStyle(pi.arrow2), color: 'var(--tt-comment)', fontSize: 16 }}
            >
              →
            </span>
            <div
              style={{
                ...fadeStyle(pi.art),
                background: 'var(--tt-bg)',
                border: '1px solid var(--tt-green)',
                borderRadius: 8,
                padding: '11px 14px',
              }}
            >
              <div
                style={{
                  color: 'var(--tt-green)',
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 2,
                }}
              >
                artifacts
              </div>
              <div style={{ color: 'var(--tt-comment)', fontSize: 11.5 }}>
                outputs/ · trace · grading
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.9, minHeight: 78 }}>
            <div style={{ height: 22, position: 'relative' }}>
              <div style={{ ...fadeStyle(pi.running, 0.2), inset: 0, position: 'absolute' }}>
                <span style={{ color: 'var(--tt-cyan)' }}>{piSpin}</span>
                <span style={{ color: 'var(--tt-fg-dark)' }}> llm turn → </span>
                <span style={{ color: 'var(--tt-cyan)' }}>{piToolName}</span>
                <span style={{ color: 'var(--tt-comment)' }}>
                  {' '}
                  · result feeds the next turn…
                </span>
              </div>
              <div style={{ ...fadeStyle(pi.done), inset: 0, position: 'absolute' }}>
                <span style={{ color: 'var(--tt-green)', fontWeight: 700 }}>✓ done</span>
                <span style={{ color: 'var(--tt-comment)' }}>
                  {' '}
                 . the model stopped calling tools; artifacts written
                </span>
              </div>
            </div>
            <div style={fadeStyle(pi.l1)}>
              <span style={{ color: 'var(--tt-comment)' }}>every tool call, in order → </span>
              <span style={{ color: 'var(--tt-teal)' }}>trace.json</span>
            </div>
            <div style={fadeStyle(pi.l2)}>
              <span style={{ color: 'var(--tt-comment)' }}>
                tokens · cost · context used →{' '}
              </span>
              <span style={{ color: 'var(--tt-teal)' }}>timing.json</span>
            </div>
          </div>
        </div>
      </div>
      <div
        style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }}
      >
        that&apos;s the whole story. nothing hidden in a framework layer. when a check fails,
        the trace explains it.
      </div>

      <SectionKicker style={{ marginBottom: 6 }}>one flag, any model</SectionKicker>
      <div
        style={{
          color: 'var(--tt-comment)',
          fontSize: 12.5,
          lineHeight: 1.6,
          marginBottom: 12,
          maxWidth: 820,
        }}
      >
        arc-skill-eval inherits Pi&apos;s provider registry, so the runner and the judge each pin
        to any configured model. or fall back to Pi&apos;s default when unpinned.
      </div>
      <div
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.9,
          marginBottom: 12,
          padding: '12px 15px',
        }}
      >
        <div>
          <span style={{ color: 'var(--tt-green)' }}>$ </span>
          <span style={{ color: 'var(--tt-fg)' }}>
            arc-skill-eval run ./skills/my-skill --compare \
          </span>
        </div>
        <div style={{ paddingLeft: '4ch' }}>
          <span style={{ color: 'var(--tt-fg-dark)' }}>--model anthropic/claude-opus-4-5 \</span>
          <span style={{ color: 'var(--tt-comment)' }}>{'        '}# runs the case</span>
        </div>
        <div style={{ paddingLeft: '4ch' }}>
          <span style={{ color: 'var(--tt-fg-dark)' }}>
            --judge-model mistral/ministral-8b-latest
          </span>
          <span style={{ color: 'var(--tt-comment)' }}>{'  '}# grades the prose</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {providers.map((label) => (
          <span
            key={label}
            style={{
              border: '1px solid var(--tt-border)',
              borderRadius: 5,
              color: 'var(--tt-fg-dark)',
              fontSize: 11.5,
              padding: '3px 9px',
            }}
          >
            {label}
          </span>
        ))}
      </div>
      <Callout accent="orange" style={{ marginBottom: 32 }}>
        <span style={{ color: 'var(--tt-orange)', fontWeight: 700 }}>
          the judge defaults to the runner&apos;s model.
        </span>{' '}
        that means the model grades its own output. fine for smoke tests, biased for anything
        you&apos;ll act on. pin <span style={{ color: 'var(--tt-fg)' }}>--judge-model</span> to a
        different model when the verdict matters. a small cheap judge (ministral-8b) grades tight
        rubrics well.
      </Callout>

      <SectionKicker style={{ marginBottom: 6 }}>
        an eval-owned runtime for reproducible runs
      </SectionKicker>
      <div
        style={{
          color: 'var(--tt-comment)',
          fontSize: 12.5,
          lineHeight: 1.6,
          marginBottom: 12,
          maxWidth: 820,
        }}
      >
        by default the runner uses your personal Pi config (
        <span style={{ color: 'var(--tt-teal)' }}>~/.pi/agent</span>). for team and CI runs,
        that&apos;s a hidden variable. your default model isn&apos;t your teammate&apos;s.{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>init-runtime</span> creates a tiny config
        the eval owns instead:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            background: 'var(--tt-bg-dark)',
            border: '1px solid var(--tt-border)',
            borderRadius: 8,
            flex: 1,
            fontSize: 12.5,
            lineHeight: 1.9,
            minWidth: 320,
            padding: '12px 15px',
          }}
        >
          <div>
            <span style={{ color: 'var(--tt-green)' }}>$ </span>
            <span style={{ color: 'var(--tt-fg)' }}>
              arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \
            </span>
          </div>
          <div style={{ paddingLeft: '4ch' }}>
            <span style={{ color: 'var(--tt-fg-dark)' }}>
              --provider ollama-cloud --model gpt-oss:20b
            </span>
          </div>
          <div style={{ height: 6 }} />
          <div>
            <span style={{ color: 'var(--tt-green)' }}>$ </span>
            <span style={{ color: 'var(--tt-fg)' }}>arc-skill-eval run ./skills/my-skill \</span>
          </div>
          <div style={{ paddingLeft: '4ch' }}>
            <span style={{ color: 'var(--tt-fg-dark)' }}>
              --agent-dir ./.arc-skill-eval/pi-agent
            </span>
          </div>
        </div>
        <div
          style={{
            background: 'var(--tt-bg-dark)',
            border: '1px solid var(--tt-border)',
            borderRadius: 8,
            flex: 'none',
            fontSize: 12.5,
            lineHeight: 1.9,
            padding: '12px 15px',
            width: 300,
          }}
        >
          <div>
            <span style={{ color: 'var(--tt-teal)' }}>.arc-skill-eval/pi-agent/</span>
          </div>
          <div>
            <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
            <span style={{ color: 'var(--tt-fg-dark)' }}>models.json</span>
            <span style={{ color: 'var(--tt-comment)' }}>{'    '}providers</span>
          </div>
          <div>
            <span style={{ color: 'var(--tt-dim)' }}>└─ </span>
            <span style={{ color: 'var(--tt-fg-dark)' }}>settings.json</span>
            <span style={{ color: 'var(--tt-comment)' }}>{'  '}defaults</span>
          </div>
          <div
            style={{
              color: 'var(--tt-comment)',
              fontSize: 11.5,
              lineHeight: 1.55,
              marginTop: 8,
            }}
          >
            that&apos;s the whole runtime. keys stay out of it. reference secrets by env-var
            name (
            <span style={{ color: 'var(--tt-fg-dark)' }}>
              &quot;apiKey&quot;: &quot;OLLAMA_API_KEY&quot;
            </span>
            ), never literal values.
          </div>
        </div>
      </div>
      <div
        style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }}
      >
        <span style={{ color: 'var(--tt-fg-dark)' }}>run</span> preflights the directory before
        executing anything. missing models.json, provider entries, or API-key env vars are
        reported once, with the <span style={{ color: 'var(--tt-fg-dark)' }}>init-runtime</span>{' '}
        fix named. a cheap lane like{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>ollama-cloud/gpt-oss:20b</span> makes good
        smoke tests; save the frontier model for the runs you&apos;ll act on.
      </div>

      <SectionKicker style={{ marginBottom: 6 }}>
        isolated by default: context modes
      </SectionKicker>
      <div
        style={{
          color: 'var(--tt-comment)',
          fontSize: 12.5,
          lineHeight: 1.6,
          marginBottom: 12,
          maxWidth: 820,
        }}
      >
        the eval must measure the skill, not your personal setup. so by default nothing ambient
        rides along.
      </div>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: '1fr 1fr',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            border: '1px solid var(--tt-border)',
            borderLeft: '2px solid var(--tt-green)',
            borderRadius: 8,
            padding: '13px 15px',
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 6 }}>
            <span style={{ color: 'var(--tt-green)', fontSize: 13, fontWeight: 700 }}>
              --context-mode isolated
            </span>
            <span
              style={{
                border: '1px solid var(--tt-border)',
                borderRadius: 4,
                color: 'var(--tt-comment)',
                fontSize: 11,
                padding: '1px 6px',
              }}
            >
              default
            </span>
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }}>
            no ambient Pi skills, extensions, prompt templates, themes, or context files. the
            model sees the target skill (plus any --extra-skill distractors) and nothing else.
          </div>
        </div>
        <div
          style={{
            border: '1px solid var(--tt-border)',
            borderLeft: '2px solid var(--tt-cyan)',
            borderRadius: 8,
            padding: '13px 15px',
          }}
        >
          <div style={{ color: 'var(--tt-cyan)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            --context-mode ambient
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }}>
            opt in to your normal Pi loadout. extension tools, MCP-style tools, configured
            resources. use it to test how the skill behaves in a crowded context.
          </div>
        </div>
      </div>
      <div
        style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }}
      >
        either way, the resolved loadout is recorded in{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>context-manifest.json</span>. so when a
        skill misfires, you can see exactly what else was in the room.
      </div>

      <SectionKicker style={{ marginBottom: 6 }}>where bash runs</SectionKicker>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: '1fr 1fr',
          marginBottom: 12,
        }}
      >
        <div
          style={{ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 6 }}>
            <span style={{ color: 'var(--tt-fg)', fontSize: 13, fontWeight: 700 }}>
              --sandbox none
            </span>
            <span
              style={{
                border: '1px solid var(--tt-border)',
                borderRadius: 4,
                color: 'var(--tt-comment)',
                fontSize: 11,
                padding: '1px 6px',
              }}
            >
              default
            </span>
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }}>
            the case runs in a temp workspace on your machine. real shell, real npm. right for
            skills whose commands must actually work.
          </div>
        </div>
        <div
          style={{ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }}
        >
          <div style={{ color: 'var(--tt-teal)', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            --sandbox just-bash
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }}>
            bash executes in an in-process virtual shell rooted at the case workspace. no host
            shell, repo tree never touched.{' '}
            <span style={{ color: 'var(--tt-fg-dark)' }}>npm</span> /{' '}
            <span style={{ color: 'var(--tt-fg-dark)' }}>npx</span> /{' '}
            <span style={{ color: 'var(--tt-fg-dark)' }}>git</span> resolve to deterministic
            mocks you can shape per case with{' '}
            <span style={{ color: 'var(--tt-fg-dark)' }}>sandboxMocks</span>.
          </div>
        </div>
      </div>
      <Callout accent="teal">
        <span style={{ color: 'var(--tt-teal)', fontWeight: 700 }}>
          mocks make flaky checks deterministic.
        </span>{' '}
        if a case only needs <span style={{ color: 'var(--tt-fg)' }}>npm install</span> to
        &quot;succeed&quot;, a mock that returns exit 0 and drops{' '}
        <span style={{ color: 'var(--tt-teal)' }}>node_modules/.installed</span> tests the
        skill&apos;s behavior without the network, the registry, or the clock.
      </Callout>
    </div>
  );
};
