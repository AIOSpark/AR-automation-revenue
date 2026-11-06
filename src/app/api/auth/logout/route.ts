import { NextResponse } from "next/server";
import { trackAuthFunnelEvent } from "@/lib/auth/analytics";
import { revokeSessionToken } from "@/lib/auth/session";

function getSessionToken(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie") || "";
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("aiospark_session="));
  return entry ? decodeURIComponent(entry.slice("aiospark_session=".length)) : undefined;
}

export async function POST(request: Request) {
  trackAuthFunnelEvent("logout_completed");

  revokeSessionToken(getSessionToken(request));

  const response = NextResponse.json({ message: "Logout successful" });
  response.cookies.delete("aiospark_session");
  response.cookies.delete("aiospark_active_org");
  return response;
}
