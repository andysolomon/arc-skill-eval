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

export const CodeBlock = ({ children, code, language }: CodeBlockProps) => (
  <pre
    style={{
      background: 'var(--tt-bg)',
      border: '1px solid var(--tt-border)',
      color: 'var(--tt-fg)',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.55,
      margin: '16px 0',
      maxWidth: '100%',
      overflowX: 'auto',
      padding: 14,
    }}
  >
    <code className={language ? `language-${language}` : undefined}>{code ?? children}</code>
  </pre>
);

const Pre = ({ children }: { children?: ReactNode }) => (
  <pre
    style={{
      background: 'var(--tt-bg)',
      border: '1px solid var(--tt-border)',
      color: 'var(--tt-fg)',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.55,
      margin: '16px 0',
      maxWidth: '100%',
      overflowX: 'auto',
      padding: 14,
    }}
  >
    {children}
  </pre>
);

export const Note = ({ children, tone = 'info' }: NoteProps) => (
  <aside
    style={{
      background: 'var(--tt-bg-dark)',
      border: '1px solid var(--tt-border)',
      borderLeft: `4px solid ${tone === 'warning' ? 'var(--tt-yellow)' : 'var(--tt-cyan)'}`,
      color: 'var(--tt-fg-dark)',
      lineHeight: 1.5,
      margin: '16px 0',
      padding: '12px 14px',
    }}
  >
    {children}
  </aside>
);

const components = {
  a: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} style={{ color: 'var(--tt-cyan)', textUnderlineOffset: 3 }}>
      {children}
    </a>
  ),
  code: ({ children, className, ...props }: HTMLAttributes<HTMLElement>) => (
    <code
      {...props}
      className={className}
      style={{
        color: 'var(--tt-green)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '0.92em',
      }}
    >
      {children}
    </code>
  ),
  CodeBlock,
  h2: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props} style={{ color: 'var(--tt-fg)', fontSize: 20, lineHeight: 1.2, margin: '28px 0 10px' }}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
    <h3 {...props} style={{ color: 'var(--tt-fg)', fontSize: 16, lineHeight: 1.25, margin: '22px 0 8px' }}>
      {children}
    </h3>
  ),
  Kicker,
  Note,
  p: ({ children, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props} style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.65, margin: '0 0 14px' }}>
      {children}
    </p>
  ),
  pre: ({ children }: HTMLAttributes<HTMLPreElement>) => <Pre>{children}</Pre>,
  ul: ({ children, ...props }: HTMLAttributes<HTMLUListElement>) => (
    <ul {...props} style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.6, margin: '0 0 14px', paddingLeft: 22 }}>
      {children}
    </ul>
  ),
} satisfies Record<string, ComponentType<any>>;

export const LearnMDXProvider = ({ children }: { children: ReactNode }) => {
  const { theme } = useTheme();

  return (
    <div className="learn-mdx" data-theme={theme} style={{ maxWidth: 760 }}>
      <style>{highlightTheme}</style>
      <BaseMDXProvider components={components}>{children}</BaseMDXProvider>
    </div>
  );
};
