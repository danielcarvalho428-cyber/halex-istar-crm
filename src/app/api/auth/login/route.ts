import {
  AUTH_COOKIE_NAME,
  AUTH_MAX_AGE_SECONDS,
  createSessionToken,
  isAuthConfigured,
  validateCredentials,
} from '@/lib/auth';
import { privateJson } from '@/lib/http';
import { checkRateLimit } from '@/lib/rate-limit';
import type { AccountRole } from '@/types';

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return privateJson(
      { ok: false, message: 'Login is not configured on this deployment.' },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null) as {
    username?: unknown;
    password?: unknown;
  } | null;

  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const clientKey = getClientKey(request);
  const broadRateLimit = checkRateLimit(`login-ip:${clientKey}`, 30, 15 * 60 * 1000);
  const credentialRateLimit = checkRateLimit(
    `login-credential:${clientKey}:${username.toLowerCase()}`,
    8,
    15 * 60 * 1000
  );
  const rateLimit = !broadRateLimit.allowed ? broadRateLimit : credentialRateLimit;

  if (!rateLimit.allowed) {
    const response = privateJson(
      { ok: false, message: 'Muitas tentativas. Aguarde um pouco e tente novamente.' },
      { status: 429 }
    );
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return response;
  }

  let session: {
    username: string;
    role: AccountRole;
    accountId?: string | null;
    displayName?: string | null;
    company?: string | null;
  } | null = null;

  if (!session && validateCredentials(username, password)) {
    session = {
      username,
      role: 'admin',
      accountId: null,
      displayName: 'Admin',
      company: 'Almeida Lumina Ltda',
    };
  }

  if (!session) {
    return privateJson(
      { ok: false, message: 'Usuario ou senha invalidos.' },
      { status: 401 }
    );
  }

  const response = privateJson({ ok: true });
  const isHttps = new URL(request.url).protocol === 'https:';
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: await createSessionToken(session),
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: AUTH_MAX_AGE_SECONDS,
  });

  return response;
}
