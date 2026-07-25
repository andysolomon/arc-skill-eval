import { useCreateAnimation } from '../useLearnAnimations';
import { Callout, ChapterHeader, fadeStyle, pageStyle, SectionKicker, TrafficDots } from './ui';

const pathChips = [
  { color: 'var(--tt-yellow)', label: 'behaviors' },
  { color: 'var(--tt-blue)', label: 'prompts' },
  { color: 'var(--tt-cyan)', label: 'assertions' },
  { color: 'var(--tt-green)', label: 'run --compare' },
  { color: 'var(--tt-magenta)', label: 'delta' },
];

const behaviorRows = [
  {
    text: 'configures semantic-release with the conventional preset',
    dim: 'outcome',
    color: 'var(--tt-green)',
  },
  { text: 'reads the skill before acting', dim: 'process', color: 'var(--tt-blue)' },
  { text: 'summarizes the plugins it installed', dim: 'style', color: 'var(--tt-magenta)' },
  {
    text: 'writes no release config for a docs-only change',
    dim: 'outcome',
    color: 'var(--tt-green)',
  },
];

const flavorCards = [
  {
    color: 'var(--tt-green)',
    label: 'explicit',
    prompt: '"Use arc-conventional-commits to set up semantic-release."',
  },
  {
    color: 'var(--tt-blue)',
    label: 'implicit',
    prompt: '"Set up automated releases driven by commit messages."',
  },
  {
    color: 'var(--tt-cyan)',
    label: 'contextual',
    prompt: '"We keep shipping wrong version bumps. Fix our release flow."',
  },
  {
    color: 'var(--tt-orange)',
    label: 'adjacent-negative',
    prompt: '"This PR only edits README.md — do I need a release?"',
  },
];

const pitfalls = [
  { title: 'fabricated files', desc: 'a file-exists on output the skill never produces' },
  { title: 'wording asserts', desc: 'failing a correct answer for paraphrasing' },
  { title: 'no negative case', desc: 'never testing where the skill should stay silent' },
  { title: 'judge overload', desc: 'using a judge where a regex would settle it' },
];

const codeColors = {
  kw: 'var(--tt-magenta)',
  fn: 'var(--tt-cyan)',
  str: 'var(--tt-green)',
  key: 'var(--tt-yellow)',
  punc: 'var(--tt-comment)',
  plain: 'var(--tt-fg-dark)',
} as const;

const { kw, fn, str, key, punc, plain } = codeColors;

type CodeToken = readonly [text: string, color: string];
type CodeRow = { indent?: number; toks: readonly CodeToken[] };

// The same arc-conventional-commits suite as the JSON above, authored with the
// typed builder. Kept faithful to the real arc-skill-eval/evals API.
const builderLines: readonly CodeRow[] = [
  { toks: [['import ', kw], ['{', punc]] },
  { indent: 2, toks: [['defineSkillEval, evalCase, seeded, fileExists, regexMatch, judge,', plain]] },
  { toks: [['} ', punc], ['from ', kw], ['"arc-skill-eval/evals"', str], [';', punc]] },
  { toks: [[' ', punc]] },
  { toks: [['export default ', kw], ['defineSkillEval', fn], ['({', punc]] },
  { indent: 2, toks: [['skill_name', key], [': ', punc], ['"arc-conventional-commits"', str], [',', punc]] },
  { indent: 2, toks: [['cases', key], [': [', punc]] },
  { indent: 4, toks: [['evalCase', fn], ['({', punc]] },
  { indent: 6, toks: [['id', key], [': ', punc], ['"trigger-explicit"', str], [',', punc]] },
  { indent: 6, toks: [['prompt', key], [': ', punc], ['"Set up semantic-release in this repo."', str], [',', punc]] },
  {
    indent: 6,
    toks: [
      ['setup', key],
      [': ', punc],
      ['seeded', fn],
      ['({ ', punc],
      ['from', key],
      [': ', punc],
      ['"files/clean-repo"', str],
      [' }),', punc],
    ],
  },
  { indent: 6, toks: [['assertions', key], [': [', punc]] },
  { indent: 8, toks: [['fileExists', fn], ['(', punc], ['".releaserc.json"', str], ['),', punc]] },
  { indent: 8, toks: [['regexMatch', fn], ['(', punc], ['"conventionalcommits"', str], ['),', punc]] },
  {
    indent: 8,
    toks: [
      ['judge', fn],
      ['(', punc],
      ['"Summarizes the plugins it installed."', str],
      [').', punc],
      ['soft', fn],
      ['(),', punc],
    ],
  },
  { indent: 6, toks: [['],', punc]] },
  { indent: 4, toks: [['}),', punc]] },
  { indent: 2, toks: [['],', punc]] },
  { toks: [['});', punc]] },
];

const codeCardStyle = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.85,
  overflowX: 'auto',
  padding: '14px 16px',
} as const;

const StepBadge = ({ num }: { num: string }) => (
  <div
    style={{
      alignItems: 'center',
      border: '1px solid var(--tt-border-active)',
      borderRadius: 8,
      color: 'var(--tt-blue)',
      display: 'flex',
      flex: 'none',
      fontSize: 13,
      fontWeight: 700,
      height: 34,
      justifyContent: 'center',
      width: 34,
    }}
  >
    {num}
  </div>
);

const stepCardStyle = {
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  flex: 1,
  minWidth: 0,
  padding: '14px 16px',
} as const;

const stepTitleStyle = {
  color: 'var(--tt-fg)',
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 5,
} as const;

const stepIntroStyle = {
  color: 'var(--tt-comment)',
  fontSize: 12.5,
  lineHeight: 1.6,
  marginBottom: 12,
} as const;

export const ChapterCreate = () => {
  const { ca, caSpin, fs, fsSpin, controlLabel, toggle, replay } = useCreateAnimation();

  return (
    <div style={pageStyle}>
      <ChapterHeader num="03" title="Creating an eval" />
      <div
        style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 24, maxWidth: 820 }}
      >
        you don&apos;t need a benchmark — you need a handful of prompts that pin the behaviors
        you care about, each with a few checks. here&apos;s the whole path, worked through on a
        real skill: <span style={{ color: 'var(--tt-teal)' }}>arc-conventional-commits</span>.
      </div>

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 28,
        }}
      >
        {pathChips.map((chip, index) => (
          <div key={chip.label} style={{ display: 'contents' }}>
            {index > 0 ? <span style={{ color: 'var(--tt-comment)' }}>→</span> : null}
            <span
              style={{
                border: '1px solid var(--tt-border)',
                borderRadius: 6,
                color: chip.color,
                fontSize: 12,
                padding: '6px 11px',
              }}
            >
              {chip.label}
            </span>
          </div>
        ))}
      </div>

      <SectionKicker style={{ marginBottom: 10 }}>watch a run</SectionKicker>
      <div
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          marginBottom: 30,
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
            arc-skill-eval
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
        <div style={{ fontSize: 12.5, lineHeight: 1.9, minHeight: 300, padding: '14px 16px' }}>
          <div style={fadeStyle(ca.cmd)}>
            <span style={{ color: 'var(--tt-green)' }}>$ </span>
            <span style={{ color: 'var(--tt-fg)' }}>
              arc-skill-eval create ./skills/arc-conventional-commits --compare
            </span>
          </div>
          <div style={fadeStyle(ca.read)}>
            <span style={{ color: 'var(--tt-green)' }}>✓</span>
            <span style={{ color: 'var(--tt-fg-dark)' }}> read SKILL.md · name + description ok</span>
          </div>
          <div style={fadeStyle(ca.prop)}>
            <span style={{ color: 'var(--tt-cyan)' }}>•</span>
            <span style={{ color: 'var(--tt-fg-dark)' }}>
              {' '}
              proposing cases from the skill&apos;s promise…
            </span>
          </div>
          <div style={{ ...fadeStyle(ca.c1), paddingLeft: '2ch' }}>
            <span style={{ color: 'var(--tt-green)' }}>✓ </span>
            <span style={{ color: 'var(--tt-fg-dark)' }}>trigger-explicit</span>
          </div>
          <div style={{ ...fadeStyle(ca.c2), paddingLeft: '2ch' }}>
            <span style={{ color: 'var(--tt-green)' }}>✓ </span>
            <span style={{ color: 'var(--tt-fg-dark)' }}>execution-golden-path</span>
          </div>
          <div style={{ ...fadeStyle(ca.c3), paddingLeft: '2ch' }}>
            <span style={{ color: 'var(--tt-green)' }}>✓ </span>
            <span style={{ color: 'var(--tt-fg-dark)' }}>adjacent-negative</span>
          </div>
          <div style={{ ...fadeStyle(ca.runh), marginTop: 6 }}>
            <span style={{ color: 'var(--tt-blue)' }}>▶ </span>
            <span style={{ color: 'var(--tt-fg-dark)' }}>
              run --compare · with_skill vs without_skill
            </span>
          </div>
          <div style={{ height: 26, marginTop: 2, position: 'relative' }}>
            <div style={{ ...fadeStyle(ca.running, 0.2), inset: 0, position: 'absolute' }}>
              <span style={{ color: 'var(--tt-cyan)' }}>{caSpin}</span>
              <span style={{ color: 'var(--tt-fg-dark)' }}>
                {' '}
                grading with_skill · without_skill…
              </span>
            </div>
            <div style={{ ...fadeStyle(ca.done), inset: 0, position: 'absolute' }}>
              <span style={{ color: 'var(--tt-green)', fontWeight: 700 }}>
                ✓ 3 cases · 6/6 assertions passed
              </span>
            </div>
          </div>
          <div style={fadeStyle(ca.bar1)}>
            <span style={{ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '14ch' }}>
              with_skill
            </span>
            <span style={{ color: 'var(--tt-green)' }}>▓▓▓▓▓▓▓▓▓▓▓▓▓▓</span>
            <span style={{ color: 'var(--tt-green)' }}>{' '}6/6</span>
          </div>
          <div style={fadeStyle(ca.bar2)}>
            <span style={{ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '14ch' }}>
              without_skill
            </span>
            <span style={{ color: 'var(--tt-orange)' }}>▓▓▓▓▓▓▓▓▓▓▓▓</span>
            <span style={{ color: 'var(--tt-dim)' }}>░░</span>
            <span style={{ color: 'var(--tt-orange)' }}>{' '}5/6</span>
          </div>
          <div style={{ ...fadeStyle(ca.delta, 0.45), marginTop: 6 }}>
            <span style={{ color: 'var(--tt-comment)' }}>delta{'  '}</span>
            <span style={{ color: 'var(--tt-green)', fontSize: 16, fontWeight: 700 }}>
              Δ +16.7%
            </span>
          </div>
          <div style={fadeStyle(ca.wrote)}>
            <span style={{ color: 'var(--tt-comment)' }}>wrote </span>
            <span style={{ color: 'var(--tt-teal)' }}>evals-runs/run-7af3/</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <StepBadge num="01" />
        <div style={stepCardStyle}>
          <div style={stepTitleStyle}>List the behaviors that matter</div>
          <div style={stepIntroStyle}>
            start from the skill&apos;s promise. write the must-pass behaviors as a checklist,
            and tag each with the dimension it lives in.
          </div>
          {behaviorRows.map((row) => (
            <div
              key={row.text}
              style={{
                alignItems: 'center',
                display: 'flex',
                fontSize: 12.5,
                gap: 9,
                padding: '4px 0',
              }}
            >
              <span style={{ color: 'var(--tt-green)' }}>✓</span>
              <span style={{ color: 'var(--tt-fg-dark)', flex: 1 }}>{row.text}</span>
              <span
                style={{
                  background: `color-mix(in srgb, ${row.color} 16%, var(--tt-bg))`,
                  borderRadius: 4,
                  color: row.color,
                  fontSize: 11,
                  padding: '2px 8px',
                }}
              >
                {row.dim}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <StepBadge num="02" />
        <div style={stepCardStyle}>
          <div style={stepTitleStyle}>Turn behaviors into prompts</div>
          <div style={stepIntroStyle}>
            for each behavior write a realistic prompt. cover the trigger boundary with four
            flavors.
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {flavorCards.map((card) => (
              <div
                key={card.label}
                style={{
                  background: 'var(--tt-bg-dark)',
                  borderLeft: `2px solid ${card.color}`,
                  borderRadius: 6,
                  padding: '9px 12px',
                }}
              >
                <div
                  style={{ color: card.color, fontSize: 11, fontWeight: 700, marginBottom: 3 }}
                >
                  {card.label}
                </div>
                <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12, lineHeight: 1.5 }}>
                  {card.prompt}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <StepBadge num="03" />
        <div style={stepCardStyle}>
          <div style={stepTitleStyle}>Attach assertions — deterministic first</div>
          <div style={stepIntroStyle}>
            give each case a few checks. reach for deterministic checks first; add a judge only
            for what scripts can&apos;t see.
          </div>
          <div
            style={{
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              fontSize: 12.5,
              lineHeight: 1.95,
              padding: '13px 15px',
            }}
          >
            <div>
              <span style={{ color: 'var(--tt-comment)' }}>{'{'}</span>
            </div>
            <div style={{ paddingLeft: '2ch' }}>
              <span style={{ color: 'var(--tt-yellow)' }}>&quot;prompt&quot;</span>
              <span style={{ color: 'var(--tt-comment)' }}>: </span>
              <span style={{ color: 'var(--tt-fg)' }}>
                &quot;Set up semantic-release in this repo.&quot;
              </span>
              <span style={{ color: 'var(--tt-comment)' }}>,</span>
            </div>
            <div style={{ paddingLeft: '2ch' }}>
              <span style={{ color: 'var(--tt-yellow)' }}>&quot;assertions&quot;</span>
              <span style={{ color: 'var(--tt-comment)' }}>: [</span>
            </div>
            <div style={{ display: 'flex', gap: 12, paddingLeft: '4ch' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--tt-cyan)' }}>
                  {'{ "type": "file-exists", "path": ".releaserc.json" }'}
                </span>
                <span style={{ color: 'var(--tt-comment)' }}>,</span>
              </span>
              <span style={{ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }}>← deterministic</span>
            </div>
            <div style={{ display: 'flex', gap: 12, paddingLeft: '4ch' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--tt-cyan)' }}>
                  {'{ "type": "regex-match", "pattern": "conventionalcommits" }'}
                </span>
                <span style={{ color: 'var(--tt-comment)' }}>,</span>
              </span>
              <span style={{ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }}>← deterministic</span>
            </div>
            <div style={{ display: 'flex', gap: 12, paddingLeft: '4ch' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--tt-magenta)' }}>
                  &quot;Summarizes the plugins it installed.&quot;
                </span>
              </span>
              <span style={{ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }}>← llm-judge</span>
            </div>
            <div style={{ paddingLeft: '2ch' }}>
              <span style={{ color: 'var(--tt-comment)' }}>]</span>
            </div>
            <div>
              <span style={{ color: 'var(--tt-comment)' }}>{'}'}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <StepBadge num="04" />
        <div style={stepCardStyle}>
          <div style={stepTitleStyle}>Run it — twice</div>
          <div style={stepIntroStyle}>
            the <span style={{ color: 'var(--tt-fg-dark)' }}>--compare</span> flag runs each case
            with the skill and again without it.
          </div>
          <div
            style={{
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              fontSize: 13,
              padding: '12px 15px',
            }}
          >
            <span style={{ color: 'var(--tt-green)' }}>$ </span>
            <span style={{ color: 'var(--tt-fg)' }}>
              arc-skill-eval run ./skills/arc-conventional-commits --compare
            </span>
          </div>
          <div
            style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginTop: 8 }}
          >
            without <span style={{ color: 'var(--tt-fg-dark)' }}>--compare</span> you get a
            single score. with it, you get the difference the skill makes — the load-bearing
            signal.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
        <StepBadge num="05" />
        <div style={stepCardStyle}>
          <div style={stepTitleStyle}>Read the delta, then grow the suite</div>
          <div style={stepIntroStyle}>
            a positive delta is your evidence. every failure you fix by hand becomes the next
            case.
          </div>
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div>
              <span
                style={{ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '14ch' }}
              >
                with_skill
              </span>
              <span style={{ color: 'var(--tt-green)' }}>▓▓▓▓▓▓▓▓▓▓▓▓▓▓</span>
              <span style={{ color: 'var(--tt-green)' }}>{' '}6/6</span>
            </div>
            <div>
              <span
                style={{ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '14ch' }}
              >
                without_skill
              </span>
              <span style={{ color: 'var(--tt-orange)' }}>▓▓▓▓▓▓▓▓▓▓▓▓</span>
              <span style={{ color: 'var(--tt-dim)' }}>░░</span>
              <span style={{ color: 'var(--tt-orange)' }}>{' '}5/6</span>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <span style={{ color: 'var(--tt-comment)' }}>delta{'  '}</span>
            <span style={{ color: 'var(--tt-green)', fontSize: 18, fontWeight: 700 }}>
              Δ +16.7%
            </span>
          </div>
        </div>
      </div>

      <SectionKicker style={{ marginBottom: 10 }}>figure — interactive authoring</SectionKicker>
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
            arc-skill-eval create --interactive
          </span>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.85, padding: '14px 16px' }}>
          <div>
            <span style={{ color: 'var(--tt-green)' }}>$ </span>
            <span style={{ color: 'var(--tt-fg)' }}>
              arc-skill-eval create ./skills/arc-conventional-commits --interactive
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--tt-green)' }}>✓</span>
            <span style={{ color: 'var(--tt-fg-dark)' }}> read SKILL.md · proposing 3 cases…</span>
          </div>
          <div style={{ height: 8 }} />
          <div
            style={{
              background: 'var(--tt-bg)',
              border: '1px solid var(--tt-border)',
              borderRadius: 6,
              padding: '10px 12px',
            }}
          >
            <div>
              <span style={{ color: 'var(--tt-comment)' }}>case 2/3{'  '}</span>
              <span style={{ color: 'var(--tt-yellow)', fontWeight: 700 }}>
                execution-golden-path
              </span>
            </div>
            <div style={{ paddingLeft: '2ch' }}>
              <span style={{ color: 'var(--tt-comment)' }}>prompt{'  '}</span>
              <span style={{ color: 'var(--tt-fg)' }}>
                &quot;Add a CI job that enforces Conventional Commits.&quot;
              </span>
            </div>
            <div style={{ paddingLeft: '2ch' }}>
              <span style={{ color: 'var(--tt-comment)' }}>assert{'  '}</span>
              <span style={{ color: 'var(--tt-cyan)' }}>
                file-exists .github/workflows/commitlint.yml
              </span>
            </div>
            <div style={{ paddingLeft: '2ch' }}>
              <span style={{ color: 'var(--tt-comment)' }}>{' '.repeat(8)}</span>
              <span style={{ color: 'var(--tt-magenta)' }}>
                llm-judge · triggers on pull_request
              </span>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <span style={{ color: 'var(--tt-green)' }}>[a]</span>
            <span style={{ color: 'var(--tt-fg-dark)' }}> accept{'  '}</span>
            <span style={{ color: 'var(--tt-orange)' }}>[s]</span>
            <span style={{ color: 'var(--tt-fg-dark)' }}> skip{'  '}</span>
            <span style={{ color: 'var(--tt-blue)' }}>[e]</span>
            <span style={{ color: 'var(--tt-fg-dark)' }}> edit{'   '}</span>
            <span style={{ color: 'var(--tt-comment)' }}>› </span>
            <span style={{ color: 'var(--tt-fg)' }}>a</span>
            <span style={{ background: 'var(--tt-fg)', color: 'var(--tt-fg)' }}>{' '}</span>
          </div>
        </div>
      </div>
      <div
        style={{ color: 'var(--tt-comment)', fontSize: 11.5, lineHeight: 1.6, marginBottom: 8 }}
      >
        <span style={{ color: 'var(--tt-fg-dark)' }}>--interactive</span> walks each proposed
        case — accept / skip / edit before anything is written to{' '}
        <span style={{ color: 'var(--tt-teal)' }}>evals/evals.json</span>.
      </div>

      <SectionKicker style={{ margin: '34px 0 12px' }}>what makes a good case</SectionKicker>
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
            borderRadius: 8,
            borderTop: '2px solid var(--tt-green)',
            padding: '13px 15px',
          }}
        >
          <div
            style={{ color: 'var(--tt-green)', fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}
          >
            do
          </div>
          <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.85 }}>
            <div>· one behavior per case</div>
            <div>· a realistic prompt in the user&apos;s words</div>
            <div>· a fixed starting state (a fixture)</div>
            <div>· check artifacts &amp; behavior, not wording</div>
          </div>
        </div>
        <div
          style={{
            border: '1px solid var(--tt-border)',
            borderRadius: 8,
            borderTop: '2px solid var(--tt-red)',
            padding: '13px 15px',
          }}
        >
          <div
            style={{ color: 'var(--tt-red)', fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}
          >
            don&apos;t
          </div>
          <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.85 }}>
            <div>· bundle five behaviors into one prompt</div>
            <div>· assert exact phrasing</div>
            <div>· depend on the network or the clock</div>
            <div>· test only the happy path</div>
          </div>
        </div>
      </div>

      <SectionKicker>fixtures — pin the starting state</SectionKicker>
      <div
        style={{
          color: 'var(--tt-comment)',
          fontSize: 12.5,
          lineHeight: 1.6,
          marginBottom: 14,
          maxWidth: 820,
        }}
      >
        a case runs against a <span style={{ color: 'var(--tt-fg-dark)' }}>setup</span> directory
        copied into a fresh sandbox, so every run starts from the same place and a check means
        the same thing each time.
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
            fontSize: 11,
            gap: 8,
            padding: '7px 12px',
          }}
        >
          <span style={{ color: 'var(--tt-teal)', fontWeight: 700 }}>sandbox</span>
          <span style={{ color: 'var(--tt-comment)' }}>execution-golden-path</span>
          <span style={{ flex: 1 }} />
          <span onClick={toggle} style={{ color: 'var(--tt-comment)', cursor: 'pointer' }}>
            {controlLabel}
          </span>
          <span onClick={replay} style={{ color: 'var(--tt-comment)', cursor: 'pointer' }}>
            ↻ replay
          </span>
        </div>
        <div style={{ display: 'flex', minHeight: 264 }}>
          <div
            style={{
              borderRight: '1px solid var(--tt-border)',
              flex: 1,
              fontSize: 12.5,
              lineHeight: 1.85,
              minWidth: 0,
              padding: '13px 16px',
            }}
          >
            <div style={{ color: 'var(--tt-comment)', marginBottom: 8 }}>
              prompt{'  '}
              <span style={{ color: 'var(--tt-fg-dark)' }}>
                &quot;Add a CI job that enforces Conventional Commits.&quot;
              </span>
            </div>
            <div style={{ ...fadeStyle(fs.copy), marginBottom: 6 }}>
              <span style={{ color: 'var(--tt-cyan)' }}>⇄</span>
              <span style={{ color: 'var(--tt-comment)' }}> copied files/clean-repo → sandbox</span>
            </div>
            <div style={fadeStyle(fs.root, 0.3)}>
              <span style={{ color: 'var(--tt-teal)' }}>repo/</span>
            </div>
            <div style={fadeStyle(fs.pkg, 0.3)}>
              <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
              <span style={{ color: 'var(--tt-fg-dark)' }}>package.json</span>
            </div>
            <div style={fadeStyle(fs.src, 0.3)}>
              <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
              <span style={{ color: 'var(--tt-fg-dark)' }}>src/index.js</span>
            </div>
            <div style={fadeStyle(fs.readme, 0.3)}>
              <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
              <span style={{ color: 'var(--tt-fg-dark)' }}>README.md</span>
            </div>
            <div style={{ height: 24, margin: '2px 0', position: 'relative' }}>
              <div style={{ ...fadeStyle(fs.running, 0.2), inset: 0, position: 'absolute' }}>
                <span style={{ color: 'var(--tt-cyan)' }}>{fsSpin}</span>
                <span style={{ color: 'var(--tt-fg-dark)' }}> agent working…</span>
              </div>
            </div>
            <div style={fadeStyle(fs.fnew1, 0.4)}>
              <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
              <span style={{ color: 'var(--tt-green)' }}>commitlint.config.js</span>
              <span style={{ color: 'var(--tt-green)', fontSize: 10 }}>{'  '}＋new</span>
            </div>
            <div style={fadeStyle(fs.fnew2, 0.4)}>
              <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
              <span style={{ color: 'var(--tt-green)' }}>.github/workflows/commitlint.yml</span>
              <span style={{ color: 'var(--tt-green)', fontSize: 10 }}>{'  '}＋new</span>
            </div>
            <div style={fadeStyle(fs.fnew3, 0.4)}>
              <span style={{ color: 'var(--tt-dim)' }}>└─ </span>
              <span style={{ color: 'var(--tt-green)' }}>.releaserc.json</span>
              <span style={{ color: 'var(--tt-green)', fontSize: 10 }}>{'  '}＋new</span>
            </div>
          </div>
          <div
            style={{
              flex: 'none',
              fontSize: 12,
              lineHeight: 1.7,
              padding: '13px 16px',
              width: 316,
            }}
          >
            <div
              style={{
                color: 'var(--tt-cyan)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.05em',
                marginBottom: 10,
              }}
            >
              ASSERTIONS
            </div>
            <div style={{ height: 22, marginBottom: 4, position: 'relative' }}>
              <div style={{ ...fadeStyle(fs.checking, 0.2), inset: 0, position: 'absolute' }}>
                <span style={{ color: 'var(--tt-cyan)' }}>{fsSpin}</span>
                <span style={{ color: 'var(--tt-comment)' }}> checking files…</span>
              </div>
            </div>
            <div style={{ ...fadeStyle(fs.a1), display: 'flex', gap: 8, padding: '3px 0' }}>
              <span style={{ color: 'var(--tt-green)' }}>✓</span>
              <span style={{ color: 'var(--tt-cyan)', flex: 'none', width: 88 }}>file-exists</span>
              <span style={{ color: 'var(--tt-comment)', minWidth: 0 }}>
                workflows/commitlint.yml
              </span>
            </div>
            <div style={{ ...fadeStyle(fs.a2), display: 'flex', gap: 8, padding: '3px 0' }}>
              <span style={{ color: 'var(--tt-green)' }}>✓</span>
              <span style={{ color: 'var(--tt-cyan)', flex: 'none', width: 88 }}>regex-match</span>
              <span style={{ color: 'var(--tt-comment)', minWidth: 0 }}>config-conventional</span>
            </div>
            <div style={{ ...fadeStyle(fs.a3), display: 'flex', gap: 8, padding: '3px 0' }}>
              <span style={{ color: 'var(--tt-green)' }}>✓</span>
              <span style={{ color: 'var(--tt-cyan)', flex: 'none', width: 88 }}>json-valid</span>
              <span style={{ color: 'var(--tt-comment)', minWidth: 0 }}>.releaserc.json</span>
            </div>
            <div style={{ ...fadeStyle(fs.a4), display: 'flex', gap: 8, padding: '3px 0' }}>
              <span style={{ color: 'var(--tt-green)' }}>✓</span>
              <span style={{ color: 'var(--tt-magenta)', flex: 'none', width: 88 }}>
                file-absent
              </span>
              <span style={{ color: 'var(--tt-comment)', minWidth: 0 }}>.npmrc · never written</span>
            </div>
            <div
              style={{
                ...fadeStyle(fs.pass, 0.45),
                borderTop: '1px solid var(--tt-border)',
                marginTop: 12,
                paddingTop: 10,
              }}
            >
              <span style={{ color: 'var(--tt-green)', fontWeight: 700 }}>4/4 passed</span>
              <span style={{ color: 'var(--tt-comment)' }}>
                {'  '}fixture reset for next run
              </span>
            </div>
          </div>
        </div>
      </div>
      <div
        style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.6, marginBottom: 32 }}
      >
        a negative case just points at a different fixture — e.g.{' '}
        <span style={{ color: 'var(--tt-teal)' }}>files/docs-only</span> — so &quot;should do
        nothing&quot; is testable too.
      </div>

      <SectionKicker>a fuller evals.json</SectionKicker>
      <div
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.85,
          marginBottom: 32,
          padding: '14px 16px',
        }}
      >
        <div>
          <span style={{ color: 'var(--tt-comment)' }}>{'{'}</span>
        </div>
        <div style={{ paddingLeft: '2ch' }}>
          <span style={{ color: 'var(--tt-yellow)' }}>&quot;skill_name&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-green)' }}>&quot;arc-conventional-commits&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>,</span>
        </div>
        <div style={{ paddingLeft: '2ch' }}>
          <span style={{ color: 'var(--tt-yellow)' }}>&quot;evals&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>: [</span>
        </div>
        <div style={{ paddingLeft: '4ch' }}>
          <span style={{ color: 'var(--tt-comment)' }}>{'{'}</span>
        </div>
        <div style={{ paddingLeft: '6ch' }}>
          <span style={{ color: 'var(--tt-yellow)' }}>&quot;id&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-fg)' }}>&quot;trigger-explicit&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>,</span>
        </div>
        <div style={{ paddingLeft: '6ch' }}>
          <span style={{ color: 'var(--tt-yellow)' }}>&quot;prompt&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-fg)' }}>
            &quot;Set up semantic-release in this repo.&quot;
          </span>
          <span style={{ color: 'var(--tt-comment)' }}>,</span>
        </div>
        <div style={{ paddingLeft: '6ch' }}>
          <span style={{ color: 'var(--tt-yellow)' }}>&quot;setup&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-teal)' }}>&quot;files/clean-repo&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>,</span>
        </div>
        <div style={{ paddingLeft: '6ch' }}>
          <span style={{ color: 'var(--tt-yellow)' }}>&quot;assertions&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>: [</span>
        </div>
        <div style={{ paddingLeft: '8ch' }}>
          <span style={{ color: 'var(--tt-cyan)' }}>
            {'{ "type": "file-exists", "path": ".releaserc.json" }'}
          </span>
          <span style={{ color: 'var(--tt-comment)' }}>,</span>
        </div>
        <div style={{ paddingLeft: '8ch' }}>
          <span style={{ color: 'var(--tt-cyan)' }}>
            {'{ "type": "regex-match", "pattern": "conventionalcommits" }'}
          </span>
          <span style={{ color: 'var(--tt-comment)' }}>,</span>
        </div>
        <div style={{ paddingLeft: '8ch' }}>
          <span style={{ color: 'var(--tt-magenta)' }}>
            &quot;Summarizes the plugins it installed.&quot;
          </span>
        </div>
        <div style={{ paddingLeft: '6ch' }}>
          <span style={{ color: 'var(--tt-comment)' }}>]</span>
        </div>
        <div style={{ paddingLeft: '4ch' }}>
          <span style={{ color: 'var(--tt-comment)' }}>{'}, {'}</span>
        </div>
        <div style={{ paddingLeft: '6ch' }}>
          <span style={{ color: 'var(--tt-yellow)' }}>&quot;id&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-fg)' }}>&quot;adjacent-negative&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>,</span>
        </div>
        <div style={{ paddingLeft: '6ch' }}>
          <span style={{ color: 'var(--tt-yellow)' }}>&quot;prompt&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-fg)' }}>
            &quot;This PR only edits README.md — need a release?&quot;
          </span>
          <span style={{ color: 'var(--tt-comment)' }}>,</span>
        </div>
        <div style={{ paddingLeft: '6ch' }}>
          <span style={{ color: 'var(--tt-yellow)' }}>&quot;setup&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>: </span>
          <span style={{ color: 'var(--tt-teal)' }}>&quot;files/docs-only&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>,</span>
        </div>
        <div style={{ paddingLeft: '6ch' }}>
          <span style={{ color: 'var(--tt-yellow)' }}>&quot;assertions&quot;</span>
          <span style={{ color: 'var(--tt-comment)' }}>: [</span>
        </div>
        <div style={{ paddingLeft: '8ch' }}>
          <span style={{ color: 'var(--tt-cyan)' }}>
            {'{ "type": "file-absent", "path": ".releaserc.json" }'}
          </span>
          <span style={{ color: 'var(--tt-comment)' }}>,</span>
        </div>
        <div style={{ paddingLeft: '8ch' }}>
          <span style={{ color: 'var(--tt-magenta)' }}>
            &quot;Explains a docs-only change triggers no release.&quot;
          </span>
        </div>
        <div style={{ paddingLeft: '6ch' }}>
          <span style={{ color: 'var(--tt-comment)' }}>]</span>
        </div>
        <div style={{ paddingLeft: '4ch' }}>
          <span style={{ color: 'var(--tt-comment)' }}>{'}'}</span>
        </div>
        <div style={{ paddingLeft: '2ch' }}>
          <span style={{ color: 'var(--tt-comment)' }}>]</span>
        </div>
        <div>
          <span style={{ color: 'var(--tt-comment)' }}>{'}'}</span>
        </div>
      </div>

      <SectionKicker>advanced — the typed builder</SectionKicker>
      <div
        style={{
          color: 'var(--tt-comment)',
          fontSize: 12.5,
          lineHeight: 1.6,
          marginBottom: 14,
          maxWidth: 820,
        }}
      >
        the json is the contract — but you don&apos;t have to hand-write it. for larger suites,
        author them in typescript with{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>defineSkillEval</span>: type-checked helpers
        and one source of truth, then compile to{' '}
        <span style={{ color: 'var(--tt-teal)' }}>evals/evals.json</span> with{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>emit</span>. same suite as above, authored
        in code:
      </div>

      <div style={{ ...codeCardStyle, marginBottom: 12, overflow: 'hidden' }}>
        <div
          style={{
            alignItems: 'center',
            borderBottom: '1px solid var(--tt-border)',
            display: 'flex',
            gap: 6,
            margin: '-14px -16px 12px',
            padding: '7px 12px',
          }}
        >
          <TrafficDots />
          <span style={{ color: 'var(--tt-comment)', fontSize: 11, marginLeft: 8 }}>
            evals/evals.eval.ts
          </span>
        </div>
        {builderLines.map((line, index) => (
          <div key={index} style={{ paddingLeft: `${line.indent ?? 0}ch` }}>
            {line.toks.map((token, tokenIndex) => (
              <span key={tokenIndex} style={{ color: token[1] }}>
                {token[0]}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div style={{ ...codeCardStyle, lineHeight: 1.9, marginBottom: 12 }}>
        <div>
          <span style={{ color: 'var(--tt-green)' }}>$ </span>
          <span style={{ color: 'var(--tt-fg)' }}>
            arc-skill-eval emit ./skills/arc-conventional-commits
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--tt-green)' }}>✓</span>
          <span style={{ color: 'var(--tt-fg-dark)' }}> wrote evals/evals.json · 3 cases</span>
        </div>
        <div style={{ height: 8 }} />
        <div>
          <span style={{ color: 'var(--tt-green)' }}>$ </span>
          <span style={{ color: 'var(--tt-fg)' }}>
            arc-skill-eval emit ./skills/arc-conventional-commits --check
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ color: 'var(--tt-green)' }}>✓</span>
            <span style={{ color: 'var(--tt-fg-dark)' }}> evals/evals.json is up to date</span>
          </span>
          <span style={{ color: 'var(--tt-dim)', whiteSpace: 'nowrap' }}>← guards drift in ci</span>
        </div>
      </div>

      <div
        style={{
          color: 'var(--tt-comment)',
          fontSize: 12,
          lineHeight: 1.6,
          marginBottom: 16,
          maxWidth: 820,
        }}
      >
        the same chain that sets severity also unlocks{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>scored</span> judges:{' '}
        <span style={{ color: 'var(--tt-cyan)' }}>judge(&quot;…&quot;).atLeast(4)</span> grades the
        output on a 1–5 rubric and passes only at or above the bar — the score lands in{' '}
        <span style={{ color: 'var(--tt-teal)' }}>grading.json</span>. use it when a hard pass/fail
        is too blunt for a quality signal.
      </div>

      <Callout accent="cyan" style={{ marginBottom: 32 }}>
        the runner still reads <span style={{ color: 'var(--tt-teal)' }}>evals/evals.json</span>,
        never the <span style={{ color: 'var(--tt-fg-dark)' }}>.eval.ts</span> — the builder is an
        authoring convenience, not a second runtime. wire{' '}
        <span style={{ color: 'var(--tt-fg-dark)' }}>emit --check</span> into ci and the build
        fails whenever the committed json drifts from the suite.
      </Callout>

      <SectionKicker>common pitfalls</SectionKicker>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
        {pitfalls.map((pitfall) => (
          <div
            key={pitfall.title}
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
                {pitfall.title}
              </div>
              <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5 }}>
                {pitfall.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
