/**
 * Структурированное логирование в файл для отладки чата.
 * Формат: NDJSON (одна строка = один JSON-объект).
 * Поля каждой записи: ts (ISO), section, level, requestId?, и переданные данные.
 *
 * Включение: DEBUG_LOG=1 или DEBUG_LOG=true в .env.local
 * Путь: DEBUG_LOG_PATH (по умолчанию logs/debug.log)
 *
 * Примеры обработки логов:
 *   tail -f logs/debug.log | jq .
 *   jq -r 'select(.requestId=="a1b2c3d4")' logs/debug.log
 *   jq -r 'select(.section=="SQL_RUN") | .ts + " " + (.error // "ok")' logs/debug.log
 *   jq -r 'select(.section=="REQUEST") | .message' logs/debug.log
 *   grep '"section":"ERROR"' logs/debug.log | jq .
 */

import { appendFile, mkdir } from "fs/promises";
import { join, dirname } from "path";

const ENV_ENABLED = process.env.DEBUG_LOG === "1" || process.env.DEBUG_LOG === "true";
const LOG_PATH = process.env.DEBUG_LOG_PATH || join(process.cwd(), "logs", "debug.log");

const MAX_STRING_LENGTH = 6000;
const MAX_NESTED_STRING = 2000;

export type DebugLogLevel = "info" | "warn" | "error";

export interface DebugLogMeta {
  requestId?: string;
  level?: DebugLogLevel;
}

function sanitize(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") {
    const out = value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) + "…[обрезано]" : value;
    return out.replace(/\n/g, " ").replace(/\r/g, "");
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(sanitize);
  }
  if (typeof value === "object") {
    try {
      const acc: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === "string" && v.length > MAX_NESTED_STRING) {
          acc[k] = v.slice(0, MAX_NESTED_STRING) + "…[обрезано]";
        } else {
          acc[k] = sanitize(v);
        }
      }
      return acc;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function buildPayload(section: string, data: Record<string, unknown> | string, meta?: DebugLogMeta): Record<string, unknown> {
  const ts = new Date().toISOString();
  const payload: Record<string, unknown> = {
    ts,
    section,
    level: meta?.level ?? "info",
  };
  if (meta?.requestId) payload.requestId = meta.requestId;
  if (typeof data === "string") {
    payload.msg = data.length > MAX_STRING_LENGTH ? data.slice(0, MAX_STRING_LENGTH) + "…[обрезано]" : data;
  } else {
    for (const [k, v] of Object.entries(data)) {
      payload[k] = sanitize(v);
    }
  }
  return payload;
}

export function isDebugLogEnabled(): boolean {
  return !!ENV_ENABLED;
}

/**
 * Пишет одну строку NDJSON в debug.log.
 * section — этап (REQUEST, SQL_RUN, FORMAT_OUTPUT, ERROR и т.д.).
 * data — объект с полями или строка.
 * meta — опционально requestId и level для связи всех записей одного запроса.
 */
export async function debugLog(
  section: string,
  data: Record<string, unknown> | string,
  meta?: DebugLogMeta
): Promise<void> {
  if (!ENV_ENABLED) return;
  const payload = buildPayload(section, data, meta);
  let line: string;
  try {
    line = JSON.stringify(payload) + "\n";
  } catch (e) {
    line = JSON.stringify({ ts: new Date().toISOString(), section, level: "error", serializeError: String(e) }) + "\n";
  }
  try {
    await mkdir(dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, line, "utf8");
  } catch (e) {
    console.warn("[debugLog] write failed:", e);
  }
}

/**
 * Возвращает функцию логирования, привязанную к requestId.
 * Удобно в API: const log = createRequestLogger(requestId); log("REQUEST", { ... });
 */
export function createRequestLogger(requestId: string): (section: string, data: Record<string, unknown> | string, level?: DebugLogLevel) => void {
  return (section: string, data: Record<string, unknown> | string, level?: DebugLogLevel) => {
    void debugLog(section, data, { requestId, level: level ?? "info" });
  };
}
