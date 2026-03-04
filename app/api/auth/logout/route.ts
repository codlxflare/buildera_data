import { NextResponse } from "next/server";
import { getSessionCookieName } from "@/app/lib/auth";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

export async function POST() {
  const name = getSessionCookieName();
  const res = NextResponse.json({ ok: true }, { headers: SECURITY_HEADERS });
  res.cookies.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
