import { useState, type DragEvent } from 'react';
import { color } from '@/design/tokens';
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
        background: color.bgDark,
        border: `1px solid ${color.border}`,
        color: color.fg,
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
          border: `1px dashed ${color.borderActive}`,
          color: color.comment,
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
          background: color.bg,
          border: `1px solid ${color.border}`,
          color: color.fg,
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
            background: color.bg,
            border: `1px solid ${color.border}`,
            color: color.cyan,
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
            background: color.selection,
            border: `1px solid ${color.borderActive}`,
            color: color.fg,
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
