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

  const channel = req.nextUrl.searchParams.get("channel");
  const period = req.nextUrl.searchParams.get("period") || "";
  if (channel === null || channel === "") {
    return NextResponse.json(
      { error: "Укажите channel" },
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
    const isWithoutChannel = channel === "Без канала";
    // На воронке канал = COALESCE(ch.name, eb.channel_name): ищем по обоим полям. Контакт, статус, менеджер — для просмотра «кто и как».
    const sql = isWithoutChannel
      ? `
      SELECT eb.id AS lead_id, eb.created_at, eb.channel_name AS channel,
             eb.deal_id, CASE WHEN eb.deal_id IS NOT NULL THEN 1 ELSE 0 END AS has_deal,
             COALESCE(c.contacts_buy_name, TRIM(CONCAT(COALESCE(c.name_last, ''), ' ', COALESCE(c.name_first, '')))) AS client_name,
             c.contacts_buy_phones AS client_phone,
             COALESCE(st.status_name, eb.status_name, '—') AS status_name,
             u.users_name AS manager_name
      FROM estate_buys eb
      LEFT JOIN contacts c ON c.contacts_id = eb.contacts_id
      LEFT JOIN estate_statuses st ON st.status_id = eb.status
      LEFT JOIN users u ON u.id = eb.manager_id
      WHERE DATE(eb.created_at) >= ? AND DATE(eb.created_at) <= ?
        AND eb.channel_name IS NULL AND eb.advertising_channel_id IS NULL
      ORDER BY eb.created_at DESC
      LIMIT 500
    `
      : `
      SELECT eb.id AS lead_id, eb.created_at,
             COALESCE(ch.name, eb.channel_name) AS channel,
             eb.deal_id, CASE WHEN eb.deal_id IS NOT NULL THEN 1 ELSE 0 END AS has_deal,
             COALESCE(c.contacts_buy_name, TRIM(CONCAT(COALESCE(c.name_last, ''), ' ', COALESCE(c.name_first, '')))) AS client_name,
             c.contacts_buy_phones AS client_phone,
             COALESCE(st.status_name, eb.status_name, '—') AS status_name,
             u.users_name AS manager_name
      FROM estate_buys eb
      LEFT JOIN estate_advertising_channels ch ON eb.advertising_channel_id = ch.id
      LEFT JOIN contacts c ON c.contacts_id = eb.contacts_id
      LEFT JOIN estate_statuses st ON st.status_id = eb.status
      LEFT JOIN users u ON u.id = eb.manager_id
      WHERE DATE(eb.created_at) >= ? AND DATE(eb.created_at) <= ?
        AND (eb.channel_name = ? OR ch.name = ?)
      ORDER BY eb.created_at DESC
      LIMIT 500
    `;
    const rows = await runReadOnlyQuery(sql, isWithoutChannel ? [start, end] : [start, end, channel, channel]);
    const list = rows.map((r) => ({
      lead_id: r.lead_id,
      created_at: r.created_at,
      channel: String(r.channel ?? "—"),
      has_deal: Number(r.has_deal ?? 0),
      client_name: r.client_name != null && String(r.client_name).trim() !== "" ? String(r.client_name).trim() : "—",
      client_phone: r.client_phone != null && String(r.client_phone).trim() !== "" ? String(r.client_phone).trim() : "—",
      status_name: String(r.status_name ?? "—"),
      manager_name: r.manager_name != null && String(r.manager_name).trim() !== "" ? String(r.manager_name).trim() : "—",
    }));
    return NextResponse.json(
      { channel, period, start, end, leads: list },
      { headers: { ...SECURITY_HEADERS, "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка загрузки";
    return NextResponse.json({ error: msg }, { status: 500, headers: SECURITY_HEADERS });
  }
}
