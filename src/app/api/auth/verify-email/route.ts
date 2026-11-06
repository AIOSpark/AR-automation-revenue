import { NextResponse } from "next/server";
import { confirmEmailVerification } from "@/lib/auth/supabase";
import { createSessionToken } from "@/lib/auth/session";
import { isDevAuthEnabled } from "@/lib/auth/dev-mode";
import { rateLimiterStore, requestIdentifier } from "@/lib/auth/rate-limiter";

function tooManyAttempts(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: `Too many verification attempts. Please retry after ${retryAfterSeconds} seconds.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function POST(request: Request) {
  try {
    const ipLimit = rateLimiterStore.checkRateLimit(`ip:${requestIdentifier(request)}`, "auth");
    if (!ipLimit.allowed) return tooManyAttempts(ipLimit.retryAfterSeconds);

    if (!isDevAuthEnabled()) {
      return NextResponse.json(
        { error: "Email verification must be completed through the managed authentication provider" },
        { status: 410 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email address is required" }, { status: 400 });
    }

    const accountLimit = rateLimiterStore.checkRateLimit(
      `account:${String(email).trim().toLowerCase()}`,
      "auth"
    );
    if (!accountLimit.allowed) return tooManyAttempts(accountLimit.retryAfterSeconds);

    const result = await confirmEmailVerification(email);

    if (!result.success || !result.user) {
      return NextResponse.json({ error: "User account not found or invalid token" }, { status: 404 });
    }

    const sessionToken = createSessionToken(result.user.id);
    if (!sessionToken) {
      return NextResponse.json(
        { error: "Authentication is not configured for this environment" },
        { status: 503 }
      );
    }

    const response = NextResponse.json({ message: "Email verified successfully", user: result.user });
    response.cookies.set({
      name: "aiospark_session",
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
