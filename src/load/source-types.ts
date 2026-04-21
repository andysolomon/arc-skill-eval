import type { NormalizedSkillEvalContract, ValidationIssue } from "../contracts/types.js";

export type RepoSourceKind = "local" | "git";

export type GitRepoInput = string | GitRepoRequest;

export interface GitRepoRequest {
  url: string;
  ref?: string | null;
  displayName?: string;
}

export interface GitResolutionMetadata {
  rootDir: string;
  commitSha: string | null;
  branch: string | null;
  originUrl: string | null;
}

export interface RepoSourceDescriptor {
  kind: RepoSourceKind;
  input: string;
  repositoryRoot: string;
  displayName: string;
  resolvedRef: string | null;
  git: GitResolutionMetadata | null;
}

export interface DiscoveredSkillFiles {
  skillName: string;
  skillDir: string;
  relativeSkillDir: string;
  skillDefinitionPath: string;
  evalDefinitionPath: string;
}

export interface LocalRepoLoadResult {
  source: RepoSourceDescriptor;
  skills: DiscoveredSkillFiles[];
}

export interface ValidatedSkillDiscovery {
  files: DiscoveredSkillFiles;
  contract: NormalizedSkillEvalContract;
}

export interface InvalidSkillDiscovery {
  files: DiscoveredSkillFiles;
  issues: ValidationIssue[];
}

export interface ValidatedLocalRepoLoadResult extends LocalRepoLoadResult {
  validSkills: ValidatedSkillDiscovery[];
  invalidSkills: InvalidSkillDiscovery[];
}

export interface GitRepoLoadResult extends LocalRepoLoadResult {
  tempDir: string;
  cleanup: () => Promise<void>;
}

export interface ValidatedGitRepoLoadResult extends ValidatedLocalRepoLoadResult {
  tempDir: string;
  cleanup: () => Promise<void>;
}
