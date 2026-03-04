/**
 * GET /api/samples — выгрузка примеров данных из БД (только чтение).
 * Используется для формирования api_samples.txt, чтобы ИИ видел реальные значения полей.
 * ?refresh=1 — сбросить кэш и заново выгрузить из БД (и перезаписать api_samples.txt).
 * Требует аутентификации — данные о структуре БД не должны быть публично доступны.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, verifySessionToken, isAuthConfigured } from "@/app/lib/auth";
import { getSchemaSamplesText, clearSchemaSamplesCache } from "@/app/lib/dbSamples";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
} as const;

export async function GET(req: NextRequest) {
  // Auth check — same pattern as all other protected API routes
  if (isAuthConfigured()) {
    try {
      const token = getSessionFromCookie(req.headers.get("cookie"));
      if (!token || !verifySessionToken(token)) {
        return new NextResponse("Unauthorized", { status: 401, headers: SECURITY_HEADERS });
      }
    } catch {
      return new NextResponse("Unauthorized", { status: 401, headers: SECURITY_HEADERS });
    }
  }

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (refresh) clearSchemaSamplesCache();

  const text = await getSchemaSamplesText(refresh);
  return new NextResponse(text || "Нет данных (БД не подключена или файл api_samples.txt пуст).", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
