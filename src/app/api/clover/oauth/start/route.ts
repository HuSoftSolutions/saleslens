import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { ensureUserOrg } from "@/lib/orgs/getUserOrg";
import {
  generateOAuthState,
  buildAuthorizationUrl,
} from "@/lib/clover/oauth";

export async function GET(request: NextRequest) {
  // The token is passed as a query param since this endpoint redirects the browser.
  // This is a GET request initiated by a browser redirect, so we can't use Authorization headers.
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email ?? "";

    // Ensure user has an org
    const org = await ensureUserOrg(uid, email);

    // Generate CSRF-safe state
    const state = await generateOAuthState(uid, org.orgId);

    // Build authorization URL and redirect
    const authUrl = buildAuthorizationUrl(state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("OAuth start error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 }
    );
  }
}
