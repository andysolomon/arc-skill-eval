import { useCallback, useEffect, useState } from 'react';
import { color, radius, text } from '@/design/tokens';

/**
 * Interactive, daemon-backed directory picker. Unlike a browser `webkitdirectory`
 * upload (which only exposes the picked folder's name, never an absolute path),
 * this navigates the real filesystem through the daemon's `GET /fs` endpoint and
 * yields a real absolute path — a reference, not an upload. On-brand with the
 * TUI tree aesthetic (design.md §2).
 */

type FsEntry = {
  name: string;
  path: string;
  type: 'dir' | 'file';
  isSkill: boolean;
  hasEvalsRuns: boolean;
};

type FsListing = {
  ok: boolean;
  path: string;
  parent: string | null;
  entries: FsEntry[];
  error?: string;
};

const FS_URL = 'http://localhost:7357/fs';

const rowBase = {
  alignItems: 'center',
  background: 'transparent',
  border: 0,
  borderRadius: radius.md,
  cursor: 'pointer',
  display: 'flex',
  gap: 7,
  padding: '5px 8px',
  textAlign: 'left',
  width: '100%',
} as const;

export type FolderPickerProps = {
  initialPath?: string;
  onPick: (absolutePath: string) => void;
  onExit: () => void;
};

export const FolderPicker = ({ initialPath, onPick, onExit }: FolderPickerProps) => {
  const [listing, setListing] = useState<FsListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((path?: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const url = path ? `${FS_URL}?path=${encodeURIComponent(path)}` : FS_URL;

    void fetch(url, { signal })
      .then((response) => response.json() as Promise<FsListing>)
      .then((data) => {
        if (signal?.aborted) {
          return;
        }
        if (data.ok) {
          setListing(data);
        } else {
          setError(data.error ?? 'could not read that directory');
        }
      })
      .catch(() => {
        if (!signal?.aborted) {
          setError('daemon offline — start it with npm run dev');
        }
      })
      .finally(() => {
        if (!signal?.aborted) {
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(initialPath, controller.signal);
    return () => controller.abort();
  }, [initialPath, load]);

  const directories = listing?.entries.filter((entry) => entry.type === 'dir') ?? [];
  const files = listing?.entries.filter((entry) => entry.type === 'file') ?? [];

  return (
    <div data-testid="folder-picker">
      <div
        style={{
          alignItems: 'center',
          borderBottom: `1px solid ${color.border}`,
          display: 'flex',
          gap: 8,
          padding: '7px 12px',
        }}
      >
        <button
          aria-label="back to favorites"
          onClick={onExit}
          type="button"
          style={{
            background: 'transparent',
            border: 0,
            color: color.comment,
            cursor: 'pointer',
            fontSize: text.sm,
            padding: 0,
          }}
        >
          ← back
        </button>
        <span style={{ color: color.dim, fontSize: text['2xs'] }}>pick a folder to reference</span>
      </div>

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 8,
          padding: '7px 12px 3px',
        }}
      >
        <button
          aria-label="parent directory"
          disabled={!listing?.parent}
          onClick={() => listing?.parent && load(listing.parent)}
          type="button"
          style={{
            background: 'transparent',
            border: `1px solid ${color.border}`,
            borderRadius: radius.sm,
            color: listing?.parent ? color.fgDark : color.dim,
            cursor: listing?.parent ? 'pointer' : 'not-allowed',
            flex: 'none',
            fontSize: text.sm,
            padding: '1px 7px',
          }}
        >
          ↑ up
        </button>
        <span
          title={listing?.path}
          style={{
            color: color.teal,
            direction: 'rtl',
            fontSize: text.xs,
            overflow: 'hidden',
            textAlign: 'left',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {listing?.path ?? '…'}
        </span>
      </div>

      <div style={{ maxHeight: 220, overflow: 'auto', padding: '2px 5px 5px' }}>
        {loading ? (
          <div style={{ color: color.comment, fontSize: text.sm, padding: '6px 8px' }}>
            reading…
          </div>
        ) : null}
        {error ? (
          <div style={{ color: color.red, fontSize: text.xs, padding: '6px 8px' }}>✗ {error}</div>
        ) : null}
        {!loading && !error && directories.length === 0 && files.length === 0 ? (
          <div style={{ color: color.comment, fontSize: text.sm, padding: '6px 8px' }}>
            empty directory
          </div>
        ) : null}

        {directories.map((entry) => (
          <button
            className="folder-picker-row"
            key={entry.path}
            onClick={() => load(entry.path)}
            title={entry.path}
            type="button"
            style={rowBase}
          >
            <span aria-hidden="true" style={{ color: color.dim, flex: 'none' }}>
              └
            </span>
            <span
              style={{
                color: color.teal,
                flex: 1,
                fontSize: text.sm,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.name}/
            </span>
            {entry.isSkill ? (
              <span style={{ color: color.green, flex: 'none', fontSize: text['2xs'] }}>skill</span>
            ) : null}
            {entry.hasEvalsRuns ? (
              <span style={{ color: color.cyan, flex: 'none', fontSize: text['2xs'] }}>runs</span>
            ) : null}
            <span aria-hidden="true" style={{ color: color.dim, flex: 'none', fontSize: text['3xs'] }}>
              ›
            </span>
          </button>
        ))}

        {files.map((entry) => (
          <div
            key={entry.path}
            style={{ ...rowBase, cursor: 'default' }}
            title={entry.name}
          >
            <span aria-hidden="true" style={{ color: color.dim, flex: 'none' }}>
              ·
            </span>
            <span
              style={{
                color: color.comment,
                flex: 1,
                fontSize: text.sm,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.name}
            </span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${color.border}`, padding: '8px 12px' }}>
        <button
          disabled={!listing?.ok}
          onClick={() => listing && onPick(listing.path)}
          type="button"
          style={{
            alignItems: 'center',
            background: listing?.ok
              ? 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))'
              : 'transparent',
            border: `1px solid ${listing?.ok ? color.green : color.border}`,
            borderRadius: radius.lg,
            color: listing?.ok ? color.green : color.dim,
            cursor: listing?.ok ? 'pointer' : 'not-allowed',
            display: 'flex',
            fontSize: text.ui,
            fontWeight: 700,
            height: 34,
            justifyContent: 'center',
            width: '100%',
          }}
        >
          use this folder →
        </button>
      </div>
    </div>
  );
};
