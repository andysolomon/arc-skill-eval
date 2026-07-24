/** Max length for redacted stderr previews persisted in traces / error messages. */
export const STDERR_PREVIEW_MAX_CHARS = 400;

const SECRET_PATTERNS: Array<{ pattern: RegExp; replace: (match: string) => string }> = [
  {
    pattern: /\bsk-[A-Za-z0-9_-]{10,}\b/g,
    replace: () => "sk-[REDACTED]",
  },
  {
    pattern: /\bghp_[A-Za-z0-9]{20,}\b/g,
    replace: () => "ghp_[REDACTED]",
  },
  {
    pattern: /\bgho_[A-Za-z0-9]{20,}\b/g,
    replace: () => "gho_[REDACTED]",
  },
  {
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gi,
    replace: () => "github_pat_[REDACTED]",
  },
  {
    pattern: /(?:^|[\s;])([A-Z][A-Z0-9_]*_API_KEY)\s*=\s*[^\s]+/gim,
    replace: (match) => match.replace(/=\s*[^\s]+$/, "= [REDACTED]"),
  },
  {
    pattern: /\bAuthorization:\s*Bearer\s+\S+/gi,
    replace: () => "Authorization: Bearer [REDACTED]",
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/g,
    replace: () => "Bearer [REDACTED]",
  },
  {
    pattern: /\b[A-Za-z0-9+/]{48,}={0,2}\b/g,
    replace: () => "[REDACTED]",
  },
];

export function redactCliSecrets(text: string): string {
  let out = text;
  for (const { pattern, replace } of SECRET_PATTERNS) {
    out = out.replace(pattern, replace);
  }
  return out;
}

export function buildRedactedStderrPreview(stderr: string): string {
  return redactCliSecrets(stderr.trim()).slice(0, STDERR_PREVIEW_MAX_CHARS);
}

export interface CliProcessForensics {
  kind: string;
  exitCode: number;
  stderrBytes: number;
  stderrPreviewRedacted: string;
  parseErrors: unknown[];
}

export function buildCliProcessForensics(
  kind: string,
  exitCode: number,
  stderr: string,
  parseErrors: unknown[] = [],
): CliProcessForensics {
  return {
    kind,
    exitCode,
    stderrBytes: Buffer.byteLength(stderr, "utf8"),
    stderrPreviewRedacted: buildRedactedStderrPreview(stderr),
    parseErrors,
  };
}
