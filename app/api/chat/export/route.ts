import { NextRequest, NextResponse } from "next/server";
import { getExport } from "@/app/lib/exportStore";
import { rowsToCsv } from "@/app/lib/csvExport";
import { getSessionFromCookie, verifySessionToken, isAuthConfigured } from "@/app/lib/auth";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET(req: NextRequest) {
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

  const id = req.nextUrl.searchParams.get("id");
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Не указан id выгрузки" }, { status: 400, headers: SECURITY_HEADERS });
  }

  const rows = getExport(id);
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Выгрузка не найдена или истекла" }, { status: 404, headers: SECURITY_HEADERS });
  }

  const csv = rowsToCsv(rows);
  const filename = `macrodata-export-${id.slice(0, 8)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
