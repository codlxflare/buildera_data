// Спецификация графика для отображения в чате
export type ChartSeries = { name: string; dataKey: string; color?: string };

export type ChartSpec = {
  type: "bar" | "line" | "pie" | "area";
  title: string;
  data: Record<string, string | number>[];
  xKey: string;
  yKey?: string;
  nameKey?: string;
  valueKey?: string;
  /** Несколько серий для bar/line (план/факт и т.д.) */
  series?: ChartSeries[];
  /** Для bar: рисовать серии сложенными в один столбик */
  stacked?: boolean;
  /** Подпись под графиком (одна строка) */
  description?: string;
};

/**
 * Уточняющий вопрос — когда запрос пользователя неполный (нет периода и т.п.).
 * message — текст вопроса к пользователю.
 * options — варианты ответа, отображаются как кнопки.
 */
export type ClarifySpec = {
  message: string;
  options: string[];
};

const CHART_BLOCK_REGEX = /```chart\s*([\s\S]*?)```/gi;
const SUGGESTIONS_BLOCK_REGEX = /```suggestions\s*([\s\S]*?)```/i;
const CLARIFY_BLOCK_REGEX = /```clarify\s*([\s\S]*?)```/i;

/**
 * Парсит ```clarify блок из ответа модели.
 * Формат: первая непустая строка — вопрос, остальные — варианты ответа.
 */
export function parseClarifyBlock(reply: string): ClarifySpec | null {
  const m = reply.match(CLARIFY_BLOCK_REGEX);
  if (!m) return null;
  const lines = m[1]
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
    .filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  return {
    message: lines[0],
    options: lines.slice(1).slice(0, 6),
  };
}

/** Проверяет, содержит ли ответ модели clarify-блок */
export function hasClarifyBlock(reply: string): boolean {
  return CLARIFY_BLOCK_REGEX.test(reply);
}

const CHART_COLORS = ["#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

function safeJsonParse(raw: string): unknown {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```\w*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  s = s.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(s);
}

function parseOneChart(raw: string): ChartSpec | null {
  try {
    const parsed = safeJsonParse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "type" in parsed && "data" in parsed && Array.isArray(parsed.data)) {
      const t = (parsed as Record<string, unknown>).type as string;
      const arr = (parsed as Record<string, unknown>).data as unknown[];
      const safeData = arr
        .slice(0, 30)
        .filter((item): item is Record<string, string | number> => typeof item === "object" && item !== null && !Array.isArray(item))
        .map((item) => {
          const row: Record<string, string | number> = {};
          for (const [k, v] of Object.entries(item)) {
            if (typeof k === "string" && (typeof v === "string" || typeof v === "number")) row[k] = v;
          }
          return row;
        });
      if (!["bar", "line", "pie", "area"].includes(t) || safeData.length === 0) return null;

      const rawYKey = (parsed as Record<string, unknown>).yKey ?? (parsed as Record<string, unknown>).yField ?? (parsed as Record<string, unknown>).y;
      const yKeyVal = typeof rawYKey === "string" ? rawYKey : "y";

      let series: ChartSeries[] | undefined;
      const rawSeries = (parsed as Record<string, unknown>).series;
      if (Array.isArray(rawSeries) && rawSeries.length > 0) {
        series = rawSeries
          .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null && "name" in s)
          .slice(0, 5)
          .map((s, i) => {
            const dataKey =
              typeof (s as Record<string, unknown>).dataKey === "string"
                ? (s as Record<string, unknown>).dataKey as string
                : typeof (s as Record<string, unknown>).y === "string"
                  ? (s as Record<string, unknown>).y as string
                  : rawSeries.length === 1
                    ? yKeyVal
                    : "";
            return {
              name: String((s as Record<string, unknown>).name),
              dataKey,
              color: typeof (s as Record<string, unknown>).color === "string" ? (s as Record<string, unknown>).color as string : CHART_COLORS[i % CHART_COLORS.length],
            };
          })
          .filter((s) => s.dataKey.length > 0);
        if (series.length === 0) series = undefined;
      }

      const stacked =
        t === "bar" && typeof (parsed as Record<string, unknown>).stacked === "boolean"
          ? (parsed as Record<string, unknown>).stacked as boolean
          : false;
      const description =
        typeof (parsed as Record<string, unknown>).description === "string"
          ? ((parsed as Record<string, unknown>).description as string).slice(0, 200)
          : undefined;

      const rawXKey = (parsed as Record<string, unknown>).xKey ?? (parsed as Record<string, unknown>).x ?? (parsed as Record<string, unknown>).xField;
      const xKeyVal = typeof rawXKey === "string" ? rawXKey : "x";

      return {
        type: t as ChartSpec["type"],
        title: typeof (parsed as Record<string, unknown>).title === "string" ? (parsed as Record<string, unknown>).title as string : "График",
        data: safeData,
        xKey: xKeyVal,
        yKey: yKeyVal,
        nameKey: typeof (parsed as Record<string, unknown>).nameKey === "string" ? (parsed as Record<string, unknown>).nameKey as string : "name",
        valueKey: typeof (parsed as Record<string, unknown>).valueKey === "string" ? (parsed as Record<string, unknown>).valueKey as string : "value",
        series: series?.length ? series : undefined,
        stacked: stacked || undefined,
        description: description || undefined,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function parseChartFromReply(reply: string): { text: string; charts: ChartSpec[] } {
  const out = parseReplyBlocks(reply);
  return { text: out.text, charts: out.charts };
}

export function parseReplyBlocks(reply: string): {
  text: string;
  charts: ChartSpec[];
  suggestions: string[];
  clarify?: ClarifySpec;
} {
  const charts: ChartSpec[] = [];

  // Извлекаем clarify-блок, если есть
  const clarify = parseClarifyBlock(reply) ?? undefined;

  const chartMatches = Array.from(reply.matchAll(CHART_BLOCK_REGEX));
  for (const m of chartMatches) {
    const spec = parseOneChart(m[1].trim());
    if (spec) charts.push(spec);
  }

  const text = reply
    .replace(CHART_BLOCK_REGEX, "")
    .replace(SUGGESTIONS_BLOCK_REGEX, "")
    .replace(CLARIFY_BLOCK_REGEX, "")
    .trim();

  let suggestions: string[] = [];
  const sugMatch = reply.match(SUGGESTIONS_BLOCK_REGEX);
  if (sugMatch) {
    suggestions = sugMatch[1]
      .split("\n")
      .map((s) => String(s).trim().replace(/^[-•*]\s*/, "").slice(0, 120))
      .filter((s) => s.length > 0)
      .slice(0, 4);
  }

  return { text, charts, suggestions, clarify };
}
