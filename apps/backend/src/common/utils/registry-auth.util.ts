import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { decrypt } from './crypto.util';

/**
 * Parse the registry host from an image reference.
 * The first slash-separated segment is the host only if it looks like one
 * (contains '.' or ':', or is "localhost"). Otherwise the image lives on
 * Docker Hub (docker.io).
 */
export function parseImageHost(image: string): string {
  if (!image) return 'docker.io';
  const refNoTag = image.replace(/@.*$/, '').replace(/:[^/]+$/, '');
  const firstSeg = refNoTag.split('/')[0];
  if (refNoTag.includes('/') && (firstSeg.includes('.') || firstSeg.includes(':') || firstSeg === 'localhost')) {
    return firstSeg.toLowerCase();
  }
  return 'docker.io';
}

/**
 * Pick a matching registry record for an image. For Docker Hub images
 * (no explicit host, or host is docker.io), match by `type: 'dockerhub'`
 * or a URL containing docker.io/hub.docker.com. For other hosts, match
 * by URL hostname.
 */
async function pickRegistry(image: string, registryModel: Model<any>): Promise<any | null> {
  const host = parseImageHost(image);
  const registries = await registryModel.find().lean().exec();
  if (host === 'docker.io' || host === 'index.docker.io' || host === 'registry-1.docker.io') {
    const hubReg = registries.find((r: any) =>
      r.type === 'dockerhub' ||
      (r.url ?? '').includes('docker.io') ||
      (r.url ?? '').includes('hub.docker.com'),
    );
    return hubReg ?? null;
  }
  const match = registries.find((r: any) => {
    try { return new URL(r.url).hostname.toLowerCase() === host; } catch { return false; }
  });
  return match ?? null;
}

/**
 * Build the raw authconfig object dockerode consumes (as `options.authconfig`
 * on `pull`, or in `{ authconfig: { key: <base64> } }` on `createService`).
 */
export async function buildAuthConfig(
  image: string,
  registryModel: Model<any>,
  encryptionSecret: string,
): Promise<{ username: string; password: string; serveraddress: string } | null> {
  const registry = await pickRegistry(image, registryModel);
  if (!registry || !registry.username || !registry.passwordEncrypted) return null;
  try {
    const password = decrypt(registry.passwordEncrypted, encryptionSecret);
    const host = parseImageHost(image);
    const serveraddress = host === 'docker.io' ? 'https://index.docker.io/v1/' : registry.url;
    return { username: registry.username, password, serveraddress };
  } catch {
    return null;
  }
}

/**
 * Base64-encoded authconfig for the `X-Registry-Auth` header
 * (used by `docker service create / update` via dockerode).
 * Falls back to the host-side `~/.docker/config.json` entry if present.
 */
export async function buildRegistryAuthHeader(
  image: string | undefined,
  registryModel: Model<any>,
  encryptionSecret: string,
): Promise<string> {
  if (image) {
    const cfg = await buildAuthConfig(image, registryModel, encryptionSecret);
    if (cfg) return Buffer.from(JSON.stringify(cfg)).toString('base64');
  }
  // Fallback: read host-side docker config (if mounted)
  try {
    const configPath = path.join(process.env.HOME || '/root', '.docker', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const auths = config.auths || {};
    const entry = auths['https://index.docker.io/v1/'] || auths['https://registry-1.docker.io/v2/'] || Object.values(auths)[0];
    if (entry && (entry as any).auth) {
      return Buffer.from(JSON.stringify({ identitytoken: '', auth: (entry as any).auth })).toString('base64');
    }
  } catch { /* no fallback auth */ }
  return '';
}
