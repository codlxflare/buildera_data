"use client";

import { useState, useRef, useEffect } from "react";
import MessageContent from "@/app/components/MessageContent";
import ChartBlock from "@/app/components/ChartBlock";
import { parseReplyBlocks, type ChartSpec, type ClarifySpec } from "@/app/lib/chartSpec";
import { randomUUID } from "@/app/lib/uuid";

const QUICK_PROMPTS = [
  "Дай 3 вывода и рекомендации по данным",
  "Детализация по отделам за период",
  "Сравни с прошлым месяцем",
  "Почему конверсия могла измениться?",
  "Где самый большой долг и что делать?",
  "Какие каналы стоит усилить?",
];

const FETCH_OPTS = { credentials: "include" as RequestCredentials };
const ANON_PLACEHOLDER_RE = /(?:__ANON_\d+__|_ANON_\d+_)/i;

function chartHasAnonPlaceholders(charts: ChartSpec[]): boolean {
  return charts.some((chart) =>
    chart.data.some((row) =>
      Object.values(row).some((v) => typeof v === "string" && ANON_PLACEHOLDER_RE.test(v))
    )
  );
}

interface PinnableWidget {
  id: string;
  title: string;
  chartSpec: ChartSpec;
  prompt: string;
  createdAt: number;
}

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  charts?: ChartSpec[];
  suggestions?: string[];
  clarify?: ClarifySpec;
  exportId?: string;
  rowCount?: number;
  sql?: string;
}

interface DashboardAiPanelProps {
  open: boolean;
  onClose: () => void;
  contextString: string;
  periodLabel: string;
  initialPrompt?: string | null;
  onInitialPromptSent?: () => void;
  onPinChart?: (widget: PinnableWidget) => void;
}

export default function DashboardAiPanel({
  open, onClose, contextString, periodLabel,
  initialPrompt, onInitialPromptSent, onPinChart,
}: DashboardAiPanelProps) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [csvDownloadingId, setCsvDownloadingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sentInitialRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function extractMarkdownTable(content: string): string | null {
    const match = content.match(/\|[^\n]+\|\n\|[-:\s|]+\|\n(\|[^\n]+\|\n?)+/);
    return match ? match[0].trim() : null;
  }
  function copyContent(msgKey: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(msgKey);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }
  function copyTable(msgKey: string, content: string) {
    const table = extractMarkdownTable(content);
    if (!table) return;
    navigator.clipboard.writeText(table).then(() => {
      setCopiedTableId(msgKey);
      setTimeout(() => setCopiedTableId(null), 2000);
    });
  }
  async function downloadCsv(exportId: string, rowCount: number) {
    if (csvDownloadingId) return;
    setCsvDownloadingId(exportId);
    try {
      const res = await fetch(`/api/chat/export?id=${encodeURIComponent(exportId)}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data?.error === "string" ? data.error : "Ошибка выгрузки");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `macrodata-export-${exportId.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
    } finally {
      setCsvDownloadingId(null);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open) {
      sentInitialRef.current = null;
      return;
    }
    if (!initialPrompt?.trim()) return;
    if (sentInitialRef.current === initialPrompt) return;
    sentInitialRef.current = initialPrompt;
    sendMessage(initialPrompt);
    onInitialPromptSent?.();
  }, [open, initialPrompt]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  async function sendMessage(userText: string) {
    const trimmed = (userText || input).trim();
    if (!trimmed || loading) return;
    const fullMessage = contextString
      ? `[Контекст дашборда: ${contextString}]\n\n${trimmed}`
      : trimmed;
    setInput("");
    const historyForApi = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: trimmed }, { role: "assistant", content: "", charts: [] }]);
    setLoading(true);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: fullMessage, stream: true, history: historyForApi, noAnonymize: true, source: "dashboard" }),
        signal,
        ...FETCH_OPTS,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data && typeof data.error === "string") ? data.error : `Ошибка ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Нет ответа");
      const decoder = new TextDecoder();
      let buffer = "";

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
              t?: string; c?: string; reply?: string; error?: string; charts?: ChartSpec[];
              suggestions?: string[]; clarify?: ClarifySpec;
              exportId?: string; rowCount?: number; sql?: string;
            };
            if (payload.t === "d" && typeof payload.c === "string") {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: last.content + payload.c };
                }
                return next;
              });
            } else if (payload.t === "e") {
              let charts = Array.isArray(payload.charts) ? payload.charts : [];
              if (
                charts.length > 0 &&
                chartHasAnonPlaceholders(charts) &&
                typeof payload.reply === "string"
              ) {
                const reparsed = parseReplyBlocks(payload.reply).charts;
                if (reparsed.length > 0) charts = reparsed;
              }
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    content: payload.reply ?? last.content,
                    charts,
                    suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : undefined,
                    clarify: payload.clarify ?? undefined,
                    exportId: typeof payload.exportId === "string" ? payload.exportId : undefined,
                    rowCount: typeof payload.rowCount === "number" ? payload.rowCount : undefined,
                    sql: typeof payload.sql === "string" ? payload.sql : undefined,
                  };
                }
                return next;
              });
            } else if (payload.t === "err" && typeof payload.error === "string") {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: `Ошибка: ${payload.error}` };
                }
                return next;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            content: `Ошибка: ${err instanceof Error ? err.message : "Не удалось отправить запрос"}`,
          };
        }
        return next;
      });
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handlePinChart(chart: ChartSpec, msgIndex: number) {
    if (!onPinChart) return;
    const pinId = `${msgIndex}-${chart.title}`;
    if (pinnedIds.has(pinId)) return;
    setPinnedIds((prev) => { const next = new Set(Array.from(prev)); next.add(pinId); return next; });
    const title = chart.title || "ИИ-диаграмма";
    const prompt = messages[msgIndex - 1]?.content ?? "";
    onPinChart({
      id: randomUUID(),
      title,
      chartSpec: chart,
      prompt,
      createdAt: Date.now(),
    });
    void fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "WIDGET_CREATED", source: "dashboard", widgetTitle: title, prompt }),
      credentials: "include",
    }).catch(() => {});
  }

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white border-l border-[#e8edf2] shadow-2xl animate-slide-in-right" style={{ width: "min(50vw, 780px)", minWidth: "380px" }}>

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-[#e8edf2] flex items-center justify-between gap-2 bg-[#fafbfc]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shrink-0 shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-900 text-sm leading-tight">ИИ-ассистент</h2>
              <p className="text-xs text-slate-400 truncate">{periodLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                title="Очистить историю"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
              aria-label="Закрыть"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Context bar */}
        {contextString && (
          <div className="flex-shrink-0 px-4 py-2 bg-accent/5 border-b border-accent/10">
            <p className="text-xs text-slate-500 truncate" title={contextString.length > 200 ? "Полные данные дашборда переданы ассистенту" : contextString}>
              <span className="text-accent font-medium">Контекст: </span>
              {contextString.length > 200
                ? "полные данные дашборда (KPI + виджеты), доступ к БД как в основном чате"
                : contextString.slice(0, 120)}{contextString.length > 120 && contextString.length <= 200 ? "…" : ""}
            </p>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
          {messages.length === 0 && (
            <div className="py-4">
              <p className="text-sm text-slate-400 text-center mb-4">
                Спросите что угодно по данным дашборда
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    disabled={loading}
                    className="px-3 py-2 rounded-xl bg-[#f8fafc] hover:bg-[#f1f5f9] text-slate-600 text-xs border border-[#e8edf2] hover:border-[#cbd5e1] transition-all text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
              {m.role === "assistant" && (
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shrink-0 mt-1 mr-2">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
              )}
              <div className={`max-w-[90%] rounded-2xl px-3.5 py-3 text-sm ${
                m.role === "user"
                  ? "bg-accent text-white rounded-br-sm"
                  : "bg-white border border-[#e8edf2] text-slate-800 rounded-bl-sm shadow-sm"
              }`}>
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                ) : (
                  <div className="space-y-2">
                    {m.content ? (
                      <div className="flex flex-col gap-1.5">
                        <MessageContent content={m.content} />
                        {m.content && (
                          <div className="flex items-center gap-0.5 flex-wrap">
                            {m.exportId != null && m.rowCount != null && (
                              <button
                                type="button"
                                onClick={() => downloadCsv(m.exportId!, m.rowCount!)}
                                disabled={csvDownloadingId === m.exportId}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40"
                                title={`Скачать CSV (${m.rowCount} строк)`}
                              >
                                {csvDownloadingId === m.exportId ? (
                                  <span className="text-xs text-accent">…</span>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                )}
                              </button>
                            )}
                            {extractMarkdownTable(m.content) && (
                              <button
                                type="button"
                                onClick={() => copyTable(`msg-${i}`, m.content)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                title="Копировать таблицу"
                              >
                                {copiedTableId === `msg-${i}` ? (
                                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => copyContent(`msg-${i}`, m.content)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                              title="Копировать"
                            >
                              {copiedId === `msg-${i}` ? (
                                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : loading && i === messages.length - 1 ? (
                      <div className="flex items-center gap-2 text-slate-400">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((j) => (
                            <span key={j} className="w-1.5 h-1.5 rounded-full bg-accent/40 animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />
                          ))}
                        </div>
                        <span className="text-xs">Думаю…</span>
                      </div>
                    ) : null}

                    {m.charts && m.charts.length > 0 && (
                      <div className="space-y-2 mt-2">
                        {m.charts.map((chart, ci) => {
                          const pinId = `${i}-${chart.title}`;
                          const isPinned = pinnedIds.has(pinId);
                          return (
                            <div key={ci} className="rounded-xl border border-[#e8edf2] overflow-hidden">
                              <ChartBlock spec={chart} />
                              {onPinChart && (
                                <div className="px-3 py-2 border-t border-[#f0f4f8] flex justify-end bg-[#fafbfc]">
                                  <button
                                    type="button"
                                    onClick={() => handlePinChart(chart, i)}
                                    disabled={isPinned}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                      isPinned
                                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default"
                                        : "bg-white hover:bg-accent/5 text-slate-500 hover:text-accent border border-[#e8edf2] hover:border-accent/30"
                                    }`}
                                  >
                                    {isPinned ? (
                                      <>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Добавлено
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                        </svg>
                                        На дашборд
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {m.role === "assistant" && m.clarify && m.clarify.options.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-[#e8edf2]">
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs font-semibold text-accent">Уточните запрос</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {m.clarify.options.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => sendMessage(opt)}
                              className="px-3 py-2 rounded-xl bg-accent/10 hover:bg-accent/15 text-accent text-xs font-medium border border-accent/20 hover:border-accent/40 transition-all duration-200"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {m.role === "assistant" && !m.clarify && m.suggestions && m.suggestions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#f0f4f8]">
                        <p className="text-xs font-medium text-slate-400 mb-2">Что спросить дальше</p>
                        <div className="flex flex-wrap gap-2">
                          {m.suggestions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => sendMessage(s)}
                              className="px-3 py-1.5 rounded-lg bg-[#f8fafc] hover:bg-[#f1f5f9] text-slate-500 hover:text-slate-700 text-xs border border-[#e8edf2] hover:border-[#cbd5e1] transition-all duration-200"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-[#e8edf2] bg-white">
          {loading && (
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <div className="flex gap-1">
                  {[0, 1, 2].map((j) => (
                    <span key={j} className="w-1 h-1 rounded-full bg-accent/50 animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />
                  ))}
                </div>
                Генерирую ответ…
              </div>
              <button
                type="button"
                onClick={() => { abortRef.current?.abort(); setLoading(false); }}
                className="text-xs text-slate-400 hover:text-red-400 transition-colors"
              >
                Отменить
              </button>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Вопрос по данным дашборда…"
              disabled={loading}
              className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:opacity-50 text-sm transition-all"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="ui-btn ui-btn-primary h-10 w-10 p-0 rounded-xl flex-shrink-0 disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
