import { useEffect, useRef, useState } from 'react';

import { FolderPicker } from '@/components/FolderPicker';
import { SectionNav } from '@/components/SectionNav';
import { useEnv } from '@/state/env';
import { useWorkspace } from '@/state/workspace';
import type { EnvName } from '@/persistence/preferences';
import { themeNames } from '@/state/theme';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeName } from '@/types';

const themeMeta: Record<ThemeName, { label: string; dot: string }> = {
  tokyonight: { label: 'tn', dot: '#7aa2f7' },
  gruvbox: { label: 'gb', dot: '#fabd2f' },
  nord: { label: 'nord', dot: '#88c0d0' },
};

const envMeta: Array<{ name: EnvName; label: string; dot: string }> = [
  { name: 'hosted', label: 'hosted', dot: 'var(--tt-cyan)' },
  { name: 'localhost', label: 'localhost', dot: 'var(--tt-green)' },
];

export const INSTALL_COMMAND = 'npm i -g arc-skill-eval';

const WorkspaceChip = () => {
  const {
    workspace,
    favorites,
    skills,
    skillsStatus,
    resolvedPath,
    source,
    workspaceError,
    setWorkspace,
    pickWorkspace,
  } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'home' | 'browse'>('home');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (!open) {
      setMode('home');
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const choose = (path: string) => {
    setWorkspace(path);
    setOpen(false);
  };

  const submitReference = () => {
    const next = reference.trim();
    if (!next) {
      return;
    }

    pickWorkspace(next);
    setReference('');
    setOpen(false);
  };

  return (
    <div style={{ flex: 'none', position: 'relative' }}>
      <button
        data-testid="workspace-chip"
        onClick={() => setOpen((current) => !current)}
        title="working directory"
        type="button"
        style={{
          alignItems: 'center',
          background: 'transparent',
          border: '1px solid var(--tt-border)',
          borderRadius: 7,
          cursor: 'pointer',
          display: 'inline-flex',
          gap: 7,
          height: 30,
          padding: '0 11px',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: 'var(--tt-comment)', fontSize: 11 }}>dir</span>
        <span
          title={workspaceError ? `${workspace} — ${workspaceError}` : workspace}
          style={{
            color: workspaceError ? 'var(--tt-red)' : 'var(--tt-teal)',
            fontSize: 12.5,
          }}
        >
          {workspace}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--tt-dim)', fontSize: 10 }}>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            style={{ inset: 0, position: 'fixed', zIndex: 65 }}
          />
          <div
            data-testid="workspace-dropdown"
            style={{
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border-active)',
              borderRadius: 8,
              left: 0,
              maxHeight: 'calc(100vh - 64px)',
              overflowX: 'hidden',
              overflowY: 'auto',
              position: 'absolute',
              top: 36,
              width: 288,
              zIndex: 70,
            }}
          >
            {mode === 'browse' ? (
              <FolderPicker
                initialPath={
                  resolvedPath ??
                  (workspace.startsWith('~') || workspace.startsWith('/') ? workspace : undefined)
                }
                onExit={() => setMode('home')}
                onPick={(picked) => {
                  pickWorkspace(picked);
                  setOpen(false);
                }}
              />
            ) : (
              <>
                <div
                  style={{
                    borderBottom: '1px solid var(--tt-border)',
                    color: 'var(--tt-comment)',
                    fontSize: 11,
                    lineHeight: 1.5,
                    padding: '7px 12px',
                  }}
                >
                  workspace — arc-skill-eval runs from a directory root, no skill file needed. pick
                  one:
                </div>
            <div
              style={{
                color: 'var(--tt-comment)',
                fontSize: 10.5,
                letterSpacing: '.06em',
                padding: '7px 12px 3px',
                textTransform: 'uppercase',
              }}
            >
              favorites
            </div>
            <div style={{ padding: '0 5px 4px' }}>
              {favorites.map((path) => {
                const active = path === workspace;

                return (
                  <button
                    key={path}
                    onClick={() => choose(path)}
                    type="button"
                    style={{
                      alignItems: 'center',
                      background: active ? 'var(--tt-selection)' : 'transparent',
                      border: 0,
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      fontSize: 12.5,
                      gap: 8,
                      padding: '7px 9px',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span style={{ color: 'var(--tt-green)', flex: 'none', width: 11 }}>
                      {active ? '✓' : ''}
                    </span>
                    <span style={{ color: 'var(--tt-teal)' }}>{path}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ padding: '0 10px 8px' }}>
              <div
                style={{
                  alignItems: 'center',
                  border: '1px dashed var(--tt-border)',
                  borderRadius: 6,
                  display: 'flex',
                  gap: 7,
                  height: 32,
                  padding: '0 9px',
                }}
              >
                <span aria-hidden="true" style={{ color: 'var(--tt-fg-dark)', fontSize: 12 }}>
                  ⇱
                </span>
                <input
                  aria-label="reference a folder or github repo"
                  onChange={(event) => setReference(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitReference();
                    }
                  }}
                  placeholder="~/path or github.com/owner/repo…"
                  spellCheck={false}
                  value={reference}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--tt-fg)',
                    flex: 1,
                    fontSize: 12,
                    minWidth: 0,
                    outline: 'none',
                  }}
                />
              </div>
              <button
                aria-label="browse folders"
                onClick={() => setMode('browse')}
                type="button"
                style={{
                  alignItems: 'center',
                  background: 'transparent',
                  border: '1px dashed var(--tt-border)',
                  borderRadius: 6,
                  color: 'var(--tt-fg-dark)',
                  cursor: 'pointer',
                  display: 'flex',
                  fontSize: 12,
                  gap: 7,
                  height: 30,
                  justifyContent: 'center',
                  marginTop: 6,
                  width: '100%',
                }}
              >
                ⇱ browse folders…
              </button>
            </div>
            <div style={{ borderTop: '1px solid var(--tt-border)', padding: '7px 12px' }}>
              <div style={{ color: 'var(--tt-comment)', fontSize: 11, marginBottom: 5 }}>
                skills found here
                {skillsStatus === 'loading' ? (
                  <span style={{ color: 'var(--tt-dim)' }}> · scanning…</span>
                ) : null}
                {skillsStatus === 'offline' ? (
                  <span style={{ color: 'var(--tt-dim)' }}> · sample — daemon offline</span>
                ) : null}
                {skillsStatus === 'live' && source === 'github' ? (
                  <span style={{ color: 'var(--tt-dim)' }}> · cloned from github</span>
                ) : null}
              </div>
              {workspaceError ? (
                <div style={{ color: 'var(--tt-red)', fontSize: 11.5, padding: '1px 0' }}>
                  ✗ {workspaceError}
                </div>
              ) : null}
              {!workspaceError && skills.length === 0 && skillsStatus === 'live' ? (
                <div style={{ color: 'var(--tt-comment)', fontSize: 12, padding: '1px 0' }}>
                  no skills found under this directory
                </div>
              ) : null}
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  title={
                    skill.hasEvals
                      ? `${skill.id} — has an eval suite`
                      : skill.description || `${skill.id} — no eval suite`
                  }
                  style={{
                    color: skill.hasEvals
                      ? 'var(--tt-green)'
                      : skill.role === 'distractor'
                        ? 'var(--tt-comment)'
                        : 'var(--tt-fg-dark)',
                    fontSize: 12,
                    padding: '1px 0',
                  }}
                >
                  <span style={{ color: 'var(--tt-dim)' }}>└ </span>
                  {skill.id}/
                </div>
              ))}
              {skillsStatus === 'live' && resolvedPath ? (
                <div
                  style={{
                    color: 'var(--tt-dim)',
                    fontSize: 10.5,
                    marginTop: 5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {resolvedPath}
                </div>
              ) : null}
            </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

export const GlobalHeader = () => {
  const { theme, setTheme } = useTheme();
  const { env, setEnv } = useEnv();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copyInstall = () => {
    void navigator.clipboard?.writeText(INSTALL_COMMAND).catch(() => {});
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <header className="global-header" data-testid="global-header">
      <div className="brand-lockup">
        <span className="brand-lockup__glyph" aria-hidden="true">
          S
        </span>
        arc-skill-eval
      </div>
      <span className="global-header__divider" aria-hidden="true" />
      <SectionNav />
      <span className="global-header__spacer" />
      {env === 'localhost' ? <WorkspaceChip /> : null}
      <div className="pill-toggle" role="radiogroup" aria-label="Environment">
        {envMeta.map((option) => (
          <button
            aria-checked={env === option.name}
            className="pill-toggle__option"
            data-active={env === option.name}
            data-testid={`env-option-${option.name}`}
            key={option.name}
            onClick={() => setEnv(option.name)}
            role="radio"
            title={option.label}
            type="button"
          >
            <span
              className="pill-toggle__dot"
              style={{ background: option.dot }}
              aria-hidden="true"
            />
            {option.label}
          </button>
        ))}
      </div>
      <div className="pill-toggle" role="radiogroup" aria-label="Theme">
        {themeNames.map((themeName) => (
          <button
            aria-checked={theme === themeName}
            className="pill-toggle__option"
            data-active={theme === themeName}
            data-theme-option={themeName}
            data-testid={`theme-option-${themeName}`}
            key={themeName}
            onClick={() => setTheme(themeName)}
            role="radio"
            title={themeName}
            type="button"
          >
            <span
              className="pill-toggle__dot"
              style={{ background: themeMeta[themeName].dot }}
              aria-hidden="true"
            />
            {themeMeta[themeName].label}
          </button>
        ))}
      </div>
      <button
        className="install-chip"
        data-testid="install-command-chip"
        onClick={copyInstall}
        title="copy install command"
        type="button"
      >
        <span className="install-chip__prompt">$</span>
        {INSTALL_COMMAND}
        <span className="install-chip__status" data-copied={copied}>
          {copied ? '✓ copied' : '⧉'}
        </span>
      </button>
    </header>
  );
};
