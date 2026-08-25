import { useCallback, useEffect, useRef, useState } from 'react';
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

const readListing = async (path?: string, signal?: AbortSignal): Promise<FsListing> => {
  const url = path ? `${FS_URL}?path=${encodeURIComponent(path)}` : FS_URL;
  const response = await fetch(url, { signal });
  return response.json() as Promise<FsListing>;
};

export type FolderPickerProps = {
  initialPath?: string;
  onPick: (absolutePath: string) => void;
  onExit: () => void;
};

export const FolderPicker = ({ initialPath, onPick, onExit }: FolderPickerProps) => {
  const [listing, setListing] = useState<FsListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const listingRef = useRef<FsListing | null>(null);

  listingRef.current = listing;

  const load = useCallback((path?: string, signal?: AbortSignal) => {
    setLoading(true);
    const hadListing = listingRef.current !== null;

    void (async () => {
      try {
        const data = await readListing(path, signal);
        if (signal?.aborted) {
          return;
        }

        if (data.ok) {
          setListing(data);
          setInlineNotice(null);
          return;
        }

        const failError = data.error ?? 'could not read that directory';

        if (hadListing) {
          setInlineNotice(`✗ ${failError}`);
          return;
        }

        let ancestor = data.parent;
        for (let step = 0; step < 64 && ancestor; step += 1) {
          const ancestorData = await readListing(ancestor, signal);
          if (signal?.aborted) {
            return;
          }
          if (ancestorData.ok) {
            setListing(ancestorData);
            setInlineNotice(`✗ ${failError}. Showing ${ancestorData.path}`);
            return;
          }
          ancestor = ancestorData.parent;
        }

        const homeData = await readListing(undefined, signal);
        if (signal?.aborted) {
          return;
        }
        if (homeData.ok) {
          setListing(homeData);
          setInlineNotice(`✗ ${failError}. Showing ${homeData.path}`);
        } else {
          setInlineNotice(`✗ ${failError}`);
        }
      } catch {
        if (!signal?.aborted) {
          setInlineNotice('daemon offline. Start it with npm run dev');
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    })();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(initialPath, controller.signal);
    return () => controller.abort();
  }, [initialPath, load]);

  const directories = listing?.entries.filter((entry) => entry.type === 'dir') ?? [];
  const files = listing?.entries.filter((entry) => entry.type === 'file') ?? [];
  const parentPath = listing?.parent ?? null;

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
          aria-label="Back to saved directories"
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
          ← Saved directories
        </button>
        <span style={{ color: color.dim, fontSize: text['2xs'] }}>
          Choose a working directory
        </span>
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
          disabled={!parentPath}
          onClick={() => parentPath && load(parentPath)}
          type="button"
          style={{
            background: 'transparent',
            border: `1px solid ${color.border}`,
            borderRadius: radius.sm,
            color: parentPath ? color.fgDark : color.dim,
            cursor: parentPath ? 'pointer' : 'not-allowed',
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
        {inlineNotice ? (
          <div style={{ color: color.red, fontSize: text.xs, padding: '6px 8px' }}>{inlineNotice}</div>
        ) : null}
        {!loading && listing && directories.length === 0 && files.length === 0 ? (
          <div style={{ color: color.comment, fontSize: text.sm, padding: '6px 8px' }}>
            This directory is empty
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
          Select this directory →
        </button>
      </div>
    </div>
  );
};
