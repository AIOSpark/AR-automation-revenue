import { NextRequest, NextResponse } from "next/server";
import { rateLimiterStore } from "@/lib/auth/rate-limiter";
import { TransactionalEmailProvider } from "@/lib/communication/email-provider";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIdentifier(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown-client";
}

export async function POST(request: NextRequest) {
  const limit = rateLimiterStore.checkRateLimit(clientIdentifier(request), "auth");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many applications. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = payload as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const company = typeof input.company === "string" ? input.company.trim() : "";
  const role = typeof input.role === "string" ? input.role.trim() : "Not provided";

  if (name.length < 2 || name.length > 120 || company.length < 2 || company.length > 160 || !emailPattern.test(email)) {
    return NextResponse.json({ error: "Please provide a valid name, work email, and company." }, { status: 400 });
  }

  const salesEmail = process.env.SALES_LEAD_EMAIL;
  if (!salesEmail && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Lead capture is temporarily unavailable." }, { status: 503 });
  }

  const recipient = salesEmail || email;
  const result = await TransactionalEmailProvider.sendEmail({
    toEmail: recipient,
    organizationId: "public-lead",
    subject: `New AIOSpark early-access application — ${company}`,
    body: [
      "New AIOSpark early-access application",
      `Name: ${name}`,
      `Email: ${email}`,
      `Company: ${company}`,
      `Role: ${role}`,
    ].join("\n"),
  });

  if (!result.success) {
    return NextResponse.json({ error: "We could not submit your application. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ success: true, messageId: result.messageId });
}
