import { NextRequest, NextResponse } from "next/server";
import { isAuthConfigured, getSessionFromCookie, verifySessionToken } from "@/app/lib/auth";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

export async function GET(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ ok: true }, { headers: SECURITY_HEADERS });
  }
  try {
    const cookieHeader = req.headers.get("cookie");
    const token = getSessionFromCookie(cookieHeader);
    if (!token || !verifySessionToken(token)) {
      return NextResponse.json({ ok: false }, { status: 401, headers: SECURITY_HEADERS });
    }
    return NextResponse.json({ ok: true }, { headers: SECURITY_HEADERS });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401, headers: SECURITY_HEADERS });
  }
}
