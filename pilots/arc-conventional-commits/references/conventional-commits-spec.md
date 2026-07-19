# Conventional Commits v1.0.0 — Full Specification

Source: https://www.conventionalcommits.org/en/v1.0.0/

## Table of Contents

1. [Commit Message Structure](#commit-message-structure)
2. [The 16 Specification Rules](#the-16-specification-rules)
3. [SemVer Mapping](#semver-mapping)
4. [Examples](#examples)
5. [FAQ](#faq)

---

## Commit Message Structure

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Parts:**
- **type** — A noun describing the category of change (e.g., `feat`, `fix`)
- **scope** — Optional noun in parentheses giving extra context (e.g., `parser`, `api`, `auth`)
- **description** — Short summary of the change, immediately after the colon and space
- **body** — Optional free-form text providing additional detail, separated from description by a blank line
- **footer(s)** — Optional structured metadata, separated from body by a blank line

---

## The 16 Specification Rules

1. Commits MUST be prefixed with a type, which consists of a noun, `feat`, `fix`, etc., followed by the OPTIONAL scope, OPTIONAL `!`, and REQUIRED terminal colon and space.

2. The type `feat` MUST be used when a commit adds a new feature to the application or library.

3. The type `fix` MUST be used when a commit represents a bug fix for the application.

4. A scope MAY be provided after a type. A scope MUST consist of a noun describing a section of the codebase surrounded by parenthesis, e.g., `fix(parser):`.

5. A description MUST immediately follow the colon and space after the type/scope prefix. The description is a short summary of the code changes, e.g., `fix: array parsing issue when multiple spaces were contained in string`.

6. A longer commit body MAY be provided after the short description, providing additional contextual information about the code changes. The body MUST begin one blank line after the description.

7. A commit body is free-form and MAY consist of any number of newline separated paragraphs.

8. One or more footers MAY be provided one blank line after the body. Each footer MUST consist of a word token, followed by either a `:<space>` or `<space>#` separator, followed by a string value (this is inspired by the git trailer convention).

9. A footer's token MUST use `-` in place of whitespace characters, e.g., `Acked-by` (this helps differentiate the footer section from a multi-paragraph body). An exception is made for `BREAKING CHANGE`, which MAY also be used as a token.

10. A footer's value MAY contain spaces and newlines, and parsing MUST terminate when the next valid footer token/separator pair is observed.

11. Breaking changes MUST be indicated in the type/scope prefix of a commit, or as an entry in the footer.

12. If included as a footer, a breaking change MUST consist of the uppercase text `BREAKING CHANGE`, followed by a colon, space, and description, e.g., `BREAKING CHANGE: environment variables now take precedence over config files`.

13. If included in the type/scope prefix, breaking changes MUST be indicated by a `!` immediately before the `:`. If `!` is used, `BREAKING CHANGE:` MAY be omitted from the footer section, and the commit description SHALL be used to describe the breaking change.

14. Types other than `feat` and `fix` MAY be used in your commit messages, e.g., `docs: updated ref docs`.

15. The units of information that make up Conventional Commits MUST NOT be treated as case sensitive by implementors, with the exception of `BREAKING CHANGE` which MUST be uppercase.

16. `BREAKING-CHANGE` MUST be synonymous with `BREAKING CHANGE`, when used as a token in a footer.

---

## SemVer Mapping

Conventional Commits maps directly to [Semantic Versioning 2.0.0](https://semver.org/):

| Commit Type | SemVer Bump | When |
|------------|-------------|------|
| `fix:` | PATCH | Bug fix, no API change |
| `feat:` | MINOR | New feature, backwards compatible |
| `BREAKING CHANGE` (any type) | MAJOR | Incompatible API change |

The `!` shorthand after the type/scope is equivalent to a `BREAKING CHANGE:` footer.

Types other than `feat` and `fix` (e.g., `docs`, `chore`, `refactor`) do not trigger
a version bump by default but still appear in the changelog.

---

## Examples

### Simple fix
```
fix: prevent racing of requests
```
→ PATCH bump

### Feature with scope
```
feat(lang): add Polish language support
```
→ MINOR bump

### Breaking change with `!` and footer
```
feat(api)!: send an email to the customer when a product is shipped

BREAKING CHANGE: `]` endpoint no longer returns a 200 status.
```
→ MAJOR bump

### Breaking change with only `!`
```
refactor!: drop support for Node 6
```
→ MAJOR bump (the `!` draws attention to the breaking nature)

### Commit with body and multiple footers
```
fix: prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue but are
obsolete now.

Reviewed-by: Z
Refs: #123
```

### Commit with `BREAKING CHANGE` footer (no `!`)
```
feat: allow provided config object to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for
extending other config files.
```
→ MAJOR bump

### Commit with no body
```
docs: correct spelling of CHANGELOG
```
→ No version bump

### Commit with scope and breaking change footer
```
feat(api): allow provided config object to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for
extending other config files.
```
→ MAJOR bump

### Revert commit
```
revert: let us never again speak of the noodle incident

Refs: 676104e, a]215868
```

---

## FAQ

### What if a commit fits multiple types?

Choose the most specific type. If a commit fixes a bug AND adds a feature, consider
splitting it into two commits. If that is not practical, `feat` takes precedence over
`fix` (a MINOR bump includes PATCH-level changes).

### How do I handle reverts?

Use `revert:` as the type. Include the SHA of the reverted commit in the footer:
```
revert: remove broken endpoint

Refs: abc1234
```

### What counts as a breaking change?

Any change that requires consumers of your code to modify their usage. Examples:
- Removing or renaming a public API method
- Changing the type signature of a function
- Changing default behavior in a way that breaks existing usage
- Removing support for a platform or runtime version

### Can I use custom types?

Yes. The spec only mandates `feat` and `fix`. You can add your own types
(`hotfix`, `wip`, `release`, etc.), though the widely-adopted convention
uses: `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`.

### How does `!` interact with the `BREAKING CHANGE` footer?

They are equivalent. You can use either, or both. When both are present,
the footer description is used in the changelog. When only `!` is used,
the commit description serves as the breaking change description.

### What if my commit does not trigger a version bump?

Commits with types like `docs`, `chore`, `style`, `refactor`, `test`, `ci`, `build`
do not trigger a version bump by default in semantic-release. They will still appear
in the changelog under their respective section headings.

### Do scopes affect versioning?

No. Scopes are purely organizational — they appear in the changelog for readability
but do not influence which version bump occurs. The bump is determined solely by
the type and whether a breaking change is indicated.
