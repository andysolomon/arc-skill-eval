import type { ReactNode } from 'react';
import { Callout, ChapterHeader, pageStyle, SectionKicker } from './ui';

const deterministicTypes: { title: string; snippet: ReactNode; desc: ReactNode }[] = [
  {
    title: 'file-exists',
    snippet: (
      <>
        {'{ "type": '}
        <span style={{ color: 'var(--tt-cyan)' }}>&quot;file-exists&quot;</span>
        {', "path": ".releaserc.json" }'}
      </>
    ),
    desc: (
      <>
        passes if the path was written.{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>use when</span> the skill must produce a
        file. <span style={{ color: 'var(--tt-orange)' }}>gotcha:</span> assert the real output,
        never one the skill doesn&apos;t make.
      </>
    ),
  },
  {
    title: 'file-absent',
    snippet: (
      <>
        {'{ "type": '}
        <span style={{ color: 'var(--tt-cyan)' }}>&quot;file-absent&quot;</span>
        {', "path": ".releaserc.json" }'}
      </>
    ),
    desc: (
      <>
        passes if the path was <span style={{ color: 'var(--tt-fg-dark)' }}>not</span> written.{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>use when</span> a negative case must leave
        the repo untouched. <span style={{ color: 'var(--tt-orange)' }}>gotcha:</span> pair with
        a fixture that shouldn&apos;t trigger the skill.
      </>
    ),
  },
  {
    title: 'regex-match',
    snippet: (
      <>
        {'{ "type": '}
        <span style={{ color: 'var(--tt-cyan)' }}>&quot;regex-match&quot;</span>
        {', "pattern": "conventionalcommits" }'}
      </>
    ),
    desc: (
      <>
        passes if the pattern appears in the file.{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>use when</span> content must contain
        something specific. <span style={{ color: 'var(--tt-orange)' }}>gotcha:</span> match
        structure, not incidental prose.
      </>
    ),
  },
  {
    title: 'json-valid',
    snippet: (
      <>
        {'{ "type": '}
        <span style={{ color: 'var(--tt-cyan)' }}>&quot;json-valid&quot;</span>
        {', "path": "evals/evals.json" }'}
      </>
    ),
    desc: (
      <>
        passes if the file parses as JSON.{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>use when</span> output is config or a
        manifest. <span style={{ color: 'var(--tt-orange)' }}>gotcha:</span> add a regex-match to
        also check its shape.
      </>
    ),
  },
];

const behaviorTypes: { title: string; snippet: ReactNode; desc: ReactNode }[] = [
  {
    title: 'tool-call-required',
    snippet: (
      <>
        {'{ "kind": '}
        <span style={{ color: 'var(--tt-blue)' }}>&quot;behavior&quot;</span>
        {', "method": "tool-call-required", "value": "Write" }'}
      </>
    ),
    desc: (
      <>
        passes if the run actually called that tool.{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>use when</span> the <em>process</em> is the
        claim. add <span style={{ color: 'var(--tt-fg-dark)' }}>&quot;match&quot;</span> to check
        the tool input.
      </>
    ),
  },
  {
    title: 'tool-call-forbidden',
    snippet: (
      <>
        {'{ "kind": '}
        <span style={{ color: 'var(--tt-blue)' }}>&quot;behavior&quot;</span>
        {', "method": "tool-call-forbidden", "value": "Bash" }'}
      </>
    ),
    desc: (
      <>
        passes if the tool was <span style={{ color: 'var(--tt-fg-dark)' }}>never</span> called.{' '}
        <span style={{ color: 'var(--tt-orange)' }}>gotcha:</span> tool names are case-sensitive —{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>Write</span>, not <span style={{ color: 'var(--tt-fg-dark)' }}>write</span>.
      </>
    ),
  },
  {
    title: 'skill-read-required',
    snippet: (
      <>
        {'{ "kind": '}
        <span style={{ color: 'var(--tt-blue)' }}>&quot;behavior&quot;</span>
        {', "method": "skill-read-required", "value": "<skill>" }'}
      </>
    ),
    desc: (
      <>
        passes if the skill was actually read from disk.{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>use when</span> a routing case must prove the
        skill loaded.
      </>
    ),
  },
  {
    title: 'no-forbidden-files-touched',
    snippet: (
      <>
        {'{ "kind": '}
        <span style={{ color: 'var(--tt-blue)' }}>&quot;safety&quot;</span>
        {', "method": "no-forbidden-files-touched", "config": { "paths": [".env"] } }'}
      </>
    ),
    desc: (
      <>
        passes if none of those paths were written or edited.{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>use when</span> a run must leave sensitive
        files untouched.
      </>
    ),
  },
];

// Not yet gradeable — declared honestly so authors don't write checks that
// silently never run. Track them; don't ship suites that depend on them.
const roadmap: { label: string; desc: ReactNode }[] = [
  {
    label: 'not-regex',
    desc: (
      <>
        a pattern must NOT appear — e.g. no hardcoded{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>npm publish</span>
      </>
    ),
  },
  {
    label: 'json-path',
    desc: (
      <>
        a value at a key equals X —{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>.on == &quot;pull_request&quot;</span>
      </>
    ),
  },
  {
    label: 'command-exit',
    desc: (
      <>
        a script or the project&apos;s own test exits{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>0</span>
      </>
    ),
  },
  { label: 'count', desc: <>exactly N matches, not merely ≥ 1</> },
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

export const ChapterAssert = () => (
  <div style={pageStyle}>
    <ChapterHeader num="04" title="Writing assertions" />
    <div
      style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 28, maxWidth: 820 }}
    >
      an assertion is a single check with a boolean result. climb the ladder and stop at the
      cheapest rung that proves the claim:{' '}
      <span style={{ color: 'var(--tt-cyan)' }}>deterministic</span> (a script reads the files) →{' '}
      <span style={{ color: 'var(--tt-blue)' }}>behavior</span> (the run trace is inspected) →{' '}
      <span style={{ color: 'var(--tt-magenta)' }}>llm-judge</span> (a rubric decides — burns
      tokens, keep it last).
    </div>

    <SectionKicker style={{ marginBottom: 14 }}>choosing a check</SectionKicker>
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 18,
        marginBottom: 30,
      }}
    >
      <div
        style={{
          border: '1px solid var(--tt-border-active)',
          borderRadius: 8,
          color: 'var(--tt-fg)',
          fontSize: 13,
          lineHeight: 1.5,
          padding: '12px 16px',
        }}
      >
        can a script verify it
        <br />
        exactly, every time?
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
          <span style={{ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700 }}>yes →</span>
          <span
            style={{
              border: '1px solid var(--tt-border)',
              borderLeft: '2px solid var(--tt-cyan)',
              borderRadius: 6,
              color: 'var(--tt-cyan)',
              fontSize: 12.5,
              padding: '8px 12px',
            }}
          >
            deterministic assertion
          </span>
        </div>
        <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
          <span style={{ color: 'var(--tt-orange)', fontSize: 12, fontWeight: 700 }}>
            no{'  '}→
          </span>
          <span
            style={{
              border: '1px solid var(--tt-border)',
              borderLeft: '2px solid var(--tt-magenta)',
              borderRadius: 6,
              color: 'var(--tt-magenta)',
              fontSize: 12.5,
              padding: '8px 12px',
            }}
          >
            llm-judge assertion
          </span>
        </div>
      </div>
    </div>

    <SectionKicker>deterministic types — one by one</SectionKicker>
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(2, 1fr)',
        marginBottom: 30,
      }}
    >
      {deterministicTypes.map((type) => (
        <div
          key={type.title}
          style={{ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }}
        >
          <div
            style={{ color: 'var(--tt-cyan)', fontSize: 13, fontWeight: 700, marginBottom: 8 }}
          >
            {type.title}
          </div>
          <div
            style={{
              background: 'var(--tt-bg-dark)',
              borderRadius: 5,
              color: 'var(--tt-fg-dark)',
              fontSize: 11.5,
              marginBottom: 8,
              padding: '8px 10px',
            }}
          >
            {type.snippet}
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55 }}>
            {type.desc}
          </div>
        </div>
      ))}
    </div>

    <SectionKicker>behavior &amp; safety — graded from the run trace</SectionKicker>
    <div
      style={{ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.6, marginBottom: 14, maxWidth: 820 }}
    >
      still deterministic — no judge — but they read what the run <em>did</em> (tool calls, skill
      reads, touched files) instead of the files it left behind. reach for these when the{' '}
      <span style={{ color: 'var(--tt-blue)' }}>process</span> is the claim, before writing a
      prose rubric.
    </div>
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(2, 1fr)',
        marginBottom: 22,
      }}
    >
      {behaviorTypes.map((type) => (
        <div
          key={type.title}
          style={{ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }}
        >
          <div style={{ color: 'var(--tt-blue)', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            {type.title}
          </div>
          <div
            style={{
              background: 'var(--tt-bg-dark)',
              borderRadius: 5,
              color: 'var(--tt-fg-dark)',
              fontSize: 11,
              lineHeight: 1.5,
              marginBottom: 8,
              padding: '8px 10px',
              wordBreak: 'break-word',
            }}
          >
            {type.snippet}
          </div>
          <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55 }}>
            {type.desc}
          </div>
        </div>
      ))}
    </div>

    <SectionKicker>gate vs soft</SectionKicker>
    <div
      style={{
        border: '1px solid var(--tt-border)',
        borderLeft: '2px solid var(--tt-blue)',
        borderRadius: 8,
        color: 'var(--tt-comment)',
        fontSize: 12.5,
        lineHeight: 1.6,
        marginBottom: 30,
        maxWidth: 820,
        padding: '12px 15px',
      }}
    >
      by default every failed assertion fails the run. mark one{' '}
      <span style={{ color: 'var(--tt-fg)' }}>&quot;mustPass&quot;: false</span> or{' '}
      <span style={{ color: 'var(--tt-fg)' }}>&quot;severity&quot;: &quot;warn&quot;</span> to make
      a miss <span style={{ color: 'var(--tt-blue)' }}>soft</span> — it&apos;s recorded in{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>grading.json</span> but doesn&apos;t break the
      build. use soft for style and quality signals; run{' '}
      <span style={{ color: 'var(--tt-fg)' }}>--strict</span> in CI when you want them to gate too.
    </div>

    <SectionKicker>an llm-judge assertion</SectionKicker>
    <div
      style={{
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        marginBottom: 24,
        padding: '14px 16px',
      }}
    >
      <div style={{ color: 'var(--tt-comment)', fontSize: 11, marginBottom: 4 }}>RUBRIC</div>
      <div style={{ color: 'var(--tt-fg)', fontSize: 13, marginBottom: 14 }}>
        &quot;The response summarizes the semantic-release plugins it installed.&quot;
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div
          style={{
            background: 'var(--tt-bg-dark)',
            borderLeft: '2px solid var(--tt-green)',
            borderRadius: 6,
            padding: '10px 12px',
          }}
        >
          <div
            style={{ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700, marginBottom: 5 }}
          >
            ✓ pass
          </div>
          <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12, lineHeight: 1.5 }}>
            &quot;installs @semantic-release/commit-analyzer and release-notes-generator&quot;
          </div>
        </div>
        <div
          style={{
            background: 'var(--tt-bg-dark)',
            borderLeft: '2px solid var(--tt-red)',
            borderRadius: 6,
            padding: '10px 12px',
          }}
        >
          <div
            style={{ color: 'var(--tt-red)', fontSize: 12, fontWeight: 700, marginBottom: 5 }}
          >
            ✗ fail
          </div>
          <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12, lineHeight: 1.5 }}>
            &quot;Done — semantic-release is set up.&quot; — names no plugins
          </div>
        </div>
      </div>
    </div>

    <SectionKicker>a healthy mix</SectionKicker>
    <div
      style={{
        borderRadius: 5,
        display: 'flex',
        height: 22,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          background: 'var(--tt-cyan)',
          color: 'var(--tt-bg-dark)',
          display: 'flex',
          fontSize: 11,
          fontWeight: 700,
          paddingLeft: 12,
          width: '70%',
        }}
      >
        deterministic{'  '}~70%
      </div>
      <div
        style={{
          alignItems: 'center',
          background: 'var(--tt-magenta)',
          color: 'var(--tt-bg-dark)',
          display: 'flex',
          fontSize: 11,
          fontWeight: 700,
          paddingLeft: 12,
          width: '30%',
        }}
      >
        judge{'  '}~30%
      </div>
    </div>
    <Callout accent="orange" style={{ marginBottom: 34 }}>
      <span style={{ color: 'var(--tt-orange)', fontWeight: 700 }}>pin the judge.</span>{' '}
      deterministic checks are fast, free and repeatable — lean on them. the judge is powerful
      for prose but slower, costs tokens, and can drift run to run, so pass{' '}
      <span style={{ color: 'var(--tt-fg)' }}>--judge-model</span> explicitly and never let a
      model grade its own output.
    </Callout>

    <SectionKicker>anatomy of an assertion</SectionKicker>
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: '1fr 1fr',
        marginBottom: 32,
      }}
    >
      <div
        style={{ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }}
      >
        <div style={{ color: 'var(--tt-cyan)', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
          deterministic — fields
        </div>
        <div
          style={{
            background: 'var(--tt-bg-dark)',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.9,
            padding: '10px 12px',
          }}
        >
          <div>
            <span style={{ color: 'var(--tt-comment)' }}>{'{'}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, paddingLeft: '2ch' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: 'var(--tt-yellow)' }}>&quot;type&quot;</span>
              <span style={{ color: 'var(--tt-comment)' }}>: </span>
              <span style={{ color: 'var(--tt-cyan)' }}>&quot;regex-match&quot;</span>
              <span style={{ color: 'var(--tt-comment)' }}>,</span>
            </span>
            <span style={{ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }}>← the check</span>
          </div>
          <div style={{ display: 'flex', gap: 10, paddingLeft: '2ch' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: 'var(--tt-yellow)' }}>&quot;path&quot;</span>
              <span style={{ color: 'var(--tt-comment)' }}>: </span>
              <span style={{ color: 'var(--tt-fg-dark)' }}>&quot;commitlint.config.js&quot;</span>
              <span style={{ color: 'var(--tt-comment)' }}>,</span>
            </span>
            <span style={{ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }}>← where</span>
          </div>
          <div style={{ display: 'flex', gap: 10, paddingLeft: '2ch' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: 'var(--tt-yellow)' }}>&quot;pattern&quot;</span>
              <span style={{ color: 'var(--tt-comment)' }}>: </span>
              <span style={{ color: 'var(--tt-fg-dark)' }}>&quot;config-conventional&quot;</span>
            </span>
            <span style={{ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }}>← what</span>
          </div>
          <div>
            <span style={{ color: 'var(--tt-comment)' }}>{'}'}</span>
          </div>
        </div>
      </div>
      <div
        style={{ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '13px 15px' }}
      >
        <div
          style={{ color: 'var(--tt-magenta)', fontSize: 12, fontWeight: 700, marginBottom: 8 }}
        >
          judge — a single criterion
        </div>
        <div
          style={{
            background: 'var(--tt-bg-dark)',
            borderRadius: 6,
            color: 'var(--tt-fg-dark)',
            fontSize: 12.5,
            lineHeight: 1.6,
            marginBottom: 8,
            padding: '10px 12px',
          }}
        >
          &quot;The workflow triggers on pull_request, not push.&quot;
        </div>
        <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55 }}>
          one observable claim, graded true / false — not a paragraph, not a checklist.
        </div>
      </div>
    </div>

    <SectionKicker>on the roadmap — not gradeable yet</SectionKicker>
    <div
      style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 12, maxWidth: 820 }}
    >
      shapes we want but the runner does <span style={{ color: 'var(--tt-orange)' }}>not</span>{' '}
      grade yet — don&apos;t depend on them in a suite you rely on. express the same intent today
      with the checks above (e.g. <span style={{ color: 'var(--tt-fg-dark)' }}>not-regex</span> →
      a <span style={{ color: 'var(--tt-blue)' }}>command-forbidden</span> or a judge claim).
    </div>
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 32 }}
    >
      {roadmap.map((item) => (
        <div
          key={item.label}
          style={{
            border: '1px dashed var(--tt-border)',
            borderRadius: 7,
            display: 'flex',
            fontSize: 12.5,
            gap: 12,
            opacity: 0.75,
            padding: '9px 13px',
          }}
        >
          <span style={{ color: 'var(--tt-dim)', flex: 'none', width: 118 }}>{item.label}</span>
          <span style={{ color: 'var(--tt-comment)' }}>{item.desc}</span>
        </div>
      ))}
    </div>

    <SectionKicker>writing a good rubric</SectionKicker>
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
          borderLeft: '2px solid var(--tt-red)',
          borderRadius: 8,
          padding: '11px 14px',
        }}
      >
        <div style={{ color: 'var(--tt-red)', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          ✗ weak
        </div>
        <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.5 }}>
          &quot;The response is good and helpful.&quot;
        </div>
        <div style={{ color: 'var(--tt-comment)', fontSize: 11.5, marginTop: 6 }}>
          subjective — two people (or two runs) disagree.
        </div>
      </div>
      <div
        style={{
          border: '1px solid var(--tt-border)',
          borderLeft: '2px solid var(--tt-green)',
          borderRadius: 8,
          padding: '11px 14px',
        }}
      >
        <div
          style={{ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700, marginBottom: 6 }}
        >
          ✓ strong
        </div>
        <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.5 }}>
          &quot;Names each semantic-release plugin it installed.&quot;
        </div>
        <div style={{ color: 'var(--tt-comment)', fontSize: 11.5, marginTop: 6 }}>
          one observable claim, gradable the same way twice.
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }}>
      {['one claim', 'observable', 'binary', 'about behavior, not phrasing'].map((label) => (
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

    <SectionKicker style={{ marginBottom: 6 }}>grade hard</SectionKicker>
    <div
      style={{
        color: 'var(--tt-comment)',
        fontSize: 12.5,
        lineHeight: 1.6,
        marginBottom: 14,
        maxWidth: 820,
      }}
    >
      a PASS needs concrete evidence that quotes or references the output — never the benefit of
      the doubt. if the rubric says &quot;includes a summary&quot; and the output has a section
      titled Summary with one vague sentence, that&apos;s a{' '}
      <span style={{ color: 'var(--tt-red)' }}>FAIL</span> — the label is there, the substance
      isn&apos;t. and while grading, grade the assertions themselves: too easy, too hard, or
      unverifiable ones get fixed for the next iteration.
    </div>
    <div
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.9,
        marginBottom: 32,
        padding: '12px 15px',
      }}
    >
      <div>
        <span style={{ color: 'var(--tt-comment)' }}>{'{ '}</span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;passed&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-red)' }}>false</span>
        <span style={{ color: 'var(--tt-comment)' }}>,</span>
      </div>
      <div style={{ paddingLeft: '2ch' }}>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;text&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>&quot;Both axes are labeled&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>,</span>
      </div>
      <div style={{ paddingLeft: '2ch' }}>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;evidence&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>
          &quot;Y-axis reads &apos;Revenue ($)&apos; but the X-axis has no label&quot;
        </span>
        <span style={{ color: 'var(--tt-comment)' }}>{' }'}</span>
      </div>
    </div>

    <SectionKicker>judge failure modes</SectionKicker>
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
      {judgeFailures.map((failure) => (
        <div
          key={failure.title}
          style={{
            border: '1px solid var(--tt-border)',
            borderRadius: 7,
            display: 'flex',
            gap: 9,
            padding: '10px 13px',
          }}
        >
          <span style={{ color: 'var(--tt-red)', flex: 'none' }}>✗</span>
          <div>
            <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12.5, fontWeight: 700 }}>
              {failure.title}
            </div>
            <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }}>
              {failure.desc}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);
