import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, getSessionFromToken } from '@/lib/auth';
import { privateJson } from '@/lib/http';

export async function GET() {
  const cookieStore = await cookies();
  const session = await getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    return privateJson({ ok: false, message: 'Unauthorized.' }, { status: 401 });
  }

  return privateJson({
    ok: true,
    data: {
      username: session.username,
      role: session.role,
      displayName: session.displayName,
      company: session.company,
    },
  });
}
