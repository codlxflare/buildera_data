"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import type { WidgetKey } from "@/app/lib/dashboardQueries";
import type { ChartSpec } from "@/app/lib/chartSpec";
import { randomUUID } from "@/app/lib/uuid";
import ChartBlock from "@/app/components/ChartBlock";
import HoverTooltip from "@/app/components/HoverTooltip";
import TopNav from "@/app/components/TopNav";
import DashboardAiPanel from "./DashboardAiPanel";

/* ─── Constants ─────────────────────────────────────────────── */
const STORAGE_KEY = "macrodata-dashboards-v2";
const STORAGE_CUSTOM_KEY = "macrodata-custom-widgets";
const STORAGE_PERIOD_KEY = "macrodata-dashboard-period";
const FETCH_OPTS = { credentials: "include" as RequestCredentials };

const CHART_COLORS = [
  "#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b",
  "#ef4444", "#06b6d4", "#84cc16", "#ec4899",
];
const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 12,
  color: "#0f172a",
  boxShadow: "0 10px 40px -10px rgba(15, 23, 42, 0.25), 0 4px 12px -2px rgba(15, 23, 42, 0.08)",
  maxWidth: 320,
};
const AXIS_TICK = { fill: "#475569", fontSize: 11 };
const GRID_STROKE = "#e2e8f0";

/* ─── Types ──────────────────────────────────────────────────── */
interface CustomWidget {
  id: string;
  title: string;
  chartSpec: ChartSpec;
  prompt: string;
  createdAt: number;
}

type AnyWidgetId = WidgetKey | string; // custom = `custom:${uuid}`

interface StoredDashboard {
  id: string;
  name: string;
  widgetIds: AnyWidgetId[];
  createdAt: number;
}

interface DashboardState {
  dashboards: StoredDashboard[];
  activeId: string | null;
}

/* ─── Widget metadata ────────────────────────────────────────── */
const WIDGET_META: Record<WidgetKey, { label: string; desc: string; icon: string; span: "half" | "full" | "third" }> = {
  summary: { label: "KPI-сводка", desc: "Ключевые метрики за период", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", span: "full" },
  deals_by_month: { label: "Сделки по месяцам", desc: "Динамика количества сделок", icon: "M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z", span: "full" },
  deals_amount_by_month: { label: "Выручка по месяцам", desc: "Динамика суммы завершённых сделок", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", span: "full" },
  avg_check_by_month: { label: "Средний чек по месяцам", desc: "Средняя сумма сделки в динамике", icon: "M12 8c-1.657 0-3 .895-3 2v6c0 1.105 1.343 2 3 2s3-.895 3-2v-1m0-7c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", span: "full" },
  managers_performance: { label: "Менеджеры", desc: "Сделки и выручка по менеджерам", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", span: "full" },
  plan_vs_fact: { label: "План vs Факт", desc: "Сравнение плана и фактических показателей", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", span: "full" },
  leads_by_channel: { label: "Заявки по каналам", desc: "Источники входящих заявок", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z", span: "half" },
  debt_by_house: { label: "Платежи по домам", desc: "Ожидаемые платежи по объектам", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", span: "half" },
  conversion_by_channel: { label: "Конверсия по каналам", desc: "% перехода заявок в сделки", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6", span: "half" },
  deals_by_status: { label: "Сделки по статусам", desc: "Распределение сделок по статусам", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z", span: "third" },
  payment_incoming: { label: "Платежи в периоде", desc: "Просрочено / в срок", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", span: "third" },
  leads_funnel: { label: "Воронка продаж", desc: "За период: заявки (все), встречи, завершённые сделки", icon: "M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4", span: "third" },
};

const ALL_CHART_WIDGETS: WidgetKey[] = [
  "deals_by_month", "deals_amount_by_month", "avg_check_by_month", "managers_performance", "plan_vs_fact",
  "leads_by_channel", "debt_by_house", "conversion_by_channel",
  "deals_by_status", "payment_incoming", "leads_funnel",
];

const TEMPLATES: { id: string; name: string; widgetIds: WidgetKey[] }[] = [
  { id: "empty", name: "Пустой", widgetIds: [] },
  { id: "sales", name: "Продажи", widgetIds: ["summary", "deals_by_month", "deals_amount_by_month", "avg_check_by_month", "deals_by_status", "managers_performance"] },
  { id: "leads", name: "Заявки и маркетинг", widgetIds: ["summary", "leads_by_channel", "conversion_by_channel", "leads_funnel"] },
  { id: "finance", name: "Финансы", widgetIds: ["summary", "debt_by_house", "payment_incoming", "plan_vs_fact"] },
  { id: "full", name: "Полный обзор", widgetIds: ["summary", "deals_by_month", "deals_amount_by_month", "avg_check_by_month", "leads_by_channel", "debt_by_house", "conversion_by_channel", "deals_by_status", "managers_performance", "plan_vs_fact", "payment_incoming", "leads_funnel"] },
];

/* ─── Storage helpers ────────────────────────────────────────── */
function getDefaultState(): DashboardState {
  return {
    dashboards: [{ id: "main", name: "Основной", widgetIds: TEMPLATES[4].widgetIds, createdAt: Date.now() }],
    activeId: "main",
  };
}

function loadState(): DashboardState {
  if (typeof window === "undefined") return getDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DashboardState;
      if (parsed.dashboards?.length > 0) {
        const activeId = parsed.activeId && parsed.dashboards.some((d) => d.id === parsed.activeId)
          ? parsed.activeId : parsed.dashboards[0].id;
        return { ...parsed, activeId };
      }
    }
  } catch {}
  return getDefaultState();
}

function saveState(state: DashboardState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function loadCustomWidgets(): Record<string, CustomWidget> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCustomWidgets(widgets: Record<string, CustomWidget>) {
  try { localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(widgets)); } catch {}
}

/* ─── Utils ──────────────────────────────────────────────────── */
function getDefaultPeriod(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(STORAGE_PERIOD_KEY);
    if (saved && /^\d{4}-\d{2}$/.test(saved)) return saved;
  }
  const now = new Date();
  // Default to previous month — current month usually has too little data
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

function isWideChartSpec(spec?: ChartSpec | null): boolean {
  if (!spec) return false;
  return spec.type === "bar" && Array.isArray(spec.data) && spec.data.length > 6;
}

function formatMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} М`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)} К`;
  return v.toLocaleString("ru-RU");
}

function formatUpdatedAgo(ms: number): string {
  if (ms < 60_000) return "только что";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} мин назад`;
  return `${Math.floor(ms / 3_600_000)} ч назад`;
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/* ─── Sub-components ─────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[#e8edf2] bg-white p-4 h-24">
      <div className="h-3 w-20 rounded-full skeleton mb-3" />
      <div className="h-7 w-16 rounded-lg skeleton" />
    </div>
  );
}

function SkeletonChart({ height = 300 }: { height?: number }) {
  return (
    <div style={{ height }}>
      <div className="h-full rounded-xl bg-[#f8fafc] flex items-end gap-2 p-4">
        {[60, 85, 45, 90, 70, 55, 80, 65, 75, 50].map((h, i) => (
          <div key={i} className="flex-1 rounded-t skeleton" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function EmptyWidget({ label }: { label: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6 py-10">
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
        <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-500">Нет данных</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────────── */
interface KpiCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: string;
  color: string;
  bgFrom: string;
  bgTo: string;
  borderColor: string;
}

function KpiCard({ label, value, subValue, icon, color, bgFrom, bgTo, borderColor }: KpiCardProps) {
  return (
    <div
      className="relative rounded-2xl border overflow-hidden p-4 flex flex-col gap-2 min-h-[88px] group transition-all duration-200 hover:scale-[1.015] cursor-default"
      style={{
        borderColor,
        background: `linear-gradient(135deg, ${bgFrom}, ${bgTo})`,
        boxShadow: `0 1px 4px ${borderColor}33, 0 4px 16px -4px ${borderColor}44`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + "20" }}>
          <svg className="w-4 h-4" fill="none" stroke={color} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
      </div>
      <HoverTooltip content={<><strong>{label}</strong><br />{value}</>}>
        <p className="text-2xl font-bold text-slate-900 truncate leading-tight cursor-default">{value}</p>
      </HoverTooltip>
      {subValue && <p className="text-xs font-medium" style={{ color }}>{subValue}</p>}
    </div>
  );
}

/* ─── Widget wrapper ─────────────────────────────────────────── */
function WidgetCard({
  title, children, onRemove, loading, isEmpty, span,
}: {
  title: string;
  children: React.ReactNode;
  onRemove: () => void;
  loading?: boolean;
  isEmpty?: boolean;
  span?: "half" | "full" | "third";
}) {
  return (
    <div className={`ui-card ui-card-elevate overflow-hidden animate-fade-in flex flex-col
      ${span === "full" ? "lg:col-span-3" : span === "half" ? "lg:col-span-2" : "lg:col-span-1"}`}>
      <div className="flex-shrink-0 px-4 py-3 border-b border-[#f0f4f8] flex items-center justify-between gap-2 bg-[#fafbfc]">
        <HoverTooltip content={<strong>{title}</strong>}>
          <span className="text-sm font-semibold text-slate-700 truncate cursor-default">{title}</span>
        </HoverTooltip>
        <button type="button" onClick={onRemove}
          className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all"
          title="Удалить виджет">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 p-4" style={{ minHeight: 280 }}>
        {loading ? <SkeletonChart /> : isEmpty ? <EmptyWidget label="за выбранный период" /> : children}
      </div>
    </div>
  );
}

/* ─── Chart renderers ────────────────────────────────────────── */
function ChartDealsMonth({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({ month: String(r.month ?? ""), cnt: Number(r.cnt ?? 0) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={d} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradDeals" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="month" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#334155" }} formatter={(v: number) => [v, "Сделок"]} />
        <Area type="monotone" dataKey="cnt" stroke="#0ea5e9" strokeWidth={2.5} fill="url(#gradDeals)" dot={{ fill: "#0ea5e9", r: 3 }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ChartDealsAmount({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({ month: String(r.month ?? ""), amount: Number(r.amount ?? 0), cnt: Number(r.cnt ?? 0) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={d} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradAmt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="month" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} tickFormatter={(v) => formatMoney(v)} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#334155" }} formatter={(v: number, name: string) => [name === "amount" ? v.toLocaleString("ru-RU") : v, name === "amount" ? "Сумма, ₸" : "Сделок"]} />
        <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2.5} fill="url(#gradAmt)" dot={{ fill: "#10b981", r: 3 }} name="amount" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ChartAvgCheckByMonth({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({ month: String(r.month ?? ""), avg: Number(r.avg_amount ?? 0), cnt: Number(r.cnt ?? 0) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={d} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis dataKey="month" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} tickFormatter={(v) => formatMoney(v)} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [v.toLocaleString("ru-RU"), name === "avg" ? "Средний чек" : "Сделок"]} />
        <Line type="monotone" dataKey="avg" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: "#f59e0b", r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartManagers({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({
    manager: String(r.manager ?? "").split(" ").slice(0, 2).join(" "),
    deals_count: Number(r.deals_count ?? 0),
    deals_amount: Number(r.deals_amount ?? 0),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={d} margin={{ top: 8, right: 16, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="manager" tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-25} textAnchor="end" height={65} interval={0} />
        <YAxis yAxisId="left" tick={AXIS_TICK} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} tickFormatter={(v) => formatMoney(v)} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [name === "deals_amount" ? v.toLocaleString("ru-RU") : v, name === "deals_amount" ? "Сумма, ₸" : "Сделок"]} />
        <Legend formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 11 }}>{v === "deals_count" ? "Сделок" : "Сумма, ₸"}</span>} />
        <Bar yAxisId="left" dataKey="deals_count" name="deals_count" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Bar yAxisId="right" dataKey="deals_amount" name="deals_amount" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartPlanVsFact({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({
    month: String(r.month ?? ""),
    plan: Number(r.plan_amount ?? 0),
    fact: Number(r.fact_amount ?? 0),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={d} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="month" tick={AXIS_TICK} />
        <YAxis tick={AXIS_TICK} tickFormatter={(v) => formatMoney(v)} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [v.toLocaleString("ru-RU"), name === "plan" ? "План" : "Факт"]} />
        <Legend formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 11 }}>{v === "plan" ? "План" : "Факт"}</span>} />
        <Bar dataKey="plan" fill="#475569" radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Bar dataKey="fact" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={32} />
        {d.map((entry, i) => entry.fact > 0 && entry.plan > 0 && entry.fact >= entry.plan ? (
          <ReferenceLine key={i} x={entry.month} stroke="#10b981" strokeDasharray="0" strokeOpacity={0} />
        ) : null)}
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartLeadsByChannel({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({ name: String(r.channel ?? "").slice(0, 22), cnt: Number(r.cnt ?? 0) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={d} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ ...AXIS_TICK, fontSize: 10 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, "Заявок"]} />
        <Bar dataKey="cnt" fill="#0ea5e9" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {d.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartDebtByHouse({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({ name: String(r.house_name ?? "").slice(0, 18), total: Number(r.total ?? 0) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={d} margin={{ top: 4, right: 8, left: 0, bottom: 70 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-40} textAnchor="end" height={72} interval={0} />
        <YAxis tick={AXIS_TICK} tickFormatter={(v) => formatMoney(v)} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v.toLocaleString("ru-RU"), "Сумма, ₸"]} />
        <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartConversion({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({
    name: String(r.channel ?? "").slice(0, 16),
    conversion: Number(r.conversion ?? 0),
    leads: Number(r.leads ?? 0),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={d} margin={{ top: 4, right: 8, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-30} textAnchor="end" height={62} interval={0} />
        <YAxis tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [n === "conversion" ? `${v}%` : v, n === "conversion" ? "Конверсия" : "Заявок"]} />
        <Bar dataKey="conversion" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartDealsByStatus({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({ name: String(r.status_name ?? ""), value: Number(r.cnt ?? 0) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={d} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={80} innerRadius={35}
          label={({ name, value }) => `${value}`} labelLine={{ stroke: "#475569", strokeWidth: 1 }}>
          {d.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, "Сделок"]} />
        <Legend formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 10 }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ChartPaymentIncoming({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({ name: String(r.payment_status ?? ""), value: Number(r.total ?? 0), cnt: Number(r.cnt ?? 0) }));
  const colors: Record<string, string> = {
    "Просрочено": "#ef4444",
    "К оплате": "#f59e0b",
    "Проведено": "#10b981",
    "Отклонено": "#64748b",
  };
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={d} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={80} innerRadius={35}
          label={({ name }) => name} labelLine={{ stroke: "#475569", strokeWidth: 1 }}>
          {d.map((entry, i) => <Cell key={i} fill={colors[entry.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, _name: string, p: { payload?: { cnt?: number } }) => [v.toLocaleString("ru-RU"), `Сумма, ₸ • операций: ${p?.payload?.cnt ?? 0}`]} />
        <Legend formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 10 }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ChartLeadsFunnel({ rows }: { rows: Record<string, unknown>[] }) {
  const d = rows.map((r) => ({ stage: String(r.stage ?? ""), cnt: Number(r.cnt ?? 0) }));
  const funnelColors = ["#0ea5e9", "#8b5cf6", "#10b981"];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={d} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
        <YAxis type="category" dataKey="stage" width={65} tick={{ ...AXIS_TICK, fontSize: 11 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, "Кол-во"]} />
        <Bar dataKey="cnt" radius={[0, 4, 4, 0]} maxBarSize={28} label={{ position: "right", fill: "#94a3b8", fontSize: 11 }}>
          {d.map((_, i) => <Cell key={i} fill={funnelColors[i % funnelColors.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── AI Chart Builder Modal ─────────────────────────────────── */
interface AiChartBuilderProps {
  onAdd: (widget: CustomWidget) => void;
  onClose: () => void;
}

/** Блок ответа ИИ с уточняющими вариантами (показываем в виде чата вместо ошибки). */
type ClarifyBlock = { userPrompt: string; assistantReply: string; options: string[] };

function AiChartBuilderModal({ onAdd, onClose }: AiChartBuilderProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewChart, setPreviewChart] = useState<ChartSpec | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [error, setError] = useState("");
  const [clarifyBlock, setClarifyBlock] = useState<ClarifyBlock | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function generate() {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError("");
    setPreviewChart(null);
    abortRef.current = new AbortController();

    const fullPrompt = `Нужна диаграмма по данным из БД MacroData. Запрос: ${trimmed}. Сформируй SQL-запрос к БД для получения этих данных — по результату будет построена диаграмма.`;
    const history = clarifyBlock
      ? [{ role: "user" as const, content: clarifyBlock.userPrompt }, { role: "assistant" as const, content: clarifyBlock.assistantReply }]
      : [];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: fullPrompt, stream: true, history }),
        signal: abortRef.current.signal,
        credentials: "include",
      });

      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Нет ответа");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullReply = "";
      let resolvedChart: ChartSpec | null = null;
      let resolvedTitle = "";
      let lastClarifyOptions: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              t?: string; c?: string; reply?: string; charts?: ChartSpec[];
              clarify?: { message?: string; options?: string[] };
              suggestions?: string[];
            };
            if (payload.t === "e") {
              if (payload.charts?.length) {
                resolvedChart = payload.charts[0];
                resolvedTitle = payload.charts[0].title || trimmed;
              }
              if (payload.reply) fullReply = payload.reply;
              const opts = payload.clarify?.options ?? payload.suggestions ?? [];
              if (opts.length > 0) lastClarifyOptions = opts;
            } else if (payload.t === "d" && payload.c) {
              fullReply += payload.c;
            }
          } catch {}
        }
      }

      if (resolvedChart) {
        setPreviewChart(resolvedChart);
        setPreviewTitle(resolvedTitle || trimmed);
        setClarifyBlock(null);
      } else if (lastClarifyOptions.length > 0 && fullReply.trim()) {
        setClarifyBlock({ userPrompt: clarifyBlock?.userPrompt ?? trimmed, assistantReply: fullReply.trim(), options: lastClarifyOptions });
      } else {
        const match = fullReply.match(/```chart\s*([\s\S]*?)```/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]) as Record<string, unknown>;
            if (parsed.error && typeof parsed.error === "string") {
              const opts = Array.isArray(parsed.suggestions)
                ? (parsed.suggestions as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 6)
                : [];
              setClarifyBlock({
                userPrompt: clarifyBlock?.userPrompt ?? trimmed,
                assistantReply: parsed.error,
                options: opts.length > 0 ? opts : ["Покажи заявки по каналам за весь период", "Покажи сделки по каналам за весь период", "Покажи конверсию по каналам за весь период"],
              });
            } else {
              const spec = parsed as unknown as ChartSpec;
              if (spec.data && Array.isArray(spec.data) && spec.data.length > 0) {
                resolvedChart = spec;
                resolvedTitle = (spec.title as string) || trimmed;
                setPreviewChart(resolvedChart);
                setPreviewTitle(resolvedTitle || trimmed);
                setClarifyBlock(null);
              } else {
                setError("Не удалось разобрать спецификацию диаграммы. Попробуйте переформулировать запрос.");
              }
            }
          } catch {
            setError("Не удалось разобрать спецификацию диаграммы. Попробуйте переформулировать запрос.");
          }
        } else {
          setError("ИИ не смог создать диаграмму. Попробуйте уточнить запрос.");
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message || "Ошибка генерации");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleAdd() {
    if (!previewChart) return;
    const widget: CustomWidget = {
      id: randomUUID(),
      title: previewTitle || prompt,
      chartSpec: { ...previewChart, title: previewTitle || previewChart.title },
      prompt,
      createdAt: Date.now(),
    };
    onAdd(widget);
    onClose();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Опишите диаграмму</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) generate(); }}
          placeholder="Например: столбчатая диаграмма сделок по менеджерам за текущий месяц&#10;Или: круговая диаграмма заявок по каналам"
          className="ui-textarea text-sm"
          rows={3}
          disabled={loading}
        />
        <p className="text-xs text-slate-400">Ctrl+Enter для отправки</p>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={loading || !prompt.trim()}
        className="ui-btn ui-btn-primary w-full h-10"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Генерирую диаграмму…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Создать диаграмму
          </>
        )}
      </button>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {clarifyBlock && !previewChart && (
        <div className="rounded-xl border border-[#e8edf2] bg-[#fafbfc] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e8edf2]">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Диалог с ИИ</p>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Вы</p>
              <p className="text-sm text-slate-800 rounded-lg bg-white border border-[#e8edf2] px-3 py-2">{clarifyBlock.userPrompt}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">ИИ</p>
              <p className="text-sm text-slate-800 whitespace-pre-wrap">{clarifyBlock.assistantReply}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-accent mb-2">Уточните запрос — выберите вариант:</p>
              <div className="flex flex-wrap gap-2">
                {clarifyBlock.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPrompt(opt)}
                    className="px-3 py-2 rounded-xl bg-accent/10 hover:bg-accent/15 text-accent text-xs font-medium border border-accent/20 hover:border-accent/40 transition-all"
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Выбранный вариант подставится в поле выше. Нажмите «Создать диаграмму» ещё раз.</p>
            </div>
          </div>
        </div>
      )}

      {previewChart && (
        <div className="rounded-xl border border-[#e8edf2] overflow-hidden">
          <div className="px-3 py-2.5 border-b border-[#f0f4f8] bg-[#fafbfc] flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-accent flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Предпросмотр
            </span>
            <input
              type="text"
              value={previewTitle}
              onChange={(e) => setPreviewTitle(e.target.value)}
              className="flex-1 min-w-0 ml-3 px-2.5 py-1 rounded-lg bg-white border border-[#e2e8f0] text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              placeholder="Название виджета"
            />
          </div>
          <div className="p-3">
            <ChartBlock spec={{ ...previewChart, title: "" }} />
          </div>
        </div>
      )}

      {previewChart && (
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-medium text-sm transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Добавить на дашборд
        </button>
      )}
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────── */
export default function DashboardPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [state, setState] = useState<DashboardState>(loadState);
  const [customWidgets, setCustomWidgets] = useState<Record<string, CustomWidget>>(loadCustomWidgets);
  const [period, setPeriod] = useState(getDefaultPeriod);
  const [data, setData] = useState<Record<string, Record<string, unknown>[]>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [addTab, setAddTab] = useState<"standard" | "ai">("standard");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTemplateId, setCreateTemplateId] = useState("full");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const activeDashboard = useMemo(
    () => state.dashboards.find((d) => d.id === state.activeId),
    [state.dashboards, state.activeId]
  );
  const widgets = useMemo(
    () => activeDashboard?.widgetIds ?? [],
    [activeDashboard]
  );
  const stdWidgets = useMemo(
    () => widgets.filter((w) => !String(w).startsWith("custom:")) as WidgetKey[],
    [widgets]
  );
  // Stable string key for useCallback dep — prevents infinite loops
  const stdWidgetsKey = stdWidgets.join(",");

  useEffect(() => {
    fetch("/api/auth/session", FETCH_OPTS)
      .then((r) => { setAuthenticated(r.ok); setAuthChecked(true); })
      .catch(() => { setAuthChecked(true); setAuthenticated(false); });
  }, []);

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { saveCustomWidgets(customWidgets); }, [customWidgets]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_PERIOD_KEY, period); } catch {}
  }, [period]);

  // Tick every minute to refresh "updated N min ago"
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (bust = false) => {
    if (!stdWidgetsKey) {
      setData({});
      setLoading(false);
      setLastUpdatedAt(Date.now());
      return;
    }
    // Cancel any in-flight request before starting a new one
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const url = `/api/dashboard/data?period=${encodeURIComponent(period)}&widgets=${stdWidgetsKey}${bust ? `&_t=${Date.now()}` : ""}`;
      const res = await fetch(url, { ...FETCH_OPTS, signal: ac.signal });
      if (ac.signal.aborted) return;
      if (res.status === 401) { setAuthenticated(false); return; }
      if (!res.ok) throw new Error("Ошибка загрузки");
      const json = await res.json() as Record<string, Record<string, unknown>[]>;
      if (ac.signal.aborted) return;
      setData(json);
      setLastUpdatedAt(Date.now());
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setData({});
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, stdWidgetsKey]);

  useEffect(() => {
    if (!authenticated || !authChecked) return;
    loadData();
    return () => { abortRef.current?.abort(); };
  }, [authenticated, authChecked, loadData]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        void loadData(true);
      }
      if (e.altKey && e.key === "1") {
        e.preventDefault();
        const [y, m] = period.split("-").map(Number);
        const d = new Date(y, m - 2, 1);
        setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      if (e.altKey && e.key === "2") {
        e.preventDefault();
        setPeriod(getCurrentPeriod());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadData, period]);

  function setWidgetsForActive(updater: (prev: AnyWidgetId[]) => AnyWidgetId[]) {
    if (!activeDashboard) return;
    setState((s) => ({
      ...s,
      dashboards: s.dashboards.map((d) =>
        d.id === activeDashboard.id ? { ...d, widgetIds: updater(d.widgetIds) } : d
      ),
    }));
  }

  function addStdWidget(key: WidgetKey) {
    if (widgets.includes(key)) return;
    setWidgetsForActive((prev) => [...prev, key]);
    setAddWidgetOpen(false);
  }

  function addCustomWidgetToDash(widget: CustomWidget) {
    setCustomWidgets((prev) => ({ ...prev, [widget.id]: widget }));
    setWidgetsForActive((prev) => [...prev, `custom:${widget.id}`]);
  }

  function removeWidget(widgetId: AnyWidgetId) {
    setWidgetsForActive((prev) => prev.filter((w) => w !== widgetId));
  }

  function createDashboard() {
    const name = createName.trim() || "Новый дашборд";
    const template = TEMPLATES.find((t) => t.id === createTemplateId);
    const widgetIds = template ? [...template.widgetIds] : [];
    const id = randomUUID();
    setState((s) => ({
      dashboards: [...s.dashboards, { id, name, widgetIds, createdAt: Date.now() }],
      activeId: id,
    }));
    setCreateName("");
    setCreateTemplateId("full");
    setCreateModalOpen(false);
  }

  function renameDashboard(id: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setState((s) => ({
      ...s,
      dashboards: s.dashboards.map((d) => (d.id === id ? { ...d, name: trimmed } : d)),
    }));
    setRenameId(null);
    setRenameValue("");
  }

  function deleteDashboard(id: string) {
    setState((s) => {
      const list = s.dashboards.filter((d) => d.id !== id);
      const nextActive = list.length > 0 ? (s.activeId === id ? list[0].id : s.activeId) : null;
      return { dashboards: list, activeId: nextActive };
    });
  }

  const summaryRow = data.summary?.[0];
  const periodLabel = period
    ? new Date(period + "-02").toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
    : "Период";

  const aiContextString = useMemo(() => {
    const MAX_ROWS_PER_WIDGET = 40;
    const MAX_CONTEXT_CHARS = 28000;

    const lines: string[] = [];
    lines.push("=== КОНТЕКСТ ДАШБОРДА ===");
    lines.push("Ты видишь все данные текущего дашборда ниже. Ты также можешь выполнять запросы к БД (SELECT) как в основном чате — используй блок ```sql, бэкенд выполнит запрос и вернёт результат. Графики: при запросе «гистограмма», «столбчатая» → type bar; «линейный», «тренд» → line или area; «круговая», «доли» → pie. Если пользователь не указал тип — предложи лучший по смыслу (bar для сравнения по категориям, line/area для динамики по времени, pie для долей). При «хочу график», «диаграмму», «визуализируй» предложи подходящий тип и построй по данным из БД или из контекста дашборда.");
    lines.push("");

    if (activeDashboard?.name) lines.push(`Дашборд: «${activeDashboard.name}»`);
    lines.push(`Период: ${periodLabel} (параметр периода: ${period})`);
    lines.push("");

    const sr = data.summary?.[0] as Record<string, unknown> | undefined;
    if (sr) {
      lines.push("--- KPI-сводка (summary) ---");
      const summaryKeys = [
        "total_deals", "completed_deals", "total_deal_amount", "total_leads", "leads_with_deal",
        "total_debt", "overdue_debt", "active_properties",
      ];
      summaryKeys.forEach((k) => {
        const v = sr[k];
        if (v != null) lines.push(`${k}: ${typeof v === "number" ? v.toLocaleString("ru-RU") : v}`);
      });
      lines.push("");
    }

    const widgetKeys = stdWidgets.filter((k) => data[k] && Array.isArray(data[k]));
    let totalChars = lines.join("\n").length;
    for (const key of widgetKeys) {
      const meta = WIDGET_META[key];
      const label = meta?.label ?? key;
      const rows = data[key] as Record<string, unknown>[] | undefined;
      if (!rows || rows.length === 0) continue;
      const limited = rows.slice(0, MAX_ROWS_PER_WIDGET);
      const cols = limited.length > 0 ? Object.keys(limited[0]) : [];
      const header = cols.join("\t");
      const dataLines = limited.map((r) => cols.map((c) => String(r[c] ?? "")).join("\t"));
      const block = `--- ${label} (${key}) ---\nКолонки: ${cols.join(", ")}\n${header}\n${dataLines.join("\n")}${rows.length > MAX_ROWS_PER_WIDGET ? `\n... всего строк: ${rows.length}` : ""}`;
      if (totalChars + block.length > MAX_CONTEXT_CHARS) break;
      lines.push(block);
      lines.push("");
      totalChars += block.length;
    }

    const customIds = widgets.filter((w) => String(w).startsWith("custom:"));
    const customList = Object.values(customWidgets);
    if (customIds.length > 0 && customList.length > 0) {
      lines.push("--- Пользовательские виджеты (закреплённые графики из чата) ---");
      customIds.forEach((id) => {
        const cw = customList.find((c: CustomWidget) => `custom:${c.id}` === id);
        if (cw) lines.push(`- ${cw.title} (данных в контексте нет, можно запросить через SQL при необходимости)`);
      });
      lines.push("");
    }

    lines.push("=== КОНЕЦ КОНТЕКСТА ДАШБОРДА ===");
    return lines.join("\n");
  }, [activeDashboard?.name, period, periodLabel, data, stdWidgets, widgets, customWidgets]);

  const availableToAdd = ALL_CHART_WIDGETS.filter((k) => !widgets.includes(k));
  const summaryInWidgets = widgets.includes("summary");

  /* KPI cards config */
  const kpiCards = useMemo((): KpiCardProps[] => {
    const sr = summaryRow;
    const totalDeals = Number(sr?.total_deals ?? 0);
    const completedDeals = Number(sr?.completed_deals ?? 0);
    const totalAmount = Number(sr?.total_deal_amount ?? 0);
    const totalLeads = Number(sr?.total_leads ?? 0);
    const leadsWithDeal = Number(sr?.leads_with_deal ?? 0);
    const totalDebt = Number(sr?.total_debt ?? 0);
    const overdueDebt = Number(sr?.overdue_debt ?? 0);
    const activeProps = Number(sr?.active_properties ?? 0);
    const conversion = totalLeads > 0 ? Math.round((completedDeals / totalLeads) * 1000) / 10 : 0;

    return [
      {
        label: "Сделок за период",
        value: loading ? "—" : completedDeals.toLocaleString("ru-RU"),
        subValue: `завершённых за ${periodLabel}`,
        icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        color: "#38bdf8",
        bgFrom: "rgba(14,165,233,0.12)",
        bgTo: "rgba(14,165,233,0.04)",
        borderColor: "rgba(14,165,233,0.3)",
      },
      {
        label: "Выручка",
        value: loading ? "—" : formatMoney(totalAmount),
        subValue: totalAmount > 0 ? `${totalAmount.toLocaleString("ru-RU")} ₸` : undefined,
        icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
        color: "#34d399",
        bgFrom: "rgba(16,185,129,0.12)",
        bgTo: "rgba(16,185,129,0.04)",
        borderColor: "rgba(16,185,129,0.3)",
      },
      {
        label: "Новых заявок",
        value: loading ? "—" : totalLeads.toLocaleString("ru-RU"),
        subValue: `${leadsWithDeal} со сделкой за период`,
        icon: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z",
        color: "#a78bfa",
        bgFrom: "rgba(139,92,246,0.12)",
        bgTo: "rgba(139,92,246,0.04)",
        borderColor: "rgba(139,92,246,0.3)",
      },
      {
        label: "Конверсия",
        value: loading ? "—" : `${conversion}%`,
        subValue: "заявки → сделки",
        icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
        color: conversion >= 20 ? "#34d399" : conversion >= 10 ? "#fbbf24" : "#f87171",
        bgFrom: conversion >= 20 ? "rgba(16,185,129,0.12)" : conversion >= 10 ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)",
        bgTo: "rgba(0,0,0,0.04)",
        borderColor: conversion >= 20 ? "rgba(16,185,129,0.3)" : conversion >= 10 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)",
      },
      {
        label: "К оплате",
        value: loading ? "—" : formatMoney(totalDebt),
        subValue: overdueDebt > 0 ? `Просрочено: ${formatMoney(overdueDebt)}` : "Нет просрочки",
        icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
        color: overdueDebt > 0 ? "#fb923c" : "#38bdf8",
        bgFrom: overdueDebt > 0 ? "rgba(249,115,22,0.12)" : "rgba(14,165,233,0.12)",
        bgTo: "rgba(0,0,0,0.04)",
        borderColor: overdueDebt > 0 ? "rgba(249,115,22,0.3)" : "rgba(14,165,233,0.3)",
      },
      {
        label: "В продаже",
        value: loading ? "—" : activeProps.toLocaleString("ru-RU"),
        subValue: "активных лотов",
        icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
        color: "#94a3b8",
        bgFrom: "rgba(100,116,139,0.12)",
        bgTo: "rgba(100,116,139,0.04)",
        borderColor: "rgba(100,116,139,0.3)",
      },
    ];
  }, [summaryRow, loading, periodLabel]);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] gap-3 flex-col">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-glow-sm mb-2">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-accent/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafc] p-4 gap-4">
        <p className="text-slate-600 text-sm">Для просмотра дашбордов войдите в систему.</p>
        <Link href="/chat" className="ui-btn ui-btn-primary px-5">
          Войти
        </Link>
      </div>
    );
  }

  /* ─── Render ─────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex relative bg-[#f8fafc]">
      {/* Floating AI button */}
      <button
        type="button"
        onClick={() => setAiOpen(true)}
        className="fixed bottom-6 right-6 z-30 h-14 px-5 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5] text-white shadow-[0_4px_24px_rgba(99,102,241,0.55)] hover:from-[#818cf8] hover:to-[#6366f1] hover:shadow-[0_6px_32px_rgba(99,102,241,0.7)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2.5 border border-white/20 font-semibold text-sm"
        title="ИИ-ассистент по данным дашборда"
      >
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span>ИИ-ассистент</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
      </button>

      <DashboardAiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        contextString={aiContextString}
        periodLabel={periodLabel}
        initialPrompt={aiInitialPrompt}
        onInitialPromptSent={() => setAiInitialPrompt(null)}
        onPinChart={addCustomWidgetToDash}
      />

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className={`${sidebarOpen ? "w-60" : "w-14"} flex-shrink-0 border-r border-[#e8edf2] bg-white flex flex-col transition-all duration-200 z-20`}>
        <div className="h-[57px] px-3 border-b border-[#e8edf2] flex items-center justify-between gap-2">
          <Link href="/chat" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors min-w-0" title="ИИ-ассистент (чат)">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {sidebarOpen && <span className="text-sm font-medium truncate">Чат</span>}
          </Link>
          <button type="button" onClick={() => setSidebarOpen((o) => !o)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {sidebarOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />}
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
          {sidebarOpen ? (
            <>
              <div className="px-2 mb-1">
            <Link href={`/funnel?period=${encodeURIComponent(period)}`} className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-600 hover:text-[#6366f1] hover:bg-[#6366f1]/8 transition-all group">
              <svg className="w-4 h-4 shrink-0 text-[#6366f1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              <span className="font-medium">Воронка продаж</span>
            </Link>
          </div>
          <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Дашборды</p>
              {state.dashboards.map((d) => (
                <div key={d.id} className="group relative px-2">
                  {renameId === d.id ? (
                    <div className="flex items-center gap-1 py-1">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameDashboard(d.id, renameValue);
                          if (e.key === "Escape") setRenameId(null);
                        }}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-white border border-[#e2e8f0] text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                        autoFocus
                      />
                      <button type="button" onClick={() => renameDashboard(d.id, renameValue)}
                        className="p-1.5 text-accent hover:text-accent-dark rounded-lg hover:bg-accent/10">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setState((s) => ({ ...s, activeId: d.id }))}
                        className={`flex-1 min-w-0 text-left px-3 py-2 rounded-xl text-sm transition-all ${
                          state.activeId === d.id
                            ? "bg-accent/10 text-accent font-medium border border-accent/20"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <span className="truncate block">{d.name}</span>
                        <span className="text-xs text-slate-400 font-normal">{d.widgetIds.length} виджетов</span>
                      </button>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center shrink-0 transition-opacity">
                        <button type="button" onClick={() => { setRenameId(d.id); setRenameValue(d.name); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Переименовать">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button type="button"
                          onClick={() => state.dashboards.length > 1 && deleteDashboard(d.id)}
                          disabled={state.dashboards.length <= 1}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 disabled:cursor-not-allowed" title="Удалить">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="mx-2 mt-2 w-[calc(100%-1rem)] flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-[#cbd5e1] text-slate-400 hover:border-accent/50 hover:text-accent hover:bg-accent/5 transition-all text-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Новый дашборд
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 px-2 py-1">
              <Link href={`/funnel?period=${encodeURIComponent(period)}`} className="w-9 h-9 rounded-xl text-[#6366f1] hover:bg-[#6366f1]/10 flex items-center justify-center transition-all" title="Воронка продаж">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
              </Link>
              {state.dashboards.map((d) => (
                <button key={d.id} type="button"
                  onClick={() => setState((s) => ({ ...s, activeId: d.id }))}
                  className={`w-9 h-9 rounded-xl text-xs font-bold flex items-center justify-center transition-all ${
                    state.activeId === d.id ? "bg-accent/10 text-accent border border-accent/25" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  title={d.name}
                >
                  {d.name.slice(0, 2).toUpperCase()}
                </button>
              ))}
              <button type="button" onClick={() => setCreateModalOpen(true)}
                className="w-9 h-9 rounded-xl text-slate-400 hover:text-accent hover:bg-slate-100 flex items-center justify-center transition-all" title="Новый дашборд">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          )}
        </div>

        <div className="p-2 border-t border-[#e8edf2]">
          <button
            type="button"
            onClick={async () => { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); window.location.href = "/"; }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 text-sm transition-all"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            {sidebarOpen && <span>Выйти</span>}
          </button>
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          title={activeDashboard?.name ?? "Дашборд"}
          subtitle={loading ? "Загрузка…" : lastUpdatedAt ? `Обновлено ${formatUpdatedAgo(Date.now() - lastUpdatedAt)}` : "MacroData CRM"}
          className="sticky top-0 z-10"
          actions={(
            <>
              <div className="flex items-center gap-1 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-1 py-1">
                <button
                  type="button"
                  onClick={() => { const [y, m] = period.split("-").map(Number); const d = new Date(y, m - 2, 1); setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }}
                  className="ui-btn ui-btn-secondary !h-8 !px-2"
                  title="Предыдущий месяц (Alt+1)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="ui-input !h-8 !w-36 !px-2 text-center text-sm" />
                <button
                  type="button"
                  onClick={() => { const [y, m] = period.split("-").map(Number); const d = new Date(y, m, 1); setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }}
                  className="ui-btn ui-btn-secondary !h-8 !px-2"
                  title="Следующий месяц"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
              <button type="button" onClick={() => setPeriod(getCurrentPeriod())} className="ui-btn ui-btn-secondary" title="Текущий месяц (Alt+2)">
                Текущий
              </button>
              <button type="button" onClick={() => loadData(true)} disabled={loading} className="ui-btn ui-btn-secondary" title="Обновить данные (Alt+R)">
                <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">Обновить</span>
              </button>
              <button
                type="button"
                onClick={() => { setAiInitialPrompt("Дай 3 кратких вывода и 2–3 рекомендации по данным. Без таблиц — только выводы и действия."); setAiOpen(true); }}
                className="ui-btn ui-btn-secondary border-accent/35 text-accent"
                title="ИИ-анализ данных дашборда"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="hidden sm:inline">Выводы ИИ</span>
              </button>
              <button type="button" onClick={() => { setAddTab("standard"); setAddWidgetOpen(true); }} className="ui-btn ui-btn-primary">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Виджет
              </button>
            </>
          )}
        />

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6">
          <div className="max-w-screen-2xl mx-auto space-y-5">

            {/* Воронка продаж — те же цифры, что в KPI (один источник: summary) */}
            <section className="bg-white rounded-2xl border border-[#e8edf2] shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex flex-wrap items-center justify-between gap-3 bg-[#fafbfc]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-800 text-sm">Воронка продаж</h2>
                    <p className="text-xs text-slate-400">{periodLabel}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {summaryRow && !loading ? (
                    <>
                      <span className="text-sm text-slate-500"><span className="font-semibold text-slate-700">{Number(summaryRow.total_leads ?? 0).toLocaleString("ru-RU")}</span> заявок</span>
                      <span className="text-sm text-slate-500"><span className="font-semibold text-slate-700">{Number(summaryRow.completed_deals ?? summaryRow.total_deals ?? 0).toLocaleString("ru-RU")}</span> завершённых сделок</span>
                      <span className="text-sm text-slate-500">Конверсия <span className="font-semibold text-[#6366f1]">{summaryRow.total_leads ? (Math.round((Number(summaryRow.completed_deals ?? 0) / Number(summaryRow.total_leads)) * 1000) / 10) : 0}%</span></span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">{loading ? "Загрузка…" : "Нет данных"}</span>
                  )}
                  <Link href={`/funnel?period=${encodeURIComponent(period)}`} className="ui-btn ui-btn-secondary !h-8 gap-1.5 text-sm">
                    Подробнее
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                </div>
              </div>
            </section>

            {widgets.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-[#e2e8f0] p-16 text-center animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-slate-600 font-medium mb-2">Дашборд пуст</p>
                <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">Добавьте виджеты с данными или создайте кастомную диаграмму с помощью ИИ.</p>
                <div className="flex justify-center gap-3 flex-wrap">
                  <button type="button" onClick={() => { setAddTab("standard"); setAddWidgetOpen(true); }}
                    className="ui-btn ui-btn-primary px-5">
                    + Добавить виджет
                  </button>
                  <button type="button" onClick={() => { setAddTab("ai"); setAddWidgetOpen(true); }}
                    className="ui-btn ui-btn-secondary px-5">
                    ИИ-диаграмма
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* KPI Row */}
                {summaryInWidgets && (
                  <section>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                      {loading
                        ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
                        : kpiCards.map((card) => <KpiCard key={card.label} {...card} />)}
                    </div>
                  </section>
                )}

                {/* Charts Grid — 3 fractional columns on large screens */}
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
                  {widgets.filter((w) => w !== "summary").map((widgetId) => {
                    // Custom AI widget
                    if (String(widgetId).startsWith("custom:")) {
                      const id = String(widgetId).slice(7);
                      const cw = customWidgets[id];
                      if (!cw) return null;
                      const wideCustom = isWideChartSpec(cw.chartSpec);
                      return (
                        <div key={widgetId}
                          className={`ui-card ui-card-elevate border-accent/25 overflow-hidden animate-fade-in flex flex-col ${wideCustom ? "lg:col-span-3" : "lg:col-span-1"}`}>
                          <div className="flex-shrink-0 px-4 py-3 border-b border-[#f0f4f8] flex items-center justify-between gap-2 bg-[#fafbfc]">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                              <span className="text-sm font-semibold text-slate-700 truncate">{cw.title}</span>
                              <span className="ui-badge ui-badge-blue shrink-0">ИИ</span>
                            </div>
                            <button type="button" onClick={() => removeWidget(widgetId)}
                              className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all"
                              title="Удалить виджет">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <div className="flex-1 p-3">
                            <ChartBlock spec={cw.chartSpec} />
                          </div>
                        </div>
                      );
                    }

                    // Standard widget
                    const key = widgetId as WidgetKey;
                    const meta = WIDGET_META[key];
                    if (!meta) return null;
                    const rows = data[key] || [];
                    const isEmpty = !loading && rows.length === 0;
                    const spanClass = meta.span === "full" ? "lg:col-span-3" : meta.span === "half" ? "lg:col-span-2" : "lg:col-span-1";

                    return (
                      <WidgetCard
                        key={key}
                        title={meta.label}
                        onRemove={() => removeWidget(key)}
                        loading={loading}
                        isEmpty={isEmpty}
                        span={meta.span}
                      >
                        <div className={spanClass === "lg:col-span-3" ? "" : ""}>
                          {key === "deals_by_month" && <ChartDealsMonth rows={rows} />}
                          {key === "deals_amount_by_month" && <ChartDealsAmount rows={rows} />}
                          {key === "avg_check_by_month" && <ChartAvgCheckByMonth rows={rows} />}
                          {key === "managers_performance" && <ChartManagers rows={rows} />}
                          {key === "plan_vs_fact" && <ChartPlanVsFact rows={rows} />}
                          {key === "leads_by_channel" && <ChartLeadsByChannel rows={rows} />}
                          {key === "debt_by_house" && <ChartDebtByHouse rows={rows} />}
                          {key === "conversion_by_channel" && <ChartConversion rows={rows} />}
                          {key === "deals_by_status" && <ChartDealsByStatus rows={rows} />}
                          {key === "payment_incoming" && <ChartPaymentIncoming rows={rows} />}
                          {key === "leads_funnel" && <ChartLeadsFunnel rows={rows} />}
                        </div>
                      </WidgetCard>
                    );
                  })}
                </section>
              </>
            )}
          </div>
        </main>
      </div>

      {/* ── Add Widget Modal ──────────────────────────────────────── */}
      {addWidgetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm" onClick={() => setAddWidgetOpen(false)}>
          <div className={`rounded-2xl bg-white border border-[#e8edf2] shadow-2xl w-full max-h-[88vh] flex flex-col animate-fade-in ${addTab === "ai" ? "max-w-screen-xl" : "max-w-lg"}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-[#e8edf2] flex items-center justify-between">
              <h2 className="font-semibold text-lg text-slate-900">Добавить виджет</h2>
              <button type="button" onClick={() => setAddWidgetOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 px-5 pt-3 flex gap-1 border-b border-[#e8edf2]">
              {(["standard", "ai"] as const).map((tab) => (
                <button key={tab} type="button" onClick={() => setAddTab(tab)}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all -mb-px border-b-2 ${
                    addTab === tab
                      ? "text-accent border-accent"
                      : "text-slate-500 border-transparent hover:text-slate-700"
                  }`}>
                  {tab === "standard" ? "Стандартные" : "ИИ-диаграмма"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
              {addTab === "standard" ? (
                <div className="space-y-2">
                  {availableToAdd.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">Все стандартные виджеты уже добавлены.</p>
                  ) : (
                    availableToAdd.map((k) => {
                      const meta = WIDGET_META[k];
                      return (
                        <button key={k} type="button" onClick={() => addStdWidget(k)}
                          className="w-full text-left px-4 py-3 rounded-xl bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#e8edf2] hover:border-accent/30 transition-all group flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-white group-hover:bg-accent/10 border border-[#e8edf2] flex items-center justify-center shrink-0 transition-all">
                            <svg className="w-4 h-4 text-slate-400 group-hover:text-accent transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={meta.icon} />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">{meta.label}</p>
                            <p className="text-xs text-slate-400">{meta.desc}</p>
                          </div>
                          <svg className="w-4 h-4 text-slate-300 group-hover:text-accent ml-auto shrink-0 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      );
                    })
                  )}
                  {/* Also show "add summary" if not in widgets */}
                  {!summaryInWidgets && (
                    <button key="summary" type="button" onClick={() => addStdWidget("summary")}
                      className="w-full text-left px-4 py-3 rounded-xl bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#e8edf2] hover:border-accent/30 transition-all group flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white group-hover:bg-accent/10 border border-[#e8edf2] flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-slate-400 group-hover:text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={WIDGET_META.summary.icon} />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{WIDGET_META.summary.label}</p>
                        <p className="text-xs text-slate-400">{WIDGET_META.summary.desc}</p>
                      </div>
                      <svg className="w-4 h-4 text-slate-300 group-hover:text-accent ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  )}
                </div>
              ) : (
                <AiChartBuilderModal onAdd={addCustomWidgetToDash} onClose={() => setAddWidgetOpen(false)} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create Dashboard Modal ──────────────────────────────── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm" onClick={() => setCreateModalOpen(false)}>
          <div className="rounded-2xl bg-white border border-[#e8edf2] shadow-2xl max-w-md w-full p-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-lg text-slate-900 mb-1">Новый дашборд</h2>
            <p className="text-sm text-slate-400 mb-5">Выберите шаблон — виджеты можно изменить после создания.</p>
            <label className="block mb-3">
              <span className="text-xs font-semibold text-slate-600 block mb-1.5 uppercase tracking-wide">Название</span>
              <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)}
                placeholder="Например: Продажи Q1 2026"
                className="ui-input text-sm" />
            </label>
            <label className="block mb-5">
              <span className="text-xs font-semibold text-slate-600 block mb-1.5 uppercase tracking-wide">Шаблон</span>
              <div className="grid grid-cols-1 gap-2">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" onClick={() => setCreateTemplateId(t.id)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                      createTemplateId === t.id
                        ? "bg-accent/10 border-accent/30 text-slate-900 font-medium"
                        : "bg-[#f8fafc] border-[#e8edf2] text-slate-600 hover:bg-[#f1f5f9] hover:border-[#cbd5e1]"
                    }`}>
                    <span>{t.name}</span>
                    {t.widgetIds.length > 0 && <span className="ml-2 text-xs text-slate-400">{t.widgetIds.length} виджетов</span>}
                  </button>
                ))}
              </div>
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={createDashboard} className="ui-btn ui-btn-primary flex-1 h-10">
                Создать
              </button>
              <button type="button" onClick={() => setCreateModalOpen(false)} className="ui-btn ui-btn-secondary flex-1 h-10">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
