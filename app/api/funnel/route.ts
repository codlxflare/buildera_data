import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, verifySessionToken, isAuthConfigured } from "@/app/lib/auth";
import { isDbConfigured, runReadOnlyQuery } from "@/app/lib/db";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

/** Нормализация строки ряда: драйвер может вернуть dt/cnt в разном регистре, cnt — number. */
function normTimeRow(r: Record<string, unknown>): { dt: string; cnt: number } {
  const dt = r?.dt ?? r?.DT ?? "";
  const cnt = r?.cnt ?? r?.CNT ?? 0;
  return { dt: String(dt), cnt: Number(cnt) };
}

function authFail() {
  return NextResponse.json({ error: "Требуется вход в систему" }, { status: 401, headers: SECURITY_HEADERS });
}

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

  const url = req.nextUrl;
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const now = new Date();
  const start = startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  let end = endParam && /^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  if (end < start) end = start;

  try {
    // Все запросы: DATE() для единообразия и любых диапазонов (в т.ч. 2 года), конец включительно
    const leadsCountRows = await runReadOnlyQuery(
      `SELECT COUNT(*) AS total FROM estate_buys WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?`,
      [start, end]
    ).catch(() => [{ total: 0 }]);
    const leadsRow = leadsCountRows?.[0] as Record<string, unknown> | undefined;
    // Драйвер может вернуть total как number или BigInt
    const totalLeadsRaw = leadsRow?.total ?? (leadsRow ? Object.values(leadsRow)[0] : undefined);
    let totalLeads = Number(totalLeadsRaw ?? 0);

    // Попадание в период: по deal_date (проведённые) ИЛИ по deal_date_start (брони/в работе без даты проведения)
    const [dealsRow] = await runReadOnlyQuery(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN deal_status = 150 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN deal_status = 105 THEN 1 ELSE 0 END) AS reserved,
        SUM(CASE WHEN deal_status = 110 THEN 1 ELSE 0 END) AS in_work,
        COALESCE(SUM(CASE WHEN deal_status = 150 THEN deal_sum ELSE 0 END), 0) AS revenue
       FROM estate_deals
       WHERE (
         (deal_date IS NOT NULL AND DATE(deal_date) >= ? AND DATE(deal_date) <= ?)
         OR (deal_date IS NULL AND deal_date_start IS NOT NULL AND DATE(deal_date_start) >= ? AND DATE(deal_date_start) <= ?)
       )`,
      [start, end, start, end]
    ).catch(() => [{ total: 0, completed: 0, reserved: 0, in_work: 0, revenue: 0 }]);

    const deals = dealsRow as Record<string, unknown>;

    // Заявки за период, у которых есть хотя бы одна сделка (для этапа «Перешли в сделку»)
    const [leadsWithDealRow] = await runReadOnlyQuery(
      `SELECT COUNT(DISTINCT eb.id) AS cnt
       FROM estate_buys eb
       INNER JOIN estate_deals ed ON eb.estate_buy_id = ed.estate_buy_id
       WHERE DATE(eb.created_at) >= ? AND DATE(eb.created_at) <= ?`,
      [start, end]
    ).catch(() => [{ cnt: 0 }]);
    const leadsWithDeal = Number((leadsWithDealRow as Record<string, unknown>)?.cnt ?? 0);

    // ── 2. Leads by status (funnel); в БД поле status, не estate_buy_status ─
    const funnelLeads = await runReadOnlyQuery(
      `SELECT
        COALESCE(status, 0) AS status_id,
        COUNT(*) AS cnt
       FROM estate_buys
       WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
       GROUP BY status`,
      [start, end]
    ).catch(() => []);

    // ── 3. Leads by channel (with revenue) ─────────────────────────
    const channelRows = await runReadOnlyQuery(
      `SELECT
        COALESCE(ch.name, eb.channel_name, 'Не указан') AS channel,
        COUNT(DISTINCT eb.id) AS leads,
        COUNT(DISTINCT ed.deal_id) AS deals,
        COALESCE(SUM(CASE WHEN ed.deal_status = 150 THEN ed.deal_sum ELSE 0 END), 0) AS revenue,
        ROUND(COUNT(DISTINCT ed.deal_id) * 100.0 / NULLIF(COUNT(DISTINCT eb.id), 0), 1) AS conv_pct
       FROM estate_buys eb
       LEFT JOIN estate_advertising_channels ch ON eb.advertising_channel_id = ch.id
       LEFT JOIN estate_deals ed ON eb.estate_buy_id = ed.estate_buy_id AND ed.deal_status = 150
       WHERE DATE(eb.created_at) >= ? AND DATE(eb.created_at) <= ?
       GROUP BY ch.name, eb.channel_name
       HAVING COUNT(DISTINCT eb.id) > 0
       ORDER BY leads DESC
       LIMIT 20`,
      [start, end]
    ).catch(() => []);

    // ── 4. Distribution by house: все источники привязки к дому по схеме ─
    // Связи: estate_deals.house_id; estate_sells.house_id (объект сделки или заявки); estate_buys.house_id, first_house_interest
    let houseRows: Array<Record<string, unknown>> = [];
    try {
      const raw = await runReadOnlyQuery(
        `SELECT
          COALESCE(MAX(h.name), MAX(h.public_house_name), 'Не определён') AS house,
          COUNT(DISTINCT eb.id) AS total,
          SUM(CASE WHEN eb.status = 1 THEN 1 ELSE 0 END) AS new_leads,
          COUNT(DISTINCT CASE WHEN ed.deal_status = 105 THEN ed.deal_id END) AS reserved,
          COUNT(DISTINCT CASE WHEN ed.deal_status = 150 THEN ed.deal_id END) AS completed
         FROM estate_buys eb
         LEFT JOIN estate_deals ed ON eb.estate_buy_id = ed.estate_buy_id
         LEFT JOIN estate_sells s_deal ON ed.estate_sell_id = s_deal.estate_sell_id
         LEFT JOIN estate_sells s_lead ON eb.estate_sell_id = s_lead.estate_sell_id
         LEFT JOIN estate_houses h ON h.house_id = COALESCE(
           ed.house_id,
           s_deal.house_id,
           s_lead.house_id,
           eb.house_id,
           eb.first_house_interest
         )
         WHERE DATE(eb.created_at) >= ? AND DATE(eb.created_at) <= ?
         GROUP BY COALESCE(ed.house_id, s_deal.house_id, s_lead.house_id, eb.house_id, eb.first_house_interest)
         HAVING total > 0
         ORDER BY total DESC
         LIMIT 15`,
        [start, end]
      );
      houseRows = Array.isArray(raw) ? raw : [];
    } catch {
      houseRows = [];
    }
    if (houseRows.length === 0 && totalLeads > 0) {
      houseRows = [{
        house: "Без привязки к объекту",
        total: totalLeads,
        new_leads: totalLeads,
        reserved: 0,
        completed: 0,
      }];
    }

    // ── 5. Deals by manager (то же правило периода: deal_date или deal_date_start) ─
    const managerRows = await runReadOnlyQuery(
      `SELECT
        COALESCE(u.users_name, 'Без менеджера') AS manager,
        COUNT(ed.deal_id) AS deals_count,
        SUM(CASE WHEN ed.deal_status = 150 THEN 1 ELSE 0 END) AS completed,
        COALESCE(SUM(CASE WHEN ed.deal_status = 150 THEN ed.deal_sum ELSE 0 END), 0) AS revenue
       FROM estate_deals ed
       LEFT JOIN users u ON ed.deal_manager_id = u.id
       WHERE (
         (ed.deal_date IS NOT NULL AND DATE(ed.deal_date) >= ? AND DATE(ed.deal_date) <= ?)
         OR (ed.deal_date IS NULL AND ed.deal_date_start IS NOT NULL AND DATE(ed.deal_date_start) >= ? AND DATE(ed.deal_date_start) <= ?)
       )
       GROUP BY u.id, u.users_name
       HAVING deals_count > 0
       ORDER BY completed DESC, deals_count DESC
       LIMIT 15`,
      [start, end, start, end]
    ).catch(() => []);

    // ── 6. Leads over time: всегда по дням (YYYY-MM-DD); диапазон через datetime для совместимости с драйвером ─
    const startDt = `${start} 00:00:00`;
    const endDt = `${end} 23:59:59`;
    const timeSeriesRowsRaw = await runReadOnlyQuery(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS dt, COUNT(*) AS cnt
       FROM estate_buys WHERE created_at >= ? AND created_at <= ?
       GROUP BY DATE(created_at) ORDER BY dt`,
      [startDt, endDt]
    ).catch(() => []);
    const timeSeriesRows = Array.isArray(timeSeriesRowsRaw)
      ? timeSeriesRowsRaw.map((r: Record<string, unknown>) => normTimeRow(r as Record<string, unknown>))
      : [];
    // Если COUNT вернул 0, но динамика по дням есть — берём сумму (защита от особенностей драйвера/БД)
    if (totalLeads === 0 && timeSeriesRows.length > 0) {
      totalLeads = timeSeriesRows.reduce((s, r) => s + Number(r.cnt ?? 0), 0);
    }

    // ── 7. Deals over time (completed deals): по дням; диапазон через datetime ─
    const dealsTimeSeriesRaw = await runReadOnlyQuery(
      `SELECT DATE_FORMAT(COALESCE(deal_date, deal_date_start), '%Y-%m-%d') AS dt, COUNT(*) AS cnt
       FROM estate_deals
       WHERE deal_status = 150
       AND (
         (deal_date IS NOT NULL AND deal_date >= ? AND deal_date <= ?)
         OR (deal_date IS NULL AND deal_date_start IS NOT NULL AND deal_date_start >= ? AND deal_date_start <= ?)
       )
       GROUP BY DATE(COALESCE(deal_date, deal_date_start)) ORDER BY dt`,
      [startDt, endDt, startDt, endDt]
    ).catch(() => []);
    const dealsTimeSeriesRows = Array.isArray(dealsTimeSeriesRaw)
      ? dealsTimeSeriesRaw.map((r: Record<string, unknown>) => normTimeRow(r as Record<string, unknown>))
      : [];

    // ── 8. Reservations (брони) over time: по дням; диапазон через datetime ─
    const reservedTimeSeriesRaw = await runReadOnlyQuery(
      `SELECT DATE_FORMAT(COALESCE(deal_date, deal_date_start, reserve_date_start), '%Y-%m-%d') AS dt, COUNT(*) AS cnt
       FROM estate_deals
       WHERE deal_status = 105
       AND (
         (deal_date IS NOT NULL AND deal_date >= ? AND deal_date <= ?)
         OR (deal_date IS NULL AND deal_date_start IS NOT NULL AND deal_date_start >= ? AND deal_date_start <= ?)
         OR (deal_date IS NULL AND deal_date_start IS NULL AND reserve_date_start IS NOT NULL AND reserve_date_start >= ? AND reserve_date_start <= ?)
       )
       GROUP BY DATE(COALESCE(deal_date, deal_date_start, reserve_date_start)) ORDER BY dt`,
      [startDt, endDt, startDt, endDt, startDt, endDt]
    ).catch(() => []);
    const reservedTimeSeriesRows = Array.isArray(reservedTimeSeriesRaw)
      ? reservedTimeSeriesRaw.map((r: Record<string, unknown>) => normTimeRow(r as Record<string, unknown>))
      : [];

    // ── 9. All deals over time (брони + в работе + проведённые) для вкладки «Сделок за период» ─
    const allDealsTimeSeriesRaw = await runReadOnlyQuery(
      `SELECT DATE_FORMAT(COALESCE(deal_date, deal_date_start, reserve_date_start), '%Y-%m-%d') AS dt, COUNT(*) AS cnt
       FROM estate_deals
       WHERE deal_status IN (105, 110, 150)
       AND (
         (deal_date IS NOT NULL AND deal_date >= ? AND deal_date <= ?)
         OR (deal_date IS NULL AND deal_date_start IS NOT NULL AND deal_date_start >= ? AND deal_date_start <= ?)
         OR (deal_date IS NULL AND deal_date_start IS NULL AND reserve_date_start IS NOT NULL AND reserve_date_start >= ? AND reserve_date_start <= ?)
       )
       GROUP BY DATE(COALESCE(deal_date, deal_date_start, reserve_date_start)) ORDER BY dt`,
      [startDt, endDt, startDt, endDt, startDt, endDt]
    ).catch(() => []);
    const allDealsTimeSeriesRows = Array.isArray(allDealsTimeSeriesRaw)
      ? allDealsTimeSeriesRaw.map((r: Record<string, unknown>) => normTimeRow(r as Record<string, unknown>))
      : [];

    const completedCount = Number(deals.completed ?? 0);
    const revenueSum = Number(deals.revenue ?? 0);
    const avgDealSum = completedCount > 0 ? Math.round(revenueSum / completedCount) : 0;
    const revenuePerLead = totalLeads > 0 ? Math.round(revenueSum / totalLeads) : 0;

    return NextResponse.json({
      period: { start, end },
      summary: {
        totalLeads,
        totalDeals: Number(deals.total ?? 0),
        leadsWithDeal,
        completedDeals: completedCount,
        reservedDeals: Number(deals.reserved ?? 0),
        inWorkDeals: Number(deals.in_work ?? 0),
        revenue: revenueSum,
        conversion: totalLeads > 0 ? Math.round((completedCount / totalLeads) * 1000) / 10 : 0,
        avgDealSum,
        revenuePerLead,
      },
      funnelLeads,
      channels: channelRows,
      houses: houseRows,
      managers: managerRows,
      timeSeries: timeSeriesRows,
      dealsTimeSeries: dealsTimeSeriesRows,
      reservedTimeSeries: reservedTimeSeriesRows,
      allDealsTimeSeries: allDealsTimeSeriesRows,
    }, { headers: SECURITY_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ошибка запроса" },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}
