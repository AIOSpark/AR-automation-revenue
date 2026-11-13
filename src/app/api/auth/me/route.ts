import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authStore } from "@/lib/auth/store";
import { tenantStore } from "@/lib/tenant/store";
import { verifySessionToken } from "@/lib/auth/session";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("aiospark_session")?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: "Unauthorized session" }, { status: 401 });
    }

    const userId = verifySessionToken(sessionToken);
    if (!userId) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    let user = userId ? authStore.getUserById(userId) : null;
    if (!user) {
      return NextResponse.json({ error: "Session invalid or user not found" }, { status: 401 });
    }

    let organization = authStore.getOrganizationByUserId(user.id);
    if (!organization || !tenantStore.getMember(user.id, organization.id)) {
      return NextResponse.json({ error: "No active organization membership" }, { status: 403 });
    }

    return NextResponse.json({
      authenticated: true,
      user,
      organization,
      email_verified: user.email_verified,
      requiresEmailVerification: !user.email_verified,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
