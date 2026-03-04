/**
 * Выгрузка примеров данных из БД (только чтение) для подсказок ИИ.
 * Не изменяет БД. Результат кэшируется и опционально сохраняется в api_samples.txt.
 */

import path from "path";
import fs from "fs";
import type { RowDataPacket } from "mysql2/promise";
import { isDbConfigured, runReadOnlyQuery } from "./db";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 час
const SAMPLES_FILE = "api_samples.txt";

let cache: { text: string; ts: number } | null = null;

interface SampleQuery {
  name: string;
  sql: string;
  format: (rows: RowDataPacket[]) => string;
}

const SAMPLE_QUERIES: SampleQuery[] = [
  {
    name: "finances.status_name (статусы платежей)",
    sql: "SELECT DISTINCT status_name FROM finances WHERE status_name IS NOT NULL AND TRIM(status_name) != '' ORDER BY status_name LIMIT 30",
    format: (rows) => rows.map((r) => String(r.status_name ?? "")).join(", ") || "—",
  },
  {
    name: "finances: пример date_to, summa, deal_id, status_name",
    sql: "SELECT DATE(date_to) AS date_to, summa, deal_id, estate_sell_id, status_name FROM finances WHERE deal_id IS NOT NULL LIMIT 2",
    format: (rows) =>
      rows.length
        ? rows
            .map(
              (r) =>
                `date_to=${r.date_to ?? "NULL"} summa=${r.summa ?? "NULL"} deal_id=${r.deal_id ?? "NULL"} status=${r.status_name ?? "NULL"}`
            )
            .join("; ")
        : "—",
  },
  {
    name: "estate_buys.channel_name (источники заявок)",
    sql: "SELECT DISTINCT channel_name FROM estate_buys WHERE channel_name IS NOT NULL AND TRIM(channel_name) != '' ORDER BY channel_name LIMIT 25",
    format: (rows) => rows.map((r) => String(r.channel_name ?? "")).join(", ") || "—",
  },
  {
    name: "estate_deals.deal_status, deal_date",
    sql: "SELECT DISTINCT deal_status FROM estate_deals LIMIT 20",
    format: (rows) => rows.map((r) => String(r.deal_status ?? "")).join(", ") || "—",
  },
  {
    name: "estate_deals: пример deal_date",
    sql: "SELECT deal_date, deal_status FROM estate_deals WHERE deal_date IS NOT NULL LIMIT 2",
    format: (rows) =>
      rows.length
        ? rows.map((r) => `deal_date=${r.deal_date} deal_status=${r.deal_status}`).join("; ")
        : "—",
  },
  {
    name: "estate_buys: пример created_at",
    sql: "SELECT created_at FROM estate_buys WHERE created_at IS NOT NULL LIMIT 1",
    format: (rows) => (rows[0]?.created_at != null ? String(rows[0].created_at) : "—"),
  },
  {
    name: "contacts: наличие contacts_buy_name, contacts_buy_phones",
    sql: "SELECT 1 FROM contacts WHERE (contacts_buy_name IS NOT NULL AND TRIM(contacts_buy_name) != '') OR (contacts_buy_phones IS NOT NULL AND TRIM(contacts_buy_phones) != '') LIMIT 1",
    format: (rows) => (rows.length > 0 ? "есть записи с именами/телефонами" : "—"),
  },
  {
    name: "estate_houses.name / public_house_name",
    sql: "SELECT name, public_house_name FROM estate_houses LIMIT 2",
    format: (rows) =>
      rows.length
        ? rows.map((r) => `name=${String(r.name ?? "").slice(0, 40)}`).join("; ")
        : "—",
  },
  {
    name: "estate_sells.plans_name, geo_flatnum",
    sql: "SELECT plans_name, geo_flatnum FROM estate_sells WHERE estate_sell_id IS NOT NULL LIMIT 2",
    format: (rows) =>
      rows.length
        ? rows.map((r) => `plans_name=${String(r.plans_name ?? "").slice(0, 30)} geo_flatnum=${r.geo_flatnum ?? ""}`).join("; ")
        : "—",
  },
];

async function fetchSamplesFromDb(): Promise<string> {
  const lines: string[] = [
    "ПРИМЕРЫ ДАННЫХ ИЗ БД (только чтение, для ориентира ИИ; не менять БД):",
    "По этим примерам видно, какие значения встречаются в полях и в каком формате.",
    "",
  ];
  for (const q of SAMPLE_QUERIES) {
    try {
      const rows = await runReadOnlyQuery<RowDataPacket>(q.sql, []);
      const formatted = q.format(rows);
      lines.push(`${q.name}: ${formatted}`);
    } catch {
      lines.push(`${q.name}: (запрос не выполнен — таблица/поле может отсутствовать)`);
    }
  }
  return lines.join("\n");
}

/**
 * Возвращает текст с примерами данных из БД.
 * Сначала проверяет кэш, затем файл api_samples.txt (если есть), иначе запрашивает БД и кэширует.
 * @param forceRefresh — если true, игнорировать кэш и файл, выгрузить заново из БД
 */
export async function getSchemaSamplesText(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.ts < CACHE_TTL_MS) return cache.text;

  const filePath = path.join(process.cwd(), SAMPLES_FILE);
  if (!forceRefresh) {
    try {
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (content.length > 0) {
        cache = { text: content, ts: now };
        return content;
      }
    } catch {
      // файла нет или не читается
    }
  }

  if (!isDbConfigured()) return "";

  try {
    const text = await fetchSamplesFromDb();
    cache = { text, ts: now };
    try {
      fs.writeFileSync(filePath, text, "utf-8");
    } catch {
      // не удалось записать файл — используем только кэш
    }
    return text;
  } catch {
    return "";
  }
}

/**
 * Сбрасывает кэш (например после обновления api_samples.txt вручную).
 */
export function clearSchemaSamplesCache(): void {
  cache = null;
}
