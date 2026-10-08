import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `authenticatedTest` injects the admin auth state (from global-setup) into
 * each test's localStorage via `addInitScript` BEFORE the first navigation.
 * This avoids relying on a shared refresh_token cookie — token rotation on
 * the backend would otherwise invalidate the cookie after the first test and
 * bounce subsequent tests to /login.
 */
const dirName =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const AUTH_FILE = path.join(dirName, '.auth', 'user.json');

type AuthState = {
  baseURL: string;
  accessToken: string;
  user: unknown;
  swarmuiAuth: string;
};

function loadAuth(): AuthState {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error(
      `Auth state missing at ${AUTH_FILE}. Did global-setup run?`,
    );
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) as AuthState;
}

export const authenticatedTest = base.extend({
  // Auto-wire the auth state before any navigation.
  context: async ({ context }, use) => {
    const auth = loadAuth();
    await context.addInitScript((payload: string) => {
      try {
        window.localStorage.setItem('swarmui-auth', payload);
      } catch {
        /* storage disabled — tests will catch the failure */
      }
    }, auth.swarmuiAuth);
    await use(context);
  },
});

export { expect };
