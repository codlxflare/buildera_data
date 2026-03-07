import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, verifySessionToken, isAuthConfigured } from "@/app/lib/auth";
import { isDbConfigured, runReadOnlyQuery } from "@/app/lib/db";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

function authFail() {
  return NextResponse.json({ error: "Требуется вход в систему" }, { status: 401, headers: SECURITY_HEADERS });
}

/** Детализация по дню: заявки, проведённые сделки, брони за выбранную дату */
export async function GET(req: NextRequest) {
  if (isAuthConfigured()) {
    try {
      const token = getSessionFromCookie(req.headers.get("cookie"));
      if (!token || !verifySessionToken(token)) return authFail();
    } catch {
      return authFail();
    }
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ error: "БД не настроена" }, { status: 503, headers: SECURITY_HEADERS });
  }

  const dateStr = req.nextUrl.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json(
      { error: "Укажите date в формате YYYY-MM-DD" },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }

  try {
    const leadsSql = `
      SELECT eb.id AS lead_id, eb.created_at,
             COALESCE(ch.name, eb.channel_name, '—') AS channel,
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
      WHERE DATE(eb.created_at) = ?
      ORDER BY eb.created_at DESC
      LIMIT 500
    `;
    const leadsRaw = await runReadOnlyQuery(leadsSql, [dateStr]);
    const leads = leadsRaw.map((r: Record<string, unknown>) => ({
      lead_id: r.lead_id,
      created_at: r.created_at,
      channel: String(r.channel ?? "—"),
      has_deal: Number(r.has_deal ?? 0),
      client_name: r.client_name != null && String(r.client_name).trim() !== "" ? String(r.client_name).trim() : "—",
      client_phone: r.client_phone != null && String(r.client_phone).trim() !== "" ? String(r.client_phone).trim() : "—",
      status_name: String(r.status_name ?? "—"),
      manager_name: r.manager_name != null && String(r.manager_name).trim() !== "" ? String(r.manager_name).trim() : "—",
    }));

    const dealsSql = `
      SELECT ed.deal_id, ed.deal_date, ed.deal_sum, ed.deal_status,
             COALESCE(c.contacts_buy_name, TRIM(CONCAT(COALESCE(c.name_last, ''), ' ', COALESCE(c.name_first, ''))), '—') AS client_name,
             COALESCE(s.geo_flatnum, s.plans_name, '—') AS flat_number
      FROM estate_deals ed
      LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id
      LEFT JOIN estate_sells s ON ed.estate_sell_id = s.estate_sell_id
      WHERE ed.deal_status = 150
        AND DATE(COALESCE(ed.deal_date, ed.deal_date_start)) = ?
      ORDER BY ed.deal_date DESC
      LIMIT 200
    `;
    const dealsRaw = await runReadOnlyQuery(dealsSql, [dateStr]);
    const deals = dealsRaw.map((r: Record<string, unknown>) => ({
      deal_id: r.deal_id,
      deal_date: r.deal_date,
      deal_sum: Number(r.deal_sum ?? 0),
      client_name: String(r.client_name ?? "—"),
      flat_number: String(r.flat_number ?? "—"),
    }));

    const reservedSql = `
      SELECT ed.deal_id, ed.deal_date, ed.deal_date_start, ed.reserve_date_start, ed.deal_sum,
             COALESCE(c.contacts_buy_name, TRIM(CONCAT(COALESCE(c.name_last, ''), ' ', COALESCE(c.name_first, ''))), '—') AS client_name,
             COALESCE(s.geo_flatnum, s.plans_name, '—') AS flat_number
      FROM estate_deals ed
      LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id
      LEFT JOIN estate_sells s ON ed.estate_sell_id = s.estate_sell_id
      WHERE ed.deal_status = 105
        AND DATE(COALESCE(ed.deal_date, ed.deal_date_start, ed.reserve_date_start)) = ?
      ORDER BY COALESCE(ed.reserve_date_start, ed.deal_date_start, ed.deal_date) DESC
      LIMIT 200
    `;
    const reservedRaw = await runReadOnlyQuery(reservedSql, [dateStr]);
    const reserved = reservedRaw.map((r: Record<string, unknown>) => ({
      deal_id: r.deal_id,
      deal_date: r.deal_date,
      deal_date_start: r.deal_date_start,
      reserve_date_start: r.reserve_date_start,
      deal_sum: Number(r.deal_sum ?? 0),
      client_name: String(r.client_name ?? "—"),
      flat_number: String(r.flat_number ?? "—"),
    }));

    return NextResponse.json(
      { date: dateStr, leads, deals, reserved },
      { headers: SECURITY_HEADERS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка загрузки";
    return NextResponse.json({ error: msg }, { status: 500, headers: SECURITY_HEADERS });
  }
}
