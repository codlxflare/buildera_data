/**
 * Простой in-memory rate limit по ключу (IP или id сессии).
 * Ограничение: N запросов в минуту.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

const store = new Map<string, { count: number; resetAt: number }>();

function getKey(identifier: string): string {
  return identifier.trim() || "anonymous";
}

export function checkRateLimit(identifier: string): { allowed: boolean; retryAfterMs?: number } {
  const key = getKey(identifier);
  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    store.set(key, entry);
    return { allowed: true };
  }
  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { allowed: true };
}
