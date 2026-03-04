/**
 * Прямой запрос к БД без ИИ: задолженность до 28 февраля по подписанным контрактам,
 * с именами и телефонами клиентов, по домам и квартирам.
 * Запуск из корня проекта: node scripts/check-debt.js
 * Требуется .env.local с MACRODATA_DB_* (или MACRODATA_*).
 */

const fs = require("fs");
const path = require("path");

// Загрузка .env.local
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
          val = val.slice(1, -1);
        process.env[key] = val;
      }
    }
  });
}

const host = process.env.MACRODATA_DB_HOST || process.env.MACRODATA_HOST;
const user = process.env.MACRODATA_DB_USER || process.env.MACRODATA_USER;
const password = process.env.MACRODATA_DB_PASSWORD || process.env.MACRODATA_PASSWORD;
const database = process.env.MACRODATA_DB_NAME || process.env.MACRODATA_DATABASE;

if (!host || !user || !password || !database) {
  console.error("Нужны переменные: MACRODATA_DB_HOST, MACRODATA_DB_USER, MACRODATA_DB_PASSWORD, MACRODATA_DB_NAME (или MACRODATA_*) в .env.local");
  process.exit(1);
}

const mysql = require("mysql2/promise");

const SQL = `
SELECT
  f.summa AS debt_amount,
  DATE(f.date_to) AS payment_date,
  COALESCE(h.name, h.public_house_name) AS house_name,
  s.plans_name AS flat_plan,
  s.geo_flatnum AS flat_number,
  c.contacts_buy_name AS client_name,
  c.contacts_buy_phones AS client_phones
FROM finances f
LEFT JOIN estate_deals ed ON f.deal_id = ed.deal_id
LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id
LEFT JOIN estate_sells s ON f.estate_sell_id = s.estate_sell_id
LEFT JOIN estate_houses h ON s.house_id = h.house_id
WHERE DATE(f.date_to) >= '2026-02-01'
  AND DATE(f.date_to) <= '2026-02-28'
  AND f.deal_id IS NOT NULL
ORDER BY f.date_to, house_name, flat_number
LIMIT 5000
`;

async function main() {
  const conn = await mysql.createConnection({
    host,
    port: parseInt(process.env.MACRODATA_DB_PORT || process.env.MACRODATA_PORT || "3306", 10),
    user,
    password,
    database,
  });

  try {
    const [rows] = await conn.execute(SQL);
    const list = Array.isArray(rows) ? rows : [];

    console.log("=== Задолженность до 28 февраля 2026 (подписанные контракты) ===\n");
    console.log("Всего строк:", list.length);

    if (list.length === 0) {
      console.log("Записей нет.");
      return;
    }

    const total = list.reduce((sum, r) => sum + Number(r.debt_amount || 0), 0);
    console.log("Общая сумма (тенге):", total.toLocaleString("ru-RU", { minimumFractionDigits: 2 }));

    console.log("\n--- Список (дата | дом | квартира | клиент | телефон | сумма) ---\n");
    list.forEach((r, i) => {
      const date = r.payment_date ? (r.payment_date instanceof Date ? r.payment_date.toISOString().slice(0, 10) : String(r.payment_date).slice(0, 10)) : "";
      console.log(
        `${i + 1}. ${date} | ${r.house_name || ""} | ${r.flat_number || ""} | ${r.client_name || "(нет имени)"} | ${r.client_phones || "(нет телефона)"} | ${Number(r.debt_amount || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2 })}`
      );
    });
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
