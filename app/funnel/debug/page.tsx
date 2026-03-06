"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import TopNav from "@/app/components/TopNav";

const SECURITY_FETCH = { credentials: "include" as RequestCredentials };

function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 font-semibold text-slate-800 text-sm">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Table({ data, columns }: { data: unknown[]; columns: string[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <p className="text-slate-500 text-sm">Нет данных</p>;
  }
  const rows = data as Record<string, unknown>[];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((col) => (
              <th key={col} className="text-left py-2 px-2 font-semibold text-slate-500 uppercase">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
              {columns.map((col) => (
                <td key={col} className="py-2 px-2 text-slate-700">
                  {row[col] != null ? String(row[col]) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FunnelDebugPage() {
  const [start, setStart] = useState(getMonthStart());
  const [end, setEnd] = useState(getToday());
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", SECURITY_FETCH)
      .then((r) => r.json())
      .then((d) => {
        setAuthenticated(d?.authenticated !== false);
        setAuthChecked(true);
      })
      .catch(() => {
        setAuthenticated(false);
        setAuthChecked(true);
      });
  }, []);

  const load = () => {
    if (!authenticated) return;
    setLoading(true);
    setError(null);
    fetch(`/api/funnel/debug?start=${start}&end=${end}`, SECURITY_FETCH)
      .then((r) => {
        if (!r.ok) throw new Error(`Ошибка ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authenticated) load();
  }, [authenticated]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-indigo-500/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }
  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <p className="text-slate-600 text-sm">Войдите в систему для просмотра отладки.</p>
        <Link href="/" className="ui-btn ui-btn-primary">На главную</Link>
      </div>
    );
  }

  const leads = data?.leads as Record<string, unknown> | undefined;
  const deals = data?.deals as Record<string, unknown> | undefined;
  const funnel = data?.funnel_metrics as Record<string, unknown> | undefined;
  const houseDebug = data?.house_debug as Record<string, unknown> | undefined;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TopNav
        title="Отладка воронки продаж"
        subtitle={data ? `Период: ${start} — ${end}` : "Проверка данных в таблицах"}
        icon={
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="ui-input !h-8 !w-32 text-sm" />
            <span className="text-slate-400">—</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="ui-input !h-8 !w-32 text-sm" />
            <button type="button" onClick={load} disabled={loading} className="ui-btn ui-btn-primary !h-8">
              {loading ? "Загрузка…" : "Обновить"}
            </button>
            <Link href="/funnel" className="ui-btn ui-btn-secondary !h-8">Воронка</Link>
          </div>
        }
      />

      <main className="flex-1 p-4 lg:p-6 space-y-4 max-w-6xl mx-auto w-full">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {data && (
          <>
            <Section title="Легенда">
              <pre className="text-xs text-slate-600 whitespace-pre-wrap">{JSON.stringify(data.legend, null, 2)}</pre>
            </Section>

            <Section title="Заявки (estate_buys) за период">
              <ul className="text-sm text-slate-700 space-y-1">
                <li><strong>Всего заявок:</strong> {leads?.total_in_period != null ? String(leads.total_in_period) : "—"}</li>
                <li><strong>Заполнение полей:</strong> {typeof leads?.columns_filled === "object" ? JSON.stringify(leads.columns_filled) : String(leads?.columns_filled ?? "—")}</li>
              </ul>
              <p className="text-xs text-slate-500 mt-2">По статусу заявки (estate_buys.status → estate_statuses):</p>
              <Table
                data={(() => {
                  const byStatus = (leads?.by_status as Record<string, unknown>[]) ?? [];
                  const names = (data.lead_status_names as Record<string, unknown>[]) ?? [];
                  const map = new Map(names.map((n) => [Number(n.status_id), String(n.status_name ?? "")]));
                  return byStatus.map((r) => ({ ...r, status_name: map.get(Number(r.status_id)) ?? "—" }));
                })()}
                columns={["status_id", "status_name", "cnt"]}
              />
              {Array.isArray(data.lead_status_names) && (data.lead_status_names as unknown[]).length > 0 && (
                <>
                  <p className="text-xs text-slate-500 mt-2">Справочник статусов заявок (estate_statuses):</p>
                  <Table data={data.lead_status_names as unknown[]} columns={["status_id", "status_name"]} />
                </>
              )}
            </Section>

            <Section title="Сделки (estate_deals) за период (по deal_date)">
              <ul className="text-sm text-slate-700 space-y-1">
                <li><strong>Всего сделок за период:</strong> {deals?.total_in_period != null ? String(deals.total_in_period) : "—"}</li>
                <li><strong>В работе / брони / завершено:</strong> {typeof deals?.in_work_reserved_completed === "object" ? JSON.stringify(deals.in_work_reserved_completed) : String(deals?.in_work_reserved_completed ?? "—")}</li>
                <li><strong>Заполнение полей (house_id, estate_sell_id):</strong> {typeof deals?.columns_filled === "object" ? JSON.stringify(deals.columns_filled) : String(deals?.columns_filled ?? "—")}</li>
              </ul>
              <p className="text-xs text-slate-500 mt-2">По deal_status:</p>
              <Table data={(deals?.by_status_raw as unknown[]) ?? []} columns={["status_id", "cnt"]} />
              {Array.isArray(data.deal_status_names) && (data.deal_status_names as unknown[]).length > 0 && (
                <>
                  <p className="text-xs text-slate-500 mt-2">Справочник статусов (estate_deals_statuses):</p>
                  <Table data={data.deal_status_names as unknown[]} columns={["status_id", "status_name"]} />
                </>
              )}
            </Section>

            <Section title="Метрики воронки">
              <ul className="text-sm text-slate-700 space-y-1">
                <li><strong>Заявок с хотя бы одной сделкой</strong> (заявки периода, у которых есть сделка): {funnel?.leads_with_any_deal != null ? String(funnel.leads_with_any_deal) : "—"}</li>
                <li><strong>Заявок с сделкой, датированной в периоде:</strong> {funnel?.leads_with_deal_in_period != null ? String(funnel.leads_with_deal_in_period) : "—"}</li>
              </ul>
            </Section>

            <Section title="Привязка к домам (для блока «Распределение по объектам»)">
              <p className="text-xs text-slate-500 mb-2">По house_id из сделок за период:</p>
              <Table data={(houseDebug?.by_deal_house_id as unknown[]) ?? []} columns={["house_id", "cnt"]} />
              <p className="text-xs text-slate-500 mt-3">По house_id / first_house_interest заявок за период:</p>
              <Table data={(houseDebug?.by_lead_house_id as unknown[]) ?? []} columns={["house_id", "cnt"]} />
              <p className="text-xs text-slate-500 mt-3">Справочник домов (первые 30):</p>
              <Table data={(houseDebug?.house_names as unknown[]) ?? []} columns={["house_id", "name", "public_house_name"]} />
            </Section>

            <Section title="Примеры заявок (последние 15 за период)">
              <Table
                data={(data.sample_leads as unknown[]) ?? []}
                columns={["id", "estate_buy_id", "created", "house_id", "first_house_interest", "estate_sell_id", "deals_count"]}
              />
            </Section>

            <Section title="Примеры сделок (последние 15 за период)">
              <Table
                data={(data.sample_deals as unknown[]) ?? []}
                columns={["deal_id", "estate_buy_id", "deal_date", "deal_status", "house_id", "estate_sell_id"]}
              />
            </Section>

            <Section title="Ряды для графиков воронки (timeSeries, dealsTimeSeries, reservedTimeSeries)">
              {(() => {
                const info = data.charts_info as Record<string, number> | undefined;
                const ts = (data.timeSeries as { dt: string; cnt: number }[]) ?? [];
                const dts = (data.dealsTimeSeries as { dt: string; cnt: number }[]) ?? [];
                const rts = (data.reservedTimeSeries as { dt: string; cnt: number }[]) ?? [];
                return (
                  <>
                    <p className="text-sm text-slate-600 mb-2">
                      Точно такие же запросы выполняет основной <code className="bg-slate-100 px-1 rounded">/api/funnel</code> для графиков на вкладках.
                    </p>
                    <ul className="text-sm text-slate-700 space-y-1 mb-3">
                      <li><strong>timeSeries</strong> (заявки по дням): {info?.timeSeries_points ?? ts.length} точек {info?.timeSeries_error != null && <span className="text-red-600"> — ошибка: {String(info.timeSeries_error)}</span>}</li>
                      <li><strong>dealsTimeSeries</strong> (проведённые сделки по дням): {info?.dealsTimeSeries_points ?? dts.length} точек {info?.dealsTimeSeries_error != null && <span className="text-red-600"> — ошибка: {String(info.dealsTimeSeries_error)}</span>}</li>
                      <li><strong>reservedTimeSeries</strong> (брони по дням): {info?.reservedTimeSeries_points ?? rts.length} точек {info?.reservedTimeSeries_error != null && <span className="text-red-600"> — ошибка: {String(info.reservedTimeSeries_error)}</span>}</li>
                    </ul>
                    {ts.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-slate-500 mb-1">timeSeries (первые 5):</p>
                        <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto">{JSON.stringify(ts.slice(0, 5), null, 2)}</pre>
                      </div>
                    )}
                    {dts.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-slate-500 mb-1">dealsTimeSeries (первые 5):</p>
                        <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto">{JSON.stringify(dts.slice(0, 5), null, 2)}</pre>
                      </div>
                    )}
                    {dts.length === 0 && (data.deals as Record<string, unknown>)?.in_work_reserved_completed && (
                      <p className="text-xs text-amber-600">dealsTimeSeries пустой при ненулевых проведённых — проверьте фильтр по дате (deal_date / deal_date_start) и deal_status = 150.</p>
                    )}
                    {rts.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">reservedTimeSeries (первые 5):</p>
                        <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto">{JSON.stringify(rts.slice(0, 5), null, 2)}</pre>
                      </div>
                    )}
                  </>
                );
              })()}
            </Section>

            <Section title="Полный ответ API (JSON)">
              <pre className="text-xs bg-slate-100 p-3 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap break-all">
                {JSON.stringify(data, null, 2)}
              </pre>
            </Section>
          </>
        )}
      </main>
    </div>
  );
}
