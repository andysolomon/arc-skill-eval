import { MDXProvider as BaseMDXProvider } from '@mdx-js/react';
import type {
  AnchorHTMLAttributes,
  ComponentType,
  HTMLAttributes,
  ReactNode,
} from 'react';
import { Kicker } from '@/components/primitives';
import { useTheme } from '@/state/theme';

type CodeBlockProps = {
  children?: ReactNode;
  code?: string;
  language?: string;
};

type NoteProps = {
  children: ReactNode;
  tone?: 'info' | 'warning';
};

const highlightTheme = `
.learn-mdx[data-theme] .hljs-keyword,
.learn-mdx[data-theme] .hljs-selector-tag,
.learn-mdx[data-theme] .hljs-title.function_ { color: var(--tt-magenta); }
.learn-mdx[data-theme] .hljs-string,
.learn-mdx[data-theme] .hljs-attr,
.learn-mdx[data-theme] .hljs-symbol { color: var(--tt-green); }
.learn-mdx[data-theme] .hljs-number,
.learn-mdx[data-theme] .hljs-literal,
.learn-mdx[data-theme] .hljs-variable { color: var(--tt-orange); }
.learn-mdx[data-theme] .hljs-comment { color: var(--tt-comment); }
.learn-mdx[data-theme] .hljs-punctuation,
.learn-mdx[data-theme] .hljs-operator { color: var(--tt-fg-dark); }
.learn-mdx[data-theme="gruvbox"] .hljs-keyword,
.learn-mdx[data-theme="gruvbox"] .hljs-title.function_ { color: var(--tt-yellow); }
.learn-mdx[data-theme="nord"] .hljs-string,
.learn-mdx[data-theme="nord"] .hljs-attr { color: var(--tt-cyan); }
`;

const preStyle = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  color: 'var(--tt-fg)',
  fontSize: 12.5,
  lineHeight: 1.85,
  margin: '16px 0',
  maxWidth: '100%',
  overflowX: 'auto' as const,
  padding: '14px 16px',
};

export const CodeBlock = ({ children, code, language }: CodeBlockProps) => (
  <pre style={preStyle}>
    <code className={language ? `language-${language}` : undefined}>{code ?? children}</code>
  </pre>
);

const Pre = ({ children }: { children?: ReactNode }) => <pre style={preStyle}>{children}</pre>;

export const Note = ({ children, tone = 'info' }: NoteProps) => (
  <aside
    style={{
      background: 'var(--tt-bg-dark)',
      border: '1px solid var(--tt-border)',
      borderLeft: `2px solid ${tone === 'warning' ? 'var(--tt-yellow)' : 'var(--tt-orange)'}`,
      borderRadius: 8,
      color: 'var(--tt-fg-dark)',
      fontSize: 12.5,
      lineHeight: 1.6,
      margin: '16px 0',
      padding: '12px 16px',
    }}
  >
    {children}
  </aside>
);

const components = {
  a: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} style={{ color: 'var(--tt-blue)', textUnderlineOffset: 3 }}>
      {children}
    </a>
  ),
  code: ({ children, className, ...props }: HTMLAttributes<HTMLElement>) =>
    className ? (
      <code {...props} className={className}>
        {children}
      </code>
    ) : (
      <code
        {...props}
        style={{
          background: 'var(--tt-bg-dark)',
          borderRadius: 4,
          color: 'var(--tt-fg)',
          fontSize: '0.95em',
          padding: '1px 5px',
        }}
      >
        {children}
      </code>
    ),
  CodeBlock,
  h1: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h1 {...props} style={{ color: 'var(--tt-fg)', fontSize: 22, fontWeight: 700, margin: '28px 0 10px' }}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      {...props}
      style={{
        color: 'var(--tt-cyan)',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.05em',
        margin: '32px 0 12px',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h3 {...props} style={{ color: 'var(--tt-fg)', fontSize: 13.5, fontWeight: 700, margin: '22px 0 8px' }}>
      {children}
    </h3>
  ),
  Kicker,
  Note,
  p: ({ children, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
    <p
      {...props}
      style={{ color: 'var(--tt-fg-dark)', fontSize: 13, lineHeight: 1.7, margin: '0 0 14px', maxWidth: 820 }}
    >
      {children}
    </p>
  ),
  pre: ({ children }: HTMLAttributes<HTMLPreElement>) => <Pre>{children}</Pre>,
  ul: ({ children, ...props }: HTMLAttributes<HTMLUListElement>) => (
    <ul
      {...props}
      style={{ color: 'var(--tt-fg-dark)', fontSize: 13, lineHeight: 1.7, margin: '0 0 14px', paddingLeft: 20 }}
    >
      {children}
    </ul>
  ),
  li: ({ children, ...props }: HTMLAttributes<HTMLLIElement>) => (
    <li {...props} style={{ margin: '4px 0' }}>
      {children}
    </li>
  ),
} satisfies Record<string, ComponentType<any>>;

export const LearnMDXProvider = ({ children }: { children: ReactNode }) => {
  const { theme } = useTheme();

  return (
    <div className="learn-mdx" data-theme={theme}>
      <style>{highlightTheme}</style>
      <BaseMDXProvider components={components}>{children}</BaseMDXProvider>
    </div>
  );
};
