"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ChartSpec } from "@/app/lib/chartSpec";
import { TOOLTIP_CONTENT_STYLE } from "./HoverTooltip";

const CHART_COLORS = ["#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

export default function ChartBlock({ spec }: { spec: ChartSpec }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const { type, title, xKey, yKey = "y", nameKey = "name", valueKey = "value", series, stacked, description } = spec;
  const data = Array.isArray(spec.data) ? spec.data : [];
  const hasSeries = Array.isArray(series) && series.length > 0;
  const stackId = stacked ? "stack1" : undefined;
  const manyCategories = type === "bar" && data.length > 6;
  const exportMinWidth = manyCategories ? Math.max(960, data.length * 105) : 0;

  const commonProps = {
    margin: { top: 12, right: 24, left: 52, bottom: 8 },
    data,
  };

  const axisStyle = { stroke: "#94a3b8", fontSize: 11 };
  const tooltipContentStyle = TOOLTIP_CONTENT_STYLE;

  if (data.length === 0) {
    return (
      <div className="mt-3 rounded-2xl overflow-hidden bg-white border border-[#e8edf2] shadow-card">
        <div className="px-4 py-3 border-b border-[#f0f4f8] bg-[#fafbfc]">
          <span className="text-sm font-semibold text-slate-800">{title || "График"}</span>
        </div>
        <div className="p-6 text-center text-sm text-slate-500">Нет данных</div>
      </div>
    );
  }

  async function handleExport() {
    if (!chartRef.current || exporting) return;
    setExporting(true);
    const node = chartRef.current;
    const prevWidth = node.style.width;
    const prevMaxWidth = node.style.maxWidth;
    const targetWidth = Math.max(node.clientWidth, exportMinWidth);
    let expanded = false;
    try {
      // For export: temporarily widen container so long charts render fully, then restore.
      if (targetWidth > node.clientWidth) {
        node.style.width = `${targetWidth}px`;
        node.style.maxWidth = "none";
        expanded = true;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }

      const dataUrl = await toPng(node, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: Math.max(node.scrollWidth, targetWidth || node.clientWidth),
        height: node.scrollHeight,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `macrodata-${(title || "chart").replace(/\s+/g, "-").toLowerCase()}.png`;
      a.click();
    } catch {
      /* ignore */
    } finally {
      if (expanded) {
        node.style.width = prevWidth;
        node.style.maxWidth = prevMaxWidth;
      }
      setExporting(false);
    }
  }

  return (
    <div ref={chartRef} className="mt-3 rounded-2xl overflow-hidden bg-white border border-[#e8edf2] shadow-card animate-fade-in">
      <div className="px-4 py-3 border-b border-[#f0f4f8] flex items-center justify-between gap-2 bg-[#fafbfc]">
        <span className="text-sm font-semibold text-slate-800">{title || "График"}</span>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-accent disabled:opacity-40 transition-colors shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? "Сохранение…" : "PNG"}
        </button>
      </div>
      <div className="p-3" style={{ width: "100%", height: 280 }}>
        <div style={{ width: "100%", height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === "bar" ? (
            <BarChart {...commonProps}>
              <XAxis
                dataKey={xKey}
                style={axisStyle}
                tick={{ fill: "#475569", fontSize: manyCategories ? 11 : 12 }}
                interval={0}
                angle={manyCategories ? -16 : 0}
                textAnchor={manyCategories ? "end" : "middle"}
                height={manyCategories ? 78 : 30}
              />
              {/* Две оси Y при двух сериях (напр. количество + сумма), чтобы мелкие значения не терялись */}
              {hasSeries && series!.length >= 2 ? (
                <>
                  <YAxis yAxisId="left" style={axisStyle} tick={{ fill: "#475569" }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" style={axisStyle} tick={{ fill: "#475569" }} tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1e6).toFixed(0)}М` : v >= 1_000 ? `${(v / 1e3).toFixed(0)}К` : String(v)} />
                  <Tooltip contentStyle={tooltipContentStyle} labelStyle={{ color: "#0f172a" }} formatter={(v: number, name: string) => [typeof v === "number" && v >= 1000 ? v.toLocaleString("ru-RU") : v, name]} />
                  {series!.map((s, i) => (
                    <Bar
                      key={s.dataKey}
                      yAxisId={i === 0 ? "left" : "right"}
                      dataKey={s.dataKey}
                      name={s.name}
                      fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                      radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                      stackId={stackId}
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: "#334155" }}>{v}</span>} />
                </>
              ) : (
                <>
                  <YAxis style={axisStyle} tick={{ fill: "#475569" }} />
                  <Tooltip contentStyle={tooltipContentStyle} labelStyle={{ color: "#0f172a" }} />
                  {hasSeries
                    ? series!.map((s, i) => (
                        <Bar
                          key={s.dataKey}
                          dataKey={s.dataKey}
                          name={s.name}
                          fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                          radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                          stackId={stackId}
                        />
                      ))
                    : <Bar dataKey={yKey} fill="#0ea5e9" radius={[4, 4, 0, 0]} />}
                  {hasSeries && <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: "#334155" }}>{v}</span>} />}
                </>
              )}
            </BarChart>
          ) : type === "line" ? (
            <LineChart {...commonProps}>
              <XAxis dataKey={xKey} style={axisStyle} tick={{ fill: "#475569" }} />
              <YAxis style={axisStyle} tick={{ fill: "#475569" }} />
              <Tooltip contentStyle={tooltipContentStyle} labelStyle={{ color: "#0f172a" }} />
              {hasSeries
                ? series!.map((s, i) => (
                    <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.name} stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ fill: s.color ?? CHART_COLORS[i % CHART_COLORS.length] }} />
                  ))
                : <Line type="monotone" dataKey={yKey} stroke="#0ea5e9" strokeWidth={2} dot={{ fill: "#0ea5e9" }} />}
              {hasSeries && <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: "#334155" }}>{v}</span>} />}
            </LineChart>
          ) : type === "area" ? (
            <AreaChart {...commonProps}>
              <XAxis dataKey={xKey} style={axisStyle} tick={{ fill: "#475569" }} />
              <YAxis style={axisStyle} tick={{ fill: "#475569" }} />
              <Tooltip contentStyle={tooltipContentStyle} labelStyle={{ color: "#0f172a" }} />
              <Area type="monotone" dataKey={yKey} stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.3} strokeWidth={2} />
            </AreaChart>
          ) : (
            <PieChart>
              <Pie
                data={data}
                dataKey={valueKey}
                nameKey={nameKey}
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ [nameKey]: n }) => String(n)}
                labelLine={{ stroke: "#94a3b8" }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipContentStyle} formatter={(v: number) => [v, valueKey]} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: "#334155" }}>{v}</span>} />
            </PieChart>
          )}
        </ResponsiveContainer>
        </div>
      </div>
      {description && (
        <p className="px-4 pb-3 pt-2 text-xs text-slate-400 border-t border-[#f0f4f8]">{description}</p>
      )}
    </div>
  );
}
