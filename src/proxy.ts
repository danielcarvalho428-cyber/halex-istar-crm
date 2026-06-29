import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, getSessionFromToken } from './lib/auth';

function isAdminOnlyPath(pathname: string) {
  return (
    pathname === '/dashboard/licitacoes/nova' ||
    pathname === '/dashboard/empenhos/novo' ||
    pathname === '/dashboard/import' ||
    pathname === '/dashboard/import/empenhos-lote' ||
    pathname === '/dashboard/backup/data' ||
    pathname === '/dashboard/backup/export-editais' ||
    pathname.includes('/editar') ||
    pathname.includes('/upload-')
  );
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await getSessionFromToken(token);

  if (session) {
    if (session.role !== 'admin' && isAdminOnlyPath(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
