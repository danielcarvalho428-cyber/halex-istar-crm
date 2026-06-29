import { AUTH_COOKIE_NAME } from '@/lib/auth';
import { isSameOriginRequest, privateJson } from '@/lib/http';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ ok: false, message: 'Cross-origin request blocked.' }, { status: 403 });
  }
  const response = privateJson({ ok: true });
  const isHttps = new URL(request.url).protocol === 'https:';
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 0,
  });

  return response;
}
