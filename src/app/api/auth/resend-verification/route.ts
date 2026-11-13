import { NextResponse } from "next/server";
import { supabase } from "@/lib/auth/supabase";
import { rateLimiterStore, requestIdentifier } from "@/lib/auth/rate-limiter";

function tooManyAttempts(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: `Too many resend attempts. Please retry after ${retryAfterSeconds} seconds.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function POST(request: Request) {
  try {
    const ipLimit = rateLimiterStore.checkRateLimit(`ip:${requestIdentifier(request)}`, "auth");
    if (!ipLimit.allowed) return tooManyAttempts(ipLimit.retryAfterSeconds);

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email address is required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const accountLimit = rateLimiterStore.checkRateLimit(
      `account:${normalizedEmail}`,
      "auth"
    );
    if (!accountLimit.allowed) return tooManyAttempts(accountLimit.retryAfterSeconds);

    const { error } = await supabase.auth.resend({
      email: normalizedEmail,
      type: "signup",
    });

    if (error) {
      const message = error.message || "Failed to resend confirmation email";
      let status = 400;

      if (
        message.includes("email_address_not_authorized") ||
        message.includes("not authorized")
      ) {
        status = 403;
      } else if (message.includes("rate limit") || message.includes("too many")) {
        status = 429;
      } else if (message.includes("already confirmed") || message.includes("already verified")) {
        status = 409;
      }

      return NextResponse.json(
        { error: message, code: error.code, status },
        { status }
      );
    }

    return NextResponse.json({
      message: "Confirmation email resent. Please check your inbox.",
      email: normalizedEmail,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
