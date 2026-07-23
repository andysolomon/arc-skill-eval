import { color, text } from '@/design/tokens';
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
  PASS: color.green,
  FAIL: color.red,
  TIMEOUT: color.orange,
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
        background: color.bgDark,
        border: `1px solid ${color.border}`,
        color: color.fg,
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
            fontSize: text.body,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {caseId}
        </strong>
        <span
          style={{
            border: `1px solid ${color.border}`,
            color: tagColors[deltaTag],
            flex: '0 0 auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: text['2xs'],
            padding: '3px 6px',
          }}
        >
          {deltaTag}
        </span>
      </header>
      <p style={{ color: color.fgDark, lineHeight: 1.45, margin: 0 }}>{excerpt(promptExcerpt)}</p>
      <pre
        style={{
          background: color.bg,
          border: `1px solid ${color.border}`,
          color: deltaTag === 'PASS' ? color.comment : tagColors[deltaTag],
          fontSize: text.sm,
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
