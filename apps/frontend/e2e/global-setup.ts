import { FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Logs in via the REST API once and writes the resulting access token to
 * `e2e/.auth/user.json`. We skip the UI dance because the saved file is
 * consumed by `fixtures.ts`, which injects it into every test's localStorage
 * via `addInitScript` — bypassing refresh-token rotation entirely (each test
 * gets a fresh context, so a shared refresh cookie would be invalidated by
 * the first request).
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use.baseURL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    'http://212.83.131.111:1519';

  const username = process.env.SWARMUI_USER || 'root';
  const password = process.env.SWARMUI_PASS || '254226Aq';

  const dirName =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));

  const authDir = path.join(dirName, '.auth');
  fs.mkdirSync(authDir, { recursive: true });

  const res = await fetch(`${baseURL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(
      `[global-setup] login failed: ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as any;
  const data = body?.data ?? body;
  const accessToken: string | undefined = data?.accessToken;
  const user = data?.user;
  if (!accessToken || !user) {
    throw new Error(
      `[global-setup] unexpected login response: ${JSON.stringify(body)}`,
    );
  }

  const authState = {
    baseURL,
    accessToken,
    user,
    // Zustand persist envelope.
    swarmuiAuth: JSON.stringify({
      state: { accessToken, user, isAuthenticated: true },
      version: 0,
    }),
  };

  const outPath = path.join(authDir, 'user.json');
  fs.writeFileSync(outPath, JSON.stringify(authState, null, 2));
  // eslint-disable-next-line no-console
  console.log(`[global-setup] auth cached -> ${outPath}`);
}
