const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isCsrfRequestSafe(request: Request): boolean {
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
    return true;
  }

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return false;
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return true;
  }

  try {
    const originHost = new URL(origin).host;
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const requestHost = forwardedHost || request.headers.get('host') || new URL(request.url).host;
    return originHost === requestHost;
  } catch {
    return false;
  }
}
