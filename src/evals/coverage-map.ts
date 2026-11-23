/**
 * The coverage map: a case names the SKILL.md sections it covers in
 * `metadata.covers`, and this module checks those names against the headings.
 * A name with no heading means the skill was restructured under the suite. A
 * heading with no case is a part of the skill nothing exercises.
 */

import type { EvalCase } from "./types.js";

export interface SkillSection {
  /** Heading level: 2 for `##`, 3 for `###`. */
  level: 2 | 3;
  title: string;
  /** For a level-3 section, the title of the level-2 section above it. */
  parent?: string;
}

export interface CoverageCheck {
  /** False when no case uses `metadata.covers`; the map is opt-in. */
  declared: boolean;
  /** `covers` entries that match no section. */
  unknown: Array<{ caseId: string; covers: string }>;
  /** Level-2 sections that no case covers, directly or through a subsection. */
  uncovered: string[];
}

/** The `##` and `###` headings of a SKILL.md, outside frontmatter and code fences. */
export function skillSections(markdown: string): SkillSection[] {
  const sections: SkillSection[] = [];
  let inFence = false;
  let parent: string | undefined;

  for (const line of stripFrontmatter(markdown).split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!heading) continue;
    const title = heading[2]!;
    if (heading[1] === "##") {
      parent = title;
      sections.push({ level: 2, title });
    } else {
      sections.push({ level: 3, title, ...(parent ? { parent } : {}) });
    }
  }
  return sections;
}

export function checkCoverage(markdown: string, cases: ReadonlyArray<EvalCase>): CoverageCheck {
  const sections = skillSections(markdown);
  const covered = new Set<string>();
  const unknown: CoverageCheck["unknown"] = [];
  let declared = false;

  for (const evalCase of cases) {
    for (const entry of evalCase.metadata?.covers ?? []) {
      declared = true;
      const matches = sections.filter((section) => sectionMatches(section.title, entry));
      if (matches.length === 0) {
        unknown.push({ caseId: String(evalCase.id), covers: entry });
      }
      for (const section of matches) {
        covered.add(section.title);
        if (section.parent) covered.add(section.parent);
      }
    }
  }

  const uncovered = declared
    ? sections.filter((section) => section.level === 2 && !covered.has(section.title)).map((section) => section.title)
    : [];
  return { declared, unknown, uncovered };
}

/**
 * A `covers` entry names a section when it equals the heading or is its
 * leading words, so "Phase 2" names "Phase 2: Draft the config". Case,
 * markdown emphasis and trailing punctuation are ignored.
 */
function sectionMatches(title: string, entry: string): boolean {
  const heading = normalize(title);
  const wanted = normalize(entry);
  if (wanted.length === 0) return false;
  if (heading === wanted) return true;
  return heading.startsWith(wanted) && !/[a-z0-9]/.test(heading[wanted.length]!);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s.:;,!?]+$/, "")
    .trim();
}

function stripFrontmatter(markdown: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);
  return match ? markdown.slice(match[0].length) : markdown;
}
