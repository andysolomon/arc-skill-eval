import type { CSSProperties } from 'react';

export const kickerStyle: CSSProperties = {
  color: 'var(--tt-comment)',
  fontSize: 11,
  letterSpacing: '.08em',
  marginBottom: 6,
  textTransform: 'uppercase',
};

export const titleStyle: CSSProperties = {
  color: 'var(--tt-fg)',
  fontSize: 20,
  fontWeight: 700,
  margin: '0 0 8px',
};

export const introStyle: CSSProperties = {
  color: 'var(--tt-fg-dark)',
  fontSize: 13,
  lineHeight: 1.65,
  margin: '0 0 14px',
};

export const legendBoxStyle: CSSProperties = {
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  fontSize: 12,
  gap: 4,
  lineHeight: 1.55,
  marginBottom: 22,
  padding: '10px 13px',
};

export const cardStyle: CSSProperties = {
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  marginBottom: 12,
  padding: '12px 14px',
};

export const inputStyle: CSSProperties = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  borderRadius: 6,
  color: 'var(--tt-fg)',
  fontFamily: 'inherit',
  fontSize: 13,
  outline: 'none',
  padding: '8px 10px',
};

export const removeGlyphStyle: CSSProperties = {
  background: 'transparent',
  border: 0,
  color: 'var(--tt-comment)',
  cursor: 'pointer',
  flex: 'none',
  fontSize: 16,
  padding: 0,
};
