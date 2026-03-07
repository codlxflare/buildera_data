"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { getManagerDrillData, setManagerDrillData } from "@/app/lib/dashboardCache";
import { getMonthOptions } from "@/app/lib/periodUtils";

const FETCH_OPTS = { credentials: "include" as RequestCredentials };

interface DealRow {
  deal_id: number;
  deal_date: string;
  deal_sum: number;
  deal_status: number;
  status_name: string;
  client_name: string;
  house_name: string;
  flat_number: string;
}

interface ApiResponse {
  manager_id: number;
  manager_name: string;
  period: string;
  start: string;
  end: string;
  deals: DealRow[];
}

function formatMoney(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₸";
}

function formatDate(s: string): string {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

export default function ManagerDrillPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const period = searchParams.get("period") || "";

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterHouse, setFilterHouse] = useState("");

  const loadData = useCallback(async () => {
    if (!id || !period) {
      setLoading(false);
      setError("Укажите период в URL");
      return;
    }
    const fromCache = getManagerDrillData(id, period);
    if (fromCache) {
      setData(fromCache as ApiResponse);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/drill/manager?manager_id=${encodeURIComponent(id)}&period=${encodeURIComponent(period)}`,
        FETCH_OPTS
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || res.statusText);
      }
      const json = (await res.json()) as ApiResponse;
      setManagerDrillData(id, period, json);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      if (!fromCache) setData(null);
    } finally {
      setLoading(false);
    }
  }, [id, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const periodLabel = useMemo(() => {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return period || "период";
    const [y, m] = period.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }, [period]);

  const returnUrl = searchParams.get("return") || "";
  const defaultBackHref = `/dashboard/detail?metric=deals&period=${encodeURIComponent(period)}`;
  const backHref = returnUrl && returnUrl.startsWith("/") ? returnUrl : defaultBackHref;
  const backLabel = returnUrl ? (returnUrl.includes("/funnel") ? "К воронке" : returnUrl.includes("/dashboard/detail") ? "К детализации" : "Назад") : "К детализации";
  const dashboardHref = `/dashboard${period ? `?period=${encodeURIComponent(period)}` : ""}`;

  const router = useRouter();
  const monthOptions = useMemo(() => getMonthOptions(24), []);
  const dealFilters = useMemo(() => {
    if (!data?.deals?.length) return { statuses: [] as string[], houses: [] as string[] };
    const statuses = Array.from(new Set(data.deals.map((d) => String(d.status_name ?? "—").trim()).filter(Boolean))).sort();
    const houses = Array.from(new Set(data.deals.map((d) => String(d.house_name ?? "—").trim()).filter(Boolean))).sort();
    return { statuses, houses };
  }, [data?.deals]);
  const filteredDeals = useMemo(() => {
    if (!data?.deals) return [];
    let list = data.deals;
    if (filterStatus) list = list.filter((d) => String(d.status_name ?? "—").trim() === filterStatus);
    if (filterHouse) list = list.filter((d) => String(d.house_name ?? "—").trim() === filterHouse);
    return list;
  }, [data?.deals, filterStatus, filterHouse]);
  const handlePeriodChange = useCallback(
    (newPeriod: string) => {
      if (!id || !/^\d{4}-\d{2}$/.test(newPeriod)) return;
      const params = new URLSearchParams({ period: newPeriod });
      if (returnUrl) params.set("return", returnUrl);
      router.push(`/dashboard/drill/manager/${id}?${params.toString()}`);
    },
    [id, returnUrl, router]
  );

  if (!id) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-slate-500">Не указан ID менеджера</div>
        <Link href="/dashboard" className="ml-4 text-accent hover:underline">На дашборд</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <TopNav
        title={data ? `Сделки: ${data.manager_name}` : "Сделки менеджера"}
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
            {data?.deals?.length ? (
              <>
                {dealFilters.statuses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Статус сделки</span>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none">
                      <option value="">Все</option>
                      {dealFilters.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {dealFilters.houses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Объект</span>
                    <select value={filterHouse} onChange={(e) => setFilterHouse(e.target.value)} className="h-9 min-w-[160px] max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none">
                      <option value="">Все</option>
                      {dealFilters.houses.map((h) => <option key={h} value={h}>{h}</option>)}
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
            <Link href={backHref} className="block mt-3 text-accent hover:underline">Вернуться к детализации</Link>
          </div>
        )}

        {data && !loading && (
          <>
            <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm mb-6">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Итого за {periodLabel}</h2>
              <p className="text-2xl font-bold text-slate-900">{filteredDeals.length} сделок</p>
              <p className="text-slate-600 mt-1">
                Сумма: <strong>{formatMoney(filteredDeals.reduce((s, d) => s + d.deal_sum, 0))}</strong>
                {(filterStatus || filterHouse) && <span className="text-slate-400 ml-1">(отфильтровано)</span>}
              </p>
            </section>

            <section className="rounded-2xl border border-[#e2e8f0] bg-white overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-[#f0f4f8] bg-[#fafbfc]">
                <h3 className="font-semibold text-slate-800">Все сделки менеджера</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] bg-slate-50/80">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Дата</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Клиент</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Дом</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Квартира</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Сумма</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeals.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          {data.deals.length === 0 ? "Нет сделок за выбранный период" : "Нет сделок по выбранным фильтрам"}
                        </td>
                      </tr>
                    ) : (
                      filteredDeals.map((row) => (
                        <tr key={row.deal_id} className="border-b border-[#f0f4f8] hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-slate-800">{formatDate(row.deal_date)}</td>
                          <td className="px-4 py-3 text-slate-800">{row.client_name}</td>
                          <td className="px-4 py-3 text-slate-800">{row.house_name}</td>
                          <td className="px-4 py-3 text-slate-800">{row.flat_number}</td>
                          <td className="px-4 py-3 text-slate-800 font-medium">{formatMoney(row.deal_sum)}</td>
                          <td className="px-4 py-3 text-slate-800">{row.status_name}</td>
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
