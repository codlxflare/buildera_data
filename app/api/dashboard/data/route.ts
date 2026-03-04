import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, verifySessionToken } from "@/app/lib/auth";
import { isAuthConfigured } from "@/app/lib/auth";
import { isDbConfigured } from "@/app/lib/db";
import {
  runDashboardWidgets,
  getAvailableWidgetKeys,
  type WidgetKey,
} from "@/app/lib/dashboardQueries";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET(req: NextRequest) {
  if (isAuthConfigured()) {
    try {
      const token = getSessionFromCookie(req.headers.get("cookie"));
      if (!token || !verifySessionToken(token)) {
        return NextResponse.json(
          { error: "Требуется вход в систему" },
          { status: 401, headers: SECURITY_HEADERS }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Требуется вход в систему" },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }
  }

  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "БД не настроена" },
      { status: 503, headers: SECURITY_HEADERS }
    );
  }

  const period = req.nextUrl.searchParams.get("period") || "";
  const widgetsParam = req.nextUrl.searchParams.get("widgets");
  const keys: WidgetKey[] = widgetsParam
    ? (widgetsParam.split(",").map((k) => k.trim()) as WidgetKey[]).filter((k) =>
        getAvailableWidgetKeys().includes(k)
      )
    : getAvailableWidgetKeys();

  if (keys.length === 0) {
    return NextResponse.json(
      { error: "Не указаны виджеты" },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }

  try {
    const data = await runDashboardWidgets(keys, period || "current");
    return NextResponse.json(data, {
      headers: {
        ...SECURITY_HEADERS,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка загрузки данных";
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}
