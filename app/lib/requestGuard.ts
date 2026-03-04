/**
 * Защита от запросов, направленных на массовую выгрузку/дамп данных.
 * При совпадении запрос не передаётся в модель — возвращается отказ.
 * Контент сообщений не логируется.
 *
 * ВАЖНО: паттерны проверяют только явные попытки массового экспорта всей базы.
 * Обычные аналитические запросы ("покажи все сделки за февраль", "список долгов") — НЕ блокируются.
 * Запрет опасных SQL-конструкций (INSERT/UPDATE/DELETE/UNION/etc.) выполняется отдельно в sqlRunner.ts.
 */

const FORBIDDEN_PATTERNS = [
  // Прямые просьбы выгрузить/скачать/экспортировать данные в файл
  /\b(выгрузи\s+в\s+файл|скачать\s+базу|экспорт\s+в\s+csv|экспорт\s+в\s+excel|экспорт\s+в\s+json)\b/i,
  /\b(экспортируй\s+все|выкачать\s+все|дамп\s+базы|dump\s+database|full\s+dump)\b/i,
  // Попытки получить полную копию таблицы/базы
  /\b(вся\s+таблица\s+целиком|полный\s+дамп|весь\s+дамп|бэкап\s+данных|копия\s+базы|скопируй\s+базу)\b/i,
  /\b(all\s+records\s+from|dump\s+all|export\s+entire|raw\s+export)\b/i,
  // SQL-специфичные попытки выгрузки
  /\b(INTO\s+OUTFILE|LOAD\s+DATA\s+INFILE|mysqldump)\b/i,
];

const REJECT_MESSAGE =
  "Запрос не может быть выполнен по правилам конфиденциальности. Доступ только для аналитики и отчётов по метрикам.";

/**
 * Проверяет, является ли запрос попыткой массовой выгрузки/дампа данных.
 * При совпадении возвращает сообщение об отказе, иначе null.
 */
export function checkForbiddenExtraction(message: string): string | null {
  const normalized = message.trim();
  if (normalized.length === 0) return null;
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) return REJECT_MESSAGE;
  }
  return null;
}
