import { NextResponse } from "next/server";
import { supabase } from "@/lib/auth/supabase";
import { authStore } from "@/lib/auth/store";
import { createSessionToken } from "@/lib/auth/session";
import { confirmEmailVerification } from "@/lib/auth/supabase";
import { isDevAuthEnabled } from "@/lib/auth/dev-mode";
import { rateLimiterStore, requestIdentifier } from "@/lib/auth/rate-limiter";

function tooManyAttempts(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: `Too many verification attempts. Please retry after ${retryAfterSeconds} seconds.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function redirectVerify(error?: string) {
  const url = new URL("/verify-email", APP_URL);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    const ipLimit = rateLimiterStore.checkRateLimit(`ip:${requestIdentifier(request)}`, "auth");
    if (!ipLimit.allowed) return tooManyAttempts(ipLimit.retryAfterSeconds);

    const { searchParams } = new URL(request.url);
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") || "email";

    if (!tokenHash) {
      return redirectVerify("missing_token");
    }

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error || !data.user) {
      return redirectVerify("invalid_token");
    }

    const email = data.user.email;
    if (!email) {
      return redirectVerify("no_email");
    }

    let user = authStore.getUserByEmail(email);
    if (!user) {
      user = authStore.createUser({
        auth_provider_id: data.user.id,
        email,
        first_name: data.user.user_metadata?.first_name || "",
        last_name: data.user.user_metadata?.last_name || "",
        email_verified: true,
      });
    } else {
      user.email_verified = true;
      authStore.updateUserEmailVerified(user.auth_provider_id, true);
    }

    const sessionToken = createSessionToken(user.id);
    if (!sessionToken) {
      return redirectVerify("session_failed");
    }

    const redirectUrl = new URL("/dashboard", APP_URL);
    const response = NextResponse.redirect(redirectUrl);
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
    return redirectVerify("server_error");
  }
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
