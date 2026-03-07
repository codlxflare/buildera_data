import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, verifySessionToken } from "@/app/lib/auth";
import { isAuthConfigured } from "@/app/lib/auth";
import { isDbConfigured, runReadOnlyQuery } from "@/app/lib/db";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

  const managerId = req.nextUrl.searchParams.get("manager_id");
  const period = req.nextUrl.searchParams.get("period") || "";
  const mid = managerId ? parseInt(managerId, 10) : NaN;
  if (!Number.isInteger(mid) || mid < 1) {
    return NextResponse.json(
      { error: "Укажите manager_id (число)" },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }

  const [y, m] = period.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    return NextResponse.json(
      { error: "Укажите period в формате YYYY-MM" },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = lastDayOfMonth(y, m);

  try {
    const nameRows = await runReadOnlyQuery("SELECT users_name AS name FROM users WHERE id = ? LIMIT 1", [mid]);
    const managerName = (nameRows[0] as { name?: string } | undefined)?.name ?? `Менеджер #${mid}`;

    const sql = `
      SELECT
        ed.deal_id,
        ed.deal_date AS deal_date,
        ed.deal_sum AS deal_sum,
        ed.deal_status AS deal_status,
        COALESCE(c.contacts_buy_name, CONCAT(TRIM(COALESCE(c.name_last, '')), ' ', TRIM(COALESCE(c.name_first, ''))), '—') AS client_name,
        COALESCE(h.name, h.public_house_name, '—') AS house_name,
        COALESCE(s.geo_flatnum, s.plans_name, '—') AS flat_number
      FROM estate_deals ed
      LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id
      LEFT JOIN estate_sells s ON ed.estate_sell_id = s.estate_sell_id
      LEFT JOIN estate_houses h ON s.house_id = h.house_id
      WHERE ed.deal_manager_id = ?
        AND ed.deal_date IS NOT NULL
        AND DATE(ed.deal_date) >= ? AND DATE(ed.deal_date) <= ?
      ORDER BY ed.deal_date DESC, ed.deal_id DESC
      LIMIT 500
    `;
    const rows = await runReadOnlyQuery(sql, [mid, start, end]);
    const STATUS_NAMES: Record<number, string> = {
      150: "Завершено",
      140: "Отменено",
      100: "В работе",
      110: "Бронь",
      120: "Договор",
      130: "Регистрация",
    };
    const list = rows.map((r) => ({
      deal_id: r.deal_id,
      deal_date: r.deal_date,
      deal_sum: Number(r.deal_sum ?? 0),
      deal_status: Number(r.deal_status ?? 0),
      status_name: STATUS_NAMES[Number(r.deal_status)] ?? `Статус ${r.deal_status}`,
      client_name: String(r.client_name ?? "—"),
      house_name: String(r.house_name ?? "—"),
      flat_number: String(r.flat_number ?? "—"),
    }));
    return NextResponse.json(
      { manager_id: mid, manager_name: managerName, period, start, end, deals: list },
      { headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка загрузки";
    return NextResponse.json({ error: msg }, { status: 500, headers: SECURITY_HEADERS });
  }
}
