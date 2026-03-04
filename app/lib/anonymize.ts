/**
 * Обезличивание PII для отправки в ИИ (OpenAI).
 * В ответе ИИ плейсхолдеры заменяются обратно на реальные значения перед отправкой на фронт.
 */

/** Колонки с персональными данными (имена, телефоны, email и т.п.) — маскируются при передаче в модель */
const PII_COLUMN_NAMES = new Set([
  "contacts_buy_name",
  "contacts_buy_phones",
  "contacts_buy_phone",
  "contact_name",
  "contact_phone",
  "fio",
  "name",
  "users_name",
  "phone",
  "phones",
  "email",
  "emails",
  "manager",
  "client_name",
  "client_phone",
  "buyer_name",
  "buyer_phone",
]);

const PLACEHOLDER_PREFIX = "__ANON_";
const PLACEHOLDER_SUFFIX = "__";

function isPiiColumn(key: string): boolean {
  const lower = key.toLowerCase();
  if (PII_COLUMN_NAMES.has(lower)) return true;
  if (lower.includes("name") && (lower.includes("contact") || lower.includes("buy") || lower.includes("client"))) return true;
  if (lower.includes("phone") || lower.includes("tel")) return true;
  if (lower.includes("email")) return true;
  if (lower === "fio") return true;
  return false;
}

/**
 * Заменяет в строках значения PII-колонок на уникальные плейсхолдеры.
 * Возвращает обезличенные строки и карту плейсхолдер → реальное значение для обратной подстановки.
 */
export function anonymizeRows(rows: Record<string, unknown>[]): {
  anonymizedRows: Record<string, unknown>[];
  placeholderToReal: Map<string, string>;
} {
  const placeholderToReal = new Map<string, string>();
  let counter = 0;

  function toPlaceholder(): string {
    const key = `${PLACEHOLDER_PREFIX}${counter}${PLACEHOLDER_SUFFIX}`;
    counter += 1;
    return key;
  }

  const anonymizedRows = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [col, value] of Object.entries(row)) {
      const strVal = value === null || value === undefined ? "" : String(value).trim();
      if (isPiiColumn(col) && strVal.length > 0) {
        const placeholder = toPlaceholder();
        placeholderToReal.set(placeholder, String(value));
        out[col] = placeholder;
      } else {
        out[col] = value;
      }
    }
    return out;
  });

  return { anonymizedRows, placeholderToReal };
}

const PLACEHOLDER_REGEX = /__ANON_(\d+)__/g;
/** Вариант с одним подчёркиванием (модель или кэш мог исказить) */
const PLACEHOLDER_REGEX_ALT = /_ANON_(\d+)_/g;

function toCanonicalPlaceholder(match: string): string {
  const num = match.match(/(\d+)/)?.[1];
  return num != null ? `__ANON_${num}__` : match;
}

/**
 * Восстанавливает в тексте реальные значения вместо плейсхолдеров.
 * Поддерживает и __ANON_N__, и _ANON_N_ (на случай искажения моделью/кэшем).
 */
export function replacePlaceholders(text: string, placeholderToReal: Map<string, string>): string {
  if (placeholderToReal.size === 0) return text;
  return text
    .replace(PLACEHOLDER_REGEX, (match) => placeholderToReal.get(toCanonicalPlaceholder(match)) ?? match)
    .replace(PLACEHOLDER_REGEX_ALT, (match) => placeholderToReal.get(toCanonicalPlaceholder(match)) ?? match);
}

/**
 * Рекурсивно заменяет плейсхолдеры на реальные значения во всех строках объекта.
 * Используется для спека диаграмм: ИИ получает обезличенные данные, на фронт/дашборд уходят реальные.
 */
export function replacePlaceholdersInObject(
  obj: unknown,
  placeholderToReal: Map<string, string>
): unknown {
  if (placeholderToReal.size === 0) return obj;
  if (typeof obj === "string") return replacePlaceholders(obj, placeholderToReal);
  if (Array.isArray(obj)) return obj.map((item) => replacePlaceholdersInObject(item, placeholderToReal));
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = replacePlaceholdersInObject(v, placeholderToReal);
    return out;
  }
  return obj;
}
