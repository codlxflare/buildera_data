"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { getHouseDrillData, setHouseDrillData, type HouseDrillPayload } from "@/app/lib/dashboardCache";
import { getMonthOptions } from "@/app/lib/periodUtils";

const FETCH_OPTS = { credentials: "include" as RequestCredentials };

function formatMoney(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₸";
}

function formatDate(s: string): string {
  if (!s) return "—";
  const d = String(s).slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}

function HouseDrillContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const period = searchParams.get("period") || "";

  const [data, setData] = useState<HouseDrillPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterLeadStatus, setFilterLeadStatus] = useState("");
  const [filterLeadManager, setFilterLeadManager] = useState("");
  const [filterDealStatus, setFilterDealStatus] = useState("");

  const loadData = useCallback(async () => {
    if (!id || !period) {
      setLoading(false);
      setError("Укажите период в URL");
      return;
    }
    const fromCache = getHouseDrillData(id, period);
    if (fromCache) {
      setData(fromCache);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/drill/house?house_id=${encodeURIComponent(id)}&period=${encodeURIComponent(period)}`,
        FETCH_OPTS
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || res.statusText);
      }
      const json = (await res.json()) as HouseDrillPayload;
      setHouseDrillData(id, period, json);
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
  const defaultBackHref = `/dashboard/detail?metric=debt&period=${encodeURIComponent(period)}`;
  const backHref = returnUrl && returnUrl.startsWith("/") ? returnUrl : defaultBackHref;
  const backLabel = returnUrl ? (returnUrl.includes("/funnel") ? "К воронке" : returnUrl.includes("/dashboard/detail") ? "К детализации" : "На дашборд") : "К детализации";
  const dashboardHref = `/dashboard${period ? `?period=${encodeURIComponent(period)}` : ""}`;

  const router = useRouter();
  const monthOptions = useMemo(() => getMonthOptions(24), []);
  const leadFilters = useMemo(() => {
    const leads = data?.leads ?? [];
    if (!leads.length) return { statuses: [] as string[], managers: [] as string[] };
    const statuses = Array.from(new Set(leads.map((l) => String(l.status_name ?? "—").trim()).filter(Boolean))).sort();
    const managers = Array.from(new Set(leads.map((l) => String(l.manager_name ?? "—").trim()).filter(Boolean))).sort();
    return { statuses, managers };
  }, [data?.leads]);
  const dealFilters = useMemo(() => {
    const deals = data?.deals ?? [];
    if (!deals.length) return [] as string[];
    return Array.from(new Set(deals.map((d) => String(d.status_name ?? "—").trim()).filter(Boolean))).sort();
  }, [data?.deals]);
  const filteredLeads = useMemo(() => {
    const leads = data?.leads ?? [];
    if (!filterLeadStatus && !filterLeadManager) return leads;
    return leads.filter((l) => {
      if (filterLeadStatus && String(l.status_name ?? "—").trim() !== filterLeadStatus) return false;
      if (filterLeadManager && String(l.manager_name ?? "—").trim() !== filterLeadManager) return false;
      return true;
    });
  }, [data?.leads, filterLeadStatus, filterLeadManager]);
  const filteredDeals = useMemo(() => {
    const deals = data?.deals ?? [];
    if (!filterDealStatus) return deals;
    return deals.filter((d) => String(d.status_name ?? "—").trim() === filterDealStatus);
  }, [data?.deals, filterDealStatus]);
  const handlePeriodChange = useCallback(
    (newPeriod: string) => {
      if (!id || !/^\d{4}-\d{2}$/.test(newPeriod)) return;
      const params = new URLSearchParams({ period: newPeriod });
      if (returnUrl) params.set("return", returnUrl);
      router.push(`/dashboard/drill/house/${id}?${params.toString()}`);
    },
    [id, returnUrl, router]
  );

  if (!id) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-slate-500">Не указан объект</div>
        <Link href="/dashboard" className="ml-4 text-accent hover:underline">На дашборд</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <TopNav
        title={data ? `Объект: ${data.house_name}` : "Объект"}
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
              Дашборд
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
            {(data?.leads?.length && (leadFilters.statuses.length > 0 || leadFilters.managers.length > 0)) ? (
              <>
                {leadFilters.statuses.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Статус заявки</span>
                    <select value={filterLeadStatus} onChange={(e) => setFilterLeadStatus(e.target.value)} className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none">
                      <option value="">Все</option>
                      {leadFilters.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {leadFilters.managers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Менеджер</span>
                    <select value={filterLeadManager} onChange={(e) => setFilterLeadManager(e.target.value)} className="h-9 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none">
                      <option value="">Все</option>
                      {leadFilters.managers.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </>
            ) : null}
            {data?.deals?.length && dealFilters.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Статус сделки</span>
                <select value={filterDealStatus} onChange={(e) => setFilterDealStatus(e.target.value)} className="h-9 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] focus:outline-none">
                  <option value="">Все</option>
                  {dealFilters.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">
            {error}
          </div>
        )}
        {loading && !data && (
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-12 text-center text-slate-500">
            Загрузка…
          </div>
        )}
        {data && (
          <>
            <section className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Заявок за период</p>
                <p className="text-xl font-bold text-slate-900">{filteredLeads.length}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Платежи за период</p>
                <p className="text-xl font-bold text-slate-900">{formatMoney(data.total_payments)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Сделки (сумма)</p>
                <p className="text-xl font-bold text-slate-900">{formatMoney(data.total_deals_sum)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Операций к оплате</p>
                <p className="text-xl font-bold text-slate-900">{data.payments.length}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Сделок</p>
                <p className="text-xl font-bold text-slate-900">{filteredDeals.length}</p>
              </div>
            </section>

            {(data.leads?.length ?? 0) > 0 && (
              <section className="rounded-2xl border border-[#e2e8f0] bg-white overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-[#f0f4f8] bg-[#fafbfc]">
                  <h2 className="font-semibold text-slate-800">Заявки по объекту</h2>
                  <p className="text-xs text-slate-500 mt-1">Контакт, канал, статус и менеджер по каждой заявке за период</p>
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
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Нет заявок по выбранным фильтрам</td>
                        </tr>
                      ) : filteredLeads.map((row) => (
                        <tr key={row.lead_id} className="border-b border-[#f0f4f8] hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{formatDate(row.created_at)}</td>
                          <td className="px-4 py-3 text-slate-800 max-w-[180px] truncate" title={row.client_name}>{row.client_name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{row.client_phone ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-800">{row.channel}</td>
                          <td className="px-4 py-3 text-slate-600">{row.status_name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{row.manager_name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-800">{row.has_deal ? "Да" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {data.payments.length > 0 && (
              <section className="rounded-2xl border border-[#e2e8f0] bg-white overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-[#f0f4f8] bg-[#fafbfc]">
                  <h2 className="font-semibold text-slate-800">Платежи по объекту</h2>
                  <p className="text-xs text-slate-500 mt-1">График платежей за выбранный период</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-slate-50/80">
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Дата</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Квартира</th>
                        <th className="text-right px-4 py-3 font-semibold text-slate-600">Сумма</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((row, i) => (
                        <tr key={i} className="border-b border-[#f0f4f8] hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-slate-800">{formatDate(row.date_to)}</td>
                          <td className="px-4 py-3 text-slate-800">{row.flat_number}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800">{formatMoney(row.summa)}</td>
                          <td className="px-4 py-3 text-slate-600">{row.status_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {(data.deals?.length ?? 0) > 0 && (
              <section className="rounded-2xl border border-[#e2e8f0] bg-white overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-[#f0f4f8] bg-[#fafbfc]">
                  <h2 className="font-semibold text-slate-800">Сделки по объекту</h2>
                  <p className="text-xs text-slate-500 mt-1">За период</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-slate-50/80">
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Дата</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Клиент</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Квартира</th>
                        <th className="text-right px-4 py-3 font-semibold text-slate-600">Сумма</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeals.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Нет сделок по выбранным фильтрам</td>
                        </tr>
                      ) : filteredDeals.map((row, i) => (
                        <tr key={i} className="border-b border-[#f0f4f8] hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-slate-800">{formatDate(row.deal_date)}</td>
                          <td className="px-4 py-3 text-slate-800">{row.client_name}</td>
                          <td className="px-4 py-3 text-slate-800">{row.flat_number}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800">{formatMoney(row.deal_sum)}</td>
                          <td className="px-4 py-3 text-slate-600">{row.status_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {!loading && data.payments.length === 0 && data.deals.length === 0 && (data.leads?.length ?? 0) === 0 && (
              <div className="rounded-2xl border border-[#e2e8f0] bg-white p-8 text-center text-slate-500">
                За период нет заявок, платежей и сделок по этому объекту.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function HouseDrillPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center text-slate-500">Загрузка…</div>
    }>
      <HouseDrillContent />
    </Suspense>
  );
}
