// AIOSpark API Rate Limiting Engine (Layer 25 Security Hardening)
// In-memory sliding window rate limiter preventing API abuse and brute-force attacks.

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  auth: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 login/signup requests per minute per IP
  api_default: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 API requests per minute per IP/Org
};

class RateLimiterStore {
  private hits: Map<string, { count: number; windowStart: number }> = new Map();

  public checkRateLimit(
    identifier: string,
    routeCategory: 'auth' | 'api_default' = 'api_default'
  ): { allowed: boolean; retryAfterSeconds: number; currentCount: number } {
    const config = DEFAULT_RATE_LIMITS[routeCategory] || DEFAULT_RATE_LIMITS.api_default;
    const now = Date.now();
    const key = `${routeCategory}:${identifier}`;

    const record = this.hits.get(key);

    if (!record || now - record.windowStart > config.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return { allowed: true, retryAfterSeconds: 0, currentCount: 1 };
    }

    if (record.count >= config.maxRequests) {
      const remainingMs = config.windowMs - (now - record.windowStart);
      const retryAfterSeconds = Math.ceil(remainingMs / 1000);
      return { allowed: false, retryAfterSeconds, currentCount: record.count };
    }

    record.count += 1;
    return { allowed: true, retryAfterSeconds: 0, currentCount: record.count };
  }

  public clearAll(): void {
    this.hits.clear();
  }
}

export const rateLimiterStore = new RateLimiterStore();

export function requestIdentifier(request: Request): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
