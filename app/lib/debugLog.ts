/**
 * Вспомогательный лог в файл для отладки чата:
 * вопрос пользователя, что передаётся на бэк, ответ ИИ (SQL/формат), результат запроса, итоговый ответ.
 * Включение: DEBUG_LOG=1 или DEBUG_LOG=true в .env.local
 * Путь: DEBUG_LOG_PATH (по умолчанию logs/debug.log в корне проекта)
 */

import { appendFile, mkdir } from "fs/promises";
import { join, dirname } from "path";

const ENV_ENABLED = process.env.DEBUG_LOG === "1" || process.env.DEBUG_LOG === "true";
const LOG_PATH = process.env.DEBUG_LOG_PATH || join(process.cwd(), "logs", "debug.log");

const MAX_STRING_LENGTH = 8000;

function formatPayload(x: unknown): string {
  if (x === undefined) return "(undefined)";
  if (x === null) return "(null)";
  if (typeof x === "string") {
    return x.length > MAX_STRING_LENGTH ? x.slice(0, MAX_STRING_LENGTH) + "\n...[обрезано]\n" : x;
  }
  if (typeof x === "object") {
    try {
      const s = JSON.stringify(x, null, 2);
      return s.length > MAX_STRING_LENGTH ? s.slice(0, MAX_STRING_LENGTH) + "\n...[обрезано]\n" : s;
    } catch {
      return String(x);
    }
  }
  return String(x);
}

export function isDebugLogEnabled(): boolean {
  return !!ENV_ENABLED;
}

export async function debugLog(section: string, data: Record<string, unknown> | string): Promise<void> {
  if (!ENV_ENABLED) return;
  const ts = new Date().toISOString();
  const body =
    typeof data === "string"
      ? data
      : Object.entries(data)
          .map(([k, v]) => `  ${k}: ${formatPayload(v)}`)
          .join("\n");
  const line = `\n[${ts}] ${section}\n${body}\n`;
  try {
    await mkdir(dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, line, "utf8");
  } catch (e) {
    // не ломаем запрос при ошибке записи лога
    console.warn("[debugLog] write failed:", e);
  }
}
