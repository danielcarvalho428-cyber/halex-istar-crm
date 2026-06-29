import { NextResponse } from 'next/server';

const privateJsonHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

export function privateJson<T>(body: T, init?: ResponseInit) {
  const response = NextResponse.json(body, init);

  for (const [key, value] of Object.entries(privateJsonHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
