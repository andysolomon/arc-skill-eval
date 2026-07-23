import { Callout, ChapterHeader, pageStyle, SectionKicker } from './ui';

const deltaCards = [
  {
    accent: 'var(--tt-green)',
    titleColor: 'var(--tt-green)',
    title: 'Δ > 0',
    desc: 'the skill helps — it lifts behavior the base model misses. keep it.',
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
    desc: 'the skill hurts — misfiring, over-constraining, or conflicting with a neighbor.',
  },
];

const patternCards = [
  {
    tag: (
      <>
        <span style={{ color: 'var(--tt-green)' }}>✓ with</span> ·{' '}
        <span style={{ color: 'var(--tt-green)' }}>✓ without</span>
      </>
    ),
    title: 'always passes → remove it',
    desc: 'the base model handles it fine. it inflates the pass rate without measuring the skill.',
  },
  {
    tag: (
      <>
        <span style={{ color: 'var(--tt-red)' }}>✗ with</span> ·{' '}
        <span style={{ color: 'var(--tt-red)' }}>✗ without</span>
      </>
    ),
    title: 'always fails → investigate it',
    desc: 'the assertion is broken, the case is too hard, or it checks the wrong thing. fix before the next iteration.',
  },
  {
    tag: (
      <>
        <span style={{ color: 'var(--tt-green)' }}>✓ with</span> ·{' '}
        <span style={{ color: 'var(--tt-red)' }}>✗ without</span>
      </>
    ),
    title: "the skill's value → study it",
    desc: 'this is where the skill earns its delta. understand which instruction made the difference — and protect it.',
  },
  {
    tag: (
      <>
        <span style={{ color: 'var(--tt-green)' }}>✓</span> then{' '}
        <span style={{ color: 'var(--tt-red)' }}>✗</span> run to run
      </>
    ),
    title: 'flaky → tighten instructions',
    desc: 'inconsistent verdicts mean the instructions are ambiguous enough to be read differently each run. add an example.',
  },
];

export const ChapterSignal = () => (
  <div style={pageStyle}>
    <ChapterHeader num="05" title="The with / without signal" />
    <div
      style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 28, maxWidth: 820 }}
    >
      the single most useful number arc-skill-eval produces is the{' '}
      <span style={{ color: 'var(--tt-fg)' }}>delta</span> between running a case with the skill
      and without it. it&apos;s the evidence the skill earned its place — not a vibe.
    </div>

    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 30,
      }}
    >
      <div
        style={{
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          maxWidth: 190,
          padding: '12px 14px',
        }}
      >
        <div
          style={{ color: 'var(--tt-yellow)', fontSize: 12, fontWeight: 700, marginBottom: 3 }}
        >
          one prompt
        </div>
        <div style={{ color: 'var(--tt-fg-dark)', fontSize: 11.5, lineHeight: 1.45 }}>
          &quot;Set up semantic-release.&quot;
        </div>
      </div>
      <span style={{ color: 'var(--tt-comment)', fontSize: 18 }}>→</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            alignItems: 'center',
            border: '1px solid var(--tt-border)',
            borderLeft: '2px solid var(--tt-green)',
            borderRadius: 6,
            display: 'flex',
            gap: 10,
            padding: '9px 13px',
          }}
        >
          <span
            style={{ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700, width: 96 }}
          >
            with_skill
          </span>
          <span style={{ color: 'var(--tt-green)' }}>▓▓▓▓▓▓▓▓</span>
          <span style={{ color: 'var(--tt-green)', fontWeight: 700 }}>6/6</span>
        </div>
        <div
          style={{
            alignItems: 'center',
            border: '1px solid var(--tt-border)',
            borderLeft: '2px solid var(--tt-orange)',
            borderRadius: 6,
            display: 'flex',
            gap: 10,
            padding: '9px 13px',
          }}
        >
          <span
            style={{ color: 'var(--tt-orange)', fontSize: 12, fontWeight: 700, width: 96 }}
          >
            without_skill
          </span>
          <span style={{ color: 'var(--tt-orange)' }}>▓▓▓▓▓▓</span>
          <span style={{ color: 'var(--tt-dim)' }}>▓▓</span>
          <span style={{ color: 'var(--tt-orange)', fontWeight: 700 }}>5/6</span>
        </div>
      </div>
      <span style={{ color: 'var(--tt-comment)', fontSize: 18 }}>→</span>
      <div
        style={{
          border: '1px solid var(--tt-green)',
          borderRadius: 8,
          padding: '12px 18px',
          textAlign: 'center',
        }}
      >
        <div style={{ color: 'var(--tt-comment)', fontSize: 11 }}>delta</div>
        <div style={{ color: 'var(--tt-green)', fontSize: 22, fontWeight: 700 }}>+16.7%</div>
      </div>
    </div>

    <SectionKicker style={{ marginBottom: 10 }}>how the delta is computed</SectionKicker>
    <div
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.95,
        marginBottom: 30,
        padding: '14px 16px',
      }}
    >
      <div>
        <span style={{ color: 'var(--tt-comment)' }}>
          delta = pass_rate(with) − pass_rate(without)
        </span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-fg-dark)' }}>{'      '}= 6/6 − 5/6</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-fg-dark)' }}>{'      '}= 1.000 − 0.833</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-green)', fontWeight: 700 }}>
          {'      '}= +0.167{'   '}(+16.7%)
        </span>
      </div>
    </div>

    <SectionKicker>reading the delta</SectionKicker>
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(3, 1fr)',
        marginBottom: 20,
      }}
    >
      {deltaCards.map((card) => (
        <div
          key={card.title}
          style={{
            border: '1px solid var(--tt-border)',
            borderRadius: 8,
            borderTop: `2px solid ${card.accent}`,
            padding: '12px 14px',
          }}
        >
          <div
            style={{ color: card.titleColor, fontSize: 13, fontWeight: 700, marginBottom: 5 }}
          >
            {card.title}
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55 }}>
            {card.desc}
          </div>
        </div>
      ))}
    </div>

    <SectionKicker style={{ marginBottom: 14 }}>
      Δ across a suite{' '}
      <span
        style={{
          color: 'var(--tt-comment)',
          fontWeight: 400,
          letterSpacing: 0,
          textTransform: 'none',
        }}
      >
        — illustrative
      </span>
    </SectionKicker>
    <div
      style={{
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        marginBottom: 8,
        padding: '18px 20px 12px',
      }}
    >
      <div style={{ alignItems: 'stretch', display: 'flex', gap: 26, height: 170 }}>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
          <div
            style={{ alignItems: 'flex-end', display: 'flex', flex: 1, justifyContent: 'center' }}
          >
            <div style={{ color: 'var(--tt-green)', fontSize: 11, marginBottom: 3 }}>+33%</div>
          </div>
          <div
            style={{ alignItems: 'flex-end', display: 'flex', flex: 1, justifyContent: 'center' }}
          >
            <div
              style={{
                background: 'var(--tt-green)',
                borderRadius: '3px 3px 0 0',
                height: '100%',
                width: 38,
              }}
            />
          </div>
          <div style={{ background: 'var(--tt-border-active)', height: 1 }} />
          <div style={{ flex: 1 }} />
        </div>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
          <div
            style={{ alignItems: 'flex-end', display: 'flex', flex: 1, justifyContent: 'center' }}
          >
            <div style={{ color: 'var(--tt-green)', fontSize: 11, marginBottom: 3 }}>+17%</div>
          </div>
          <div
            style={{ alignItems: 'flex-end', display: 'flex', flex: 1, justifyContent: 'center' }}
          >
            <div
              style={{
                background: 'var(--tt-green)',
                borderRadius: '3px 3px 0 0',
                height: '52%',
                width: 38,
              }}
            />
          </div>
          <div style={{ background: 'var(--tt-border-active)', height: 1 }} />
          <div style={{ flex: 1 }} />
        </div>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
          <div style={{ flex: 1 }} />
          <div
            style={{ alignItems: 'flex-end', display: 'flex', flex: 1, justifyContent: 'center' }}
          >
            <div
              style={{
                background: 'var(--tt-comment)',
                borderRadius: 2,
                height: 4,
                width: 38,
              }}
            />
          </div>
          <div style={{ background: 'var(--tt-border-active)', height: 1 }} />
          <div
            style={{
              alignItems: 'flex-start',
              display: 'flex',
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <div style={{ color: 'var(--tt-comment)', fontSize: 11, marginTop: 3 }}>0%</div>
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
          <div style={{ flex: 1 }} />
          <div style={{ flex: 1 }} />
          <div style={{ background: 'var(--tt-border-active)', height: 1 }} />
          <div
            style={{
              alignItems: 'flex-start',
              display: 'flex',
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                background: 'var(--tt-red)',
                borderRadius: '0 0 3px 3px',
                height: '52%',
                width: 38,
              }}
            />
          </div>
          <div style={{ alignItems: 'flex-start', display: 'flex', justifyContent: 'center' }}>
            <div style={{ color: 'var(--tt-red)', fontSize: 11, marginTop: 3 }}>−17%</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 26, marginTop: 8 }}>
        {['trigger', 'golden-path', 'adjacent-neg', 'edge-case'].map((label) => (
          <div
            key={label}
            style={{
              color: 'var(--tt-fg-dark)',
              flex: 1,
              fontSize: 11,
              textAlign: 'center',
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
    <div
      style={{ color: 'var(--tt-fg-dark)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }}
    >
      a negative bar is a gift — it points straight at a case where the skill is doing harm. use{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>--extra-skill</span> to load a distractor and
      confirm your skill doesn&apos;t fight a neighbor (e.g. release-please vs
      conventional-commits).
    </div>

    <SectionKicker style={{ marginBottom: 6 }}>the cost of the win</SectionKicker>
    <div
      style={{
        color: 'var(--tt-comment)',
        fontSize: 12.5,
        lineHeight: 1.6,
        marginBottom: 14,
        maxWidth: 820,
      }}
    >
      the delta says what the skill buys;{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>benchmark.json</span> also says what it costs
      — extra time and tokens vs the baseline. read them together.
    </div>
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: '1fr 1fr',
        marginBottom: 32,
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
        <div
          style={{ color: 'var(--tt-green)', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}
        >
          ✓ worth it
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <span style={{ color: 'var(--tt-fg)' }}>Δ +50 pts</span>
          <span style={{ color: 'var(--tt-comment)' }}> for </span>
          <span style={{ color: 'var(--tt-fg-dark)' }}>+13s · +1.7k tokens</span>
        </div>
        <div
          style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}
        >
          a big lift for a small cost — the skill earns its context.
        </div>
      </div>
      <div
        style={{
          border: '1px solid var(--tt-border)',
          borderLeft: '2px solid var(--tt-red)',
          borderRadius: 8,
          padding: '13px 15px',
        }}
      >
        <div
          style={{ color: 'var(--tt-red)', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}
        >
          ✗ probably not
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <span style={{ color: 'var(--tt-fg)' }}>Δ +2 pts</span>
          <span style={{ color: 'var(--tt-comment)' }}> for </span>
          <span style={{ color: 'var(--tt-fg-dark)' }}>2× tokens</span>
        </div>
        <div
          style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5, marginTop: 4 }}
        >
          marginal gain, doubled cost — trim the skill or cut it.
        </div>
      </div>
    </div>

    <SectionKicker style={{ marginBottom: 6 }}>patterns across the suite</SectionKicker>
    <div
      style={{
        color: 'var(--tt-comment)',
        fontSize: 12.5,
        lineHeight: 1.6,
        marginBottom: 14,
        maxWidth: 820,
      }}
    >
      aggregate numbers hide things. after each iteration, sort the assertions by how they
      behaved in both configurations:
    </div>
    <div
      style={{
        display: 'grid',
        gap: 10,
        gridTemplateColumns: '1fr 1fr',
        marginBottom: 14,
      }}
    >
      {patternCards.map((card) => (
        <div
          key={card.title}
          style={{ border: '1px solid var(--tt-border)', borderRadius: 7, padding: '11px 13px' }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 4 }}>
            <span style={{ color: 'var(--tt-comment)', fontSize: 11 }}>{card.tag}</span>
          </div>
          <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12.5, fontWeight: 700 }}>
            {card.title}
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }}>
            {card.desc}
          </div>
        </div>
      ))}
    </div>
    <Callout accent="magenta">
      <span style={{ color: 'var(--tt-magenta)', fontWeight: 700 }}>
        comparing two versions? go blind.
      </span>{' '}
      give both outputs to a judge without saying which came from which version and let it score
      organization, formatting, and polish on its own rubric. two outputs can pass the same
      assertions and still differ in quality — blind comparison catches that without bias.
    </Callout>
  </div>
);
