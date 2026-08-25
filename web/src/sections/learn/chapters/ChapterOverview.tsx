import { Callout, ChapterHeader, pageStyle, SectionKicker } from './ui';
import type { LearnChapterId } from '../chapterList';

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
    example: (
      <>
        e.g. <span style={{ color: 'var(--tt-teal)' }}>.releaserc.json</span> is written and valid
      </>
    ),
    checked: (
      <>
        checked with <span style={{ color: 'var(--tt-cyan)' }}>file-exists</span> ·{' '}
        <span style={{ color: 'var(--tt-cyan)' }}>json-valid</span>
      </>
    ),
  },
  {
    accent: 'var(--tt-blue)',
    title: 'process',
    desc: 'did it trigger the skill and take the intended steps. not a lucky shortcut?',
    example: (
      <>
        e.g. reads SKILL.md, runs commitlint. not a raw{' '}
        <span style={{ color: 'var(--tt-fg)' }}>npm publish</span>
      </>
    ),
    checked: (
      <>
        checked with <span style={{ color: 'var(--tt-fg-dark)' }}>trace.json</span> ·{' '}
        <span style={{ color: 'var(--tt-cyan)' }}>not-regex</span>
      </>
    ),
  },
  {
    accent: 'var(--tt-magenta)',
    title: 'style',
    desc: 'does the output read the way the skill promises. the conventions, tone, shape?',
    example: (
      <>
        e.g. commit subjects read <span style={{ color: 'var(--tt-fg)' }}>type: summary</span>
      </>
    ),
    checked: (
      <>
        checked with <span style={{ color: 'var(--tt-cyan)' }}>regex-match</span> ·{' '}
        <span style={{ color: 'var(--tt-magenta)' }}>judge</span>
      </>
    ),
  },
  {
    accent: 'var(--tt-yellow)',
    title: 'efficiency',
    desc: 'did it get there without thrashing? a right answer that costs 40 tool calls is a regression.',
    example: (
      <>
        e.g. ≤ 8 tool calls, under <span style={{ color: 'var(--tt-green)' }}>$0.15</span>
      </>
    ),
    checked: (
      <>
        checked with <span style={{ color: 'var(--tt-fg-dark)' }}>timing.json</span> ·{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>tool-summary</span>
      </>
    ),
  },
];

const triggerCards = [
  {
    accent: 'var(--tt-green)',
    title: 'explicit',
    desc: 'names the skill directly. proves direct usage keeps working as you edit. your smoke test.',
    example: '"Use arc-conventional-commits to set up releases."',
    passes: (
      <>
        passes when it <span style={{ color: 'var(--tt-green)' }}>fires and does the task</span>
      </>
    ),
  },
  {
    accent: 'var(--tt-blue)',
    title: 'implicit',
    desc: 'describes the scenario without naming it. the real test of whether your description earns the trigger.',
    example: '"Automate releases from our commit messages."',
    passes: (
      <>
        passes when it&apos;s{' '}
        <span style={{ color: 'var(--tt-blue)' }}>selected on description alone</span>
      </>
    ),
  },
  {
    accent: 'var(--tt-cyan)',
    title: 'contextual',
    desc: 'a realistic, noisy prompt with distractions around the real ask. closest to production.',
    example: '"Our version bumps are a mess. sort out the release flow."',
    passes: (
      <>
        passes when it fires{' '}
        <span style={{ color: 'var(--tt-cyan)' }}>and produces the right structure</span>
      </>
    ),
  },
  {
    accent: 'var(--tt-orange)',
    title: 'adjacent-negative',
    desc: 'a nearby request it should NOT fire for. catches false positives. the boundary most skills leak at.',
    example: '"This PR only edits README. do I need a release?"',
    passes: (
      <>
        passes when it <span style={{ color: 'var(--tt-orange)' }}>stays out and writes nothing</span>
      </>
    ),
  },
];

const loopSteps = [
  { color: 'var(--tt-green)', label: 'create' },
  { color: 'var(--tt-blue)', label: 'run' },
  { color: 'var(--tt-yellow)', label: 'review' },
  { color: 'var(--tt-magenta)', label: 'improve' },
];

const loopCommands = [
  { color: 'var(--tt-green)', label: 'create', desc: 'scaffold a starter suite. deterministic, guided, or interactive.' },
  { color: 'var(--tt-blue)', label: 'run', desc: 'execute cases; --compare grades with_skill vs without_skill.' },
  { color: 'var(--tt-teal)', label: 'audit', desc: 'deterministic skill-quality checks. no model tokens.' },
  { color: 'var(--tt-fg)', label: 'browse', desc: 'a four-panel run browser over the artifacts.' },
  { color: 'var(--tt-yellow)', label: 'review', desc: 'a static report; capture human notes in feedback.json.' },
  { color: 'var(--tt-magenta)', label: 'improve', desc: 'turn feedback + failures into proposed changes. nothing written without --apply.' },
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

type ChapterOverviewProps = {
  deepDives: { id: LearnChapterId; num: string; label: string; desc: string }[];
  onNavigate: (chapterId: LearnChapterId) => void;
};

export const ChapterOverview = ({ deepDives, onNavigate }: ChapterOverviewProps) => (
  <div style={pageStyle}>
    <ChapterHeader num="01" title="What arc-skill-eval is for" />
    <div
      style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 36, maxWidth: 820 }}
    >
      when you iterate on a skill, it&apos;s hard to tell whether you improved it or just changed
      its behavior. one version feels faster, another seems more reliable. then a regression
      slips in: the skill doesn&apos;t trigger, skips a required step, or leaves extra files
      behind.{' '}
      <span style={{ color: 'var(--tt-fg)' }}>
        arc-skill-eval replaces &quot;does this feel better?&quot; with evidence
      </span>{' '}
     . run the skill, capture what happened, and grade it against a small set of checks you can
      compare over time.
    </div>

    <SectionKicker>first, what a skill is</SectionKicker>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 36 }}>
      <div
        style={{
          color: 'var(--tt-fg-dark)',
          flex: 1,
          fontSize: 13,
          lineHeight: 1.7,
          minWidth: 330,
        }}
      >
        a skill is a folder with a <span style={{ color: 'var(--tt-teal)' }}>SKILL.md</span> ,
        yaml frontmatter (<span style={{ color: 'var(--tt-fg)' }}>name</span> +{' '}
        <span style={{ color: 'var(--tt-fg)' }}>description</span>) plus markdown instructions,
        and optional scripts and resources. the name and description control invocation:
        they&apos;re what the agent matches a request against to decide{' '}
        <span style={{ color: 'var(--tt-fg)' }}>whether</span> to trigger the skill and pull the
        rest into context. progressive disclosure keeps it cheap. metadata is always loaded,
        instructions load on trigger, bundled files only when read.
      </div>
      <div
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          flex: 1,
          fontSize: 12.5,
          lineHeight: 1.85,
          minWidth: 330,
          padding: '14px 16px',
        }}
      >
        <div style={{ color: 'var(--tt-comment)' }}>---</div>
        <div>
          <span style={{ color: 'var(--tt-yellow)' }}>name</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-green)' }}>arc-conventional-commits</span>
        </div>
        <div>
          <span style={{ color: 'var(--tt-yellow)' }}>description</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-fg-dark)' }}>what it does</span>
        </div>
        <div>
          <span style={{ color: 'var(--tt-comment)' }}>{'  '}+ </span>
          <span style={{ color: 'var(--tt-fg-dark)' }}>when the agent should use it.</span>
        </div>
        <div style={{ color: 'var(--tt-comment)' }}>---</div>
        <div style={{ color: 'var(--tt-fg-dark)' }}># instructions the agent follows…</div>
      </div>
    </div>

    <SectionKicker>what an eval is</SectionKicker>
    <div
      style={{
        alignItems: 'stretch',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
      }}
    >
      {flowSteps.map((step, index) => (
        <div key={step.title} style={{ display: 'contents' }}>
          {index > 0 ? (
            <span style={{ alignSelf: 'center', color: 'var(--tt-comment)' }}>→</span>
          ) : null}
          <div
            style={{
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              flex: 1,
              minWidth: 150,
              padding: '12px 14px',
            }}
          >
            <div style={{ color: step.color, fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
              {step.title}
            </div>
            <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }}>
              {step.desc}
            </div>
          </div>
        </div>
      ))}
    </div>
    <div
      style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.6, marginBottom: 36 }}
    >
      in practice it&apos;s a lightweight end-to-end test: run the agent, record what happened,
      score the result against a few rules.
    </div>

    <SectionKicker style={{ marginBottom: 6 }}>define success first</SectionKicker>
    <div
      style={{
        color: 'var(--tt-comment)',
        fontSize: 12.5,
        lineHeight: 1.6,
        marginBottom: 14,
        maxWidth: 820,
      }}
    >
      before writing the skill, write down what success means in terms you can measure. keep the
      list small and must-pass. the behaviors you care about most, across four dimensions.
    </div>
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(2, 1fr)',
        marginBottom: 36,
      }}
    >
      {dimensionCards.map((card) => (
        <div
          key={card.title}
          style={{
            border: '1px solid var(--tt-border)',
            borderRadius: 8,
            borderTop: `2px solid ${card.accent}`,
            padding: '14px 15px',
          }}
        >
          <div style={{ color: card.accent, fontSize: 13, fontWeight: 700, marginBottom: 5 }}>
            {card.title}
          </div>
          <div
            style={{
              color: 'var(--tt-comment)',
              fontSize: 12.5,
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            {card.desc}
          </div>
          <div
            style={{
              color: 'var(--tt-fg-dark)',
              fontSize: 12,
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            {card.example}
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 11.5 }}>{card.checked}</div>
        </div>
      ))}
    </div>

    <SectionKicker style={{ marginBottom: 6 }}>does it trigger?</SectionKicker>
    <div
      style={{
        color: 'var(--tt-comment)',
        fontSize: 12.5,
        lineHeight: 1.6,
        marginBottom: 14,
        maxWidth: 820,
      }}
    >
      invocation depends on the name + description. test that the skill fires when it should ,
      and holds back when it shouldn&apos;t. these become your starter cases.
    </div>
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(2, 1fr)',
        marginBottom: 36,
      }}
    >
      {triggerCards.map((card) => (
        <div
          key={card.title}
          style={{
            border: '1px solid var(--tt-border)',
            borderLeft: `2px solid ${card.accent}`,
            borderRadius: 8,
            padding: '13px 15px',
          }}
        >
          <div style={{ fontSize: 13, marginBottom: 5 }}>
            <span style={{ color: card.accent, fontWeight: 700 }}>{card.title}</span>
          </div>
          <div
            style={{
              color: 'var(--tt-comment)',
              fontSize: 12.5,
              lineHeight: 1.55,
              marginBottom: 8,
            }}
          >
            {card.desc}
          </div>
          <div
            style={{
              background: 'var(--tt-bg-dark)',
              borderRadius: 5,
              color: 'var(--tt-fg-dark)',
              fontSize: 12,
              lineHeight: 1.45,
              marginBottom: 6,
              padding: '7px 10px',
            }}
          >
            {card.example}
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 11.5 }}>{card.passes}</div>
        </div>
      ))}
    </div>

    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 20 }}>
      <div style={{ flex: 1, minWidth: 360 }}>
        <SectionKicker>layered grading</SectionKicker>
        <div
          style={{
            border: '1px solid var(--tt-border)',
            borderRadius: 8,
            marginBottom: 8,
            padding: 14,
          }}
        >
          <div
            style={{ color: 'var(--tt-cyan)', fontSize: 13, fontWeight: 700, marginBottom: 4 }}
          >
            1 · deterministic. first
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }}>
            scripts check what actually happened: files written, patterns matched, json parsed.
            fast, free, repeatable, explainable.
          </div>
        </div>
        <div
          style={{
            border: '1px solid var(--tt-border)',
            borderRadius: 8,
            marginBottom: 10,
            padding: 14,
          }}
        >
          <div
            style={{
              color: 'var(--tt-magenta)',
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            2 · llm-judge. where rules fall short
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.55 }}>
            a rubric grades prose and conventions the scripts can&apos;t. pin --judge-model so a
            model doesn&apos;t grade its own output.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['file-exists', 'regex-match', 'json-valid', 'file-absent'].map((label) => (
            <span
              key={label}
              style={{
                border: '1px solid var(--tt-border)',
                borderRadius: 5,
                color: 'var(--tt-cyan)',
                fontSize: 11.5,
                padding: '3px 8px',
              }}
            >
              {label}
            </span>
          ))}
          <span
            style={{
              border: '1px solid var(--tt-border)',
              borderRadius: 5,
              color: 'var(--tt-magenta)',
              fontSize: 11.5,
              padding: '3px 8px',
            }}
          >
            llm-judge
          </span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 360 }}>
        <SectionKicker>compare with and without the skill</SectionKicker>
        <div style={{ border: '1px solid var(--tt-border)', borderRadius: 8, padding: 16 }}>
          <div
            style={{
              color: 'var(--tt-fg-dark)',
              fontSize: 12.5,
              lineHeight: 1.6,
              marginBottom: 12,
            }}
          >
            run each case <span style={{ color: 'var(--tt-green)' }}>with_skill</span> and again{' '}
            <span style={{ color: 'var(--tt-orange)' }}>without_skill</span>. the delta is the
            evidence the skill earned its place. not a vibe.
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.95 }}>
            <div>
              <span
                style={{ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '15ch' }}
              >
                with_skill
              </span>
              <span style={{ color: 'var(--tt-green)' }}>▓▓▓▓▓▓▓▓▓▓▓▓▓▓</span>
              <span style={{ color: 'var(--tt-green)' }}> 3/3</span>
            </div>
            <div>
              <span
                style={{ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '15ch' }}
              >
                without_skill
              </span>
              <span style={{ color: 'var(--tt-orange)' }}>▓▓▓▓▓</span>
              <span style={{ color: 'var(--tt-dim)' }}>░░░░░░░░░</span>
              <span style={{ color: 'var(--tt-orange)' }}> 1/3</span>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <span style={{ color: 'var(--tt-comment)' }}>delta{'  '}</span>
            <span style={{ color: 'var(--tt-green)', fontSize: 20, fontWeight: 700 }}>
              Δ +16.7%
            </span>
          </div>
        </div>
      </div>
    </div>

    <Callout accent="orange" style={{ marginBottom: 36, padding: '13px 16px' }}>
      <span style={{ color: 'var(--tt-orange)', fontSize: 13, fontWeight: 700 }}>
        behavior, not wording.
      </span>{' '}
      assert observable behavior and artifacts, not incidental phrasing. a correct answer that
      paraphrases shouldn&apos;t fail. reserve exact-wording checks for real contracts: a commit
      message, cli output, a safety disclaimer.
    </Callout>

    <SectionKicker style={{ marginBottom: 6 }}>small suites, grown from failures</SectionKicker>
    <div
      style={{
        color: 'var(--tt-fg-dark)',
        fontSize: 13,
        lineHeight: 1.7,
        marginBottom: 36,
        maxWidth: 820,
      }}
    >
      you don&apos;t need a benchmark.{' '}
      <span style={{ color: 'var(--tt-fg)' }}>10–20 prompts</span> is enough to surface
      regressions and confirm improvements. start tiny; every manual fix you make while building
      becomes a new case. so the suite turns into a living record of what the skill must keep
      getting right.
    </div>

    <SectionKicker>the loop</SectionKicker>
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
      }}
    >
      {loopSteps.map((step, index) => (
        <div key={step.label} style={{ display: 'contents' }}>
          {index > 0 ? <span style={{ color: 'var(--tt-comment)' }}>→</span> : null}
          <span
            style={{
              border: '1px solid var(--tt-border)',
              borderRadius: 7,
              color: step.color,
              fontSize: 13,
              fontWeight: 700,
              padding: '7px 13px',
            }}
          >
            {step.label}
          </span>
        </div>
      ))}
      <span style={{ color: 'var(--tt-dim)', marginLeft: 6 }}>↺ repeat</span>
    </div>
    <div
      style={{
        display: 'grid',
        gap: '8px 24px',
        gridTemplateColumns: 'repeat(2, 1fr)',
        marginBottom: 36,
      }}
    >
      {loopCommands.map((command) => (
        <div
          key={command.label}
          style={{ display: 'flex', fontSize: 12.5, gap: 12, lineHeight: 1.5, padding: '5px 0' }}
        >
          <span style={{ color: command.color, fontWeight: 700, minWidth: 64 }}>
            {command.label}
          </span>
          <span style={{ color: 'var(--tt-comment)' }}>{command.desc}</span>
        </div>
      ))}
    </div>

    <SectionKicker>what a run writes</SectionKicker>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
      {runArtifacts.map((label) => (
        <span
          key={label}
          style={{
            border: '1px solid var(--tt-border)',
            borderRadius: 5,
            color: 'var(--tt-fg-dark)',
            fontSize: 11.5,
            padding: '4px 9px',
          }}
        >
          {label}
        </span>
      ))}
    </div>
    <div
      style={{
        borderTop: '1px solid var(--tt-border)',
        color: 'var(--tt-comment)',
        fontSize: 12.5,
        lineHeight: 1.7,
        marginTop: 20,
        paddingTop: 16,
      }}
    >
      the on-disk format follows Anthropic&apos;s published skill-eval standard; the methodology ,
      layered grading, small suites that grow from real failures, the with-skill / without-skill
      comparison as compare with and without the skill. is inspired by OpenAI&apos;s work on testing agent
      skills. the runtime is <span style={{ color: 'var(--tt-teal)' }}>Pi</span>: an llm, a loop,
      and enough tokens.
    </div>

    <SectionKicker style={{ margin: '34px 0 12px' }}>more detail</SectionKicker>
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, 1fr)' }}>
      {deepDives.map((card) => (
        <div
          className="learn-deep-dive"
          key={card.id}
          onClick={() => onNavigate(card.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onNavigate(card.id);
            }
          }}
          role="button"
          tabIndex={0}
          style={{
            border: '1px solid var(--tt-border)',
            borderRadius: 8,
            cursor: 'pointer',
            padding: '14px 16px',
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: 9, marginBottom: 5 }}>
            <span style={{ color: 'var(--tt-dim)', fontSize: 11, fontWeight: 700 }}>
              {card.num}
            </span>
            <span style={{ color: 'var(--tt-fg)', fontSize: 13.5, fontWeight: 700 }}>
              {card.label}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ color: 'var(--tt-blue)' }}>→</span>
          </div>
          <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.55 }}>
            {card.desc}
          </div>
        </div>
      ))}
    </div>

    <div
      style={{
        borderTop: '1px solid var(--tt-border)',
        color: 'var(--tt-dim)',
        fontSize: 11,
        lineHeight: 1.7,
        marginTop: 34,
        paddingTop: 14,
      }}
    >
      references:{' '}
      {references.map((reference, index) => (
        <span key={reference.href}>
          {index > 0 ? ' · ' : null}
          <a href={reference.href} rel="noopener" target="_blank">
            {reference.label}
          </a>
        </span>
      ))}
    </div>
  </div>
);
