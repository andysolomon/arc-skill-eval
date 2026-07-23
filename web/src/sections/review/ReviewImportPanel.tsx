import { useState, type ChangeEvent, type DragEvent } from 'react';
import {
  inspectReviewArtifact,
  type ReviewImportInspection,
  type ReviewRun,
} from './useReviewData';

type ReviewImportPanelProps = {
  createSampleRun: () => ReviewRun;
  onImport: (runs: ReviewRun[]) => Promise<void>;
};

const chipStyle = (accent: boolean) => ({
  border: '1px solid var(--tt-border)',
  borderRadius: 5,
  color: accent ? 'var(--tt-cyan)' : 'var(--tt-fg-dark)',
  fontSize: 11,
  padding: '3px 8px',
});

export const ReviewImportPanel = ({ createSampleRun, onImport }: ReviewImportPanelProps) => {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReviewImportInspection | null>(null);

  const inspect = (source: string) => {
    const inspection = inspectReviewArtifact(source);

    setResult(inspection);

    if (inspection.runs) {
      void onImport(inspection.runs);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setText(content);
      inspect(content);
    });
    reader.readAsText(file);
  };

  const handleFilePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.item(0);

    if (file) {
      readFile(file);
    }

    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files.item(0);

    if (file) {
      readFile(file);
    }
  };

  const handleSample = () => {
    const sampleText = JSON.stringify(createSampleRun(), null, 2);

    setText(sampleText);
    inspect(sampleText);
  };

  return (
    <div
      style={{
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 9,
          marginBottom: 9,
        }}
      >
        <span
          data-testid="review-empty-state-kicker"
          style={{
            color: 'var(--tt-cyan)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          review imports — review a JSON artifact
        </span>
        <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>
          hosted has no LLM, so no runs — bring a file arc-skill-eval produced and inspect it here.
        </span>
      </div>
      <div
        aria-label="accepted import files"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}
      >
        {['evals.json', 'grading.json', 'benchmark.json', 'timing.json', 'feedback.json'].map(
          (label, index) => (
            <span key={label} style={chipStyle(index === 0)}>
              {label}
            </span>
          ),
        )}
      </div>
      <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <label
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            style={{
              alignItems: 'center',
              border: '1px dashed var(--tt-border)',
              borderRadius: 7,
              color: 'var(--tt-fg-dark)',
              cursor: 'pointer',
              display: 'flex',
              fontSize: 12.5,
              gap: 8,
              height: 34,
              justifyContent: 'center',
            }}
          >
            ⇱ choose file
            <input
              accept="application/json,.json"
              onChange={handleFilePick}
              style={{ display: 'none' }}
              type="file"
            />
          </label>
          <textarea
            aria-label="paste arc-skill-eval json"
            onChange={(event) => setText(event.target.value)}
            placeholder="…or paste any arc-skill-eval JSON"
            spellCheck={false}
            value={text}
            style={{
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 6,
              color: 'var(--tt-fg)',
              fontFamily: 'inherit',
              fontSize: 12,
              height: 80,
              marginTop: 8,
              outline: 'none',
              padding: 8,
              resize: 'none',
              width: '100%',
            }}
          />
        </div>
        <div style={{ flex: 'none', width: 300 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button
              onClick={() => inspect(text)}
              type="button"
              style={{
                alignItems: 'center',
                background: 'transparent',
                border: '1px solid var(--tt-border-active)',
                borderRadius: 6,
                color: 'var(--tt-blue)',
                cursor: 'pointer',
                display: 'flex',
                flex: 1,
                fontSize: 12.5,
                fontWeight: 700,
                height: 32,
                justifyContent: 'center',
              }}
            >
              inspect
            </button>
            <button
              onClick={handleSample}
              type="button"
              style={{
                alignItems: 'center',
                background: 'transparent',
                border: '1px solid var(--tt-border)',
                borderRadius: 6,
                color: 'var(--tt-fg-dark)',
                cursor: 'pointer',
                display: 'flex',
                fontSize: 12.5,
                height: 32,
                justifyContent: 'center',
                padding: '0 12px',
              }}
            >
              sample
            </button>
          </div>
          {result ? (
            <div
              aria-label="import inspection result"
              style={{
                border: '1px solid var(--tt-border)',
                borderRadius: 7,
                padding: '10px 12px',
              }}
            >
              {result.checks.map((check) => (
                <div
                  key={check.label}
                  style={{ display: 'flex', fontSize: 12, gap: 8, padding: '1px 0' }}
                >
                  <span
                    style={{
                      color: check.ok ? 'var(--tt-green)' : 'var(--tt-red)',
                      flex: 'none',
                      width: 12,
                    }}
                  >
                    {check.ok ? '✓' : '✗'}
                  </span>
                  <span style={{ color: 'var(--tt-fg-dark)' }}>{check.label}</span>
                </div>
              ))}
              {result.advisories.map((advisory) => (
                <div
                  key={advisory.label}
                  style={{ display: 'flex', fontSize: 12, gap: 8, padding: '1px 0' }}
                >
                  <span
                    style={{
                      color: advisory.ok ? 'var(--tt-green)' : 'var(--tt-comment)',
                      flex: 'none',
                      width: 12,
                    }}
                  >
                    {advisory.ok ? '✓' : '○'}
                  </span>
                  <span style={{ color: 'var(--tt-comment)' }}>
                    {advisory.label} <span style={{ color: 'var(--tt-dim)' }}>· recommended</span>
                  </span>
                </div>
              ))}
              {result.ok ? (
                <>
                  <div
                    style={{
                      color: 'var(--tt-green)',
                      fontSize: 12,
                      fontWeight: 700,
                      marginTop: 8,
                    }}
                  >
                    ✓ {result.kind}
                  </div>
                  {result.summary ? (
                    <div style={{ color: 'var(--tt-comment)', fontSize: 12, marginTop: 2 }}>
                      {result.summary}
                    </div>
                  ) : null}
                </>
              ) : null}
              {result.error ? (
                <div
                  role="alert"
                  style={{ color: 'var(--tt-red)', fontSize: 12, marginTop: 8 }}
                >
                  ✗ {result.error}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
