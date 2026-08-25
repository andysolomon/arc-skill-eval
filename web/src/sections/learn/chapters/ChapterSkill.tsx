import { Callout, ChapterHeader, pageStyle, SectionKicker } from './ui';

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

export const ChapterSkill = () => (
  <div style={pageStyle}>
    <ChapterHeader num="02" title="Anatomy of a skill" />
    <div
      style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 30, maxWidth: 800 }}
    >
      a skill is a folder the agent pulls into context when it&apos;s relevant. exactly one file
      is required. <span style={{ color: 'var(--tt-teal)' }}>SKILL.md</span>. and everything
      else (scripts, references, an eval suite) is optional and loaded only when it&apos;s
      needed.
    </div>

    <SectionKicker>SKILL.md, annotated</SectionKicker>
    <div
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        fontSize: 12.5,
        lineHeight: 2,
        marginBottom: 14,
        padding: '16px 18px',
      }}
    >
      <div style={{ color: 'var(--tt-comment)' }}>---</div>
      <div style={{ display: 'flex', gap: 14 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--tt-yellow)' }}>name</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-green)' }}>arc-conventional-commits</span>
        </span>
        <span style={{ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }}>
          ← matched against the request
        </span>
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--tt-yellow)' }}>description</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-fg-dark)' }}>Set up &amp; enforce Conventional</span>
        </span>
        <span style={{ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }}>← the trigger signal</span>
      </div>
      <div style={{ color: 'var(--tt-fg-dark)' }}>
        {'  '}Commits. Use when a repo needs release
      </div>
      <div style={{ color: 'var(--tt-fg-dark)' }}>{'  '}automation or commit-message rules.</div>
      <div style={{ color: 'var(--tt-comment)' }}>---</div>
      <div style={{ display: 'flex', gap: 14 }}>
        <span style={{ color: 'var(--tt-fg-dark)', flex: 1, minWidth: 0 }}>
          # When to use / steps / examples…
        </span>
        <span style={{ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }}>
          ← body: loaded on trigger
        </span>
      </div>
    </div>
    <Callout accent="orange" style={{ marginBottom: 32 }}>
      <span style={{ color: 'var(--tt-orange)', fontWeight: 700 }}>
        name and description control invocation.
      </span>{' '}
      they&apos;re the only part always in context, so they alone decide whether the skill fires.
      write the description for the situations it should trigger in. not just what it does.
    </Callout>

    <SectionKicker style={{ marginBottom: 16 }}>
      progressive disclosure. what loads, when
    </SectionKicker>
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}
    >
      {disclosureRows.map((row) => (
        <div key={row.label} style={{ alignItems: 'center', display: 'flex', gap: 14 }}>
          <span
            style={{
              color: row.color,
              flex: 'none',
              fontSize: 13,
              fontWeight: 700,
              width: 118,
            }}
          >
            {row.label}
          </span>
          <span
            style={{
              color: 'var(--tt-comment)',
              flex: 'none',
              fontSize: 11.5,
              textAlign: 'right',
              width: 62,
            }}
          >
            {row.tokens}
          </span>
          <div
            style={{
              background: 'var(--tt-bg-dark)',
              borderRadius: 4,
              flex: 1,
              height: 16,
              overflow: 'hidden',
            }}
          >
            <div style={{ background: row.color, height: '100%', width: row.width }} />
          </div>
          <span
            style={{ color: 'var(--tt-comment)', flex: 'none', fontSize: 11.5, width: 132 }}
          >
            {row.when}
          </span>
        </div>
      ))}
    </div>
    <div
      style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 30 }}
    >
      the agent pays for what it uses. cheap metadata is always present so matching is fast; the
      heavier material only enters context once the skill is actually in play.
    </div>

    <SectionKicker>on disk</SectionKicker>
    <div
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        fontSize: 12.5,
        lineHeight: 1.9,
        padding: '14px 16px',
      }}
    >
      <div>
        <span style={{ color: 'var(--tt-teal)' }}>arc-conventional-commits/</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
        <span style={{ color: 'var(--tt-fg)' }}>SKILL.md</span>
        <span style={{ color: 'var(--tt-comment)' }}>
          {'            '}name + description + instructions
        </span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>reference/preset.md</span>
        <span style={{ color: 'var(--tt-comment)' }}>{'  '}read on demand</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>scripts/check.sh</span>
        <span style={{ color: 'var(--tt-comment)' }}>{'     '}deterministic helper</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>└─ </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>evals/evals.json</span>
        <span style={{ color: 'var(--tt-comment)' }}>{'     '}the eval suite </span>
        <span style={{ color: 'var(--tt-yellow)' }}>← what we grade</span>
      </div>
    </div>

    <SectionKicker style={{ margin: '34px 0 8px' }}>
      write the invocation description
    </SectionKicker>
    <div
      style={{
        color: 'var(--tt-comment)',
        fontSize: 12.5,
        lineHeight: 1.6,
        marginBottom: 14,
        maxWidth: 820,
      }}
    >
      a description does two jobs: say <span style={{ color: 'var(--tt-fg-dark)' }}>what</span>{' '}
      the skill does, and name the{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>situations</span> it should fire in. the
      second is the part most people forget. and it&apos;s what makes the difference between a
      skill that triggers and one that sits unused.
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
          borderLeft: '2px solid var(--tt-red)',
          borderRadius: 8,
          padding: '12px 14px',
        }}
      >
        <div style={{ color: 'var(--tt-red)', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          ✗ too vague
        </div>
        <div
          style={{
            background: 'var(--tt-bg-dark)',
            borderRadius: 5,
            color: 'var(--tt-fg-dark)',
            fontSize: 12,
            marginBottom: 7,
            padding: '8px 10px',
          }}
        >
          &quot;Helps with commits.&quot;
        </div>
        <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }}>
          no situations, no nouns the request will contain. the agent can&apos;t tell when to
          reach for it.
        </div>
      </div>
      <div
        style={{
          border: '1px solid var(--tt-border)',
          borderLeft: '2px solid var(--tt-green)',
          borderRadius: 8,
          padding: '12px 14px',
        }}
      >
        <div
          style={{ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700, marginBottom: 6 }}
        >
          ✓ specific + situational
        </div>
        <div
          style={{
            background: 'var(--tt-bg-dark)',
            borderRadius: 5,
            color: 'var(--tt-fg-dark)',
            fontSize: 12,
            marginBottom: 7,
            padding: '8px 10px',
          }}
        >
          &quot;Set up &amp; enforce Conventional Commits. semantic-release, commitlint, release
          automation. Use when a repo needs versioned releases or commit rules.&quot;
        </div>
        <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }}>
          verbs + nouns + the moments it applies.
        </div>
      </div>
    </div>

    <SectionKicker style={{ marginBottom: 14 }}>how matching works</SectionKicker>
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          maxWidth: 230,
          padding: '11px 14px',
        }}
      >
        <div style={{ color: 'var(--tt-comment)', fontSize: 11, marginBottom: 3 }}>request</div>
        <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12, lineHeight: 1.45 }}>
          &quot;Automate our releases from commit messages.&quot;
        </div>
      </div>
      <div
        style={{
          alignItems: 'center',
          color: 'var(--tt-comment)',
          display: 'flex',
          flexDirection: 'column',
          fontSize: 11,
        }}
      >
        <span>compared vs</span>
        <span style={{ color: 'var(--tt-comment)', fontSize: 16 }}>→</span>
        <span>name+description</span>
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          gap: 6,
          minWidth: 240,
        }}
      >
        {matchRows.map((row) => (
          <div
            key={row.name}
            style={{
              alignItems: 'center',
              border: '1px solid var(--tt-border)',
              borderLeft: row.selected ? '2px solid var(--tt-green)' : '1px solid var(--tt-border)',
              borderRadius: 6,
              display: 'flex',
              gap: 9,
              padding: '7px 11px',
            }}
          >
            <span
              style={{
                color: row.selected ? 'var(--tt-green)' : 'var(--tt-dim)',
                fontWeight: row.selected ? 700 : 400,
              }}
            >
              {row.selected ? '✓' : '✗'}
            </span>
            <span
              style={{
                color: row.selected ? 'var(--tt-fg)' : 'var(--tt-comment)',
                flex: 1,
                fontSize: 12.5,
              }}
            >
              {row.name}
            </span>
            <span
              style={{
                color: row.selected ? 'var(--tt-green)' : 'var(--tt-dim)',
                fontSize: 11,
              }}
            >
              {row.verdict}
            </span>
          </div>
        ))}
      </div>
    </div>
    <div
      style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }}
    >
      only metadata is compared, so the description is the whole pitch. once a skill wins, its
      SKILL.md body loads and the agent follows it.
    </div>

    <SectionKicker>inside the body</SectionKicker>
    <div
      style={{
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        marginBottom: 14,
        overflow: 'hidden',
      }}
    >
      {bodyRows.map((row, index) => (
        <div
          key={row.label}
          style={{
            borderBottom:
              index < bodyRows.length - 1 ? '1px solid var(--tt-dim)' : undefined,
            display: 'flex',
            fontSize: 12.5,
            gap: 12,
            padding: '9px 14px',
          }}
        >
          <span style={{ color: 'var(--tt-yellow)', flex: 'none', width: 96 }}>{row.label}</span>
          <span style={{ color: 'var(--tt-comment)' }}>{row.desc}</span>
        </div>
      ))}
    </div>
    <Callout accent="teal">
      <span style={{ color: 'var(--tt-teal)', fontWeight: 700 }}>keep the body lean.</span>{' '}
      everything in SKILL.md loads on every trigger. push depth into{' '}
      <span style={{ color: 'var(--tt-fg)' }}>reference/</span> files the agent opens only when
      it needs them, and let evals catch what the instructions miss.
    </Callout>
  </div>
);
