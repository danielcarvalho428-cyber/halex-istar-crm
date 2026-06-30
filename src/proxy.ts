import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, getSessionFromToken } from "./lib/auth";

function isAdminOnlyPath(pathname: string) {
  return (
    pathname === "/dashboard/configuracoes" ||
    pathname === "/dashboard/importar" ||
    pathname === "/dashboard/backup/data" ||
    pathname.startsWith("/dashboard/admin/")
  );
}

export async function proxy(request: NextRequest) {
  if (process.env.HALEX_DESKTOP === "1") return NextResponse.next();

  const localPreview =
    process.env.NODE_ENV === "development" &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (localPreview) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await getSessionFromToken(token);

  if (session) {
    if (session.role !== "admin" && isAdminOnlyPath(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "next",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
