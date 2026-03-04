/**
 * Извлечение SQL из ответа ИИ, валидация и выполнение.
 * Защита от SQL-инъекций: только один SELECT, только разрешённые таблицы, запрет опасных конструкций и комментариев.
 */

import { runReadOnlyQuery, isDbConfigured } from "./db";

const SQL_BLOCK_REGEX = /```(?:sql)?\s*([\s\S]*?)```/i;
const MAX_ROWS = 5000;

/** Запрещённые ключевые слова и конструкции (инъекции, изменение данных, опасные функции). */
const FORBIDDEN_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|REPLACE)\b/i,
  /\b(EXEC|EXECUTE|CALL|PROCEDURE|TRIGGER|EVENT)\b/i,
  /\b(INTO\s+OUTFILE|INTO\s+DUMPFILE|LOAD_FILE|LOAD\s+DATA)\b/i,
  /\bUNION\b/i,
  /\b(INFORMATION_SCHEMA|MYSQL\.|PERFORMANCE_SCHEMA|SYS\.)\b/i,
  /\b(BENCHMARK|SLEEP|WAITFOR|PG_SLEEP|GET_LOCK)\s*\(/i,
  /\b(LOCK\s+TABLES|UNLOCK\s+TABLES|GRANT|REVOKE|SET\s+GLOBAL|SET\s+SESSION)\b/i,
  // Block stacked queries via conditional comments (MySQL-specific bypass attempt)
  /\/\*!?\s*(INSERT|UPDATE|DELETE|DROP|UNION)/i,
  // Block hex-encoded attempts or nullbytes
  /0x[0-9a-f]{4,}/i,
];

/** Разрешённые таблицы (из api.txt). */
const ALLOWED_TABLES = new Set([
  "advertising_expenses", "calls", "calls_subjects", "company_departments", "contacts", "contacts_links",
  "estate_advertising_channels", "estate_attributes", "estate_attributes_names", "estate_audience", "estate_audience_estate",
  "estate_buys", "estate_buys_attr", "estate_buys_attributes", "estate_buys_attributes_names", "estate_buys_statuses_log",
  "estate_buys_utm", "estate_buys_utm_history", "estate_deals", "estate_deals_addons", "estate_deals_contacts",
  "estate_deals_discounts", "estate_deals_docs", "estate_deals_participants", "estate_deals_statuses",
  "estate_houses", "estate_houses_price_stat", "estate_meetings", "estate_mortgage", "estate_promos", "estate_restoration",
  "estate_sales_plans", "estate_sales_plans_metrics", "estate_sells", "estate_sells_attr", "estate_sells_price_min_stat",
  "estate_sells_price_stat", "estate_sells_statuses_log", "estate_statuses", "estate_statuses_reasons", "estate_tags",
  "estate_transfer", "estate_transfer_attempts", "finances", "finances_accounts", "finances_subtypes", "finances_types",
  "geo_city_complex", "inventory_demands", "inventory_noms_top", "inventory_warehouse", "inventory_warehouse_stocks",
  "noms", "noms_category", "projects", "projects_tasks", "projects_tasks_agreements", "projects_tasks_checklists",
  "projects_tasks_estimate", "projects_tasks_requests", "promos", "stat", "tags", "tasks", "tasks_tags", "users",
]);

/** Извлекает имена таблиц из SQL (FROM и JOIN). Пропускает подзапросы (скобки). */
function extractTableNames(sql: string): string[] {
  const normalized = sql.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").toLowerCase();
  const tables: string[] = [];
  const fromRe = /\bfrom\s+([\w\s,()]+?)(?=\s+where|\s+group|\s+order|\s+limit|\s+having|$)/gi;
  const joinRe = /\bjoin\s+(\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(normalized)) !== null) {
    const part = m[1].trim();
    if (!part.startsWith("(")) {
      part.split(",").forEach((t) => {
        const name = t.trim().split(/\s+/)[0];
        if (name && name !== "(") tables.push(name);
      });
    }
  }
  while ((m = joinRe.exec(normalized)) !== null) {
    if (m[1]) tables.push(m[1]);
  }
  return [...new Set(tables)];
}

export interface SqlResult {
  ok: true;
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface SqlError {
  ok: false;
  error: string;
}

/**
 * Извлекает первый блок ```sql ... ``` из текста ответа ИИ.
 * Не подставляет пользовательский ввод в запрос — выполняется только строка от модели.
 */
export function extractSqlFromReply(reply: string): string | null {
  const match = reply.match(SQL_BLOCK_REGEX);
  if (!match) return null;
  let sql = match[1].trim().replace(/\s*;\s*$/, "");
  if (!sql.toUpperCase().startsWith("SELECT")) return null;
  if (/\0/.test(sql)) return null;
  return sql;
}

/**
 * Валидирует SQL для защиты от инъекций:
 * - только один SELECT (без ; в середине);
 * - без комментариев (два дефиса и блочные комментарии);
 * - без опасных ключевых слов и функций;
 * - только таблицы из белого списка;
 * - не слишком длинный запрос (защита от DoS).
 */
export function validateSql(sql: string): { valid: true } | { valid: false; error: string } {
  const trimmed = sql.trim();
  if (trimmed.length === 0) return { valid: false, error: "Пустой запрос." };
  if (trimmed.length > 8000) return { valid: false, error: "Запрос слишком длинный." };
  if (/\0/.test(trimmed)) return { valid: false, error: "Недопустимые символы в запросе." };
  if (!/^SELECT\b/i.test(trimmed)) {
    return { valid: false, error: "Допускаются только SELECT-запросы." };
  }
  if (trimmed.includes(";")) {
    return { valid: false, error: "Допускается только одна инструкция (без ; в теле запроса)." };
  }
  // Block all SQL comments (potential bypass vectors)
  if (/--|\/\*|\*\/|#\s/.test(trimmed)) {
    return { valid: false, error: "Комментарии в запросе запрещены." };
  }
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(trimmed)) {
      return { valid: false, error: "Запрос содержит запрещённые конструкции." };
    }
  }
  const tables = extractTableNames(trimmed);
  for (const t of tables) {
    if (!ALLOWED_TABLES.has(t)) {
      return { valid: false, error: `Таблица ${t} не входит в список доступных.` };
    }
  }
  return { valid: true };
}

/**
 * Добавляет LIMIT N, если в запросе его нет.
 */
function ensureLimit(sql: string, max: number): string {
  const upper = sql.toUpperCase();
  if (upper.includes("LIMIT")) return sql;
  return `${sql.replace(/\s*;\s*$/, "")} LIMIT ${max}`;
}

/**
 * Выполняет валидный SQL и возвращает строки или ошибку.
 */
export async function runUserSql(sql: string): Promise<SqlResult | SqlError> {
  if (!isDbConfigured()) {
    return { ok: false, error: "БД не настроена." };
  }
  const validated = validateSql(sql);
  if (!validated.valid) {
    return { ok: false, error: validated.error };
  }
  const limited = ensureLimit(sql, MAX_ROWS);
  try {
    const rows = await runReadOnlyQuery<Record<string, unknown>>(limited, []);
    return { ok: true, rows, rowCount: rows.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка выполнения запроса.";
    return { ok: false, error: msg };
  }
}

/**
 * Форматирует результат запроса в текст для передачи обратно в ИИ.
 */
export function formatRowsForAi(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "Запрос вернул 0 строк.";
  const keys = Object.keys(rows[0] as object);
  const header = keys.join("\t");
  const lines = rows.map((r) => keys.map((k) => String(r[k] ?? "")).join("\t"));
  return [header, ...lines].join("\n");
}
