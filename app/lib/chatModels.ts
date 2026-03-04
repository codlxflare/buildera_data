/**
 * Выбор моделей для чата: разнесение по задачам для экономии токенов.
 * - SQL (text-to-SQL): точность важнее — более мощная модель.
 * - Форматирование ответа: можно дешевле (меньше контекста, нет схемы БД).
 * - Суммаризация диалога (опционально): самая дешёвая модель.
 */

export const DEFAULT_SQL_MODEL = "gpt-4o";
export const DEFAULT_FORMAT_MODEL = "gpt-4o-mini";
export const DEFAULT_SUMMARY_MODEL = "gpt-4o-mini";

/** Модель для генерации SQL по тексту (text-to-SQL). Максимальная точность. */
export function getSqlModel(): string {
  return process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_SQL_MODEL || DEFAULT_SQL_MODEL;
}

/** Модель для форматирования результата (таблицы, вывод, графики). Экономия токенов. */
export function getFormatModel(): string {
  return process.env.OPENAI_FORMAT_MODEL || DEFAULT_FORMAT_MODEL;
}

/** Модель для сжатия истории диалога (если включено). Минимум токенов. */
export function getSummaryModel(): string {
  return process.env.OPENAI_SUMMARY_MODEL || DEFAULT_SUMMARY_MODEL;
}

/** Использовать ли компактную схему БД для шага SQL (меньше токенов, часто достаточно для типичных запросов). */
export function useCompactSchema(): boolean {
  return process.env.USE_COMPACT_SCHEMA === "true" || process.env.USE_COMPACT_SCHEMA === "1";
}

/** Включить суммаризацию длинной истории (один доп. запрос к дешёвой модели). */
export function useDialogSummary(): boolean {
  return process.env.ENABLE_DIALOG_SUMMARY === "true" || process.env.ENABLE_DIALOG_SUMMARY === "1";
}
