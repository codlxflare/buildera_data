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

async function run<T>(query: string, params: (string | number)[] = []): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = await runReadOnlyQuery(query, params);
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
  let end = endParam && /^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : now.toISOString().slice(0, 10);
  if (end < start) end = start;

  const period = { start, end };

  // ─── 1. Заявки за период ─────────────────────────────────────────
  const leadsTotal = await run<unknown[]>(
    `SELECT COUNT(*) AS total FROM estate_buys WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?`,
    [start, end]
  );
  const leadsByStatus = await run<unknown[]>(
    `SELECT COALESCE(status, -1) AS status_id, COUNT(*) AS cnt
     FROM estate_buys WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
     GROUP BY status ORDER BY cnt DESC`,
    [start, end]
  );
  const leadsColumnsCheck = await run<unknown[]>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN house_id IS NOT NULL THEN 1 ELSE 0 END) AS with_house_id,
       SUM(CASE WHEN first_house_interest IS NOT NULL THEN 1 ELSE 0 END) AS with_first_house_interest,
       SUM(CASE WHEN estate_sell_id IS NOT NULL THEN 1 ELSE 0 END) AS with_estate_sell_id,
       SUM(CASE WHEN status IS NOT NULL THEN 1 ELSE 0 END) AS with_status
     FROM estate_buys WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?`,
    [start, end]
  );

  // ─── 2. Сделки за период (по deal_date) ───────────────────────────
  const dealsTotal = await run<unknown[]>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN deal_status = 110 THEN 1 ELSE 0 END) AS in_work,
       SUM(CASE WHEN deal_status = 105 THEN 1 ELSE 0 END) AS reserved,
       SUM(CASE WHEN deal_status = 150 THEN 1 ELSE 0 END) AS completed
     FROM estate_deals WHERE deal_date IS NOT NULL AND DATE(deal_date) >= ? AND DATE(deal_date) <= ?`,
    [start, end]
  );
  const dealsByStatus = await run<unknown[]>(
    `SELECT deal_status AS status_id, COUNT(*) AS cnt
     FROM estate_deals WHERE deal_date IS NOT NULL AND DATE(deal_date) >= ? AND DATE(deal_date) <= ?
     GROUP BY deal_status ORDER BY cnt DESC`,
    [start, end]
  );
  const dealsColumnsCheck = await run<unknown[]>(
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN house_id IS NOT NULL THEN 1 ELSE 0 END) AS with_house_id,
       SUM(CASE WHEN estate_sell_id IS NOT NULL THEN 1 ELSE 0 END) AS with_estate_sell_id
     FROM estate_deals WHERE deal_date IS NOT NULL AND DATE(deal_date) >= ? AND DATE(deal_date) <= ?`,
    [start, end]
  );

  // ─── 3. Заявки за период, у которых есть хотя бы одна сделка ─────
  const leadsWithDeal = await run<unknown[]>(
    `SELECT COUNT(DISTINCT eb.id) AS leads_with_deal
     FROM estate_buys eb
     INNER JOIN estate_deals ed ON eb.estate_buy_id = ed.estate_buy_id
     WHERE DATE(eb.created_at) >= ? AND DATE(eb.created_at) <= ?`,
    [start, end]
  );
  const leadsWithDealInPeriod = await run<unknown[]>(
    `SELECT COUNT(DISTINCT eb.id) AS cnt
     FROM estate_buys eb
     INNER JOIN estate_deals ed ON eb.estate_buy_id = ed.estate_buy_id AND DATE(ed.deal_date) >= ? AND DATE(ed.deal_date) <= ?
     WHERE DATE(eb.created_at) >= ? AND DATE(eb.created_at) <= ?`,
    [start, end, start, end]
  );

  // ─── 4. Справочники статусов ─────────────────────────────────────
  const dealStatusNames = await run<unknown[]>(
    `SELECT status_id, status_name FROM estate_deals_statuses ORDER BY status_id LIMIT 20`
  );
  const leadStatusNames = await run<unknown[]>(
    `SELECT status_id, status_name FROM estate_statuses ORDER BY status_id LIMIT 30`
  );

  // ─── 5. Примеры заявок (как хранятся привязки) ────────────────────
  const sampleLeads = await run<unknown[]>(
    `SELECT eb.id, eb.estate_buy_id, DATE(eb.created_at) AS created, eb.house_id, eb.first_house_interest, eb.estate_sell_id,
       (SELECT COUNT(*) FROM estate_deals ed WHERE ed.estate_buy_id = eb.estate_buy_id) AS deals_count
     FROM estate_buys eb
     WHERE DATE(eb.created_at) >= ? AND DATE(eb.created_at) <= ?
     ORDER BY eb.created_at DESC LIMIT 15`,
    [start, end]
  );
  const sampleDeals = await run<unknown[]>(
    `SELECT ed.deal_id, ed.estate_buy_id, DATE(ed.deal_date) AS deal_date, ed.deal_status, ed.house_id, ed.estate_sell_id
     FROM estate_deals ed
     WHERE ed.deal_date IS NOT NULL AND DATE(ed.deal_date) >= ? AND DATE(ed.deal_date) <= ?
     ORDER BY ed.deal_date DESC LIMIT 15`,
    [start, end]
  );

  // ─── 6. Распределение по домам (сырая проверка) ───────────────────
  const houseFromDeals = await run<unknown[]>(
    `SELECT ed.house_id, COUNT(*) AS cnt
     FROM estate_deals ed
     WHERE ed.deal_date IS NOT NULL AND DATE(ed.deal_date) >= ? AND DATE(ed.deal_date) <= ?
     GROUP BY ed.house_id ORDER BY cnt DESC LIMIT 10`,
    [start, end]
  );
  const houseFromLeads = await run<unknown[]>(
    `SELECT COALESCE(eb.house_id, eb.first_house_interest) AS house_id, COUNT(*) AS cnt
     FROM estate_buys eb
     WHERE DATE(eb.created_at) >= ? AND DATE(eb.created_at) <= ? AND (eb.house_id IS NOT NULL OR eb.first_house_interest IS NOT NULL)
     GROUP BY COALESCE(eb.house_id, eb.first_house_interest) ORDER BY cnt DESC LIMIT 10`,
    [start, end]
  );

  // ─── 7. Имена домов (для подстановки в отладку) ───────────────────
  const houseNames = await run<unknown[]>(
    `SELECT house_id, name, public_house_name FROM estate_houses LIMIT 30`
  );

  // ─── 8. Ряды для графиков (как в основном /api/funnel); диапазон через datetime ─
  const startDt = `${start} 00:00:00`;
  const endDt = `${end} 23:59:59`;
  const timeSeriesRows = await run<Record<string, unknown>[]>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS dt, COUNT(*) AS cnt
     FROM estate_buys WHERE created_at >= ? AND created_at <= ?
     GROUP BY DATE(created_at) ORDER BY dt`,
    [startDt, endDt]
  );
  const dealsTimeSeriesRows = await run<Record<string, unknown>[]>(
    `SELECT DATE_FORMAT(COALESCE(deal_date, deal_date_start), '%Y-%m-%d') AS dt, COUNT(*) AS cnt
     FROM estate_deals
     WHERE deal_status = 150
     AND (
       (deal_date IS NOT NULL AND deal_date >= ? AND deal_date <= ?)
       OR (deal_date IS NULL AND deal_date_start IS NOT NULL AND deal_date_start >= ? AND deal_date_start <= ?)
     )
     GROUP BY DATE(COALESCE(deal_date, deal_date_start)) ORDER BY dt`,
    [startDt, endDt, startDt, endDt]
  );
  const reservedTimeSeriesRows = await run<Record<string, unknown>[]>(
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
  );

  function norm(r: Record<string, unknown>): { dt: string; cnt: number } {
    return { dt: String(r?.dt ?? r?.DT ?? ""), cnt: Number(r?.cnt ?? r?.CNT ?? 0) };
  }
  const timeSeries = (timeSeriesRows.ok && Array.isArray(timeSeriesRows.data) ? timeSeriesRows.data : []).map(norm);
  const dealsTimeSeries = (dealsTimeSeriesRows.ok && Array.isArray(dealsTimeSeriesRows.data) ? dealsTimeSeriesRows.data : []).map(norm);
  const reservedTimeSeries = (reservedTimeSeriesRows.ok && Array.isArray(reservedTimeSeriesRows.data) ? reservedTimeSeriesRows.data : []).map(norm);

  const out: Record<string, unknown> = {
    period,
    legend: {
      deal_status: "105=Бронь, 110=Сделка в работе, 150=Проведена, 140=Отменена (estate_deals_statuses)",
      leads_status: "estate_buys.status → estate_statuses (Проверка, Подбор, Бронь и т.д.)",
    },
    leads: {
      total_in_period: leadsTotal.ok ? (leadsTotal.data[0] as Record<string, unknown>)?.total : leadsTotal.error,
      by_status: leadsByStatus.ok ? leadsByStatus.data : leadsByStatus.error,
      columns_filled: leadsColumnsCheck.ok ? leadsColumnsCheck.data[0] : leadsColumnsCheck.error,
    },
    deals: {
      total_in_period: dealsTotal.ok ? (dealsTotal.data[0] as Record<string, unknown>)?.total : dealsTotal.error,
      by_status_raw: dealsByStatus.ok ? dealsByStatus.data : dealsByStatus.error,
      in_work_reserved_completed: dealsTotal.ok ? dealsTotal.data[0] : dealsTotal.error,
      columns_filled: dealsColumnsCheck.ok ? dealsColumnsCheck.data[0] : dealsColumnsCheck.error,
    },
    funnel_metrics: {
      leads_with_any_deal: leadsWithDeal.ok ? (leadsWithDeal.data[0] as Record<string, unknown>)?.leads_with_deal : leadsWithDeal.error,
      leads_with_deal_in_period: leadsWithDealInPeriod.ok ? (leadsWithDealInPeriod.data[0] as Record<string, unknown>)?.cnt : leadsWithDealInPeriod.error,
    },
    deal_status_names: dealStatusNames.ok ? dealStatusNames.data : dealStatusNames.error,
    lead_status_names: leadStatusNames.ok ? leadStatusNames.data : leadStatusNames.error,
    sample_leads: sampleLeads.ok ? sampleLeads.data : sampleLeads.error,
    sample_deals: sampleDeals.ok ? sampleDeals.data : sampleDeals.error,
    house_debug: {
      by_deal_house_id: houseFromDeals.ok ? houseFromDeals.data : houseFromDeals.error,
      by_lead_house_id: houseFromLeads.ok ? houseFromLeads.data : houseFromLeads.error,
      house_names: houseNames.ok ? houseNames.data : houseNames.error,
    },
    timeSeries,
    dealsTimeSeries,
    reservedTimeSeries,
    charts_info: {
      timeSeries_points: timeSeries.length,
      dealsTimeSeries_points: dealsTimeSeries.length,
      reservedTimeSeries_points: reservedTimeSeries.length,
      timeSeries_error: !timeSeriesRows.ok ? timeSeriesRows.error : undefined,
      dealsTimeSeries_error: !dealsTimeSeriesRows.ok ? dealsTimeSeriesRows.error : undefined,
      reservedTimeSeries_error: !reservedTimeSeriesRows.ok ? reservedTimeSeriesRows.error : undefined,
    },
  };

  return NextResponse.json(out, { headers: SECURITY_HEADERS });
}
