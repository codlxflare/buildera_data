/**
 * In-memory кэш ответов чата по ключу (нормализованный текст запроса).
 * TTL 3 минуты. Только для уменьшения нагрузки при повторных одинаковых запросах.
 * CACHE_VERSION: при смене инвалидируются старые записи (например после фикса обезличивания в диаграммах).
 */

const TTL_MS = 180_000; // 3 мин
const CACHE_VERSION = "v2"; // диаграммы в кэше хранятся с подставленными именами (не плейсхолдеры)

interface Cached {
  reply: string;
  charts: unknown[];
  suggestions: unknown[];
  at: number;
}

const cache = new Map<string, Cached>();

function key(msg: string): string {
  return `${CACHE_VERSION}:${msg.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export function getCached(message: string): { reply: string; charts: unknown[]; suggestions: unknown[] } | null {
  const k = key(message);
  const c = cache.get(k);
  if (!c || Date.now() - c.at > TTL_MS) {
    if (c) cache.delete(k);
    return null;
  }
  return { reply: c.reply, charts: c.charts, suggestions: c.suggestions };
}

export function setCached(message: string, reply: string, charts: unknown[], suggestions: unknown[]): void {
  const k = key(message);
  cache.set(k, { reply, charts, suggestions, at: Date.now() });
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
    oldest.slice(0, 100).forEach(([kk]) => cache.delete(kk));
  }
}
