"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { parseReplyBlocks, type ChartSpec, type ClarifySpec } from "@/app/lib/chartSpec";
import MessageContent from "@/app/components/MessageContent";
import TopNav from "@/app/components/TopNav";

const ChartBlock = dynamic(() => import("@/app/components/ChartBlock"), { ssr: false });

const CHAT_STORAGE_KEY = "macrodata-chat";
const CHAT_STORAGE_MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_FOR_API = 12;
const MAX_HISTORY_CONTENT_LENGTH = 1200;
const ANON_PLACEHOLDER_RE = /(?:__ANON_\d+__|_ANON_\d+_)/i;

function chartHasAnonPlaceholders(charts: ChartSpec[]): boolean {
  return charts.some((chart) =>
    chart.data.some((row) =>
      Object.values(row).some((v) => typeof v === "string" && ANON_PLACEHOLDER_RE.test(v))
    )
  );
}

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  date: Date;
  charts?: ChartSpec[];
  suggestions?: string[];
  clarify?: ClarifySpec;
  sql?: string;
  exportId?: string;
  rowCount?: number;
};

function isErrorMessage(content: string) {
  return content.startsWith("Ошибка:");
}

const FETCH_OPTS = { credentials: "include" as RequestCredentials };

export default function Home() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"sql" | "format" | "cache" | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/auth/session", FETCH_OPTS)
      .then((r) => {
        setAuthenticated(r.ok);
        setAuthChecked(true);
      })
      .catch(() => {
        setAuthChecked(true);
        setAuthenticated(false);
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id: string; role: string; content: string; date: string; charts?: ChartSpec[]; suggestions?: string[]; clarify?: ClarifySpec; sql?: string; exportId?: string; rowCount?: number }[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMessages(
          parsed.map((m) => ({
            ...m,
            role: m.role as "user" | "assistant",
            date: new Date(m.date),
          }))
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const list = messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        date: m.date.toISOString(),
        charts: m.charts,
        suggestions: m.suggestions,
        clarify: m.clarify,
        sql: m.sql,
        exportId: m.exportId,
        rowCount: m.rowCount,
      }));
      const toStore = list.length > CHAT_STORAGE_MAX_MESSAGES ? list.slice(-CHAT_STORAGE_MAX_MESSAGES) : list;
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      /* ignore */
    }
  }, [messages]);

  function clearChat() {
    setMessages([]);
    setInput("");
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    inputRef.current?.focus();
  }

  function copyContent(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function extractMarkdownTable(content: string): string | null {
    const match = content.match(/\|[^\n]+\|\n\|[-:\s|]+\|\n(\|[^\n]+\|\n?)+/);
    return match ? match[0].trim() : null;
  }

  function copyTable(id: string, content: string) {
    const table = extractMarkdownTable(content);
    if (!table) return;
    navigator.clipboard.writeText(table).then(() => {
      setCopiedTableId(id);
      setTimeout(() => setCopiedTableId(null), 2000);
    });
  }

  const [csvDownloadingId, setCsvDownloadingId] = useState<string | null>(null);
  async function downloadCsv(exportId: string, rowCount: number) {
    if (csvDownloadingId) return;
    setCsvDownloadingId(exportId);
    try {
      const res = await fetch(`/api/chat/export?id=${encodeURIComponent(exportId)}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data && typeof data.error === "string") ? data.error : "Выгрузка не найдена или истекла";
        alert(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `macrodata-export-${exportId.slice(0, 8)}.csv`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    } finally {
      setCsvDownloadingId(null);
    }
  }

  function cancelRequest() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && !last.content && prev.length >= 2) return prev.slice(0, -1);
      return prev;
    });
    setLoading(false);
    inputRef.current?.focus();
  }

  function retryLast(messageId: string) {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 1) return;
    const userMsg = messages[idx - 1];
    const assistantMsg = messages[idx];
    if (userMsg.role !== "user" || assistantMsg.role !== "assistant" || !isErrorMessage(assistantMsg.content)) return;
    const textToResend = userMsg.content;
    setMessages((prev) => prev.slice(0, idx));
    sendMessage(textToResend);
  }

  const sendMessage = useCallback(async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      date: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      date: new Date(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setLoadingStep("sql");

    const historyForApi = messages
      .slice(-HISTORY_FOR_API)
      .map((m) => ({
        role: m.role,
        content:
          m.role === "assistant" && m.content.length > MAX_HISTORY_CONTENT_LENGTH
            ? m.content.slice(0, MAX_HISTORY_CONTENT_LENGTH) + "\n[...]"
            : m.content,
      }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, stream: true, history: historyForApi, source: "chat" }),
        signal,
        credentials: "include",
      });
      if (res.status === 401) {
        setAuthenticated(false);
        throw new Error("Требуется вход в систему");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data && typeof data.error === "string") ? data.error : `Ошибка сервера ${res.status}`;
        throw new Error(msg);
      }
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Нет ответа от сервера. Повторите запрос.");
      }
      const decoder = new TextDecoder();
      let buffer = "";
      try {
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
                t?: string;
                c?: string;
                reply?: string;
                chart?: ChartSpec | null;
                charts?: ChartSpec[];
                suggestions?: string[];
                clarify?: ClarifySpec;
                sql?: string;
                exportId?: string;
                rowCount?: number;
                error?: string;
                step?: string;
              };
              if (payload.t === "step" && payload.step) {
                setLoadingStep(payload.step === "format" ? "format" : payload.step === "cache" ? "cache" : "sql");
              } else if (payload.t === "d" && typeof payload.c === "string") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + payload.c } : m
                  )
                );
              } else if (payload.t === "e") {
                let chartsList = Array.isArray(payload.charts) ? payload.charts : (payload.chart ? [payload.chart] : []);
                if (
                  chartsList.length > 0 &&
                  chartHasAnonPlaceholders(chartsList) &&
                  typeof payload.reply === "string"
                ) {
                  const reparsed = parseReplyBlocks(payload.reply).charts;
                  if (reparsed.length > 0) chartsList = reparsed;
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: typeof payload.reply === "string" ? payload.reply : m.content,
                          charts: chartsList,
                          suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
                          clarify: payload.clarify ?? undefined,
                          sql: typeof payload.sql === "string" ? payload.sql : undefined,
                          exportId: typeof payload.exportId === "string" ? payload.exportId : undefined,
                          rowCount: typeof payload.rowCount === "number" ? payload.rowCount : undefined,
                        }
                      : m
                  )
                );
              } else if (payload.t === "err" && typeof payload.error === "string") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: `Ошибка: ${payload.error}` } : m
                  )
                );
              }
            } catch {
              /* ignore single line parse */
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }
      const msg =
        err instanceof Error
          ? err.message
          : "Не удалось отправить запрос. Проверьте интернет и ключ OpenAI в настройках сервера.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Ошибка: ${msg}` } : m
        )
      );
    } finally {
      setLoading(false);
      setLoadingStep(null);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [loading]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const login = (form.elements.namedItem("login") as HTMLInputElement)?.value?.trim() ?? "";
    const password = (form.elements.namedItem("password") as HTMLInputElement)?.value ?? "";
    setLoginError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setAuthenticated(true);
    } else {
      setLoginError((data && typeof data.error === "string") ? data.error : "Ошибка входа");
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setAuthenticated(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return;
    sendMessage(trimmed);
  }

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxH = 128;
    const h = Math.min(Math.max(el.scrollHeight, 44), maxH);
    el.style.height = `${h}px`;
  }, [input]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ── Auth check loader ── */
  if (!authChecked) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#f8fafc]">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-glow-sm mb-4">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  /* ── Login form ── */
  if (!authenticated) {
    return (
      <div className="flex flex-col h-screen relative z-10 bg-[#f8fafc]">
        <header className="flex-shrink-0 ui-nav">
          <div className="max-w-md mx-auto px-4 h-full flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-glow-sm shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="font-semibold text-base text-slate-900 tracking-tight">MacroData</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <form onSubmit={handleLogin} className="w-full max-w-sm">
            <div className="ui-card p-7">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900 mb-1">Вход в систему</h2>
                <p className="text-sm text-slate-500">Доступ только для авторизованных пользователей</p>
              </div>
              <label className="block mb-4">
                <span className="text-xs font-semibold text-slate-600 block mb-1.5 uppercase tracking-wide">Логин</span>
                <input
                  type="text"
                  name="login"
                  autoComplete="username"
                  required
                  className="ui-input"
                  placeholder="Ваш логин"
                />
              </label>
              <label className="block mb-5">
                <span className="text-xs font-semibold text-slate-600 block mb-1.5 uppercase tracking-wide">Пароль</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  className="ui-input"
                  placeholder="Пароль"
                />
              </label>
              {loginError && (
                <div className="mb-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-600">{loginError}</p>
                </div>
              )}
              <button
                type="submit"
                className="ui-btn ui-btn-primary w-full h-11"
              >
                Войти
              </button>
            </div>
          </form>
        </main>
      </div>
    );
  }

  /* ── Main chat layout ── */
  return (
    <div className="flex flex-col h-screen relative z-10">
      <TopNav
        title="MacroData"
        subtitle="Ассистент по данным застройщика"
        containerClassName="max-w-3xl lg:max-w-4xl mx-auto"
        icon={(
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-glow-sm shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
        )}
        actions={(
          <>
            <Link href="/dashboard" className="ui-btn ui-btn-secondary gap-1.5 px-3" aria-label="Перейти к дашбордам">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              Дашборды
            </Link>
            {messages.length > 0 && (
              <button type="button" onClick={clearChat} className="ui-btn ui-btn-secondary gap-1.5 px-3" aria-label="Начать новый диалог">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m-8-8h16" />
                </svg>
                Новый диалог
              </button>
            )}
            <button type="button" onClick={handleLogout} className="ui-btn ui-btn-secondary px-3" aria-label="Выйти">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </>
        )}
      />

      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin w-full">
        <div className="max-w-3xl lg:max-w-4xl w-full mx-auto px-4 lg:px-6 py-6">

          {/* ── Welcome screen ── */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center px-2 pb-10">
              {/* Hero */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center mb-5 shadow-glow-sm animate-fade-in">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">Ассистент по данным Capital Invest</h2>
              <p className="text-slate-500 text-sm max-w-sm mb-8 leading-relaxed">
                Задайте вопрос — получите таблицы, графики и аналитику из вашей CRM.
              </p>

              {/* Info cards */}
              <div className="w-full max-w-xl space-y-3 text-left animate-fade-in mb-8">
                {[
                  {
                    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
                    title: "Что умеет ассистент",
                    items: [
                      "Отчёты по сделкам, заявкам, объектам и домам",
                      "Маркетинг: конверсия, заявки по каналам, рекомендации по бюджету",
                      "Финансы, дебиторская задолженность, план vs факт",
                      "Графики, таблицы, уточнение в диалоге",
                    ],
                  },
                  {
                    icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
                    title: "Как писать запросы",
                    items: [
                      "Своими словами: «сколько заявок за февраль 2026»",
                      "Указывайте период: «за последние 3 месяца»",
                      "Просите детализацию: «по домам», «с телефонами»",
                    ],
                  },
                ].map((card) => (
                  <div key={card.title} className="ui-card p-4 flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.icon} />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">{card.title}</p>
                      <ul className="text-sm text-slate-500 space-y-1">
                        {card.items.map((item) => (
                          <li key={item} className="flex items-start gap-1.5">
                            <span className="text-accent mt-0.5 shrink-0">·</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick prompts */}
              <div className="w-full max-w-xl text-left animate-fade-in">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Примеры запросов</p>
                <div className="space-y-3">
                  {[
                    {
                      label: "Сделки",
                      color: "bg-blue-50 border-blue-100 text-blue-700 hover:border-blue-200",
                      dot: "bg-blue-400",
                      prompts: [
                        "Проведённые сделки за последний месяц по отделам",
                        "План vs факт по месяцам",
                      ],
                    },
                    {
                      label: "Маркетинг",
                      color: "bg-violet-50 border-violet-100 text-violet-700 hover:border-violet-200",
                      dot: "bg-violet-400",
                      prompts: [
                        "Заявки за февраль 2026 по каналам",
                        "Конверсия каналов и рекомендации по бюджету",
                      ],
                    },
                    {
                      label: "Финансы",
                      color: "bg-emerald-50 border-emerald-100 text-emerald-700 hover:border-emerald-200",
                      dot: "bg-emerald-400",
                      prompts: [
                        "Дебиторская задолженность по всем пользователям",
                        "Поступления по сделкам за период",
                      ],
                    },
                  ].map((group) => (
                    <div key={group.label} className="flex flex-wrap gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${group.color} cursor-default`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${group.dot}`} />
                        {group.label}
                      </span>
                      {group.prompts.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => sendMessage(s)}
                          className="px-3 py-2 rounded-xl bg-white border border-[#e8edf2] text-slate-600 text-sm hover:border-accent/40 hover:text-accent hover:bg-accent/5 transition-all duration-200 text-left shadow-sm"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Messages ── */}
          {messages.map((m) => {
            // Показываем один индикатор загрузки внизу; пустое сообщение ассистента при loading не рендерим
            if (m.role === "assistant" && !m.content && loading) {
              return <div key={m.id} className="mb-4" aria-hidden />;
            }
            return (
            <div
              key={m.id}
              className={`flex animate-slide-up ${m.role === "user" ? "justify-end" : "justify-start"} mb-4`}
            >
              {/* Assistant avatar */}
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shrink-0 mt-1 mr-2 shadow-sm">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
              )}

              <div
                className={`rounded-2xl px-4 py-3 ${
                  m.role === "user"
                    ? "max-w-[82%] lg:max-w-[72%] bg-accent text-white rounded-br-sm shadow-sm"
                    : "min-w-[200px] max-w-[600px] lg:max-w-[680px] bg-white border border-[#e8edf2] rounded-bl-sm shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {m.role === "user" ? (
                      <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</div>
                    ) : m.content ? (
                      <div className="text-slate-800">
                        <MessageContent content={m.content} />
                      </div>
                    ) : loading ? (
                      <div className="flex items-center gap-2 text-slate-400">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((j) => (
                            <span key={j} className="w-1.5 h-1.5 rounded-full bg-accent/50 animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />
                          ))}
                        </div>
                        <span className="text-xs text-slate-400">
                          {loadingStep === "format" ? "Оформляю ответ…" : loadingStep === "cache" ? "Из кэша…" : "Ищу данные…"}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Action buttons for assistant messages */}
                  {m.role === "assistant" && m.content && (
                    <div className="shrink-0 flex items-center gap-0.5">
                      {isErrorMessage(m.content) && (
                        <button
                          type="button"
                          onClick={() => retryLast(m.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title="Повторить"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      )}
                      {m.exportId && m.rowCount != null && (
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
                          onClick={() => copyTable(m.id, m.content)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title="Копировать таблицу"
                        >
                          {copiedTableId === m.id ? (
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
                        onClick={() => copyContent(m.id, m.content)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="Копировать"
                      >
                        {copiedId === m.id ? (
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

                {/* Charts */}
                {m.role === "assistant" && m.charts && m.charts.length > 0 && (
                  <div className="space-y-3 mt-1">
                    {m.charts.map((spec, i) => (
                      <ChartBlock key={i} spec={spec} />
                    ))}
                  </div>
                )}

                {/* Clarify options */}
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

                {/* Suggestions */}
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
            </div>
          );
          })}

          {/* ── Typing indicator ── */}
          {loading && (
            <div className="flex justify-start items-center gap-3 mb-4 animate-fade-in">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shrink-0 shadow-sm">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-white border border-[#e8edf2] shadow-sm flex items-center gap-3">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs text-slate-400">
                  {loadingStep === "format" ? "Оформляю ответ…" : loadingStep === "cache" ? "Из кэша…" : "Ищу данные в БД…"}
                </span>
                <button
                  type="button"
                  onClick={cancelRequest}
                  className="text-xs text-slate-400 hover:text-red-400 transition-colors border-l border-[#e8edf2] pl-3 ml-1"
                >
                  Отменить
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* ── Input (без разделения с чатом) ── */}
      <footer className="flex-shrink-0">
        <div className="max-w-3xl lg:max-w-4xl mx-auto px-4 lg:px-6 py-4 lg:py-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Поле без внешних границ */}
            <div className="rounded-2xl bg-slate-50/70 focus-within:ring-2 focus-within:ring-accent/10 transition-shadow duration-200">
              <div className="flex gap-2 p-2">
                <label className="flex-1 min-w-0 flex items-center">
                  <span className="sr-only">Вопрос по данным MacroData</span>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      const v = e.target.value;
                      setInput(v.length <= MAX_MESSAGE_LENGTH ? v : v.slice(0, MAX_MESSAGE_LENGTH));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    placeholder="Вопрос по данным MacroData…"
                    rows={1}
                    maxLength={MAX_MESSAGE_LENGTH}
                    className="min-h-[44px] max-h-32 w-full resize-none rounded-xl border-0 bg-white/80 py-3 px-4 text-sm leading-[1.5] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/20 scrollbar-thin"
                    disabled={loading}
                    aria-describedby="input-hint input-counter"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading || !input.trim() || input.length > MAX_MESSAGE_LENGTH}
                  className="flex-shrink-0 h-[44px] w-[44px] rounded-xl bg-accent text-white flex items-center justify-center shadow-sm hover:bg-accent-dark disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  aria-label="Отправить"
                  title="Отправить (Enter)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Подсказки и счётчик */}
            <div className="flex items-center justify-between gap-4 min-h-[20px] px-0.5">
              <div id="input-hint" className="flex items-center gap-2.5 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 shadow-[0_1px_0_0_rgba(255,255,255,0.8)_inset]">Ctrl+K</kbd>
                  <span>фокус</span>
                </span>
                <span className="text-slate-300 select-none">·</span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 shadow-[0_1px_0_0_rgba(255,255,255,0.8)_inset]">Enter</kbd>
                  <span>отправить</span>
                </span>
                <span className="text-slate-300 select-none">·</span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 shadow-[0_1px_0_0_rgba(255,255,255,0.8)_inset]">⇧ Enter</kbd>
                  <span>новая строка</span>
                </span>
              </div>
              <span
                id="input-counter"
                className={`text-[11px] tabular-nums shrink-0 ${input.length >= MAX_MESSAGE_LENGTH ? "text-red-500 font-medium" : "text-slate-400"}`}
                aria-live="polite"
              >
                {input.length > 100 && `${input.length} / ${MAX_MESSAGE_LENGTH}`}
              </span>
            </div>
          </form>
        </div>
      </footer>
    </div>
  );
}
