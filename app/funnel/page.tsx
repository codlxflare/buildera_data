"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import HoverTooltip from "@/app/components/HoverTooltip";

const SECURITY_FETCH = { credentials: "include" as RequestCredentials };

function fmt(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + " млрд";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + " млн";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + " тыс";
  return String(n);
}

function fmtKzt(n: number) {
  return new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 0 }).format(n) + " ₸";
}

function fmtPct(v: number) {
  return v.toFixed(1) + "%";
}

/** Форматирует dt (YYYY-MM-DD, YYYY-MM или ISO) для подписи оси графика */
function formatChartDate(dt: string | undefined): string {
  if (!dt || typeof dt !== "string") return "";
  const s = dt.includes("T") ? dt.slice(0, 10) : dt;
  if (s.length === 10) {
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  }
  if (s.length === 7) {
    const months = "янв фев мар апр май июн июл авг сен окт ноя дек".split(" ");
    const [y, m] = s.split("-");
    const mi = parseInt(m, 10) - 1;
    return mi >= 0 && mi < 12 ? `${months[mi]} ${y}` : s;
  }
  return s;
}

interface Summary {
  totalLeads: number;
  totalDeals: number;
  leadsWithDeal?: number;
  completedDeals: number;
  reservedDeals: number;
  inWorkDeals: number;
  revenue: number;
  conversion: number;
  avgDealSum?: number;
  revenuePerLead?: number;
}

interface ChannelRow {
  channel: string;
  leads: number;
  deals: number;
  conv_pct: number;
  revenue?: number;
}

interface HouseRow {
  house: string;
  total: number;
  new_leads: number;
  reserved: number;
  completed: number;
}

interface ManagerRow {
  manager: string;
  deals_count: number;
  completed: number;
  revenue: number;
}

interface TimeSeriesRow {
  dt: string;
  cnt: number;
}

interface FunnelLeadByStatus {
  status_id: number;
  cnt: number;
}

interface FunnelData {
  period: { start: string; end: string };
  summary: Summary;
  channels: ChannelRow[];
  houses: HouseRow[];
  managers: ManagerRow[];
  funnelLeads?: FunnelLeadByStatus[];
  timeSeries?: TimeSeriesRow[];
  dealsTimeSeries?: TimeSeriesRow[];
  reservedTimeSeries?: TimeSeriesRow[];
}

/** Справочник статусов заявок (estate_statuses) для подписей */
const LEAD_STATUS_NAMES: Record<number, string> = {
  0: "Удалено",
  1: "В архиве",
  2: "Служ.процесс",
  3: "Нецелевой",
  4: "Отказ",
  5: "Неразобранное",
  7: "Оценка",
  8: "Необходим обзвон",
  10: "Проверка",
  15: "Отложено",
  20: "Подбор",
  30: "Бронь",
  32: "Маркетинговый резерв",
  40: "Сделка расторгнута",
  50: "Сделка в работе",
  52: "Маркетинговая сделка",
  53: "Сделка в работе *",
  90: "Сдано",
  100: "Сделка проведена",
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const PERIOD_PRESETS: { label: string; getRange: () => [string, string] }[] = [
  { label: "Месяц", getRange: () => [getMonthStart(), getToday()] },
  {
    label: "Прошлый месяц",
    getRange: () => {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      const y = d.getFullYear(), m = d.getMonth();
      const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return [start, end];
    },
  },
  {
    label: "3 мес",
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 2);
      start.setDate(1);
      return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
    },
  },
  {
    label: "Год",
    getRange: () => {
      const d = new Date();
      return [`${d.getFullYear()}-01-01`, d.toISOString().slice(0, 10)];
    },
  },
];

type Tab = "new" | "reserved" | "deals_from_new" | "deals";

const TABS: { id: Tab; label: string }[] = [
  { id: "new", label: "Новые заявки" },
  { id: "reserved", label: "Брони" },
  { id: "deals_from_new", label: "Сделки по новым заявкам" },
  { id: "deals", label: "Сделок за период" },
];

/** Единая палитра воронки: у каждой полосы — понятный смысл */
const FUNNEL_COLORS = {
  /** Нецелевые заявки */
  nonTarget: "#dc2626",
  /** Целевая база (все целевые заявки) */
  target: "#2563eb",
  /** Отказ */
  refusal: "#ea580c",
  /** В работе (заявки или сделки) */
  inProgress: "#0ea5e9",
  /** Бронь */
  reservation: "#d97706",
  /** Сделки проведено / успех */
  completed: "#059669",
  /** Нет данных / нули */
  empty: "#e2e8f0",
} as const;

function SkeletonBar({ w }: { w: string }) {
  return <div className="h-4 rounded-full bg-slate-200 animate-pulse" style={{ width: w }} />;
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 flex flex-col gap-1 shadow-sm hover:shadow transition-shadow">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, count, total, color, pct }: {
  label: string;
  count: number;
  total: number;
  color: string;
  pct?: number;
}) {
  const width = total > 0 ? Math.min(100, (count / total) * 100) : 0;
  const displayPct = pct !== undefined ? pct : (total > 0 ? (count / total) * 100 : 0);
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
      <div className="w-48 shrink-0 text-sm text-slate-600 font-medium truncate">{label}</div>
      <div className="flex-1 relative h-6 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${width}%`, background: color }}
        />
        <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold" style={{ color: width > 35 ? "white" : "#475569" }}>
          {fmtPct(displayPct)}
        </span>
      </div>
      <div className="w-14 text-right text-sm font-bold text-slate-700 shrink-0">{count}</div>
    </div>
  );
}

/** Строка воронки в стиле образца: подпись, число, % и полоска */
function FunnelRow({
  label,
  count,
  pctOfTotal,
  pctOfTarget,
  color,
  total,
  target,
  indent,
  stackedSegments,
}: {
  label: string;
  count: number;
  pctOfTotal?: number;
  pctOfTarget?: number;
  color: string;
  total: number;
  target: number;
  indent?: boolean;
  /** Доли сегментов (сумма 100), показываются внутри полоски шириной count/target */
  stackedSegments?: { pct: number; color: string }[];
}) {
  const showPct = pctOfTarget !== undefined && target > 0 ? pctOfTarget : (total > 0 ? (count / total) * 100 : 0);
  const rawBarPct = target > 0 ? (count / target) * 100 : 0;
  // Минимальная ширина полоски при count > 0, чтобы малые % были заметны
  const MIN_BAR_PCT = 14;
  const barWidthPct = count > 0 ? Math.min(100, Math.max(rawBarPct, MIN_BAR_PCT)) : 0;
  const showPctInBar = barWidthPct > 22;
  return (
    <div className={`flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0 ${indent ? "pl-6" : ""}`}>
      <div className="w-52 shrink-0 text-sm text-slate-600 font-medium truncate">{label}</div>
      <div className="w-12 text-right text-sm font-bold text-slate-800 shrink-0">{count}</div>
      <HoverTooltip content={<><strong>{label}</strong><br />{count} · {fmtPct(showPct)}</>}>
        <div className="flex-1 flex items-center gap-2 min-w-[200px] cursor-default">
        {stackedSegments && stackedSegments.length > 0 ? (
          <div className="flex-1 flex h-6 rounded-full overflow-hidden bg-slate-100 min-w-[240px]">
            <div className="flex h-full" style={{ width: `${barWidthPct}%` }}>
              {stackedSegments.map((seg, i) =>
                seg.pct > 0 ? <div key={i} className="h-full" style={{ width: `${seg.pct}%`, background: seg.color }} /> : null
              )}
            </div>
          </div>
        ) : (
          <div className="relative h-6 bg-slate-100 rounded-full overflow-hidden flex-1 min-w-[240px]">
            <div className="h-full rounded-full transition-all" style={{ width: `${barWidthPct}%`, background: color }} />
            {showPctInBar && (
              <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold" style={{ color: "white" }}>{fmtPct(showPct)}</span>
            )}
          </div>
        )}
        {(!stackedSegments || stackedSegments.length === 0) && !showPctInBar && (
          <span className="text-xs font-semibold text-slate-500 shrink-0">{fmtPct(showPct)}</span>
        )}
        </div>
      </HoverTooltip>
    </div>
  );
}

/** Блок «Новых заявок за период» в стиле образца: заголовок + пилюли + иерархия + все активные */
function NewLeadsFunnelBlock(props: {
  totalLeads: number;
  channels: ChannelRow[];
  funnelLeads: FunnelLeadByStatus[];
  summary: Summary;
}) {
  const { totalLeads, channels, funnelLeads, summary } = props;
  const getCnt = (statusId: number) => funnelLeads.find((r) => r.status_id === statusId)?.cnt ?? 0;
  const nonTarget = getCnt(3);
  const targetLeads = totalLeads - nonTarget;
  const refusal = getCnt(4);
  const inWorkLeads = getCnt(10) + getCnt(20) + getCnt(5) + getCnt(15); // Проверка, Подбор, Неразобранное, Отложено
  const reservationLeads = getCnt(30); // Бронь (заявки)
  const inWorkDeals = summary.inWorkDeals ?? 0;
  const completedDeals = summary.completedDeals ?? 0;
  const reservedDeals = summary.reservedDeals ?? 0;
  const activeLeads = inWorkLeads + reservationLeads + inWorkDeals;

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold text-slate-800 text-base">Новых заявок за период</h2>
          <span className="text-3xl font-bold" style={{ color: FUNNEL_COLORS.target }}>{totalLeads}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {channels.slice(0, 12).map((ch, i) => {
            const pct = totalLeads ? (ch.leads / totalLeads) * 100 : 0;
            return (
              <HoverTooltip key={i} content={<><strong>{ch.channel}</strong><br />{ch.leads} заявок · {fmtPct(pct)}</>}>
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 cursor-default">
                  <span className="truncate max-w-[100px]">{ch.channel}</span>
                  <span className="ml-1 shrink-0">{ch.leads} ({fmtPct(pct)})</span>
                </span>
              </HoverTooltip>
            );
          })}
        </div>
      </div>

      <div className="p-5">
        {/* Нецелевой — красный: отсев */}
        <FunnelRow
          label="Нецелевой"
          count={nonTarget}
          color={FUNNEL_COLORS.nonTarget}
          total={totalLeads}
          target={targetLeads}
          pctOfTotal={totalLeads ? (nonTarget / totalLeads) * 100 : 0}
        />

        {/* Целевые заявки — синий: основная база */}
        <FunnelRow
          label="Целевые заявки, в т.ч.:"
          count={targetLeads}
          color={FUNNEL_COLORS.target}
          total={totalLeads}
          target={targetLeads}
          pctOfTotal={totalLeads ? (targetLeads / totalLeads) * 100 : 0}
        />

        {/* Отказ — оранжевый: негатив по целевым */}
        <FunnelRow
          label="Отказ"
          count={refusal}
          color={FUNNEL_COLORS.refusal}
          total={targetLeads}
          target={targetLeads}
          pctOfTarget={targetLeads ? (refusal / targetLeads) * 100 : 0}
          indent
        />
        {/* Заявки в работе — голубой: один цвет, без разбиения */}
        <FunnelRow
          label="Заявки в работе"
          count={inWorkLeads}
          color={FUNNEL_COLORS.inProgress}
          total={targetLeads}
          target={targetLeads}
          pctOfTarget={targetLeads ? (inWorkLeads / targetLeads) * 100 : 0}
          indent
        />
        {/* Бронь — янтарный */}
        <FunnelRow
          label="Бронь"
          count={reservationLeads || reservedDeals}
          color={FUNNEL_COLORS.reservation}
          total={targetLeads}
          target={targetLeads}
          pctOfTarget={targetLeads ? ((reservationLeads || reservedDeals) / targetLeads) * 100 : 0}
          indent
        />
        {/* Сделок в работе — голубой */}
        <FunnelRow
          label="Сделок в работе"
          count={inWorkDeals}
          color={FUNNEL_COLORS.inProgress}
          total={targetLeads}
          target={targetLeads}
          pctOfTarget={targetLeads ? (inWorkDeals / targetLeads) * 100 : 0}
          indent
        />
        {/* Сделок проведено — зелёный: успех */}
        <FunnelRow
          label="Сделок проведено"
          count={completedDeals}
          color={FUNNEL_COLORS.completed}
          total={targetLeads}
          target={targetLeads}
          pctOfTarget={targetLeads ? (completedDeals / targetLeads) * 100 : 0}
          indent
        />
        <FunnelRow label="Пропущенные звонки" count={0} color={FUNNEL_COLORS.empty} total={totalLeads} target={targetLeads} indent />
        <FunnelRow label="Неотвеченные сообщения" count={0} color={FUNNEL_COLORS.empty} total={totalLeads} target={targetLeads} indent />
        <FunnelRow label="Просроченные задачи" count={0} color={FUNNEL_COLORS.empty} total={totalLeads} target={targetLeads} indent />
        <FunnelRow label="Задолженность платежа" count={0} color={FUNNEL_COLORS.empty} total={totalLeads} target={targetLeads} indent />

        {/* Легенда: зачем какие цвета */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Цвета полос</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: FUNNEL_COLORS.nonTarget }} /> нецелевые</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: FUNNEL_COLORS.target }} /> целевая база</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: FUNNEL_COLORS.refusal }} /> отказ</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: FUNNEL_COLORS.inProgress }} /> в работе</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: FUNNEL_COLORS.reservation }} /> бронь</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: FUNNEL_COLORS.completed }} /> проведено</span>
          </div>
        </div>

        {/* Все активные заявки */}
        <div className="mt-4 pt-4 border-t-2 border-slate-200">
          <div className="flex items-center gap-3 py-2.5">
            <div className="w-52 shrink-0 text-sm font-semibold text-slate-800">Все активные заявки</div>
            <div className="w-12 text-right text-sm font-bold text-slate-800 shrink-0">{activeLeads}</div>
          </div>
          <div className="flex items-center gap-3 py-2.5 pl-6 border-b border-slate-100">
            <div className="w-52 shrink-0 text-sm text-slate-600 font-medium">Заявки в работе</div>
            <div className="w-12 text-right text-sm font-bold text-slate-700 shrink-0">{inWorkLeads}</div>
            <div className="flex-1 relative h-6 rounded-full overflow-hidden bg-slate-100 min-w-[80px]">
              <div className="h-full rounded-full transition-all" style={{ width: activeLeads ? `${(inWorkLeads / activeLeads) * 100}%` : "0%", background: FUNNEL_COLORS.inProgress }} />
              <span className="absolute inset-0 flex items-center px-2 text-xs font-semibold text-white">{activeLeads ? fmtPct((inWorkLeads / activeLeads) * 100) : "0%"}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Блок вкладки с заголовком, итогом, столбчатым графиком и пилюлями источников (Брони / Сделки по новым / Сделок за период) */
function TabBlockWithChart({
  title,
  summaryText,
  totalCount,
  timeSeries,
  channels,
  totalLeads,
  barColor,
}: {
  title: string;
  summaryText: string;
  totalCount: number;
  timeSeries: TimeSeriesRow[];
  channels: ChannelRow[];
  totalLeads: number;
  barColor: string;
}) {
  const maxCnt = Math.max(...timeSeries.map((r) => Number(r.cnt ?? 0)), 1);
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 text-lg">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{summaryText}</p>
      </div>
      {timeSeries.length > 0 && (
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-end gap-0.5 h-28">
            {timeSeries.map((row, i) => {
              const cnt = Number(row.cnt ?? 0);
              const h = maxCnt > 0 ? Math.max(4, (cnt / maxCnt) * 100) : 0;
              return (
                <HoverTooltip key={i} content={<><strong>{formatChartDate(row.dt)}</strong><br />{cnt}</>}>
                  <div className="flex-1 flex flex-col items-center justify-end min-w-0 cursor-default">
                    <div className="w-full rounded-t-sm transition-all hover:opacity-90" style={{ height: `${h}%`, background: barColor }} />
                  </div>
                </HoverTooltip>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            <span>{formatChartDate(timeSeries[0]?.dt)}</span>
            <span>{formatChartDate(timeSeries[timeSeries.length - 1]?.dt)}</span>
          </div>
        </div>
      )}
        <div className="px-5 py-4">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Новых заявок за период</p>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl font-bold" style={{ color: FUNNEL_COLORS.target }}>{totalLeads}</span>
          <div className="flex flex-wrap gap-2">
            {channels.slice(0, 10).map((ch, i) => {
              const pct = totalLeads ? (ch.leads / totalLeads) * 100 : 0;
              return (
                <HoverTooltip key={i} content={<><strong>{ch.channel}</strong><br />{ch.leads} заявок · {fmtPct(pct)}</>}>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 cursor-default">
                    {ch.leads} ({fmtPct(pct)})
                  </span>
                </HoverTooltip>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const MONTH_NAMES_RU = "январь февраль март апрель май июнь июль август сентябрь октябрь ноябрь декабрь".split(" ");

/** По дням: заявки, сделки, брони (что было проведено в этот день) */
interface DayActivity {
  leads: number;
  deals: number;
  reserved: number;
}

/** Календарь: в какие дни что было проведено — заявки, сделки, брони */
function EventsCalendar({ byDay, start, end }: { byDay: Record<string, DayActivity>; start: string; end: string }) {
  const startDate = new Date(start + "T12:00:00");
  const endDate = new Date(end + "T12:00:00");
  const todayStr = new Date().toISOString().slice(0, 10);

  type Cell = { day: number; dateStr: string; leads: number; deals: number; reserved: number; isToday: boolean };
  const months: { year: number; month: number; days: Cell[][] }[] = [];

  for (let y = startDate.getFullYear(), m = startDate.getMonth(); y < endDate.getFullYear() || (y === endDate.getFullYear() && m <= endDate.getMonth()); ) {
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const daysInMonth = last.getDate();
    const startWeekday = (first.getDay() + 6) % 7;
    const weeks: Cell[][] = [];
    let week: Cell[] = [];
    for (let i = 0; i < startWeekday; i++) week.push({ day: 0, dateStr: "", leads: 0, deals: 0, reserved: 0, isToday: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const a = byDay[dateStr] ?? { leads: 0, deals: 0, reserved: 0 };
      week.push({ day: d, dateStr, leads: a.leads, deals: a.deals, reserved: a.reserved, isToday: dateStr === todayStr });
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push({ day: 0, dateStr: "", leads: 0, deals: 0, reserved: 0, isToday: false });
      weeks.push(week);
    }
    months.push({ year: y, month: m, days: weeks });
    if (m === 11) { m = 0; y++; } else m++;
  }

  const hasAny = (c: Cell) => c.leads > 0 || c.deals > 0 || c.reserved > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-slate-800 text-lg">Календарь</h2>
          <p className="text-xs text-slate-500 mt-0.5">В какие дни что было проведено: заявки, сделки, брони</p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#6366f1]" /> заявки</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#059669]" /> сделки</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f97316]" /> брони</span>
        </div>
      </div>
      <div className="p-5 overflow-x-auto">
        <div className="flex gap-8 min-w-max">
          {months.slice(0, 3).map((cal, idx) => {
            const monthLeads = cal.days.flat().reduce((s, c) => s + c.leads, 0);
            const monthDeals = cal.days.flat().reduce((s, c) => s + c.deals, 0);
            const monthReserved = cal.days.flat().reduce((s, c) => s + c.reserved, 0);
            const monthLabel = [monthLeads, monthDeals, monthReserved].some((n) => n > 0) ? ` (заявок ${monthLeads}, сд. ${monthDeals}, брон. ${monthReserved})` : "";
            return (
              <div key={idx} className="shrink-0">
                <p className="text-sm font-semibold text-slate-700 mb-2 capitalize">
                  {MONTH_NAMES_RU[cal.month]} ({cal.year}){monthLabel}
                </p>
                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((wd) => (
                    <div key={wd} className="w-10 h-6 text-xs font-medium text-slate-400">{wd}</div>
                  ))}
                  {cal.days.flat().map((cell, i) => {
                    const active = hasAny(cell);
                    const tooltipContent = cell.dateStr ? (
                      <div className="space-y-1.5 text-left">
                        <div className="font-semibold text-slate-800 border-b border-slate-100 pb-1.5">{cell.day} {MONTH_NAMES_RU[cal.month]}</div>
                        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#6366f1] shrink-0" /> заявок <strong>{cell.leads}</strong></div>
                        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#059669] shrink-0" /> сделок <strong>{cell.deals}</strong></div>
                        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#f97316] shrink-0" /> броней <strong>{cell.reserved}</strong></div>
                      </div>
                    ) : null;
                    const cellInner = (
                      <>
                        {cell.day > 0 && (
                          <>
                            <div className="flex gap-0.5 leading-none">
                              {cell.leads > 0 && <span className={cell.isToday ? "text-white" : "text-[#6366f1] font-semibold"}>{cell.leads}</span>}
                              {cell.deals > 0 && <span className={cell.isToday ? "text-white" : "text-[#059669] font-semibold"}>{cell.deals}</span>}
                              {cell.reserved > 0 && <span className={cell.isToday ? "text-white" : "text-[#f97316] font-semibold"}>{cell.reserved}</span>}
                              {!active && <span className="opacity-60">—</span>}
                            </div>
                            <span className="text-[10px] leading-none mt-1 opacity-80">{cell.day}</span>
                          </>
                        )}
                      </>
                    );
                    const cellClassName = `w-10 h-10 flex flex-col items-center justify-center rounded text-xs ${
                      cell.day === 0 ? "invisible" : active ? (cell.isToday ? "bg-[#4f46e5] text-white" : "bg-slate-50 border border-slate-200") : "bg-slate-100 text-slate-400"
                    } ${cell.dateStr ? "cursor-default" : ""}`;
                    return tooltipContent
                      ? <HoverTooltip key={i} content={tooltipContent}><div className={cellClassName}>{cellInner}</div></HoverTooltip>
                      : <div key={i} className={cellClassName}>{cellInner}</div>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FunnelPageContent() {
  const searchParams = useSearchParams();
  const [start, setStart] = useState(getMonthStart());
  const [end, setEnd] = useState(getToday());
  const [tab, setTab] = useState<Tab>("new");
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // Период с дашборда: /funnel?period=YYYY-MM — выставить тот же месяц
  useEffect(() => {
    const p = searchParams.get("period");
    if (p && /^\d{4}-\d{2}$/.test(p)) {
      const [y, m] = p.split("-").map(Number);
      const startStr = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const endStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      setStart(startStr);
      setEnd(endStr);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/auth/session", SECURITY_FETCH)
      .then((r) => r.json())
      .then((d) => {
        setAuthenticated(d?.authenticated !== false);
        setAuthChecked(true);
      })
      .catch(() => { setAuthenticated(false); setAuthChecked(true); });
  }, []);

  const load = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/funnel?start=${start}&end=${end}`, SECURITY_FETCH);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Ошибка ${r.status}`);
      }
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [start, end, authenticated]);

  useEffect(() => {
    if (authenticated) load();
  }, [load, authenticated]);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => <span key={i} className="w-2 h-2 rounded-full bg-accent/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafc] p-4 gap-4">
        <p className="text-slate-600 text-sm">Для просмотра воронки войдите в систему.</p>
        <Link href="/" className="ui-btn ui-btn-primary px-5">На главную</Link>
      </div>
    );
  }

  const s = data?.summary;
  const totalForFunnel = tab === "new" ? (s?.totalLeads ?? 0) : tab === "reserved" ? (s?.totalDeals ?? 0) : (s?.totalDeals ?? 0);

  function getFunnelStages() {
    if (!s) return [];
    if (tab === "new") {
      const leadsWithDeal = s.leadsWithDeal ?? s.totalDeals;
      return [
        { label: "Всего заявок", count: s.totalLeads, color: FUNNEL_COLORS.target, pct: 100 },
        { label: "Заявок с сделкой", count: leadsWithDeal, color: FUNNEL_COLORS.inProgress, pct: s.totalLeads > 0 ? (leadsWithDeal / s.totalLeads) * 100 : 0 },
        { label: "Сделок за период: брони", count: s.reservedDeals, color: FUNNEL_COLORS.reservation, pct: s.totalLeads > 0 ? (s.reservedDeals / s.totalLeads) * 100 : 0 },
        { label: "Сделок за период: в работе", count: s.inWorkDeals, color: FUNNEL_COLORS.inProgress, pct: s.totalLeads > 0 ? (s.inWorkDeals / s.totalLeads) * 100 : 0 },
        { label: "Сделок за период: завершено", count: s.completedDeals, color: FUNNEL_COLORS.completed, pct: s.totalLeads > 0 ? (s.completedDeals / s.totalLeads) * 100 : 0 },
      ];
    }
    if (tab === "reserved") {
      return [
        { label: "Всего сделок", count: s.totalDeals, color: FUNNEL_COLORS.target, pct: 100 },
        { label: "Брони", count: s.reservedDeals, color: FUNNEL_COLORS.reservation, pct: s.totalDeals > 0 ? (s.reservedDeals / s.totalDeals) * 100 : 0 },
        { label: "В работе", count: s.inWorkDeals, color: FUNNEL_COLORS.inProgress, pct: s.totalDeals > 0 ? (s.inWorkDeals / s.totalDeals) * 100 : 0 },
        { label: "Завершено", count: s.completedDeals, color: FUNNEL_COLORS.completed, pct: s.totalDeals > 0 ? (s.completedDeals / s.totalDeals) * 100 : 0 },
      ];
    }
    if (tab === "deals_from_new") {
      const leadsWithDeal = s.leadsWithDeal ?? s.totalDeals;
      return [
        { label: "Всего заявок", count: s.totalLeads, color: FUNNEL_COLORS.target, pct: 100 },
        { label: "Заявок с сделкой", count: leadsWithDeal, color: FUNNEL_COLORS.inProgress, pct: s.totalLeads > 0 ? (leadsWithDeal / s.totalLeads) * 100 : 0 },
        { label: "Сделок завершено", count: s.completedDeals, color: FUNNEL_COLORS.completed, pct: s.totalLeads > 0 ? (s.completedDeals / s.totalLeads) * 100 : 0 },
      ];
    }
    return [
      { label: "Всего сделок", count: s.totalDeals, color: FUNNEL_COLORS.target, pct: 100 },
      { label: "Завершено", count: s.completedDeals, color: FUNNEL_COLORS.completed, pct: s.totalDeals > 0 ? (s.completedDeals / s.totalDeals) * 100 : 0 },
      { label: "В работе", count: s.inWorkDeals, color: FUNNEL_COLORS.inProgress, pct: s.totalDeals > 0 ? (s.inWorkDeals / s.totalDeals) * 100 : 0 },
      { label: "Брони", count: s.reservedDeals, color: FUNNEL_COLORS.reservation, pct: s.totalDeals > 0 ? (s.reservedDeals / s.totalDeals) * 100 : 0 },
    ];
  }

  const funnelStages = getFunnelStages();
  const topChannels = (data?.channels ?? []).slice(0, 12);
  const maxLeads = Math.max(...topChannels.map((c) => c.leads), 1);
  void totalForFunnel;

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      <TopNav
        title="Воронка продаж"
        subtitle={loading ? "Загрузка…" : data ? `${start} — ${end}` : ""}
        icon={
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </div>
        }
        actions={(
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {PERIOD_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const [s, e] = preset.getRange();
                    setStart(s);
                    setEnd(e);
                  }}
                  className="!h-8 px-2.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <span className="hidden sm:inline text-xs font-medium text-slate-400">Период:</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="ui-input !h-8 !w-32 !px-2 text-sm" />
              <span className="text-slate-300">—</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="ui-input !h-8 !w-32 !px-2 text-sm" />
            </div>
            <button onClick={load} disabled={loading} className="ui-btn ui-btn-secondary !h-8">
              <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Обновить</span>
            </button>
            <Link href="/dashboard" className="ui-btn ui-btn-secondary !h-8">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="hidden sm:inline">Дашборды</span>
            </Link>
          </div>
        )}
      />

      <main className="flex-1 p-4 lg:p-6 space-y-5">

        {/* Error */}
        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 text-red-600 flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Hero summary line */}
        {!loading && s && (
          <div className="rounded-2xl bg-gradient-to-r from-indigo-50 via-white to-slate-50/50 border border-slate-200/80 px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="text-sm text-slate-600">
              <strong className="text-slate-800">{fmt(s.totalLeads)}</strong> заявок
            </span>
            <span className="text-slate-300" aria-hidden>→</span>
            <span className="text-sm text-slate-600">
              <strong className="text-slate-800">{fmt(s.totalDeals)}</strong> сделок
            </span>
            <span className="text-slate-300" aria-hidden>→</span>
            <span className="text-sm text-slate-600">
              <strong className="text-emerald-700">{fmt(s.completedDeals)}</strong> завершено
            </span>
            <span className="text-slate-300" aria-hidden>·</span>
            <span className="text-sm font-semibold text-amber-600">Конверсия {fmtPct(s.conversion)}</span>
            {s.revenue > 0 && (
              <>
                <span className="text-slate-300" aria-hidden>·</span>
                <span className="text-sm text-slate-600">Выручка <strong>{fmtKzt(s.revenue)}</strong></span>
              </>
            )}
          </div>
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          {loading ? (
            Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 space-y-2 shadow-sm">
                <SkeletonBar w="60%" />
                <SkeletonBar w="40%" />
              </div>
            ))
          ) : s ? (
            <>
              <KpiCard label="Всего заявок" value={fmt(s.totalLeads)} color="#6366f1" sub="за период" />
              <KpiCard label="Сделок всего" value={fmt(s.totalDeals)} color="#3b82f6" sub="создано" />
              <KpiCard label="Завершено" value={fmt(s.completedDeals)} color="#059669" sub="статус 150" />
              <KpiCard label="Конверсия" value={fmtPct(s.conversion)} color="#f59e0b" sub="заявки → сделки" />
              <KpiCard label="Брони" value={fmt(s.reservedDeals)} color="#f97316" sub="активных" />
              <KpiCard label="Выручка" value={fmt(s.revenue) + " ₸"} color="#6366f1" sub="KZT" />
              <KpiCard label="Средний чек" value={s.avgDealSum != null ? fmtKzt(s.avgDealSum) : "—"} color="#8b5cf6" sub="на сделку" />
              <KpiCard label="Выручка на заявку" value={s.revenuePerLead != null ? fmtKzt(s.revenuePerLead) : "—"} color="#0ea5e9" sub="₸/заявка" />
            </>
          ) : null}
        </div>

        {/* Insights strip */}
        {!loading && data && (data.channels?.length > 0 || data.managers?.length > 0 || data.houses?.length > 0) && s && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(() => {
              const bestConvChannel = [...(data.channels ?? [])].filter((c) => c.leads >= 5).sort((a, b) => (b.conv_pct ?? 0) - (a.conv_pct ?? 0))[0];
              const bestRevenueChannel = [...(data.channels ?? [])].filter((c) => (c.revenue ?? 0) > 0).sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))[0];
              const bestManager = [...(data.managers ?? [])].sort((a, b) => Number(b.revenue ?? 0) - Number(a.revenue ?? 0))[0];
              const bestHouse = [...(data.houses ?? [])].filter((h) => h.total >= 3).sort((a, b) => (b.total ? (b.completed ?? 0) / b.total : 0) - (a.total ? (a.completed ?? 0) / a.total : 0))[0];
              return (
                <>
                  {bestConvChannel && (
                    <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Лучшая конверсия</p>
                      <p className="text-sm font-semibold text-slate-800 truncate" title={bestConvChannel.channel}>{bestConvChannel.channel}</p>
                      <p className="text-xs text-emerald-600 font-medium">{fmtPct(Number(bestConvChannel.conv_pct ?? 0))} · {bestConvChannel.leads} заявок</p>
                    </div>
                  )}
                  {bestRevenueChannel && (
                    <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Макс. выручка по каналу</p>
                      <p className="text-sm font-semibold text-slate-800 truncate" title={bestRevenueChannel.channel}>{bestRevenueChannel.channel}</p>
                      <p className="text-xs text-[#6366f1] font-medium">{fmtKzt(Number(bestRevenueChannel.revenue ?? 0))}</p>
                    </div>
                  )}
                  {bestManager && (
                    <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Топ менеджер</p>
                      <p className="text-sm font-semibold text-slate-800 truncate" title={bestManager.manager}>{bestManager.manager}</p>
                      <p className="text-xs text-[#6366f1] font-medium">{fmtKzt(Number(bestManager.revenue ?? 0))} · {bestManager.completed} сделок</p>
                    </div>
                  )}
                  {bestHouse && bestHouse.total && (bestHouse.completed ?? 0) > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Лучший объект</p>
                      <p className="text-sm font-semibold text-slate-800 truncate" title={bestHouse.house}>{bestHouse.house}</p>
                      <p className="text-xs text-emerald-600 font-medium">{bestHouse.completed} сделок · {fmtPct((bestHouse.completed ?? 0) / bestHouse.total * 100)} конв.</p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Tabs */}
        <div className="space-y-1">
          <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200/80 p-1 w-fit shadow-sm">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id
                    ? "bg-[#2563eb] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            {tab === "new" && "Разбивка заявок по статусам и этапам."}
            {tab === "reserved" && "Брони за период и динамика."}
            {tab === "deals_from_new" && "Сделки по новым заявкам за период."}
            {tab === "deals" && "Все сделки за период: брони, в работе, проведено."}
          </p>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Новых заявок за период (образец) — только для вкладки «Новые заявки» при наличии funnelLeads */}
          {tab === "new" && !loading && s && (data?.funnelLeads ?? []).length > 0 ? (
            <div className="lg:col-span-2">
              <NewLeadsFunnelBlock
                totalLeads={s.totalLeads}
                channels={data?.channels ?? []}
                funnelLeads={data?.funnelLeads ?? []}
                summary={s}
              />
            </div>
          ) : tab === "reserved" && !loading && s && data ? (
            <div className="lg:col-span-2">
              <TabBlockWithChart
                title="Брони"
                summaryText={`${s.reservedDeals ?? 0} броней за ук. период`}
                totalCount={s.reservedDeals ?? 0}
                timeSeries={data.reservedTimeSeries ?? []}
                channels={data.channels ?? []}
                totalLeads={s.totalLeads}
                barColor="#f97316"
              />
            </div>
          ) : (tab === "deals_from_new" || tab === "deals") && !loading && s && data ? (
            <div className="lg:col-span-2">
              <TabBlockWithChart
                title={tab === "deals_from_new" ? "Сделки по новым заявкам" : "Сделок за период"}
                summaryText={tab === "deals_from_new" ? `${s.totalLeads} заявок → ${s.completedDeals} сделок проведено` : `${s.totalDeals} сделок за период, ${s.completedDeals} проведено`}
                totalCount={tab === "deals_from_new" ? s.completedDeals : s.totalDeals}
                timeSeries={(tab === "deals_from_new" ? data.dealsTimeSeries : data.dealsTimeSeries) ?? []}
                channels={data.channels ?? []}
                totalLeads={s.totalLeads}
                barColor={tab === "deals_from_new" ? "#059669" : "#6366f1"}
              />
            </div>
          ) : (
            /* Fallback: классическая воронка полосками */
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white">
                <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-[#6366f1]/10 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-[#6366f1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  </span>
                  {tab === "new" ? "Воронка заявок" : tab === "reserved" ? "Воронка броней" : tab === "deals_from_new" ? "Сделки по новым заявкам" : "Воронка сделок"}
                </h2>
                {s && (
                  <span className="ui-badge ui-badge-blue">
                    {tab === "new" || tab === "deals_from_new" ? s.totalLeads : s.totalDeals} шт.
                  </span>
                )}
              </div>
              <div className="p-5">
                {loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <SkeletonBar w="150px" />
                        <SkeletonBar w={`${60 - i * 10}%`} />
                        <SkeletonBar w="40px" />
                      </div>
                    ))}
                  </div>
                ) : funnelStages.length > 0 ? (
                  <div>
                    {funnelStages.map((stage) => (
                      <FunnelBar
                        key={stage.label}
                        label={stage.label}
                        count={stage.count}
                        total={funnelStages[0]?.count || 1}
                        color={stage.color}
                        pct={stage.pct}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 py-8 text-center">Нет данных за выбранный период</p>
                )}
              </div>
            </div>
          )}

          {/* Distribution by house + stacked bar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white">
              <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </span>
                Распределение интереса заявок
              </h2>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 6 }, (_, i) => <SkeletonBar key={i} w={`${80 - i * 10}%`} />)}
                </div>
              ) : (data?.houses ?? []).length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wide">Дом</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-400 uppercase tracking-wide">Всего</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wide min-w-[120px]">Распределение</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-amber-500 uppercase tracking-wide">Брони</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-emerald-500 uppercase tracking-wide">Сделки</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wide">Конв.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.houses ?? []).map((row, i) => {
                      const total = row.total ?? 0;
                      const reserved = row.reserved ?? 0;
                      const completed = row.completed ?? 0;
                      const inWork = Math.max(0, total - reserved - completed);
                      const convPct = total ? (completed / total * 100) : 0;
                      const pctR = total ? (reserved / total) * 100 : 0;
                      const pctC = total ? (completed / total) * 100 : 0;
                      const pctW = total ? (inWork / total) * 100 : 0;
                      return (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-2.5 text-slate-700 font-medium truncate max-w-[140px]">
                            <HoverTooltip content={<><strong>{row.house}</strong><br />Всего: {total}</>}>
                              <span className="cursor-default">{row.house}</span>
                            </HoverTooltip>
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-700">{total}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex h-5 rounded-full overflow-hidden bg-slate-100 min-w-[100px]">
                              {pctW > 0 && (
                                <HoverTooltip content={<><strong>В работе</strong><br />{inWork}</>}>
                                  <div className="h-full cursor-default bg-slate-300" style={{ width: `${pctW}%` }} />
                                </HoverTooltip>
                              )}
                              {pctR > 0 && (
                                <HoverTooltip content={<><strong>Брони</strong><br />{reserved}</>}>
                                  <div className="h-full cursor-default bg-amber-400" style={{ width: `${pctR}%` }} />
                                </HoverTooltip>
                              )}
                              {pctC > 0 && (
                                <HoverTooltip content={<><strong>Сделки</strong><br />{completed}</>}>
                                  <div className="h-full cursor-default bg-emerald-500" style={{ width: `${pctC}%` }} />
                                </HoverTooltip>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-amber-600 font-semibold">{reserved}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-600 font-semibold">{completed}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={convPct >= 10 ? "text-emerald-600 font-semibold" : convPct > 0 ? "text-slate-600" : "text-slate-400"}>{fmtPct(convPct)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-slate-400 py-8 text-center px-5">Нет данных</p>
              )}
            </div>
          </div>

          {/* Channel conversion table */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white">
              <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /></svg>
                </span>
                Конверсия по каналам
              </h2>
              <span className="text-xs text-slate-400">{topChannels.length} каналов</span>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 8 }, (_, i) => <SkeletonBar key={i} w={`${90 - i * 8}%`} />)}
                </div>
              ) : topChannels.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs">
                      <th className="text-left px-5 py-3 font-semibold text-slate-400 uppercase tracking-wide">Канал</th>
                      <th className="text-right px-3 py-3 font-semibold text-slate-400 uppercase tracking-wide">Заявки</th>
                      <th className="text-right px-3 py-3 font-semibold text-slate-400 uppercase tracking-wide">Сделки</th>
                      <th className="text-right px-3 py-3 font-semibold text-slate-400 uppercase tracking-wide">Конв-я</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-400 uppercase tracking-wide">Выручка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topChannels.map((row, i) => {
                      const convPct = Number(row.conv_pct ?? 0);
                      const barWidth = maxLeads > 0 ? (row.leads / maxLeads) * 100 : 0;
                      const convColor = convPct >= 20 ? FUNNEL_COLORS.completed : convPct >= 5 ? FUNNEL_COLORS.target : convPct > 0 ? FUNNEL_COLORS.reservation : FUNNEL_COLORS.empty;
                      return (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                          <td className="px-5 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1] shrink-0" />
                              <HoverTooltip content={<><strong>{row.channel}</strong><br />Заявок: {row.leads} · Сделок: {row.deals} · Конв.: {fmtPct(Number(row.conv_pct ?? 0))}</>}>
                                <span className="text-slate-700 font-medium truncate max-w-[200px] cursor-default">{row.channel}</span>
                              </HoverTooltip>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-2 rounded-full bg-[#e8edf2] w-16 overflow-hidden">
                                <div className="h-full rounded-full bg-[#6366f1]/60" style={{ width: `${barWidth}%` }} />
                              </div>
                              <span className="font-semibold text-slate-700 w-8 text-right">{row.leads}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{row.deals}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-[#e8edf2] overflow-hidden min-w-[40px]">
                                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(convPct, 100)}%`, backgroundColor: convColor }} />
                              </div>
                              <span className="text-xs font-bold w-10 text-right" style={{ color: convColor }}>
                                {fmtPct(convPct)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-[#6366f1] whitespace-nowrap">{row.revenue != null ? fmtKzt(Number(row.revenue)) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-slate-400 py-8 text-center">Нет данных</p>
              )}
            </div>
          </div>

          {/* Managers table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white">
              <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </span>
                Менеджеры
              </h2>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 6 }, (_, i) => <SkeletonBar key={i} w={`${85 - i * 10}%`} />)}
                </div>
              ) : (data?.managers ?? []).length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-400 uppercase tracking-wide">Менеджер</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-400 uppercase tracking-wide">Всего</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-emerald-500 uppercase tracking-wide">Завер.</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-[#6366f1] uppercase tracking-wide">Выручка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.managers ?? []).map((row, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-2.5 text-slate-700 font-medium truncate max-w-[130px]">{row.manager}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-700">{row.deals_count}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-600 font-semibold">{row.completed}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[#6366f1]">{fmtKzt(Number(row.revenue))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-slate-400 py-8 text-center px-5">Нет данных</p>
              )}
            </div>
          </div>

        </div>

        {/* Календарь: в какие дни что проведено — заявки, сделки, брони */}
        {!loading && data?.period && (() => {
          const byDay: Record<string, { leads: number; deals: number; reserved: number }> = {};
          const addDay = (key: string) => {
            if (!byDay[key]) byDay[key] = { leads: 0, deals: 0, reserved: 0 };
          };
          (data.timeSeries ?? []).forEach((r) => {
            const d = typeof r.dt === "string" && r.dt.length >= 10 ? r.dt.slice(0, 10) : "";
            if (d) { addDay(d); byDay[d].leads += Number(r.cnt ?? 0); }
          });
          (data.dealsTimeSeries ?? []).forEach((r) => {
            const d = typeof r.dt === "string" && r.dt.length >= 10 ? r.dt.slice(0, 10) : "";
            if (d) { addDay(d); byDay[d].deals += Number(r.cnt ?? 0); }
          });
          (data.reservedTimeSeries ?? []).forEach((r) => {
            const d = typeof r.dt === "string" && r.dt.length >= 10 ? r.dt.slice(0, 10) : "";
            if (d) { addDay(d); byDay[d].reserved += Number(r.cnt ?? 0); }
          });
          return (
            <div className="mt-6">
              <EventsCalendar byDay={byDay} start={data.period.start} end={data.period.end} />
            </div>
          );
        })()}

      </main>
    </div>
  );
}

export default function FunnelPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col bg-[#f8fafc] items-center justify-center">
        <div className="text-slate-500 text-sm">Загрузка…</div>
      </div>
    }>
      <FunnelPageContent />
    </Suspense>
  );
}
