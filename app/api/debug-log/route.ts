import { NextRequest, NextResponse } from "next/server";
import { debugLog } from "@/app/lib/debugLog";
import { isAuthConfigured, getSessionFromCookie, verifySessionToken } from "@/app/lib/auth";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

/**
 * POST /api/debug-log — запись произвольного события в debug.log (NDJSON).
 * Тело: { event: string, source?: string, ...data }
 * Работает только при DEBUG_LOG=1. Используется для логирования создания виджетов и т.п.
 */
export async function POST(req: NextRequest) {
  if (!process.env.DEBUG_LOG || (process.env.DEBUG_LOG !== "1" && process.env.DEBUG_LOG !== "true")) {
    return NextResponse.json({ ok: true }, { status: 200, headers: SECURITY_HEADERS });
  }

  if (isAuthConfigured()) {
    try {
      const token = getSessionFromCookie(req.headers.get("cookie"));
      if (!token || !verifySessionToken(token)) {
        return NextResponse.json({ error: "Требуется вход в систему" }, { status: 401, headers: SECURITY_HEADERS });
      }
    } catch {
      return NextResponse.json({ error: "Требуется вход в систему" }, { status: 401, headers: SECURITY_HEADERS });
    }
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { event, source, ...rest } = body;
    const section = typeof event === "string" ? event : "EVENT";
    const data: Record<string, unknown> = { source: typeof source === "string" ? source : undefined, ...rest };
    await debugLog(section, data);
    return NextResponse.json({ ok: true }, { status: 200, headers: SECURITY_HEADERS });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: SECURITY_HEADERS });
  }
}
