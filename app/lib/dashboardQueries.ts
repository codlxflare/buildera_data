/**
 * Предопределённые запросы для виджетов дашборда MacroData.
 * period = 'YYYY-MM' (один месяц).
 */

import { runReadOnlyQuery } from "./db";

export type WidgetKey =
  | "summary"
  | "deals_by_month"
  | "deals_amount_by_month"
  | "avg_check_by_month"
  | "leads_by_channel"
  | "debt_by_house"
  | "conversion_by_channel"
  | "deals_by_status"
  | "managers_performance"
  | "plan_vs_fact"
  | "payment_incoming"
  | "leads_funnel";

const WIDGET_KEYS: WidgetKey[] = [
  "summary",
  "deals_by_month",
  "deals_amount_by_month",
  "avg_check_by_month",
  "leads_by_channel",
  "debt_by_house",
  "conversion_by_channel",
  "deals_by_status",
  "managers_performance",
  "plan_vs_fact",
  "payment_incoming",
  "leads_funnel",
];

export function getAvailableWidgetKeys(): WidgetKey[] {
  return [...WIDGET_KEYS];
}

/** Возвращает [startDate, endDate] для месяца YYYY-MM (endDate — последний день месяца). */
function monthRange(period: string): [string, string] {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    const now = new Date();
    const py = now.getFullYear();
    const pm = String(now.getMonth() + 1).padStart(2, "0");
    return [`${py}-${pm}-01`, new Date(py, now.getMonth() + 1, 0).toISOString().slice(0, 10)];
  }
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);
  return [start, end];
}

export async function runDashboardWidget(
  key: WidgetKey,
  period: string
): Promise<Record<string, unknown>[]> {
  const [start, end] = monthRange(period);

  switch (key) {
    case "summary": {
      // Run each metric independently so one failure doesn't zero out everything
      const result: Record<string, number> = {
        total_deals: 0, total_deal_amount: 0, total_leads: 0,
        leads_with_deal: 0, total_debt: 0, overdue_debt: 0, active_properties: 0,
      };

      // 1. Deals count (all statuses — to match original behaviour)
      try {
        const r = await runReadOnlyQuery(
          `SELECT COUNT(*) AS v FROM estate_deals WHERE deal_date IS NOT NULL AND deal_date >= ? AND deal_date < DATE_ADD(?, INTERVAL 1 MONTH)`,
          [start, start]
        );
        result.total_deals = Number((r[0] as Record<string, unknown>)?.v ?? 0);
      } catch {}

      // 2. Deal amount for completed deals
      try {
        const r = await runReadOnlyQuery(
          `SELECT COALESCE(SUM(deal_sum), 0) AS v FROM estate_deals WHERE deal_status = 150 AND deal_date IS NOT NULL AND deal_date >= ? AND deal_date < DATE_ADD(?, INTERVAL 1 MONTH)`,
          [start, start]
        );
        result.total_deal_amount = Number((r[0] as Record<string, unknown>)?.v ?? 0);
      } catch {}

      // 3. Leads count
      try {
        const r = await runReadOnlyQuery(
          `SELECT COUNT(*) AS v FROM estate_buys WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH)`,
          [start, start]
        );
        result.total_leads = Number((r[0] as Record<string, unknown>)?.v ?? 0);
      } catch {}

      // 4. Leads with deal
      try {
        const r = await runReadOnlyQuery(
          `SELECT COUNT(*) AS v FROM estate_buys WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH) AND deal_id IS NOT NULL`,
          [start, start]
        );
        result.leads_with_deal = Number((r[0] as Record<string, unknown>)?.v ?? 0);
      } catch {}

      // 5. Payment schedule total for period
      try {
        const r = await runReadOnlyQuery(
          `SELECT COALESCE(SUM(summa), 0) AS v FROM finances WHERE DATE(date_to) >= ? AND DATE(date_to) <= ? AND deal_id IS NOT NULL`,
          [start, end]
        );
        result.total_debt = Number((r[0] as Record<string, unknown>)?.v ?? 0);
      } catch {}

      // 6. Overdue payments (past 3 months max to avoid full scan)
      try {
        const overdueCutoff = new Date(start);
        overdueCutoff.setMonth(overdueCutoff.getMonth() - 3);
        const overdueFrom = overdueCutoff.toISOString().slice(0, 10);
        const r = await runReadOnlyQuery(
          `SELECT COALESCE(SUM(summa), 0) AS v FROM finances WHERE DATE(date_to) >= ? AND DATE(date_to) < ? AND deal_id IS NOT NULL`,
          [overdueFrom, start]
        );
        result.overdue_debt = Number((r[0] as Record<string, unknown>)?.v ?? 0);
      } catch {}

      // 7. Active properties: status 20 = в продаже (per TABLES_REFERENCE)
      try {
        const r = await runReadOnlyQuery(
          `SELECT COUNT(*) AS v FROM estate_sells WHERE estate_sell_status = 20`,
          []
        );
        result.active_properties = Number((r[0] as Record<string, unknown>)?.v ?? 0);
      } catch {}

      return [result];
    }

    case "deals_by_month": {
      const sql = `
        SELECT DATE_FORMAT(deal_date, '%Y-%m') AS month, COUNT(*) AS cnt
        FROM estate_deals
        WHERE deal_status = 150 AND deal_date IS NOT NULL
          AND deal_date >= DATE_SUB(?, INTERVAL 12 MONTH)
          AND deal_date < DATE_ADD(?, INTERVAL 1 MONTH)
        GROUP BY DATE_FORMAT(deal_date, '%Y-%m')
        ORDER BY month
        LIMIT 24
      `;
      return runReadOnlyQuery(sql, [start, start]);
    }

    case "deals_amount_by_month": {
      const sql = `
        SELECT
          DATE_FORMAT(deal_date, '%Y-%m') AS month,
          COUNT(*) AS cnt,
          COALESCE(SUM(deal_sum), 0) AS amount
        FROM estate_deals
        WHERE deal_status = 150 AND deal_date IS NOT NULL
          AND deal_date >= DATE_SUB(?, INTERVAL 12 MONTH)
          AND deal_date < DATE_ADD(?, INTERVAL 1 MONTH)
        GROUP BY DATE_FORMAT(deal_date, '%Y-%m')
        ORDER BY month
        LIMIT 24
      `;
      return runReadOnlyQuery(sql, [start, start]);
    }

    case "avg_check_by_month": {
      const sql = `
        SELECT
          DATE_FORMAT(deal_date, '%Y-%m') AS month,
          COUNT(*) AS cnt,
          COALESCE(AVG(deal_sum), 0) AS avg_amount
        FROM estate_deals
        WHERE deal_status = 150 AND deal_date IS NOT NULL
          AND deal_date >= DATE_SUB(?, INTERVAL 12 MONTH)
          AND deal_date < DATE_ADD(?, INTERVAL 1 MONTH)
        GROUP BY DATE_FORMAT(deal_date, '%Y-%m')
        ORDER BY month
        LIMIT 24
      `;
      return runReadOnlyQuery(sql, [start, start]);
    }

    case "leads_by_channel": {
      const sql = `
        SELECT COALESCE(channel_name, 'Без канала') AS channel, COUNT(*) AS cnt
        FROM estate_buys
        WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH)
        GROUP BY channel_name
        ORDER BY cnt DESC
        LIMIT 15
      `;
      return runReadOnlyQuery(sql, [start, start]);
    }

    case "debt_by_house": {
      const sql = `
        SELECT COALESCE(h.name, h.public_house_name, 'Без дома') AS house_name,
               COALESCE(SUM(f.summa), 0) AS total
        FROM finances f
        LEFT JOIN estate_sells s ON f.estate_sell_id = s.estate_sell_id
        LEFT JOIN estate_houses h ON s.house_id = h.house_id
        WHERE DATE(f.date_to) >= ? AND DATE(f.date_to) <= ? AND f.deal_id IS NOT NULL
        GROUP BY h.house_id, h.name, h.public_house_name
        ORDER BY total DESC
        LIMIT 15
      `;
      return runReadOnlyQuery(sql, [start, end]);
    }

    case "conversion_by_channel": {
      // No JOIN needed: estate_buys.deal_id IS NOT NULL means lead converted to deal
      const sql = `
        SELECT
          COALESCE(channel_name, 'Без канала') AS channel,
          COUNT(*) AS leads,
          SUM(CASE WHEN deal_id IS NOT NULL THEN 1 ELSE 0 END) AS deals
        FROM estate_buys
        WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH)
        GROUP BY channel_name
        HAVING COUNT(*) > 0
        ORDER BY leads DESC
        LIMIT 12
      `;
      const rows = await runReadOnlyQuery(sql, [start, start]);
      return rows.map((r) => {
        const leads = Number(r.leads ?? 0);
        const deals = Number(r.deals ?? 0);
        return {
          channel: r.channel ?? "Без канала",
          leads,
          deals,
          conversion: leads > 0 ? Math.round((deals / leads) * 1000) / 10 : 0,
        };
      });
    }

    case "deals_by_status": {
      const monthSql = `
        SELECT deal_status AS status_id, COUNT(*) AS cnt
        FROM estate_deals
        WHERE deal_date IS NOT NULL AND deal_date >= ? AND deal_date < DATE_ADD(?, INTERVAL 1 MONTH)
        GROUP BY deal_status
        ORDER BY cnt DESC
        LIMIT 10
      `;
      let rows = await runReadOnlyQuery(monthSql, [start, start]);
      // If month has only one status, broaden to 6 months for more analytical value
      if (rows.length <= 1) {
        const halfYearSql = `
          SELECT deal_status AS status_id, COUNT(*) AS cnt
          FROM estate_deals
          WHERE deal_date IS NOT NULL
            AND deal_date >= DATE_SUB(?, INTERVAL 6 MONTH)
            AND deal_date < DATE_ADD(?, INTERVAL 1 MONTH)
          GROUP BY deal_status
          ORDER BY cnt DESC
          LIMIT 10
        `;
        rows = await runReadOnlyQuery(halfYearSql, [start, start]);
      }
      const STATUS_NAMES: Record<number, string> = { 150: "Завершено", 140: "Отменено", 100: "В работе", 110: "Бронь", 120: "Договор", 130: "Регистрация" };
      return rows.map((r) => ({
        status_name: STATUS_NAMES[Number(r.status_id)] ?? `Статус ${r.status_id}`,
        cnt: r.cnt,
      }));
    }

    case "managers_performance": {
      // deal_manager_id → users.id (TABLES_REFERENCE); users name field = users_name
      const sql = `
        SELECT
          COALESCE(u.users_name, 'Без менеджера') AS manager,
          COUNT(ed.deal_id) AS deals_count,
          COALESCE(SUM(ed.deal_sum), 0) AS deals_amount
        FROM estate_deals ed
        LEFT JOIN users u ON ed.deal_manager_id = u.id
        WHERE ed.deal_date IS NOT NULL
          AND ed.deal_date >= ? AND ed.deal_date < DATE_ADD(?, INTERVAL 1 MONTH)
        GROUP BY u.id, u.users_name
        ORDER BY deals_count DESC
        LIMIT 10
      `;
      return runReadOnlyQuery(sql, [start, start]);
    }

    case "plan_vs_fact": {
      // Separate queries to avoid complex UNION issues; merge in JS
      const [planRows, factRows] = await Promise.all([
        runReadOnlyQuery(
          `SELECT DATE_FORMAT(plan_date, '%Y-%m') AS month,
                  COALESCE(SUM(spm.sum), 0) AS plan_amount,
                  COALESCE(SUM(spm.quantity), 0) AS plan_count
           FROM estate_sales_plans_metrics spm
           WHERE plan_date >= DATE_SUB(?, INTERVAL 6 MONTH) AND plan_date <= ?
           GROUP BY DATE_FORMAT(plan_date, '%Y-%m')
           ORDER BY month LIMIT 12`,
          [start, end]
        ).catch(() => [] as Record<string, unknown>[]),
        runReadOnlyQuery(
          `SELECT DATE_FORMAT(deal_date, '%Y-%m') AS month,
                  COALESCE(SUM(deal_sum), 0) AS fact_amount,
                  COUNT(*) AS fact_count
           FROM estate_deals
           WHERE deal_status = 150 AND deal_date IS NOT NULL
             AND deal_date >= DATE_SUB(?, INTERVAL 6 MONTH) AND deal_date <= ?
           GROUP BY DATE_FORMAT(deal_date, '%Y-%m')
           ORDER BY month LIMIT 12`,
          [start, end]
        ).catch(() => [] as Record<string, unknown>[]),
      ]);

      // Merge by month key
      const merged: Record<string, { month: string; plan_amount: number; plan_count: number; fact_amount: number; fact_count: number }> = {};
      for (const r of planRows) {
        const m = String(r.month ?? "");
        if (!merged[m]) merged[m] = { month: m, plan_amount: 0, plan_count: 0, fact_amount: 0, fact_count: 0 };
        merged[m].plan_amount = Number(r.plan_amount ?? 0);
        merged[m].plan_count = Number(r.plan_count ?? 0);
      }
      for (const r of factRows) {
        const m = String(r.month ?? "");
        if (!merged[m]) merged[m] = { month: m, plan_amount: 0, plan_count: 0, fact_amount: 0, fact_count: 0 };
        merged[m].fact_amount = Number(r.fact_amount ?? 0);
        merged[m].fact_count = Number(r.fact_count ?? 0);
      }
      return Object.values(merged).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
    }

    case "payment_incoming": {
      const sql = `
        SELECT
          CASE
            WHEN COALESCE(status_name, '') = 'Проведено' THEN 'Проведено'
            WHEN COALESCE(status_name, '') = 'Отклонено' THEN 'Отклонено'
            WHEN date_to < NOW() THEN 'Просрочено'
            ELSE 'К оплате'
          END AS payment_status,
          COUNT(*) AS cnt,
          COALESCE(SUM(summa), 0) AS total
        FROM finances
        WHERE deal_id IS NOT NULL
          AND date_to >= ? AND date_to < DATE_ADD(?, INTERVAL 1 DAY)
        GROUP BY payment_status
        ORDER BY total DESC
      `;
      const rows = await runReadOnlyQuery(sql, [start, end]);
      return rows.map((r) => ({
        payment_status: String(r.payment_status ?? "К оплате"),
        cnt: Number(r.cnt ?? 0),
        total: Number(r.total ?? 0),
      }));
    }

    case "leads_funnel": {
      // estate_meetings PK = meetings_id (TABLES_REFERENCE.md line 884)
      const sql = `
        SELECT 'Заявки' AS stage, COUNT(*) AS cnt, 1 AS ord
        FROM estate_buys
        WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH)
        UNION ALL
        SELECT 'Встречи' AS stage, COUNT(DISTINCT em.meetings_id) AS cnt, 2 AS ord
        FROM estate_meetings em
        WHERE em.meeting_date >= ? AND em.meeting_date < DATE_ADD(?, INTERVAL 1 MONTH)
        UNION ALL
        SELECT 'Сделки' AS stage, COUNT(*) AS cnt, 3 AS ord
        FROM estate_deals
        WHERE deal_date IS NOT NULL
          AND deal_date >= ? AND deal_date < DATE_ADD(?, INTERVAL 1 MONTH)
        ORDER BY ord
      `;
      const rows = await runReadOnlyQuery(sql, [start, start, start, start, start, start]);
      return rows.map((r) => ({ stage: r.stage, cnt: Number(r.cnt ?? 0) }));
    }

    default:
      return [];
  }
}

export async function runDashboardWidgets(
  keys: WidgetKey[],
  period: string
): Promise<Record<WidgetKey, Record<string, unknown>[]>> {
  const result = {} as Record<WidgetKey, Record<string, unknown>[]>;
  const unique = Array.from(new Set(keys)).filter((k) => WIDGET_KEYS.includes(k));
  for (const key of unique) {
    try {
      const rows = await runDashboardWidget(key, period);
      (result as Record<string, Record<string, unknown>[]>)[key] = rows;
      if (rows.length === 0) {
        console.warn(`[Dashboard] Widget "${key}" returned 0 rows for period=${period}`);
      }
    } catch (err) {
      console.error(`[Dashboard] Widget "${key}" FAILED for period=${period}:`, err instanceof Error ? err.message : err);
      (result as Record<string, Record<string, unknown>[]>)[key] = [];
    }
  }
  return result;
}
