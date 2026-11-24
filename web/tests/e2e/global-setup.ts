import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';

export default async function globalSetup(config: FullConfig) {
  const webDir = path.dirname(config.configFile ?? path.join(process.cwd(), 'x'));
  await rm(path.join(webDir, 'test-artifacts', 'e2e'), { recursive: true, force: true });
  await rm(path.join(webDir, 'test-artifacts', 'e2e-workspaces'), { recursive: true, force: true });
}
