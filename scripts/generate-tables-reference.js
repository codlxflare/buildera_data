/**
 * Генерирует полный справочник по всем таблицам БД MacroData из api.txt:
 * назначение, поля (тип, комментарий), связи. В конец добавляет примеры из api_samples.txt.
 * Запуск: node scripts/generate-tables-reference.js
 * Результат: docs/TABLES_REFERENCE.md
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const API_TXT = path.join(ROOT, "api.txt");
const SAMPLES_FILE = path.join(ROOT, "api_samples.txt");
const OUT_FILE = path.join(ROOT, "docs", "TABLES_REFERENCE.md");

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

function parseTableBlock(name, block) {
  const lines = block.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("Field\tType\t"));
  if (headerIdx < 0) return null;
  const descLines = lines
    .slice(0, headerIdx)
    .filter((l) => l.trim() && l !== name && !l.startsWith("Связи ") && l !== "Field");
  const description = descLines.join(" ").replace(/\s+/g, " ").trim();
  const fields = [];
  let i = headerIdx + 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("Связи ") || line === "Field	Links" || (KNOWN_TABLES.includes(line.trim()) && line.indexOf("\t") < 0)) break;
    const parts = line.split("\t");
    if (parts.length >= 6) {
      const field = parts[0].trim();
      const type = parts[1].trim();
      const comment = (parts[5] || "").trim();
      if (field && field !== "Field") fields.push({ field, type, comment });
    }
  }
  const links = [];
  const linksHeaderIdx = lines.findIndex((l, idx) => idx >= i && l === "Field	Links");
  if (linksHeaderIdx >= 0) {
    for (let j = linksHeaderIdx + 1; j < lines.length; j++) {
      const line = lines[j];
      const t = line.trim();
      if (!t || line.startsWith("Связи ") || (KNOWN_TABLES.includes(t) && line.indexOf("\t") < 0)) break;
      const parts = line.split("\t");
      if (parts.length >= 2 && parts[0].includes(".") && parts[1]) links.push(`${parts[0].trim()} → ${parts[1].trim()}`);
    }
  }
  return { name, description, fields, links };
}

function main() {
  let content;
  try {
    content = fs.readFileSync(API_TXT, "utf-8");
  } catch (e) {
    console.error("Не удалось прочитать api.txt:", e.message);
    process.exit(1);
  }

  const re = new RegExp(`\\n(${KNOWN_TABLES.join("|")})\\n`, "g");
  const starts = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    starts.push({ name: m[1], index: m.index + 1 });
  }

  const byName = new Map();
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index + starts[i].name.length + 2;
    const end = i + 1 < starts.length ? starts[i + 1].index : content.length;
    const block = content.slice(start, end);
    const parsed = parseTableBlock(starts[i].name, block);
    if (parsed && parsed.fields.length > 0) {
      const existing = byName.get(parsed.name);
      if (!existing || parsed.fields.length > existing.fields.length) byName.set(parsed.name, parsed);
    }
  }
  const tables = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));

  const md = [];
  md.push("# Справочник по всем таблицам БД MacroData");
  md.push("");
  md.push("Документ сгенерирован из `api.txt`. Содержит: назначение таблицы, поля (тип и комментарий), связи с другими таблицами. В конце — примеры значений по части таблиц (из `api_samples.txt`).");
  md.push("");
  md.push("**Версия api.txt:** MacroData v1.1.73. **Всего таблиц:** " + tables.length + ".");
  md.push("");
  md.push("## Инструкции по использованию");
  md.push("");
  md.push("| Запрос / тема | Основные таблицы | Ключевые поля и связи |");
  md.push("|---------------|------------------|------------------------|");
  md.push("| Платежи, долги, «к оплате», график до даты | **finances** | date_to, summa, deal_id, estate_sell_id, status_name; контакт покупателя через estate_deals.contacts_buy_id → contacts |");
  md.push("| Сделки (проведённые, подписанные) | **estate_deals** | deal_date, deal_status (150 = завершённые), contacts_buy_id → contacts |");
  md.push("| Заявки | **estate_buys** | created_at, channel_name, deal_id; contacts_id → contacts.id |");
  md.push("| Дома, ЖК | **estate_houses** | name, public_house_name |");
  md.push("| Квартиры, объекты в сделках | **estate_sells** | plans_name, geo_flatnum, house_id → estate_houses |");
  md.push("| Маркетинг, каналы, расходы | **estate_buys** (channel_name), **estate_advertising_channels**, **advertising_expenses** | utm_source, utm_campaign, expenses_date |");
  md.push("| Пользователи, отделы | **users**, **company_departments** | department_name, dep_boss_id → users |");
  md.push("| Звонки | **calls** | call_date, contacts_id → contacts, estate_id → estate_buys, manager_id → users |");
  md.push("| Справочники типов | finances_types, finances_subtypes, estate_statuses, noms_category, tags | id, name / title |");
  md.push("");
  md.push("---");
  md.push("");

  for (const t of tables) {
    md.push("## " + t.name);
    md.push("");
    if (t.description) {
      md.push("**Назначение:** " + t.description);
      md.push("");
    }
    md.push("| Поле | Тип | Комментарий |");
    md.push("|------|-----|--------------|");
    for (const f of t.fields) {
      const comment = (f.comment || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      md.push("| `" + f.field + "` | " + f.type + " | " + comment + " |");
    }
    md.push("");
    if (t.links && t.links.length > 0) {
      md.push("**Связи:**");
      md.push("");
      for (const link of t.links) {
        md.push("- " + link);
      }
      md.push("");
    }
    md.push("---");
    md.push("");
  }

  md.push("## Примеры значений (выборочно)");
  md.push("");
  md.push("Ниже — примеры данных из БД по части таблиц (источник: `api_samples.txt`, формируется при наличии подключения к БД).");
  md.push("");
  try {
    const samples = fs.readFileSync(SAMPLES_FILE, "utf-8").trim();
    md.push("```");
    md.push(samples);
    md.push("```");
  } catch {
    md.push("*Файл api_samples.txt отсутствует или пуст. Запустите приложение с настроенной БД и вызовите GET /api/samples?refresh=1 для формирования примеров.*");
  }
  md.push("");

  const outDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUT_FILE, md.join("\n"), "utf-8");
  console.log("Записано: " + OUT_FILE + " (" + tables.length + " таблиц)");
}

main();
