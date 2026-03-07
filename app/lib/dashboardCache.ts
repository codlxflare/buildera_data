/**
 * Кэш для данных дашборда: быстрый показ при повторном открытии и фоновое обновление.
 * In-memory + опционально localStorage для последнего периода (только summary — маленький объём).
 */

const TTL_DASH_MS = 3 * 60 * 1000;   // 3 мин для дашборда и детализации
const TTL_DRILL_MS = 5 * 60 * 1000;  // 5 мин для провалов (менеджер, канал)
const STORAGE_KEY_PREFIX = "macrodata-dash-cache-";
const STORAGE_MAX_KEYS = 4; // храним в localStorage только несколько ключей (мелкие)

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const memory = new Map<string, CacheEntry<unknown>>();

function now(): number {
  return Date.now();
}

function get<T>(key: string, ttlMs: number): T | null {
  const entry = memory.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + key);
      if (!raw) return null;
      const stored = JSON.parse(raw) as { data: T; expires: number };
      if (stored.expires > now()) {
        memory.set(key, stored);
        return stored.data;
      }
      localStorage.removeItem(STORAGE_KEY_PREFIX + key);
    } catch {
      // ignore
    }
    return null;
  }
  if (entry.expires <= now()) {
    memory.delete(key);
    return null;
  }
  return entry.data;
}

function set(key: string, data: unknown, ttlMs: number, saveToStorage = false): void {
  const expires = now() + ttlMs;
  const entry: CacheEntry<unknown> = { data, expires };
  memory.set(key, entry);
  if (saveToStorage && typeof localStorage !== "undefined") {
    try {
      const payload = JSON.stringify(entry);
      if (payload.length < 8000) {
        localStorage.setItem(STORAGE_KEY_PREFIX + key, payload);
        trimStorageKeys();
      }
    } catch {
      // quota or disabled
    }
  }
}

function trimStorageKeys(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_KEY_PREFIX)) keys.push(k);
    }
    if (keys.length <= STORAGE_MAX_KEYS) return;
    const byTime: { key: string; t: number }[] = [];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const p = JSON.parse(raw) as { expires?: number };
        byTime.push({ key: k, t: p.expires ?? 0 });
      } catch {
        localStorage.removeItem(k);
      }
    }
    byTime.sort((a, b) => a.t - b.t);
    for (let i = 0; i < byTime.length - STORAGE_MAX_KEYS; i++) {
      localStorage.removeItem(byTime[i].key);
    }
  } catch {
    // ignore
  }
}

export function getDashboardData(period: string, widgetsKey: string): Record<string, Record<string, unknown>[]> | null {
  return get<Record<string, Record<string, unknown>[]>>(`dash-${period}-${widgetsKey}`, TTL_DASH_MS);
}

export function setDashboardData(period: string, widgetsKey: string, data: Record<string, Record<string, unknown>[]>): void {
  set(`dash-${period}-${widgetsKey}`, data, TTL_DASH_MS, true);
}

export function getDetailData(metric: string, period: string): Record<string, Record<string, unknown>[]> | null {
  return get<Record<string, Record<string, unknown>[]>>(`detail-${metric}-${period}`, TTL_DASH_MS);
}

export function setDetailData(metric: string, period: string, data: Record<string, Record<string, unknown>[]>): void {
  set(`detail-${metric}-${period}`, data, TTL_DASH_MS, false);
}

export function getManagerDrillData(managerId: string, period: string): { manager_id: number; manager_name: string; period: string; deals: unknown[] } | null {
  return get(`drill-m-${managerId}-${period}`, TTL_DRILL_MS);
}

export function setManagerDrillData(managerId: string, period: string, data: { manager_id: number; manager_name: string; period: string; deals: unknown[] }): void {
  set(`drill-m-${managerId}-${period}`, data, TTL_DRILL_MS, false);
}

export function getChannelDrillData(channel: string, period: string): { channel: string; period: string; leads: unknown[] } | null {
  return get(`drill-c-${channel}-${period}`, TTL_DRILL_MS);
}

export function setChannelDrillData(channel: string, period: string, data: { channel: string; period: string; leads: unknown[] }): void {
  set(`drill-c-${channel}-${period}`, data, TTL_DRILL_MS, false);
}

export function getHouseDrillData(houseId: string, period: string): HouseDrillPayload | null {
  return get<HouseDrillPayload>(`drill-h-${houseId}-${period}`, TTL_DRILL_MS);
}

export function setHouseDrillData(houseId: string, period: string, data: HouseDrillPayload): void {
  set(`drill-h-${houseId}-${period}`, data, TTL_DRILL_MS, false);
}

/** Кэш данных воронки продаж (по периоду start–end). */
export function getFunnelData(start: string, end: string): Record<string, unknown> | null {
  return get<Record<string, unknown>>(`funnel-${start}-${end}`, TTL_DASH_MS);
}

export function setFunnelData(start: string, end: string, data: Record<string, unknown>): void {
  set(`funnel-${start}-${end}`, data, TTL_DASH_MS, true);
}

export interface HouseDrillPayload {
  house_id: number;
  house_name: string;
  period: string;
  start: string;
  end: string;
  payments: { finance_id: unknown; date_to: string; summa: number; status_name: string; flat_number: string }[];
  deals: { deal_id: number; deal_date: string; deal_sum: number; status_name: string; client_name: string; flat_number: string }[];
  leads?: { lead_id: number; created_at: string; channel: string; has_deal: number; client_name: string; client_phone: string; status_name: string; manager_name: string }[];
  total_payments: number;
  total_deals_sum: number;
}

const PREFETCH_WIDGETS: Record<string, string[]> = {
  deals: ["summary", "managers_performance", "deals_by_month", "deals_by_status"],
  revenue: ["summary", "deals_amount_by_month", "managers_performance", "plan_vs_fact"],
  leads: ["summary", "leads_by_channel", "leads_funnel", "conversion_by_channel"],
  conversion: ["summary", "conversion_by_channel", "leads_funnel"],
  debt: ["summary", "debt_by_house", "payment_incoming"],
};

const FETCH_OPTS = { credentials: "include" as RequestCredentials };

/** Фоновая подгрузка данных детализации для текущего периода (вызывать после загрузки дашборда). */
export function prefetchDetailData(period: string): void {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return;
  for (const [metric, widgets] of Object.entries(PREFETCH_WIDGETS)) {
    const key = `detail-${metric}-${period}`;
    if (memory.has(key)) continue;
    const url = `/api/dashboard/data?period=${encodeURIComponent(period)}&widgets=${widgets.join(",")}`;
    fetch(url, FETCH_OPTS)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json) set(key, json, TTL_DASH_MS, false);
      })
      .catch(() => {});
  }
}

/** Предзагрузка одного отчёта детализации (при наведении на ссылку в сайдбаре). */
export function prefetchDetailMetric(metric: string, period: string): void {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return;
  const widgets = PREFETCH_WIDGETS[metric];
  if (!widgets || getDetailData(metric, period)) return;
  const url = `/api/dashboard/data?period=${encodeURIComponent(period)}&widgets=${widgets.join(",")}`;
  fetch(url, FETCH_OPTS)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json) setDetailData(metric, period, json);
    })
    .catch(() => {});
}

/** Предзагрузка страницы провала по менеджеру при наведении на ссылку. */
export function prefetchManagerDrill(managerId: string, period: string): void {
  if (!managerId || !period || getManagerDrillData(managerId, period)) return;
  fetch(`/api/dashboard/drill/manager?manager_id=${encodeURIComponent(managerId)}&period=${encodeURIComponent(period)}`, FETCH_OPTS)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json && typeof json.manager_id === "number") setManagerDrillData(managerId, period, json);
    })
    .catch(() => {});
}

/** Предзагрузка страницы провала по каналу при наведении на ссылку. */
export function prefetchChannelDrill(channel: string, period: string): void {
  if (!channel || !period || getChannelDrillData(channel, period)) return;
  fetch(`/api/dashboard/drill/channel?channel=${encodeURIComponent(channel)}&period=${encodeURIComponent(period)}`, FETCH_OPTS)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json && json.channel != null) setChannelDrillData(channel, period, json);
    })
    .catch(() => {});
}

/** Предзагрузка страницы провала по объекту при наведении на ссылку. */
export function prefetchHouseDrill(houseId: string, period: string): void {
  if (!houseId || !period || getHouseDrillData(houseId, period)) return;
  fetch(`/api/dashboard/drill/house?house_id=${encodeURIComponent(houseId)}&period=${encodeURIComponent(period)}`, FETCH_OPTS)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json && typeof json.house_id === "number") setHouseDrillData(houseId, period, json as HouseDrillPayload);
    })
    .catch(() => {});
}
