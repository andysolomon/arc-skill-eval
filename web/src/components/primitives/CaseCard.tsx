import { useTheme } from '@/state/theme';

export type CaseDeltaTag = 'PASS' | 'FAIL' | 'TIMEOUT';

export type CaseResult = {
  caseId: string;
  deltaTag: CaseDeltaTag;
  promptExcerpt: string;
  failureEvidenceBlock?: string;
  glyph?: string;
};

export type CaseCardProps = CaseResult;

const tagColors: Record<CaseDeltaTag, string> = {
  PASS: 'var(--tt-green)',
  FAIL: 'var(--tt-red)',
  TIMEOUT: 'var(--tt-orange)',
};

const defaultGlyphs: Record<CaseDeltaTag, string> = {
  PASS: 'P',
  FAIL: 'F',
  TIMEOUT: 'T',
};

const excerpt = (value: string) => (value.length > 80 ? `${value.slice(0, 77)}...` : value);

export const CaseCard = ({
  caseId,
  deltaTag,
  promptExcerpt,
  failureEvidenceBlock,
  glyph,
}: CaseCardProps) => {
  const { theme } = useTheme();
  const evidence = failureEvidenceBlock ?? 'no failure evidence';

  return (
    <article
      data-case-status={deltaTag}
      data-theme-variant={theme}
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        color: 'var(--tt-fg)',
        display: 'grid',
        gap: 'var(--tt-gap-3, 12px)',
        padding: 14,
      }}
    >
      <header style={{ alignItems: 'center', display: 'flex', gap: 'var(--tt-gap-2, 8px)', minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            color: tagColors[deltaTag],
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontWeight: 700,
          }}
        >
          {glyph ?? defaultGlyphs[deltaTag]}
        </span>
        <strong
          style={{
            flex: '1 1 auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 13,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {caseId}
        </strong>
        <span
          style={{
            border: '1px solid var(--tt-border)',
            color: tagColors[deltaTag],
            flex: '0 0 auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 11,
            padding: '3px 6px',
          }}
        >
          {deltaTag}
        </span>
      </header>
      <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.45, margin: 0 }}>{excerpt(promptExcerpt)}</p>
      <pre
        style={{
          background: 'var(--tt-bg)',
          border: '1px solid var(--tt-border)',
          color: deltaTag === 'PASS' ? 'var(--tt-comment)' : tagColors[deltaTag],
          fontSize: 12,
          lineHeight: 1.45,
          margin: 0,
          maxHeight: 96,
          overflow: 'auto',
          padding: 10,
          whiteSpace: 'pre-wrap',
        }}
      >
        {evidence}
      </pre>
    </article>
  );
};
