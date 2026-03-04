import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, verifySessionToken, isAuthConfigured } from "@/app/lib/auth";
import { isDbConfigured, runReadOnlyQuery } from "@/app/lib/db";

export async function GET(req: NextRequest) {
  if (isAuthConfigured()) {
    try {
      const token = getSessionFromCookie(req.headers.get("cookie"));
      if (!token || !verifySessionToken(token)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const results: Record<string, unknown> = {};

  // Check deals count by status
  try {
    const r = await runReadOnlyQuery(
      `SELECT deal_status, COUNT(*) AS cnt FROM estate_deals GROUP BY deal_status ORDER BY cnt DESC LIMIT 10`
    );
    results.deals_by_status_all = r;
  } catch (e) { results.deals_by_status_all_err = String(e); }

  // Check deals count total
  try {
    const r = await runReadOnlyQuery(`SELECT COUNT(*) AS total FROM estate_deals`);
    results.deals_total = (r[0] as Record<string, unknown>)?.total;
  } catch (e) { results.deals_total_err = String(e); }

  // Check leads count
  try {
    const r = await runReadOnlyQuery(`SELECT COUNT(*) AS total FROM estate_buys LIMIT 1`);
    results.leads_total = (r[0] as Record<string, unknown>)?.total;
  } catch (e) { results.leads_total_err = String(e); }

  // Check estate_sell_status values
  try {
    const r = await runReadOnlyQuery(
      `SELECT estate_sell_status, COUNT(*) AS cnt FROM estate_sells GROUP BY estate_sell_status ORDER BY cnt DESC LIMIT 10`
    );
    results.sell_statuses = r;
  } catch (e) { results.sell_statuses_err = String(e); }

  // Check deal_sum field exists
  try {
    const r = await runReadOnlyQuery(`SELECT deal_sum FROM estate_deals LIMIT 1`);
    results.deal_sum_exists = true;
    results.deal_sum_sample = (r[0] as Record<string, unknown>)?.deal_sum;
  } catch (e) { results.deal_sum_err = String(e); }

  // Check finances table
  try {
    const r = await runReadOnlyQuery(`SELECT COUNT(*) AS total FROM finances WHERE deal_id IS NOT NULL`);
    results.finances_with_deal = (r[0] as Record<string, unknown>)?.total;
  } catch (e) { results.finances_err = String(e); }

  // Recent deals (last 6 months)
  try {
    const r = await runReadOnlyQuery(
      `SELECT DATE_FORMAT(deal_date,'%Y-%m') AS month, deal_status, COUNT(*) AS cnt FROM estate_deals WHERE deal_date >= DATE_SUB(NOW(), INTERVAL 6 MONTH) GROUP BY month, deal_status ORDER BY month DESC, cnt DESC LIMIT 20`
    );
    results.recent_deals_months = r;
  } catch (e) { results.recent_deals_err = String(e); }

  // --- Failing widget diagnostics ---

  // deals_amount_by_month
  try {
    const r = await runReadOnlyQuery(
      `SELECT DATE_FORMAT(deal_date,'%Y-%m') AS month, COUNT(*) AS cnt, COALESCE(SUM(deal_sum),0) AS amount FROM estate_deals WHERE deal_status=150 AND deal_date IS NOT NULL AND deal_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH) GROUP BY DATE_FORMAT(deal_date,'%Y-%m') ORDER BY month LIMIT 24`
    );
    results.deals_amount_by_month = r;
  } catch (e) { results.deals_amount_by_month_err = String(e); }

  // conversion_by_channel (no join, uses deal_id on estate_buys)
  try {
    const r = await runReadOnlyQuery(
      `SELECT COALESCE(channel_name,'Без канала') AS channel, COUNT(*) AS leads, SUM(CASE WHEN deal_id IS NOT NULL THEN 1 ELSE 0 END) AS deals FROM estate_buys WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) GROUP BY channel_name HAVING COUNT(*) > 0 ORDER BY leads DESC LIMIT 12`
    );
    results.conversion_by_channel = r;
  } catch (e) { results.conversion_by_channel_err = String(e); }

  // managers_performance — using deal_manager_id + users_name (TABLES_REFERENCE confirmed)
  try {
    const r = await runReadOnlyQuery(
      `SELECT COALESCE(u.users_name,'Без менеджера') AS manager, COUNT(ed.deal_id) AS deals_count, COALESCE(SUM(ed.deal_sum),0) AS deals_amount FROM estate_deals ed LEFT JOIN users u ON ed.deal_manager_id = u.id WHERE ed.deal_date IS NOT NULL AND ed.deal_date >= DATE_SUB(NOW(), INTERVAL 1 MONTH) GROUP BY u.id, u.users_name ORDER BY deals_count DESC LIMIT 10`
    );
    results.managers_deal_manager_id = r;
  } catch (e) { results.managers_deal_manager_id_err = String(e); }

  // Check users table structure (count only — no real names exposed)
  try {
    const r = await runReadOnlyQuery(`SELECT COUNT(*) AS total FROM users`);
    results.users_count = (r[0] as Record<string, unknown>)?.total;
  } catch (e) { results.users_count_err = String(e); }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
