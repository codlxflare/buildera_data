"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import type { WidgetKey } from "@/app/lib/dashboardQueries";
import { getDetailData, setDetailData, prefetchManagerDrill, prefetchChannelDrill, prefetchHouseDrill } from "@/app/lib/dashboardCache";
import { getCurrentPeriod, getMonthOptions } from "@/app/lib/periodUtils";

const FETCH_OPTS = { credentials: "include" as RequestCredentials };

const METRIC_OPTIONS = [
  { key: "deals", label: "Сделки" },
  { key: "revenue", label: "Выручка" },
  { key: "leads", label: "Заявки" },
  { key: "conversion", label: "Конверсия" },
  { key: "debt", label: "К оплате" },
  { key: "properties", label: "В продаже" },
] as const;

const METRIC_CONFIG: Record<
  string,
  { title: string; widgets: WidgetKey[]; tables: { key: WidgetKey; title: string; columns: { key: string; label: string; format?: "money" | "number" | "percent" }[] }[] }
> = {
  deals: {
    title: "Сделки за период",
    widgets: ["summary", "managers_performance", "deals_by_month", "deals_by_status"],
    tables: [
      { key: "managers_performance", title: "По менеджерам", columns: [{ key: "manager", label: "Менеджер" }, { key: "deals_count", label: "Сделок", format: "number" }, { key: "deals_amount", label: "Сумма, ₸", format: "money" }] },
      { key: "deals_by_status", title: "По статусам", columns: [{ key: "status_name", label: "Статус" }, { key: "cnt", label: "Кол-во", format: "number" }] },
    ],
  },
  revenue: {
    title: "Выручка",
    widgets: ["summary", "deals_amount_by_month", "managers_performance", "plan_vs_fact"],
    tables: [
      { key: "managers_performance", title: "По менеджерам", columns: [{ key: "manager", label: "Менеджер" }, { key: "deals_count", label: "Сделок", format: "number" }, { key: "deals_amount", label: "Сумма, ₸", format: "money" }] },
      { key: "deals_amount_by_month", title: "По месяцам", columns: [{ key: "month", label: "Месяц" }, { key: "cnt", label: "Сделок", format: "number" }, { key: "amount", label: "Сумма, ₸", format: "money" }] },
      { key: "plan_vs_fact", title: "План vs Факт", columns: [{ key: "month", label: "Месяц" }, { key: "plan_amount", label: "План, ₸", format: "money" }, { key: "fact_amount", label: "Факт, ₸", format: "money" }] },
    ],
  },
  leads: {
    title: "Заявки",
    widgets: ["summary", "leads_by_channel", "leads_funnel", "conversion_by_channel"],
    tables: [
      { key: "leads_by_channel", title: "По каналам", columns: [{ key: "channel", label: "Канал" }, { key: "cnt", label: "Заявок", format: "number" }] },
      { key: "conversion_by_channel", title: "Конверсия по каналам", columns: [{ key: "channel", label: "Канал" }, { key: "leads", label: "Заявок", format: "number" }, { key: "deals", label: "Сделок", format: "number" }, { key: "conversion", label: "Конверсия %", format: "percent" }] },
      { key: "leads_funnel", title: "Воронка", columns: [{ key: "stage", label: "Этап" }, { key: "cnt", label: "Кол-во", format: "number" }] },
    ],
  },
  conversion: {
    title: "Конверсия",
    widgets: ["summary", "conversion_by_channel", "leads_funnel"],
    tables: [
      { key: "conversion_by_channel", title: "По каналам", columns: [{ key: "channel", label: "Канал" }, { key: "leads", label: "Заявок", format: "number" }, { key: "deals", label: "Сделок", format: "number" }, { key: "conversion", label: "Конверсия %", format: "percent" }] },
      { key: "leads_funnel", title: "Воронка", columns: [{ key: "stage", label: "Этап" }, { key: "cnt", label: "Кол-во", format: "number" }] },
    ],
  },
  debt: {
    title: "К оплате и просрочка",
    widgets: ["summary", "debt_by_house", "payment_incoming"],
    tables: [
      { key: "debt_by_house", title: "По домам", columns: [{ key: "house_name", label: "Дом" }, { key: "total", label: "Сумма, ₸", format: "money" }] },
      { key: "payment_incoming", title: "По статусам платежей", columns: [{ key: "payment_status", label: "Статус" }, { key: "cnt", label: "Операций", format: "number" }, { key: "total", label: "Сумма, ₸", format: "money" }] },
    ],
  },
  properties: {
    title: "В продаже",
    widgets: ["summary", "active_properties_list"],
    tables: [
      {
        key: "active_properties_list",
        title: "Объекты в продаже",
        columns: [
          { key: "house_name", label: "Объект / ЖК" },
          { key: "flat_number", label: "Квартира" },
          { key: "estate_area", label: "Площадь, м²", format: "number" },
          { key: "estate_price", label: "Цена, ₸", format: "money" },
        ],
      },
    ],
  },
};

function formatMoney(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₸";
}

function formatCell(value: unknown, format?: "money" | "number" | "percent"): string {
  if (value == null) return "—";
  const num = Number(value);
  if (format === "money") return formatMoney(num);
  if (format === "number") return num.toLocaleString("ru-RU");
  if (format === "percent") return `${num.toLocaleString("ru-RU")}%`;
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("ru-RU");
  return String(value);
}

function DashboardDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const metric = searchParams.get("metric") || "deals";
  const period = searchParams.get("period") || getCurrentPeriod();

  const config = METRIC_CONFIG[metric] ?? METRIC_CONFIG.deals;
  const [data, setData] = useState<Record<string, Record<string, unknown>[]>>({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{ manager: string; channel: string; status: string; house: string; payment_status: string }>({
    manager: "", channel: "", status: "", house: "", payment_status: "",
  });

  const periodLabel = useMemo(() => {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return "период";
    const [y, m] = period.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }, [period]);

  const monthOptions = useMemo(() => getMonthOptions(24), []);

  const handlePeriodChange = useCallback(
    (newPeriod: string) => {
      if (!/^\d{4}-\d{2}$/.test(newPeriod)) return;
      router.push(`/dashboard/detail?metric=${encodeURIComponent(metric)}&period=${encodeURIComponent(newPeriod)}`);
    },
    [metric, router]
  );

  const loadData = useCallback(async () => {
    if (!config.widgets.length) {
      setLoading(false);
      return;
    }
    const fromCache = getDetailData(metric, period);
    if (fromCache) {
      setData(fromCache);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const url = `/api/dashboard/data?period=${encodeURIComponent(period)}&widgets=${config.widgets.join(",")}`;
      const res = await fetch(url, FETCH_OPTS);
      if (!res.ok) throw new Error("Ошибка загрузки");
      const json = (await res.json()) as Record<string, Record<string, unknown>[]>;
      setDetailData(metric, period, json);
      setData(json);
    } catch {
      if (!fromCache) setData({});
    } finally {
      setLoading(false);
    }
  }, [period, config.widgets, metric]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setFilters({ manager: "", channel: "", status: "", house: "", payment_status: "" });
  }, [metric]);

  const summary = data.summary?.[0] as Record<string, unknown> | undefined;
  const backHref = `/dashboard${period ? `?period=${encodeURIComponent(period)}` : ""}`;

  const filterOptions = useMemo(() => {
    const managers = (data.managers_performance ?? []) as Record<string, unknown>[];
    const channels = (data.leads_by_channel ?? data.conversion_by_channel ?? []) as Record<string, unknown>[];
    const dealStatuses = (data.deals_by_status ?? []) as Record<string, unknown>[];
    const houses = (data.debt_by_house ?? []) as Record<string, unknown>[];
    const paymentStatuses = (data.payment_incoming ?? []) as Record<string, unknown>[];
    const propertyHouses = (data.active_properties_list ?? []) as Record<string, unknown>[];
    const houseNames = new Set([...houses.map((r) => String(r.house_name ?? "")), ...propertyHouses.map((r) => String(r.house_name ?? ""))].filter(Boolean));
    return {
      managers: Array.from(new Set(managers.map((r) => String(r.manager ?? "")).filter(Boolean))).sort(),
      channels: Array.from(new Set(channels.map((r) => String(r.channel ?? "")).filter(Boolean))).sort(),
      statuses: Array.from(new Set(dealStatuses.map((r) => String(r.status_name ?? "")).filter(Boolean))).sort(),
      houses: Array.from(houseNames).sort(),
      payment_statuses: Array.from(new Set(paymentStatuses.map((r) => String(r.payment_status ?? "")).filter(Boolean))).sort(),
    };
  }, [data]);

  const getFilteredRows = useCallback(
    (tableKey: string, rows: Record<string, unknown>[]): Record<string, unknown>[] => {
      if (!rows?.length) return rows ?? [];
      let out = rows;
      if (tableKey === "managers_performance" && filters.manager) {
        out = out.filter((r) => String(r.manager ?? "") === filters.manager);
      }
      if (tableKey === "deals_by_status" && filters.status) {
        out = out.filter((r) => String(r.status_name ?? "") === filters.status);
      }
      if ((tableKey === "leads_by_channel" || tableKey === "conversion_by_channel") && filters.channel) {
        out = out.filter((r) => String(r.channel ?? "") === filters.channel);
      }
      if (tableKey === "debt_by_house" && filters.house) {
        out = out.filter((r) => String(r.house_name ?? "") === filters.house);
      }
      if (tableKey === "payment_incoming" && filters.payment_status) {
        out = out.filter((r) => String(r.payment_status ?? "") === filters.payment_status);
      }
      if (tableKey === "active_properties_list" && filters.house) {
        out = out.filter((r) => String(r.house_name ?? "") === filters.house);
      }
      return out;
    },
    [filters]
  );

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <TopNav
        title={config.title}
        subtitle={periodLabel}
        className="sticky top-0 z-10 border-b border-[#e2e8f0] bg-white/95 backdrop-blur"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={backHref}
              className="ui-btn ui-btn-secondary gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              На дашборд
            </Link>
            {period && (
              <Link
                href={`/funnel?period=${encodeURIComponent(period)}`}
                className="ui-btn ui-btn-secondary gap-2"
              >
                Воронка
              </Link>
            )}
          </div>
        }
      />

      {/* Фильтры: период и тип отчёта */}
      <div className="sticky top-[var(--topnav-height,56px)] z-[9] border-b border-[#e2e8f0] bg-white/98 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Период</span>
              <select
                value={period}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="h-9 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Отчёт</span>
              <div className="flex flex-wrap gap-1">
                {METRIC_OPTIONS.map((opt) => (
                  <Link
                    key={opt.key}
                    href={`/dashboard/detail?metric=${opt.key}&period=${encodeURIComponent(period)}`}
                    className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      metric === opt.key
                        ? "bg-[#6366f1] text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {opt.label}
                  </Link>
                ))}
              </div>
            </div>
            {/* Фильтры по метрикам */}
            {(metric === "deals" || metric === "revenue") && (filterOptions.managers.length > 0 || filterOptions.statuses.length > 0) && (
              <>
                {metric === "deals" && filterOptions.statuses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Статус сделки</span>
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                      className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none"
                    >
                      <option value="">Все</option>
                      {filterOptions.statuses.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}
                {filterOptions.managers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Менеджер</span>
                    <select
                      value={filters.manager}
                      onChange={(e) => setFilters((f) => ({ ...f, manager: e.target.value }))}
                      className="h-9 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none"
                    >
                      <option value="">Все</option>
                      {filterOptions.managers.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            {(metric === "leads" || metric === "conversion") && filterOptions.channels.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Канал</span>
                <select
                  value={filters.channel}
                  onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
                  className="h-9 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none"
                >
                  <option value="">Все</option>
                  {filterOptions.channels.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
            {metric === "debt" && (filterOptions.houses.length > 0 || filterOptions.payment_statuses.length > 0) && (
              <>
                {filterOptions.houses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Объект</span>
                    <select
                      value={filters.house}
                      onChange={(e) => setFilters((f) => ({ ...f, house: e.target.value }))}
                      className="h-9 min-w-[180px] max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none truncate"
                    >
                      <option value="">Все</option>
                      {filterOptions.houses.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                )}
                {filterOptions.payment_statuses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Статус платежа</span>
                    <select
                      value={filters.payment_status}
                      onChange={(e) => setFilters((f) => ({ ...f, payment_status: e.target.value }))}
                      className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none"
                    >
                      <option value="">Все</option>
                      {filterOptions.payment_statuses.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            {metric === "properties" && filterOptions.houses.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Объект / ЖК</span>
                <select
                  value={filters.house}
                  onChange={(e) => setFilters((f) => ({ ...f, house: e.target.value }))}
                  className="h-9 min-w-[180px] max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none"
                >
                  <option value="">Все</option>
                  {filterOptions.houses.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Краткий итог по метрике */}
        {summary && metric !== "properties" && (
          <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Итого за {periodLabel}</h2>
            <div className="flex flex-wrap gap-6">
              {metric === "deals" && (
                <>
                  <div><span className="text-2xl font-bold text-slate-900">{Number(summary.completed_deals ?? 0).toLocaleString("ru-RU")}</span><span className="text-slate-500 ml-2">завершённых сделок</span></div>
                  <div><span className="text-2xl font-bold text-slate-900">{formatMoney(Number(summary.total_deal_amount ?? 0))}</span><span className="text-slate-500 ml-2">выручка</span></div>
                </>
              )}
              {metric === "revenue" && (
                <div><span className="text-2xl font-bold text-slate-900">{formatMoney(Number(summary.total_deal_amount ?? 0))}</span><span className="text-slate-500 ml-2">выручка</span></div>
              )}
              {metric === "leads" && (
                <>
                  <div><span className="text-2xl font-bold text-slate-900">{Number(summary.total_leads ?? 0).toLocaleString("ru-RU")}</span><span className="text-slate-500 ml-2">заявок</span></div>
                  <div><span className="text-2xl font-bold text-slate-900">{Number(summary.leads_with_deal ?? 0).toLocaleString("ru-RU")}</span><span className="text-slate-500 ml-2">со сделкой</span></div>
                </>
              )}
              {metric === "conversion" && summary.total_leads != null && (
                <div>
                  <span className="text-2xl font-bold text-slate-900">
                    {Number(summary.total_leads) > 0
                      ? (Math.round((Number(summary.completed_deals ?? 0) / Number(summary.total_leads)) * 1000) / 10)
                      : 0}%
                  </span>
                  <span className="text-slate-500 ml-2">заявки → сделки</span>
                </div>
              )}
              {metric === "debt" && (
                <>
                  <div><span className="text-2xl font-bold text-slate-900">{formatMoney(Number(summary.total_debt ?? 0))}</span><span className="text-slate-500 ml-2">к оплате</span></div>
                  {Number(summary.overdue_debt ?? 0) > 0 && (
                    <div><span className="text-2xl font-bold text-amber-600">{formatMoney(Number(summary.overdue_debt ?? 0))}</span><span className="text-slate-500 ml-2">просрочено</span></div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {metric === "properties" && summary && (
          <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Активных лотов</h2>
            <p className="text-2xl font-bold text-slate-900">{Number(summary.active_properties ?? 0).toLocaleString("ru-RU")}</p>
          </section>
        )}

        {metric === "conversion" && (
          <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
            <Link href={`/funnel?period=${encodeURIComponent(period)}`} className="ui-btn ui-btn-primary inline-flex items-center gap-2">
              Воронка продаж
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
            <p className="text-sm text-slate-500 mt-2">Полная воронка с этапами и динамикой на отдельной странице.</p>
          </section>
        )}

        {loading ? (
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-12 text-center text-slate-500">
            Загрузка…
          </div>
        ) : (
          <>
          {metric === "properties" && summary && (!data.active_properties_list || data.active_properties_list.length === 0) && !loading && (
            <section className="rounded-2xl border border-[#e2e8f0] bg-white p-8 text-center text-slate-500">
              Нет объектов в продаже.
            </section>
          )}
          {config.tables.map(({ key, title, columns }) => {
            const rawRows = (data[key] ?? []) as Record<string, unknown>[];
            const rows = getFilteredRows(key, rawRows);
            if (!rawRows?.length) return null;
            return (
              <section key={key} className="rounded-2xl border border-[#e2e8f0] bg-white overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-[#f0f4f8] bg-[#fafbfc]">
                  <h3 className="font-semibold text-slate-800">{title}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-slate-50/80">
                        {columns.map((col) => (
                          <th key={col.key} className="text-left px-4 py-3 font-semibold text-slate-600">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={columns.length} className="px-4 py-6 text-center text-slate-500">
                            Нет данных по выбранным фильтрам
                          </td>
                        </tr>
                      ) : (
                      rows.map((row, i) => (
                        <tr key={i} className="border-b border-[#f0f4f8] hover:bg-slate-50/50">
                          {columns.map((col) => {
                            const cellValue = formatCell(row[col.key], col.format);
                            const isManagerLink = key === "managers_performance" && col.key === "manager" && row.manager_id != null && Number(row.manager_id) > 0;
                            const isChannelLink = (key === "leads_by_channel" || key === "conversion_by_channel") && col.key === "channel" && row.channel != null;
                            const isHouseLink = (key === "debt_by_house" || key === "active_properties_list") && col.key === "house_name" && row.house_id != null && Number(row.house_id) > 0;
                            const channelName = isChannelLink ? String(row.channel) : "";
                            const returnToDetail = `/dashboard/detail?metric=${metric}&period=${period}`;
                            return (
                              <td key={col.key} className="px-4 py-3 text-slate-800">
                                {isManagerLink ? (
                                  <Link
                                    href={`/dashboard/drill/manager/${String(row.manager_id)}?period=${encodeURIComponent(period)}&return=${encodeURIComponent(returnToDetail)}`}
                                    className="text-accent hover:underline font-medium"
                                    onMouseEnter={() => prefetchManagerDrill(String(row.manager_id), period)}
                                  >
                                    {cellValue}
                                  </Link>
                                ) : isChannelLink ? (
                                  <Link
                                    href={`/dashboard/drill/channel?channel=${encodeURIComponent(channelName)}&period=${encodeURIComponent(period)}&return=${encodeURIComponent(returnToDetail)}`}
                                    className="text-accent hover:underline font-medium"
                                    onMouseEnter={() => prefetchChannelDrill(channelName, period)}
                                  >
                                    {cellValue}
                                  </Link>
                                ) : isHouseLink ? (
                                  <Link
                                    href={`/dashboard/drill/house/${String(row.house_id)}?period=${encodeURIComponent(period)}&return=${encodeURIComponent(returnToDetail)}`}
                                    className="text-accent hover:underline font-medium"
                                    onMouseEnter={() => prefetchHouseDrill(String(row.house_id), period)}
                                  >
                                    {cellValue}
                                  </Link>
                                ) : (
                                  cellValue
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          </>
        )}
      </main>
    </div>
  );
}

export default function DashboardDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-slate-500">Загрузка…</div>
      </div>
    }>
      <DashboardDetailContent />
    </Suspense>
  );
}
