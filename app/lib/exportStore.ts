/**
 * Временное хранилище результатов запросов для выгрузки в CSV.
 * In-memory + запись на диск (переживает перезапуск сервера). TTL 30 минут.
 * Строки нормализуются в плоские объекты (Date/Buffer → строка) для корректного CSV.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TTL_MS = 30 * 60 * 1000; // 30 минут

const EXPORT_DIR = join(tmpdir(), "macrodata-exports");

interface ExportEntry {
  rows: Record<string, unknown>[];
  createdAt: number;
}

const store = new Map<string, ExportEntry>();

function ensureDir(): void {
  try {
    if (!existsSync(EXPORT_DIR)) mkdirSync(EXPORT_DIR, { recursive: true });
  } catch {
    // если нет прав на запись в tmp — работаем только из памяти
  }
}

function filePath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9-]/g, "_");
  return join(EXPORT_DIR, `${safe}.json`);
}

function cleanup(): void {
  const now = Date.now();
  for (const [id, entry] of Array.from(store.entries())) {
    if (now - entry.createdAt > TTL_MS) store.delete(id);
  }
}

/** Приводит значение ячейки к виду, пригодному для CSV (строка или число). */
function normalizeCell(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "object" && typeof (value as { toISOString?: () => string }).toISOString === "function") return (value as Date).toISOString();
  if (typeof value === "string" || typeof value === "number") return value;
  return String(value);
}

/** Нормализует одну строку результата в плоский объект для CSV. */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    out[key] = normalizeCell(row[key]);
  }
  return out;
}

export function setExport(id: string, rows: Record<string, unknown>[]): void {
  cleanup();
  const normalized = rows.map((r) => normalizeRow(r));
  const entry: ExportEntry = { rows: normalized, createdAt: Date.now() };
  store.set(id, entry);
  try {
    ensureDir();
    writeFileSync(filePath(id), JSON.stringify(entry), "utf8");
  } catch {
    // только память
  }
}

export function getExport(id: string): Record<string, unknown>[] | null {
  let entry = store.get(id);
  if (!entry) {
    try {
      const path = filePath(id);
      if (existsSync(path)) {
        const raw = readFileSync(path, "utf8");
        entry = JSON.parse(raw) as ExportEntry;
        if (entry && Array.isArray(entry.rows) && typeof entry.createdAt === "number") {
          store.set(id, entry);
        } else {
          entry = undefined;
        }
      }
    } catch {
      entry = undefined;
    }
  }
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    try {
      if (existsSync(filePath(id))) unlinkSync(filePath(id));
    } catch {
      /* ignore */
    }
    return null;
  }
  return entry.rows;
}
