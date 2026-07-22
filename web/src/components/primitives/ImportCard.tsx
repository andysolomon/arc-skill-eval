import { useState, type DragEvent } from 'react';
import { useEnv } from '@/state/env';

export type ImportCardProps = {
  onValidate: (text: string) => void;
  onSample: () => void;
};

export const ImportCard = ({ onValidate, onSample }: ImportCardProps) => {
  const { env } = useEnv();
  const [text, setText] = useState('');

  const readFile = (file: File) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      setText(typeof reader.result === 'string' ? reader.result : '');
    });
    reader.readAsText(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files.item(0);

    if (file) {
      readFile(file);
    }
  };

  return (
    <section
      data-env={env}
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        color: 'var(--tt-fg)',
        display: 'grid',
        gap: 'var(--tt-gap-3, 12px)',
        maxWidth: 560,
        padding: 16,
        width: '100%',
      }}
    >
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        style={{
          alignItems: 'center',
          border: '1px dashed var(--tt-border-active)',
          color: 'var(--tt-comment)',
          display: 'flex',
          justifyContent: 'center',
          minHeight: 104,
          padding: 16,
          textAlign: 'center',
        }}
      >
        import evals.json
      </div>
      <textarea
        aria-label="paste evals json"
        onChange={(event) => setText(event.target.value)}
        placeholder="paste evals.json"
        spellCheck={false}
        value={text}
        style={{
          background: 'var(--tt-bg)',
          border: '1px solid var(--tt-border)',
          color: 'var(--tt-fg)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          minHeight: 126,
          padding: 10,
          resize: 'vertical',
          width: '100%',
        }}
      />
      <footer style={{ display: 'flex', gap: 'var(--tt-gap-2, 8px)', justifyContent: 'flex-end' }}>
        <button
          onClick={() => onSample()}
          type="button"
          style={{
            background: 'var(--tt-bg)',
            border: '1px solid var(--tt-border)',
            color: 'var(--tt-cyan)',
            cursor: 'pointer',
            padding: '7px 10px',
          }}
        >
          sample
        </button>
        <button
          onClick={() => onValidate(text)}
          type="button"
          style={{
            background: 'var(--tt-selection)',
            border: '1px solid var(--tt-border-active)',
            color: 'var(--tt-fg)',
            cursor: 'pointer',
            padding: '7px 10px',
          }}
        >
          validate
        </button>
      </footer>
    </section>
  );
};
