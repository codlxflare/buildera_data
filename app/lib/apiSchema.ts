/**
 * Парсинг api.txt (MacroData): полный список таблиц с описаниями и полями.
 * Результат подставляется в системный промпт, чтобы ИИ знал все таблицы и по текстовому запросу понимал контекст и к каким данным обращаться.
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Intent Router — keyword-based domain detection (no extra API call)
// ---------------------------------------------------------------------------

/** Домены данных и ключевые слова для их распознавания в тексте запроса */
const DOMAIN_KEYWORDS: Record<string, RegExp> = {
  deals:     /\b(сделк|договор|контракт|продаж|купл|оформил|провод|провёл|deal)/i,
  leads:     /\b(заявк|лид|обращени|потенциальн|холодн|новых\s+клиент)/i,
  finance:   /\b(долг|задолженн|платеж|оплат|финанс|поступлен|выплат|к\s+оплате|деньг|дебитор|сколько\s+должн|должны\s+заплатит|график\s+платеж)/i,
  property:  /\b(объект|квартир|планировк|площад|цен[аы]|в\s+продаже|свободн|планировок|этаж|номер\s+кварт)/i,
  marketing: /\b(канал|площадк|реклам|источник|маркетинг|конверси|utm|инстаграм|фейсбук|тикток|авито|сайт|бюджет|расход|трат)/i,
  plans:     /\b(план|факт|выполнен|kpi|метрик|прогноз|план\s+продаж|vs\s+факт|перевыполн)/i,
  mortgage:  /\b(ипотек|кредит|банк|залог)/i,
  calls:     /\b(звонк|встреч|назначен|звонил|перезвон|колл)/i,
  staff:     /\b(менеджер|отдел|сотрудник|команд|специалист|работник|по\s+менеджер)/i,
  inventory: /\b(склад|материал|запас|стройматериал|номенклатур|товар|остаток)/i,
  projects:  /\b(проект|строительств|gpr|задач|работы|объём\s+работ)/i,
};

/** Таблицы, которые всегда включаются как справочные (нужны для JOIN в любом запросе) */
const BASE_TABLES = new Set([
  "contacts", "contacts_links", "estate_houses", "geo_city_complex",
  "users", "company_departments", "estate_statuses",
]);

/** Таблицы по каждому домену данных */
const DOMAIN_TABLES_MAP: Record<string, string[]> = {
  deals:     ["estate_deals", "estate_deals_statuses", "estate_deals_addons", "estate_deals_discounts", "estate_deals_participants", "estate_deals_docs"],
  leads:     ["estate_buys", "estate_buys_statuses_log", "estate_buys_utm", "estate_buys_utm_history", "estate_buys_attr"],
  finance:   ["finances", "finances_types", "finances_subtypes", "finances_accounts"],
  property:  ["estate_sells", "estate_sells_attr", "estate_sells_price_stat", "estate_sells_price_min_stat", "estate_sells_statuses_log"],
  marketing: ["advertising_expenses", "estate_advertising_channels", "estate_buys_utm"],
  plans:     ["estate_sales_plans", "estate_sales_plans_metrics"],
  mortgage:  ["estate_mortgage"],
  calls:     ["calls", "calls_subjects", "estate_meetings"],
  staff:     ["users", "company_departments"],
  inventory: ["inventory_demands", "inventory_warehouse", "inventory_warehouse_stocks", "inventory_noms_top", "noms", "noms_category"],
  projects:  ["projects", "projects_tasks", "projects_tasks_agreements", "projects_tasks_estimate", "projects_tasks_checklists", "projects_tasks_requests"],
  misc:      ["stat", "promos", "estate_promos", "estate_restoration", "estate_tags", "tags", "tasks", "tasks_tags", "estate_transfer"],
};

/**
 * Определяет домены данных по тексту запроса с помощью keyword-matching.
 * Возвращает массив доменов (например ["finance", "deals"]).
 */
export function detectDomainsFromText(text: string): string[] {
  const detected: string[] = [];
  for (const [domain, regex] of Object.entries(DOMAIN_KEYWORDS)) {
    if (regex.test(text)) detected.push(domain);
  }
  return detected;
}

/**
 * Собирает текст схемы только для запрошенных доменов + базовые справочные таблицы.
 * Используется в составе Intent Router для подбора релевантных таблиц.
 */
export function getMacrodataSchemaForDomains(domains: string[]): string {
  const needed = new Set<string>(BASE_TABLES);
  for (const domain of domains) {
    for (const table of (DOMAIN_TABLES_MAP[domain] ?? [])) {
      needed.add(table);
    }
  }
  const full = getMacrodataSchemaFromApiTxt();
  if (!full.includes("--- ")) return full;
  const blocks = full.split(/\n--- /);
  const domainLabel = domains.length > 0 ? `домены: ${domains.join(", ")}` : "ключевые таблицы";
  const out: string[] = [`ТАБЛИЦЫ MACRODATA (${domainLabel}). Выбраны для этого запроса по смыслу. Завершённые сделки: deal_status = 150. Даты: заявки — estate_buys.created_at; сделки — estate_deals.deal_date; платежи — DATE(finances.date_to). Контакт из finances — ТОЛЬКО через estate_deals (contacts_buy_id→contacts.contacts_id), не через finances.contacts_id.`, ""];
  for (let i = 1; i < blocks.length; i++) {
    const name = blocks[i].split(/\s+---/)[0].split("\n")[0].trim();
    if (needed.has(name)) out.push("--- " + blocks[i].trim(), "");
  }
  return out.join("\n").trim();
}

/**
 * Главная функция Intent Router.
 * По тексту вопроса определяет нужные таблицы и возвращает минимальную точную схему.
 * Если домены не определены — fallback на compact schema (16 ключевых таблиц).
 */
export function getSchemaByIntent(question: string, historyContext = ""): string {
  const combined = `${question} ${historyContext}`.slice(0, 1000);
  const domains = detectDomainsFromText(combined);
  if (domains.length === 0) {
    return getMacrodataSchemaShort();
  }
  // Если вопрос про финансы — всегда добавляем deals (нужен для JOIN цепочки)
  if (domains.includes("finance") && !domains.includes("deals")) {
    domains.push("deals");
  }
  // Если про сделки или заявки — добавляем property (нужен для имён квартир)
  if ((domains.includes("deals") || domains.includes("leads")) && !domains.includes("property")) {
    domains.push("property");
  }
  return getMacrodataSchemaForDomains(domains);
}

// ---------------------------------------------------------------------------
// SQL Examples loader
// ---------------------------------------------------------------------------

let sqlExamplesCache: string | null = null;

/** Читает docs/SQL_EXAMPLES.md и возвращает содержимое для injecting в промпт */
export function getSqlExamplesContent(): string {
  if (sqlExamplesCache !== null) return sqlExamplesCache;
  try {
    const p = path.join(process.cwd(), "docs", "SQL_EXAMPLES.md");
    const content = fs.readFileSync(p, "utf-8").trim();
    sqlExamplesCache = content.length > 0 ? content : "";
    return sqlExamplesCache;
  } catch {
    sqlExamplesCache = "";
    return "";
  }
}

const AI_GUIDE_PATH = path.join(process.cwd(), "docs", "AI_SCHEMA_GUIDE.md");

/** Читает руководство для ИИ (правила, маппинг, примеры SQL). Если файла нет — пустая строка. */
export function getAiSchemaGuideContent(): string {
  try {
    const content = fs.readFileSync(AI_GUIDE_PATH, "utf-8").trim();
    return content.length > 0 ? content : "";
  } catch {
    return "";
  }
}

const TABLE_HEADER = "Field\tType\tLength\tDecimal\tNull\tComments";
const FIELD_LINKS_HEADER = "Field\tLinks";

/** Список таблиц из api.txt (строки 3–68 в начале файла). */
const KNOWN_TABLES = [
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
];

interface TableInfo {
  name: string;
  description: string;
  fields: Array<{ field: string; type: string; comment: string }>;
  links: string[];
}

function parseTableBlock(name: string, block: string): TableInfo | null {
  const lines = block.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("Field\tType\t"));
  if (headerIdx < 0) return null;
  const description = lines
    .slice(0, headerIdx)
    .filter((l) => l.trim() && l !== name)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const fields: Array<{ field: string; type: string; comment: string }> = [];
  const links: string[] = [];
  let i = headerIdx + 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("Связи ") || line === FIELD_LINKS_HEADER || (KNOWN_TABLES.includes(line.trim()) && line.indexOf("\t") < 0)) break;
    const parts = line.split("\t");
    if (parts.length >= 6) {
      const field = parts[0].trim();
      const type = parts[1].trim();
      const comment = (parts[5] || "").trim();
      if (field && field !== "Field") fields.push({ field, type, comment });
    }
  }
  const linksHeaderIdx = lines.findIndex((l, idx) => idx >= i && l === FIELD_LINKS_HEADER);
  if (linksHeaderIdx >= 0) {
    for (let j = linksHeaderIdx + 1; j < lines.length; j++) {
      const line = lines[j];
      const t = line.trim();
      if (!t || line.startsWith("Связи ") || (KNOWN_TABLES.includes(t) && line.indexOf("\t") < 0)) break;
      const parts = line.split("\t");
      if (parts.length >= 2 && parts[0].includes(".") && parts[1]) {
        links.push(`${parts[0].trim()} -> ${parts[1].trim()}`);
      }
    }
  }
  return { name, description, fields, links };
}

let schemaCache: { mtime: number; text: string } | null = null;

/**
 * Читает api.txt из корня проекта, парсит все таблицы и возвращает текст схемы для промпта.
 * Результат кэшируется по mtime файла, чтобы не парсить при каждом запросе.
 */
export function getMacrodataSchemaFromApiTxt(): string {
  const apiPath = path.join(process.cwd(), "api.txt");
  let mtime: number;
  try {
    mtime = fs.statSync(apiPath).mtimeMs;
  } catch {
    return "Файл api.txt не найден. Доступные таблицы MacroData не загружены.";
  }
  if (schemaCache && schemaCache.mtime === mtime) return schemaCache.text;

  let content: string;
  try {
    content = fs.readFileSync(apiPath, "utf-8");
  } catch {
    return "Файл api.txt не найден. Доступные таблицы MacroData не загружены.";
  }

  const re = new RegExp(`\\n(${KNOWN_TABLES.join("|")})\\n`, "g");
  let m: RegExpExecArray | null;
  const starts: { name: string; index: number }[] = [];
  while ((m = re.exec(content)) !== null) {
    starts.push({ name: m[1], index: m.index + 1 });
  }
  const byName = new Map<string, TableInfo>();
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index + starts[i].name.length + 2;
    const end = i + 1 < starts.length ? starts[i + 1].index : content.length;
    const block = content.slice(start, end);
    const parsed = parseTableBlock(starts[i].name, block);
    if (parsed && parsed.fields.length > 0) {
      const existing = byName.get(parsed.name);
      if (!existing || parsed.fields.length > existing.fields.length)
        byName.set(parsed.name, parsed);
    }
  }
  const tables = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));

  const out: string[] = [
    "ПОЛНЫЙ СПИСОК ТАБЛИЦ БД MACRODATA (из api.txt) — все таблицы и поля ниже. Используй любую из них по смыслу запроса. Завершённые сделки: deal_status=150; заявки по дате: estate_buys.created_at; сделки по дате: estate_deals.deal_date; платежи/долги/«к оплате»: таблица finances (date_to, summa, contacts_id, deal_id, estate_sell_id, status_name).",
    "",
  ];
  for (const t of tables) {
    out.push(`--- ${t.name} ---`);
    if (t.description) out.push(t.description);
    for (const f of t.fields) {
      const comment = f.comment ? ` — ${f.comment}` : "";
      out.push(`  ${f.field} (${f.type})${comment}`);
    }
    if (t.links && t.links.length > 0) {
      out.push("  Связи: " + t.links.join("; "));
    }
    out.push("");
  }
  const text = out.join("\n").trim();
  schemaCache = { mtime, text };
  return text;
}

/** Ключевые таблицы для короткой схемы (шаг генерации SQL) — меньше токенов, быстрее ответ. */
const SHORT_TABLES = new Set([
  "estate_deals", "estate_deals_statuses", "estate_buys", "estate_sells", "estate_houses", "company_departments",
  "users", "finances", "finances_types", "advertising_expenses", "calls", "estate_meetings",
  "estate_sales_plans_metrics", "estate_mortgage", "estate_statuses", "estate_advertising_channels",
]);

let shortSchemaCache: { mtime: number; text: string } | null = null;

/**
 * Короткая схема только для ключевых таблиц — используется при генерации SQL для ускорения.
 */
export function getMacrodataSchemaShort(): string {
  const apiPath = path.join(process.cwd(), "api.txt");
  let mtime: number;
  try {
    mtime = fs.statSync(apiPath).mtimeMs;
  } catch {
    return "Файл api.txt не найден.";
  }
  if (shortSchemaCache && shortSchemaCache.mtime === mtime) return shortSchemaCache.text;

  const full = getMacrodataSchemaFromApiTxt();
  if (!full.includes("--- ")) {
    shortSchemaCache = { mtime, text: full };
    return full;
  }
  const blocks = full.split(/\n--- /);
  const out: string[] = ["КЛЮЧЕВЫЕ ТАБЛИЦЫ MACRODATA для SQL. Используй только их. Завершённые сделки: deal_status = 150. Даты: заявки — estate_buys.created_at; сделки — estate_deals.deal_date; маркетинг — estate_buys.channel_name, estate_advertising_channels.name. Долги/платежи «должны заплатить», «к оплате», график платежей — только таблица finances (date_to, summa, contacts_id, deal_id, estate_sell_id, status_name); JOIN contacts, estate_sells, estate_houses для имён и домов.", ""];
  for (let i = 1; i < blocks.length; i++) {
    const name = blocks[i].split(/\s+---/)[0].trim();
    if (SHORT_TABLES.has(name)) out.push("--- " + blocks[i].trim(), "");
  }
  const text = out.join("\n").trim();
  shortSchemaCache = { mtime, text };
  return text;
}
