import { NextResponse } from "next/server";
import { executeLogin } from "@/lib/auth/supabase";
import { rateLimiterStore, requestIdentifier } from "@/lib/auth/rate-limiter";

function tooManyAttempts(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: `Too many login attempts. Please retry after ${retryAfterSeconds} seconds.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function POST(request: Request) {
  try {
    const ipLimit = rateLimiterStore.checkRateLimit(`ip:${requestIdentifier(request)}`, "auth");
    if (!ipLimit.allowed) return tooManyAttempts(ipLimit.retryAfterSeconds);

    let body: { email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const accountLimit = rateLimiterStore.checkRateLimit(
      `account:${String(email).trim().toLowerCase()}`,
      "auth"
    );
    if (!accountLimit.allowed) return tooManyAttempts(accountLimit.retryAfterSeconds);

    const result = await executeLogin(email, password);

    if (!result.success) {
      return NextResponse.json({
        error: result.error,
        requiresEmailVerification: result.requiresEmailVerification,
      }, { status: 401 });
    }

    if (!result.sessionToken) {
      return NextResponse.json({ error: "Authentication is not configured for this environment" }, { status: 503 });
    }

    const response = NextResponse.json({
      message: "Login successful",
      user: result.user,
      organization: result.organization,
    });

    response.cookies.set({
      name: "aiospark_session",
      value: result.sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
