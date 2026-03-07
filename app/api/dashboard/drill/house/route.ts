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

  const houseId = req.nextUrl.searchParams.get("house_id");
  const period = req.nextUrl.searchParams.get("period") || "";
  const hid = houseId ? parseInt(houseId, 10) : NaN;
  if (!Number.isInteger(hid) || hid < 1) {
    return NextResponse.json(
      { error: "Укажите house_id (число)" },
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
    const nameRows = await runReadOnlyQuery(
      "SELECT COALESCE(name, public_house_name, 'Объект') AS name FROM estate_houses WHERE house_id = ? LIMIT 1",
      [hid]
    );
    const houseName = (nameRows[0] as { name?: string } | undefined)?.name ?? `Объект #${hid}`;

    const paymentsSql = `
      SELECT f.id AS finance_id, f.date_to, f.summa, f.status_name,
             COALESCE(s.geo_flatnum, s.plans_name, '—') AS flat_number
      FROM finances f
      LEFT JOIN estate_sells s ON f.estate_sell_id = s.estate_sell_id
      WHERE s.house_id = ?
        AND DATE(f.date_to) >= ? AND DATE(f.date_to) <= ? AND f.deal_id IS NOT NULL
      ORDER BY f.date_to DESC, f.id DESC
      LIMIT 300
    `;
    const paymentsRaw = await runReadOnlyQuery(paymentsSql, [hid, start, end]);
    const payments = paymentsRaw.map((r) => ({
      finance_id: r.finance_id,
      date_to: r.date_to,
      summa: Number(r.summa ?? 0),
      status_name: String(r.status_name ?? "—"),
      flat_number: String(r.flat_number ?? "—"),
    }));

    const dealsSql = `
      SELECT ed.deal_id, ed.deal_date, ed.deal_sum, ed.deal_status,
             COALESCE(c.contacts_buy_name, CONCAT(TRIM(COALESCE(c.name_last, '')), ' ', TRIM(COALESCE(c.name_first, ''))), '—') AS client_name,
             COALESCE(s.geo_flatnum, s.plans_name, '—') AS flat_number
      FROM estate_deals ed
      LEFT JOIN estate_sells s ON ed.estate_sell_id = s.estate_sell_id
      LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id
      WHERE s.house_id = ?
        AND ed.deal_date IS NOT NULL AND DATE(ed.deal_date) >= ? AND DATE(ed.deal_date) <= ?
      ORDER BY ed.deal_date DESC
      LIMIT 200
    `;
    const dealsRaw = await runReadOnlyQuery(dealsSql, [hid, start, end]);
    const STATUS_NAMES: Record<number, string> = {
      150: "Завершено",
      140: "Отменено",
      100: "В работе",
      110: "Бронь",
      120: "Договор",
      130: "Регистрация",
    };
    const deals = dealsRaw.map((r) => ({
      deal_id: r.deal_id,
      deal_date: r.deal_date,
      deal_sum: Number(r.deal_sum ?? 0),
      deal_status: Number(r.deal_status ?? 0),
      status_name: STATUS_NAMES[Number(r.deal_status)] ?? `Статус ${r.deal_status}`,
      client_name: String(r.client_name ?? "—"),
      flat_number: String(r.flat_number ?? "—"),
    }));

    const totalPayments = payments.reduce((s, p) => s + p.summa, 0);
    const totalDeals = deals.reduce((s, d) => s + d.deal_sum, 0);

    // Заявки по объекту: house_id, first_house_interest или объект заявки (estate_sell) в этом доме
    const leadsSql = `
      SELECT eb.id AS lead_id, eb.created_at,
             COALESCE(ch.name, eb.channel_name, '—') AS channel,
             eb.deal_id, CASE WHEN eb.deal_id IS NOT NULL THEN 1 ELSE 0 END AS has_deal,
             COALESCE(c.contacts_buy_name, TRIM(CONCAT(COALESCE(c.name_last, ''), ' ', COALESCE(c.name_first, '')))) AS client_name,
             c.contacts_buy_phones AS client_phone,
             COALESCE(st.status_name, eb.status_name, '—') AS status_name,
             u.users_name AS manager_name
      FROM estate_buys eb
      LEFT JOIN estate_sells s ON eb.estate_sell_id = s.estate_sell_id
      LEFT JOIN estate_advertising_channels ch ON eb.advertising_channel_id = ch.id
      LEFT JOIN contacts c ON c.contacts_id = eb.contacts_id
      LEFT JOIN estate_statuses st ON st.status_id = eb.status
      LEFT JOIN users u ON u.id = eb.manager_id
      WHERE (eb.house_id = ? OR eb.first_house_interest = ? OR (s.estate_sell_id IS NOT NULL AND s.house_id = ?))
        AND DATE(eb.created_at) >= ? AND DATE(eb.created_at) <= ?
      ORDER BY eb.created_at DESC
      LIMIT 500
    `;
    const leadsRaw = await runReadOnlyQuery(leadsSql, [hid, hid, hid, start, end]);
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

    return NextResponse.json(
      {
        house_id: hid,
        house_name: houseName,
        period,
        start,
        end,
        payments,
        deals,
        leads,
        total_payments: totalPayments,
        total_deals_sum: totalDeals,
      },
      {
        headers: {
          ...SECURITY_HEADERS,
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка загрузки";
    return NextResponse.json({ error: msg }, { status: 500, headers: SECURITY_HEADERS });
  }
}
