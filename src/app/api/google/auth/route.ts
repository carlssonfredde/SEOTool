import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthUrl,
  getGoogleClientCredentials,
  resolveRedirectUri,
} from "@/lib/google-oauth";

import { createGoogleState, GOOGLE_STATE_COOKIE } from "@/lib/google-oauth-policy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const creds = await getGoogleClientCredentials();
  if (!creds) {
    return NextResponse.redirect(
      new URL(
        "/settings/google?error=no-credentials",
        new URL(resolveRedirectUri(req)).origin,
      ),
    );
  }
  // MUST use the same URI-derivation logic as settings/google/page.tsx.
  // Otherwise the URI we show the user (to register in Google Cloud
  // Console) diverges from the URI Google actually receives, and
  // Google rejects with "Error 400: invalid_request".
  const redirectUri = resolveRedirectUri(req);

  const popup = req.nextUrl.searchParams.get("popup") === "1";
  const clientId = req.nextUrl.searchParams.get("clientId");
  // State encodes both popup mode and target clientId so the callback
  // knows where to store the resulting tokens. Format: "popup|clientId:123"
  const stateParts: string[] = [];
  if (popup) stateParts.push("popup");
  if (clientId && /^\d+$/.test(clientId)) {
    stateParts.push(`clientId:${clientId}`);
  }
  const state = createGoogleState(stateParts);
  const url = buildAuthUrl({
    clientId: creds.clientId,
    redirectUri,
    state,
  });
  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true, sameSite: "lax", secure: redirectUri.startsWith("https:"),
    path: "/api/google", maxAge: 600,
  });
  return response;
}
