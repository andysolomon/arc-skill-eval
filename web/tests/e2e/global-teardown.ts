import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';

/**
 * Write `test-artifacts/e2e/manifest.json`: every screenshot the run produced,
 * with its size and sha256, so a run's visual record can be listed and diffed.
 */
export default async function globalTeardown(config: FullConfig) {
  const webDir = path.dirname(config.configFile ?? path.join(process.cwd(), 'x'));
  const root = path.join(webDir, 'test-artifacts', 'e2e');

  const files: string[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.png')) {
        files.push(full);
      }
    }
  };
  await walk(root);
  if (files.length === 0) {
    return;
  }

  files.sort();
  const screenshots = await Promise.all(
    files.map(async (file) => {
      const data = await readFile(file);
      return {
        file: path.relative(root, file).split(path.sep).join('/'),
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      };
    }),
  );

  await writeFile(
    path.join(root, 'manifest.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), count: screenshots.length, screenshots }, null, 2)}\n`,
  );
}
