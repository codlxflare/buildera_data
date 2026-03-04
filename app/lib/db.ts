/**
 * Подключение к БД MacroData — только чтение.
 * Используется для безопасных метрик (агрегаты), без изменения данных.
 */

import type { RowDataPacket } from "mysql2/promise";

const env = process.env;
const hasDb =
  (env.MACRODATA_DB_HOST || env.MACRODATA_HOST) &&
  (env.MACRODATA_DB_USER || env.MACRODATA_USER) &&
  (env.MACRODATA_DB_PASSWORD || env.MACRODATA_PASSWORD) &&
  (env.MACRODATA_DB_NAME || env.MACRODATA_DATABASE);

let pool: import("mysql2/promise").Pool | null = null;

export function isDbConfigured(): boolean {
  return Boolean(hasDb);
}

export function resetPool(): void {
  pool = null;
}

function getPool(): import("mysql2/promise").Pool {
  if (!pool) {
    if (!hasDb) throw new Error("DB not configured");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysql = require("mysql2/promise");
    pool = mysql.createPool({
      host: env.MACRODATA_DB_HOST || env.MACRODATA_HOST,
      port: (env.MACRODATA_DB_PORT || env.MACRODATA_PORT)
        ? parseInt(env.MACRODATA_DB_PORT || env.MACRODATA_PORT || "3306", 10)
        : 3306,
      user: env.MACRODATA_DB_USER || env.MACRODATA_USER,
      password: env.MACRODATA_DB_PASSWORD || env.MACRODATA_PASSWORD,
      database: env.MACRODATA_DB_NAME || env.MACRODATA_DATABASE,
      waitForConnections: true,
      connectionLimit: 2,
      enableKeepAlive: true,
      connectTimeout: 10000,
      charset: "utf8mb4",
    });
  }
  return pool;
}

/**
 * Выполняет один SELECT. Параметры подставляются через плейсхолдеры (?).
 * Только чтение; любые не-SELECT запросы не выполняются.
 */
const QUERY_TIMEOUT_MS = 15_000;

export async function runReadOnlyQuery<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params: (string | number)[] = []
): Promise<T[]> {
  const trimmed = sql.trim();
  // Allow SELECT with any whitespace/newline after keyword (e.g. "SELECT\n  ...")
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error("Only SELECT is allowed");
  }
  const conn = await getPool().getConnection();
  try {
    // query() вместо execute(): SET/START/ROLLBACK и часть SELECT не поддерживаются в prepared statement protocol
    await conn.query(`SET NAMES utf8mb4`);
    await conn.query(`SET SESSION TRANSACTION READ ONLY`);
    await conn.query(`SET SESSION MAX_EXECUTION_TIME=${QUERY_TIMEOUT_MS}`);
    await conn.query(`START TRANSACTION READ ONLY`);
    try {
      const [rows] =
        params.length > 0
          ? await conn.execute<T[]>(sql, params)
          : await conn.query<T[]>(sql);
      return Array.isArray(rows) ? rows : [];
    } finally {
      await conn.query(`ROLLBACK`).catch(() => {});
    }
  } finally {
    conn.release();
  }
}
