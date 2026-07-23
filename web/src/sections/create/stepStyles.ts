import type { CSSProperties } from 'react';
import { color, radius, text, tracking } from '@/design/tokens';

export const kickerStyle: CSSProperties = {
  color: color.comment,
  fontSize: text['2xs'],
  letterSpacing: tracking.kickerWide,
  marginBottom: 6,
  textTransform: 'uppercase',
};

export const titleStyle: CSSProperties = {
  color: color.fg,
  fontSize: text.lg,
  fontWeight: 700,
  margin: '0 0 8px',
};

export const introStyle: CSSProperties = {
  color: color.fgDark,
  fontSize: text.body,
  lineHeight: 1.65,
  margin: '0 0 14px',
};

export const legendBoxStyle: CSSProperties = {
  border: `1px solid ${color.border}`,
  borderRadius: radius.xl,
  display: 'flex',
  flexDirection: 'column',
  fontSize: text.sm,
  gap: 4,
  lineHeight: 1.55,
  marginBottom: 22,
  padding: '10px 13px',
};

export const cardStyle: CSSProperties = {
  border: `1px solid ${color.border}`,
  borderRadius: radius.xl,
  marginBottom: 12,
  padding: '12px 14px',
};

export const inputStyle: CSSProperties = {
  background: color.bgDark,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.fg,
  fontFamily: 'inherit',
  fontSize: text.body,
  outline: 'none',
  padding: '8px 10px',
};

export const removeGlyphStyle: CSSProperties = {
  background: 'transparent',
  border: 0,
  color: color.comment,
  cursor: 'pointer',
  flex: 'none',
  fontSize: 16,
  padding: 0,
};
