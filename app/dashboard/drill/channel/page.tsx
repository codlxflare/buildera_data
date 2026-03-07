"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { getChannelDrillData, setChannelDrillData } from "@/app/lib/dashboardCache";
import { getMonthOptions } from "@/app/lib/periodUtils";

const FETCH_OPTS = { credentials: "include" as RequestCredentials };

interface LeadRow {
  lead_id: number;
  created_at: string;
  channel: string;
  has_deal: number;
  client_name?: string;
  client_phone?: string;
  status_name?: string;
  manager_name?: string;
}

interface ApiResponse {
  channel: string;
  period: string;
  start: string;
  end: string;
  leads: LeadRow[];
}

function formatDate(s: string): string {
  if (!s) return "—";
  const d = typeof s === "string" && s.includes("T") ? s.slice(0, 19) : String(s).slice(0, 10);
  if (d.length === 10) {
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  }
  if (d.length >= 16) {
    const [datePart, timePart] = d.split("T");
    const [y, m, day] = datePart.split("-");
    return `${day}.${m}.${y} ${timePart.slice(0, 5)}`;
  }
  return d;
}

function ChannelDrillContent() {
  const searchParams = useSearchParams();
  const channel = searchParams.get("channel");
  const period = searchParams.get("period") || "";

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterManager, setFilterManager] = useState("");

  const loadData = useCallback(async () => {
    if (!channel || !period) {
      setLoading(false);
      setError("Укажите channel и period в URL");
      return;
    }
    const fromCache = getChannelDrillData(channel, period);
    if (fromCache) {
      setData(fromCache as ApiResponse);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/drill/channel?channel=${encodeURIComponent(channel)}&period=${encodeURIComponent(period)}`,
        FETCH_OPTS
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || res.statusText);
      }
      const json = (await res.json()) as ApiResponse;
      setChannelDrillData(channel, period, json);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      if (!fromCache) setData(null);
    } finally {
      setLoading(false);
    }
  }, [channel, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const periodLabel = useMemo(() => {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return period || "период";
    const [y, m] = period.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }, [period]);

  const returnUrl = searchParams.get("return") || "";
  const defaultBackHref = `/dashboard/detail?metric=leads&period=${encodeURIComponent(period)}`;
  const backHref = returnUrl && returnUrl.startsWith("/") ? returnUrl : defaultBackHref;
  const backLabel = returnUrl ? (returnUrl.includes("/funnel") ? "К воронке" : returnUrl.includes("/dashboard/detail") ? "К детализации" : "Назад") : "К детализации";
  const dashboardHref = `/dashboard${period ? `?period=${encodeURIComponent(period)}` : ""}`;

  const router = useRouter();
  const monthOptions = useMemo(() => getMonthOptions(24), []);
  const leadFilters = useMemo(() => {
    if (!data?.leads?.length) return { statuses: [] as string[], managers: [] as string[] };
    const statuses = Array.from(new Set(data.leads.map((l) => String(l.status_name ?? "—").trim()).filter(Boolean))).sort();
    const managers = Array.from(new Set(data.leads.map((l) => String(l.manager_name ?? "—").trim()).filter(Boolean))).sort();
    return { statuses, managers };
  }, [data?.leads]);
  const filteredLeads = useMemo(() => {
    if (!data?.leads) return [];
    let list = data.leads;
    if (filterStatus) list = list.filter((l) => String(l.status_name ?? "—").trim() === filterStatus);
    if (filterManager) list = list.filter((l) => String(l.manager_name ?? "—").trim() === filterManager);
    return list;
  }, [data?.leads, filterStatus, filterManager]);
  const handlePeriodChange = useCallback(
    (newPeriod: string) => {
      if (!channel || !/^\d{4}-\d{2}$/.test(newPeriod)) return;
      const params = new URLSearchParams({ channel, period: newPeriod });
      if (returnUrl) params.set("return", returnUrl);
      router.push(`/dashboard/drill/channel?${params.toString()}`);
    },
    [channel, returnUrl, router]
  );

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <TopNav
        title={data ? `Заявки: ${data.channel}` : "Заявки по каналу"}
        subtitle={periodLabel}
        className="sticky top-0 z-10 border-b border-[#e2e8f0] bg-white/95 backdrop-blur"
        actions={
          <div className="flex gap-2">
            <Link href={backHref} className="ui-btn ui-btn-secondary gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {backLabel}
            </Link>
            <Link href={dashboardHref} className="ui-btn ui-btn-secondary">
              На дашборд
            </Link>
          </div>
        }
      />

      <div className="sticky top-[57px] z-[9] border-b border-[#e2e8f0] bg-white/98 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
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
            {data?.leads?.length ? (
              <>
                {leadFilters.statuses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Статус заявки</span>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none">
                      <option value="">Все</option>
                      {leadFilters.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {leadFilters.managers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Менеджер</span>
                    <select value={filterManager} onChange={(e) => setFilterManager(e.target.value)} className="h-9 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none">
                      <option value="">Все</option>
                      {leadFilters.managers.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading && (
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-12 text-center text-slate-500">
            Загрузка…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
            {error}
            <Link href={backHref} className="block mt-3 text-accent hover:underline">Назад</Link>
          </div>
        )}

        {data && !loading && (
          <>
            <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm mb-6">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Итого за {periodLabel}</h2>
              <p className="text-2xl font-bold text-slate-900">{filteredLeads.length} заявок</p>
              <p className="text-slate-600 mt-1">
                Со сделкой: <strong>{filteredLeads.filter((l) => l.has_deal).length}</strong>
                {(filterStatus || filterManager) && <span className="text-slate-400 ml-1">(отфильтровано)</span>}
              </p>
            </section>

            <section className="rounded-2xl border border-[#e2e8f0] bg-white overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-[#f0f4f8] bg-[#fafbfc]">
                <h3 className="font-semibold text-slate-800">Список заявок</h3>
                <p className="text-xs text-slate-500 mt-1">Контакт, статус и менеджер по каждой заявке</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] bg-slate-50/80">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Дата</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Контакт</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Телефон</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Канал</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Статус</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Менеджер</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Сделка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          {data.leads.length === 0 ? "Нет заявок за выбранный период" : "Нет заявок по выбранным фильтрам"}
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((row) => (
                        <tr key={row.lead_id} className="border-b border-[#f0f4f8] hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{formatDate(row.created_at)}</td>
                          <td className="px-4 py-3 text-slate-800 max-w-[180px] truncate" title={row.client_name}>{row.client_name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{row.client_phone ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-800">{row.channel}</td>
                          <td className="px-4 py-3 text-slate-600">{row.status_name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{row.manager_name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-800">{row.has_deal ? "Да" : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function ChannelDrillPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-slate-500">Загрузка…</div>
      </div>
    }>
      <ChannelDrillContent />
    </Suspense>
  );
}
