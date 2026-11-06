import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCsrfRequestSafe } from '@/lib/auth/csrf';

const CSRF_EXEMPT_PATHS = ['/api/billing/razorpay-webhook'];

export function proxy(request: NextRequest) {
  const isExempt = CSRF_EXEMPT_PATHS.some((path) => request.nextUrl.pathname === path);
  if (!isExempt && !isCsrfRequestSafe(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
