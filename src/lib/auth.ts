import type { AccountRole, AppSession } from '@/types';

export const AUTH_COOKIE_NAME = 'licitacoes_session';
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 8;

type AuthConfig = {
  username: string;
  password: string;
  secret: string;
};

const encoder = new TextEncoder();
const PASSWORD_HASH_ITERATIONS = 210_000;

function base64UrlEncode(value: string) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  return btoa(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64url').toString('utf8');
  }

  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
}

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(view).toString('base64url');
  }

  const binary = String.fromCharCode(...view);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64url');
  }

  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(signature);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations,
    },
    keyMaterial,
    256
  );

  return bytesToBase64Url(bits);
}

export async function createPasswordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PASSWORD_HASH_ITERATIONS);
  return `pbkdf2_sha256$${PASSWORD_HASH_ITERATIONS}$${bytesToBase64Url(salt)}$${hash}`;
}

export async function verifyPasswordHash(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, saltRaw, expectedHash] = storedHash.split('$');
  const iterations = Number(iterationsRaw);

  if (algorithm !== 'pbkdf2_sha256' || !iterations || !saltRaw || !expectedHash) {
    return false;
  }

  const actualHash = await pbkdf2(password, base64UrlToBytes(saltRaw), iterations);
  return timingSafeEqual(actualHash, expectedHash);
}

export function getAuthConfig(): AuthConfig | null {
  const username = process.env.AUTH_USERNAME;
  const password = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!username || !password || !secret) {
    return null;
  }

  return { username, password, secret };
}

export function isAuthConfigured() {
  return getAuthConfig() !== null;
}

export async function createSessionToken(session: Omit<AppSession, 'expiresAt'>) {
  const config = getAuthConfig();
  if (!config) {
    throw new Error('Authentication is not configured.');
  }

  const expiresAt = Date.now() + AUTH_MAX_AGE_SECONDS * 1000;
  const payload = base64UrlEncode(JSON.stringify({ ...session, expiresAt }));
  const signature = await sign(payload, config.secret);
  return `${payload}.${signature}`;
}

export async function getSessionFromToken(token?: string): Promise<AppSession | null> {
  const config = getAuthConfig();
  if (!config || !token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expectedSignature = await sign(payload, config.secret);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as Partial<AppSession>;
    const role: AccountRole = parsed.role === 'viewer' ? 'viewer' : 'admin';

    if (!parsed.username || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      return null;
    }

    return {
      username: parsed.username,
      role,
      accountId: parsed.accountId || null,
      displayName: parsed.displayName || null,
      company: parsed.company || null,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token?: string) {
  return (await getSessionFromToken(token)) !== null;
}

export function validateCredentials(username: string, password: string) {
  const config = getAuthConfig();
  if (!config) return false;

  return timingSafeEqual(username, config.username) && timingSafeEqual(password, config.password);
}
