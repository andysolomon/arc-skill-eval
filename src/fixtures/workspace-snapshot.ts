import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import type { WorkspaceFileSnapshot, WorkspaceSnapshot } from "./types.js";

export async function captureWorkspaceSnapshot(workspaceDir: string): Promise<WorkspaceSnapshot> {
  const rootDir = path.resolve(workspaceDir);
  const files: WorkspaceFileSnapshot[] = [];

  await walk(rootDir, rootDir, files);

  files.sort((left, right) => left.path.localeCompare(right.path));

  return { files };
}

async function walk(rootDir: string, currentDir: string, files: WorkspaceFileSnapshot[]): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walk(rootDir, absolutePath, files);
      continue;
    }

    if (!entry.isFile()) {
      const stats = await lstat(absolutePath).catch(() => null);

      if (!stats?.isFile()) {
        continue;
      }
    }

    const content = await readFile(absolutePath);

    files.push({
      path: toWorkspaceRelativePath(rootDir, absolutePath),
      size: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
}

export function toWorkspaceRelativePath(workspaceDir: string, targetPath: string): string {
  const relativePath = path.relative(path.resolve(workspaceDir), path.resolve(targetPath));
  return relativePath.split(path.sep).join("/");
}
