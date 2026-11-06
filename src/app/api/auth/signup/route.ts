import { NextResponse } from "next/server";
import { executeSignup } from "@/lib/auth/supabase";
import { validateWorkEmail } from "@/lib/auth/config";
import { rateLimiterStore, requestIdentifier } from "@/lib/auth/rate-limiter";

function tooManyAttempts(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: `Too many signup attempts. Please retry after ${retryAfterSeconds} seconds.` },
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

    const { first_name, last_name, email, password, company_name, company_size, industry, phone, role_title } = body;

    // Field Validations
    if (!first_name || !last_name) {
      return NextResponse.json({ error: "First name and last name are required" }, { status: 400 });
    }

    const emailCheck = validateWorkEmail(email);
    if (!emailCheck.isValid) {
      return NextResponse.json({ error: emailCheck.error || "Invalid email" }, { status: 400 });
    }

    const accountLimit = rateLimiterStore.checkRateLimit(
      `account:${String(email).trim().toLowerCase()}`,
      "auth"
    );
    if (!accountLimit.allowed) return tooManyAttempts(accountLimit.retryAfterSeconds);

    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 });
    }

    if (!company_name || !company_size || !industry) {
      return NextResponse.json({ error: "Company name, size, and industry are required" }, { status: 400 });
    }

    const result = await executeSignup({
      first_name,
      last_name,
      email,
      password,
      company_name,
      company_size,
      industry,
      phone,
      role_title,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      message: "Signup successful. Please verify your email.",
      user: result.user,
      organization: result.organization,
      requiresEmailVerification: result.requiresEmailVerification,
      isFreeEmailWarning: emailCheck.isFreeEmail,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
