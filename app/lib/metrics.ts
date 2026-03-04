/**
 * Все запросы данных идут в БД. Только безопасные агрегаты (COUNT, SUM) по таблицам api.txt.
 * Результат подставляется как [Данные из БД: ...]. Ответ — только структура и цифры, без описания запроса.
 */

import type { RowDataPacket } from "mysql2/promise";
import { isDbConfigured, runReadOnlyQuery } from "./db";

/** Ключевые слова запроса данных: если есть в сообщении — считаем запросом к данным. */
const DATA_REQUEST_KEYWORDS = [
  "сколько", "сумм", "количеств", "данные", "данных", "покажи", "выведи", "отчёт", "отчет",
  "сделк", "заявк", "брон", "резерв", "за период", "по отдел", "по дом", "месяц", "квартал", "год",
  "метрик", "показател", "итог", "сводк", "статистик", "число", "цифр",
];

const METRICS: Array<{
  triggers: string[];
  sql: string;
  params?: (string | number)[];
  format: (rows: RowDataPacket[]) => { label: string; data: Record<string, string | number> } | null;
}> = [
  // Завершённые сделки за последний месяц — количество
  {
    triggers: ["сделк", "завершен", "проведен", "последн", "месяц"],
    sql: `SELECT COUNT(*) AS count FROM estate_deals WHERE deal_status = 150 AND deal_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND deal_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    format: (rows) => {
      const r = rows[0];
      if (!r || typeof r?.count !== "number") return null;
      return { label: "Завершённые сделки, последний месяц", data: { "Количество, шт.": r.count } };
    },
  },
  // Завершённые сделки за последний месяц — сумма
  {
    triggers: ["сделк", "сумм", "последн", "месяц"],
    sql: `SELECT COALESCE(SUM(deal_sum), 0) AS total FROM estate_deals WHERE deal_status = 150 AND deal_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND deal_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    format: (rows) => {
      const r = rows[0];
      if (!r) return null;
      return { label: "Сумма завершённых сделок, последний месяц", data: { "Сумма, руб.": Number(r?.total ?? 0) } };
    },
  },
  // Завершённые сделки за текущий месяц
  {
    triggers: ["сделк", "текущ", "месяц", "этот месяц"],
    sql: `SELECT COUNT(*) AS count, COALESCE(SUM(deal_sum), 0) AS total FROM estate_deals WHERE deal_status = 150 AND deal_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND deal_date <= CURDATE()`,
    format: (rows) => {
      const r = rows[0];
      if (!r) return null;
      return {
        label: "Завершённые сделки, текущий месяц",
        data: { "Количество, шт.": Number(r?.count ?? 0), "Сумма, руб.": Number(r?.total ?? 0) },
      };
    },
  },
  // Сделки по отделам (последний месяц)
  {
    triggers: ["сделк", "по отдел", "отдел"],
    sql: `SELECT d.department_name, COUNT(e.deal_id) AS count, COALESCE(SUM(e.deal_sum), 0) AS total FROM estate_deals e LEFT JOIN company_departments d ON e.departments_id = d.departments_id WHERE e.deal_status = 150 AND e.deal_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND e.deal_date < DATE_FORMAT(CURDATE(), '%Y-%m-01') GROUP BY e.departments_id, d.department_name`,
    format: (rows) => {
      if (!rows.length) return null;
      const data: Record<string, string | number> = {};
      rows.forEach((r, i) => {
        const name = (r.department_name as string) || `Отдел ${i + 1}`;
        data[`${name}, шт.`] = Number(r?.count ?? 0);
        data[`${name}, руб.`] = Number(r?.total ?? 0);
      });
      return { label: "Завершённые сделки по отделам, последний месяц", data };
    },
  },
  // Заявки за последний месяц
  {
    triggers: ["заявк", "последн", "месяц"],
    sql: `SELECT COUNT(*) AS count FROM estate_buys WHERE created_at >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND created_at < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    format: (rows) => {
      const r = rows[0];
      if (!r || typeof r?.count !== "number") return null;
      return { label: "Заявки, последний месяц", data: { "Количество, шт.": r.count } };
    },
  },
  // Заявки за текущий месяц
  {
    triggers: ["заявк", "текущ", "месяц"],
    sql: `SELECT COUNT(*) AS count FROM estate_buys WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND created_at <= NOW()`,
    format: (rows) => {
      const r = rows[0];
      if (!r || typeof r?.count !== "number") return null;
      return { label: "Заявки, текущий месяц", data: { "Количество, шт.": r.count } };
    },
  },
  // Брони (deal_status = 105) за последний месяц
  {
    triggers: ["брон", "резерв", "бронь"],
    sql: `SELECT COUNT(*) AS count FROM estate_deals WHERE deal_status = 105 AND reserve_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND reserve_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    format: (rows) => {
      const r = rows[0];
      if (!r || typeof r?.count !== "number") return null;
      return { label: "Брони, последний месяц", data: { "Количество, шт.": r.count } };
    },
  },
  // Сделки в работе (110) на текущий момент
  {
    triggers: ["сделк", "в работе", "работе"],
    sql: `SELECT COUNT(*) AS count FROM estate_deals WHERE deal_status = 110`,
    format: (rows) => {
      const r = rows[0];
      if (!r || typeof r?.count !== "number") return null;
      return { label: "Сделки в работе", data: { "Количество, шт.": r.count } };
    },
  },
  // Общее количество завершённых сделок за год
  {
    triggers: ["сделк", "год", "за год"],
    sql: `SELECT COUNT(*) AS count, COALESCE(SUM(deal_sum), 0) AS total FROM estate_deals WHERE deal_status = 150 AND deal_date >= DATE_FORMAT(CURDATE(), '%Y-01-01')`,
    format: (rows) => {
      const r = rows[0];
      if (!r) return null;
      return {
        label: "Завершённые сделки с начала года",
        data: { "Количество, шт.": Number(r?.count ?? 0), "Сумма, руб.": Number(r?.total ?? 0) },
      };
    },
  },
  // Квартал
  {
    triggers: ["сделк", "квартал", "последн"],
    sql: `SELECT COUNT(*) AS count, COALESCE(SUM(deal_sum), 0) AS total FROM estate_deals WHERE deal_status = 150 AND deal_date >= DATE_SUB(CURDATE(), INTERVAL 1 QUARTER) AND deal_date < CURDATE()`,
    format: (rows) => {
      const r = rows[0];
      if (!r) return null;
      return {
        label: "Завершённые сделки, последний квартал",
        data: { "Количество, шт.": Number(r?.count ?? 0), "Сумма, руб.": Number(r?.total ?? 0) },
      };
    },
  },
  // Общий запрос «сколько сделок» без периода — последний месяц по умолчанию
  {
    triggers: ["сколько", "сделк"],
    sql: `SELECT COUNT(*) AS count, COALESCE(SUM(deal_sum), 0) AS total FROM estate_deals WHERE deal_status = 150 AND deal_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND deal_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    format: (rows) => {
      const r = rows[0];
      if (!r) return null;
      return {
        label: "Завершённые сделки, последний месяц",
        data: { "Количество, шт.": Number(r?.count ?? 0), "Сумма, руб.": Number(r?.total ?? 0) },
      };
    },
  },
  // «Покажи данные по сделкам» / «данные по сделкам»
  {
    triggers: ["покажи", "сделк"],
    sql: `SELECT COUNT(*) AS count, COALESCE(SUM(deal_sum), 0) AS total FROM estate_deals WHERE deal_status = 150 AND deal_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND deal_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    format: (rows) => {
      const r = rows[0];
      if (!r) return null;
      return {
        label: "Завершённые сделки, последний месяц",
        data: { "Количество, шт.": Number(r?.count ?? 0), "Сумма, руб.": Number(r?.total ?? 0) },
      };
    },
  },
  {
    triggers: ["данные", "сделк"],
    sql: `SELECT COUNT(*) AS count, COALESCE(SUM(deal_sum), 0) AS total FROM estate_deals WHERE deal_status = 150 AND deal_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND deal_date < DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    format: (rows) => {
      const r = rows[0];
      if (!r) return null;
      return {
        label: "Завершённые сделки, последний месяц",
        data: { "Количество, шт.": Number(r?.count ?? 0), "Сумма, руб.": Number(r?.total ?? 0) },
      };
    },
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isDataRequest(userMessage: string): boolean {
  const n = normalize(userMessage);
  return DATA_REQUEST_KEYWORDS.some((k) => n.includes(k));
}

export interface MetricsResult {
  dataContext: string | null;
  isDataRequest: boolean;
}

/**
 * Все запросы с признаком «данные» выполняются в БД. Возвращает контекст для вставки в сообщение
 * и флаг «это был запрос данных» (для нераспознанных — показать уточнение и примеры вопросов).
 */
export async function getMetricsForMessage(userMessage: string): Promise<MetricsResult> {
  const normalized = normalize(userMessage);
  const isData = isDataRequest(userMessage);

  if (!isDbConfigured()) {
    return { dataContext: null, isDataRequest: isData };
  }

  for (const m of METRICS) {
    const matched = m.triggers.filter((t) => normalized.includes(t)).length;
    if (matched < 2) continue;
    try {
      const rows = await runReadOnlyQuery<RowDataPacket>(m.sql, m.params ?? []);
      const result = m.format(rows);
      if (!result) continue;
      const parts = [result.label, ...Object.entries(result.data).map(([k, v]) => `${k}: ${v}`)];
      return { dataContext: `[Данные из БД: ${parts.join("; ")}]`, isDataRequest: true };
    } catch {
      continue;
    }
  }

  return { dataContext: null, isDataRequest: isData };
}
