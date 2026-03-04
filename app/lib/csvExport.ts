/**
 * Формирование CSV из массива объектов (результат SQL).
 * Экранирование кавычек и переносов в ячейках.
 * BOM в начале — чтобы Excel и другие программы корректно открывали UTF-8.
 */

const UTF8_BOM = "\uFEFF";

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/["\r\n,]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return UTF8_BOM;
  const first = rows[0] as Record<string, unknown>;
  const keys = Object.keys(first);
  if (keys.length === 0) return UTF8_BOM;
  const header = keys.map(escapeCsvCell).join(",");
  const lines = rows.map((r) => keys.map((k) => escapeCsvCell(r[k])).join(","));
  return UTF8_BOM + [header, ...lines].join("\r\n");
}
