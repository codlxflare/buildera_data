import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  SECURITY_AND_CONFIDENTIALITY,
  COMPANY_CONTEXT,
  MACRODATA_SCHEMA_CONTEXT,
  ASSISTANT_INSTRUCTIONS_SQL,
  buildClarifyInstructions,
  ASSISTANT_INSTRUCTIONS_FORMAT,
  ASSISTANT_INSTRUCTIONS,
  CHART_INSTRUCTIONS,
  SUGGESTIONS_INSTRUCTIONS,
} from "@/app/lib/schemaContext";
import {
  getMacrodataSchemaFromApiTxt,
  getMacrodataSchemaShort,
  getAiSchemaGuideContent,
  getSchemaByIntent,
  getSqlExamplesContent,
} from "@/app/lib/apiSchema";
import { getSchemaSamplesText } from "@/app/lib/dbSamples";
import { getSqlModel, getFormatModel } from "@/app/lib/chatModels";
import { buildEconomicalHistory } from "@/app/lib/dialogMemory";
import { parseReplyBlocks, hasClarifyBlock, parseClarifyBlock } from "@/app/lib/chartSpec";
import { checkForbiddenExtraction } from "@/app/lib/requestGuard";
import { randomUUID } from "@/app/lib/uuid";
import { isAuthConfigured, getSessionFromCookie, verifySessionToken } from "@/app/lib/auth";
import {
  extractSqlFromReply,
  runUserSql,
  formatRowsForAi,
} from "@/app/lib/sqlRunner";
import { isDbConfigured } from "@/app/lib/db";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { getCached, setCached } from "@/app/lib/responseCache";
import { createRequestLogger } from "@/app/lib/debugLog";
import { setExport } from "@/app/lib/exportStore";
import { anonymizeRows, replacePlaceholders, replacePlaceholdersInObject } from "@/app/lib/anonymize";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

const MAX_HISTORY_MESSAGES = 12;
const MAX_ASSISTANT_CONTENT_LENGTH = 1200;
const MAX_HISTORY_TOKENS_APPROX = 5000;
const CHARS_PER_TOKEN = 4;

const CHAT_TEMPERATURE = 0.1;
const SQL_MAX_TOKENS = 1500;
const FORMAT_MAX_TOKENS = 2000;
const CSV_EXPORT_THRESHOLD = 50;

/**
 * Убирает markdown-таблицы из текста ответа ассистента перед отправкой в историю к OpenAI.
 * Таблицы содержат конкретные данные из БД (имена, суммы, телефоны),
 * которые не должны повторно уходить в OpenAI в сыром виде.
 * Текстовое резюме и аналитика при этом сохраняются.
 */
function stripTablesFromAssistantContent(content: string): string {
  // Убираем строки, начинающиеся с | (markdown-таблицы)
  const lines = content.split("\n");
  const filtered = lines.filter((line) => !line.trimStart().startsWith("|"));
  const result = filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Если после удаления осталось мало — возвращаем первые 400 символов оригинала
  return result.length > 80 ? result : content.slice(0, 400);
}

/** Паттерны «фиктивных» ответов ассистента, которые засоряют историю и мешают следующему шагу генерировать SQL. */
const FILLER_REPLY_RE = /^(извини|подожди|сейчас|да,?\s*я|конечно|ок,?\s*|хорошо|подготовлю|посмотрю|готовлю|момент|обновлено|уточн)/i;

/** Проверяет, что в тексте запроса уже указан период (месяц, год, «последние N» и т.д.). */
function userMessageHasExplicitPeriod(text: string): boolean {
  const lower = text.toLowerCase();
  const monthWords = "январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь";
  if (new RegExp(`(за|в|за\\s+)?(${monthWords})`, "i").test(lower)) return true;
  if (/\d{4}\s*год|год\s*\d{4}|за\s*\d{4}/i.test(lower)) return true;
  if (/последние\s+\d+|за\s+последние|текущий\s+месяц|этот\s+месяц|прошлый\s+месяц/i.test(lower)) return true;
  if (/квартал|полгода|полугодие/i.test(lower)) return true;
  return false;
}

function buildHistoryMessages(
  raw: Array<{ role?: string; content?: string }> | undefined
): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const slice = raw.slice(-MAX_HISTORY_MESSAGES);
  let list = slice
    .filter((m) => {
      if (!m || !(m.role === "user" || m.role === "assistant") || typeof m.content !== "string") return false;
      // Фильтруем короткие бессодержательные ответы ассистента (они мешают генерации SQL)
      if (m.role === "assistant") {
        const c = (m.content as string).trim();
        if (c.length < 180 && FILLER_REPLY_RE.test(c)) return false;
      }
      return true;
    })
    .map((m) => {
      const role = m.role as "user" | "assistant";
      let content = (m.content as string).trim();
      if (role === "assistant") {
        // Убираем таблицы с конкретными данными из истории перед отправкой в OpenAI
        content = stripTablesFromAssistantContent(content);
        if (content.length > MAX_ASSISTANT_CONTENT_LENGTH) {
          content = content.slice(0, MAX_ASSISTANT_CONTENT_LENGTH) + "\n[...]";
        }
      }
      return { role, content };
    });
  let total = list.reduce((s, m) => s + Math.ceil(m.content.length / CHARS_PER_TOKEN), 0);
  while (total > MAX_HISTORY_TOKENS_APPROX && list.length > 2) {
    list = list.slice(2);
    total = list.reduce((s, m) => s + Math.ceil(m.content.length / CHARS_PER_TOKEN), 0);
  }
  return list;
}

function getClientId(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "client"
  );
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY не задан. Добавьте ключ в .env.local" },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }

  if (isAuthConfigured()) {
    try {
      const token = getSessionFromCookie(req.headers.get("cookie"));
      if (!token || !verifySessionToken(token)) {
        return NextResponse.json(
          { error: "Требуется вход в систему" },
          { status: 401, headers: SECURITY_HEADERS }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Требуется вход в систему" },
        { status: 401, headers: SECURITY_HEADERS }
      );
    }
  }

  const rl = checkRateLimit(getClientId(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте через минуту." },
      { status: 429, headers: { ...SECURITY_HEADERS, "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
    );
  }

  const t0 = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const body = (await req.json()) as { message: string; stream?: boolean; history?: Array<{ role: string; content: string }>; debug?: boolean; noAnonymize?: boolean; source?: string };
    const { message, stream: useStream, history: rawHistory, debug: showSql, noAnonymize, source: requestSource } = body;
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Требуется поле message (строка)" },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }
    let historyMessages = buildHistoryMessages(rawHistory);
    historyMessages = await buildEconomicalHistory(openai, historyMessages);
    const userContent = message.trim();

    const requestId = randomUUID().slice(0, 8);
    const log = createRequestLogger(requestId);

    const isNewDialog = historyMessages.length === 0;
    log("REQUEST", {
      message: userContent,
      stream: useStream,
      historyLength: historyMessages.length,
      newDialog: isNewDialog,
      source: requestSource ?? "unknown",
      debug: showSql,
    });

    if (historyMessages.length === 0) {
      const cached = getCached(userContent);
      if (cached) {
        if (useStream) {
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(ctrl) {
              ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "step", step: "cache" })}\n\n`));
              ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "d", c: cached.reply })}\n\n`));
              ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "e", reply: cached.reply, charts: cached.charts, suggestions: cached.suggestions })}\n\n`));
              ctrl.close();
            },
          });
          return new Response(stream, {
            headers: { ...SECURITY_HEADERS, "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" },
          });
        }
        return NextResponse.json({ reply: cached.reply, charts: cached.charts, suggestions: cached.suggestions }, { headers: SECURITY_HEADERS });
      }
    }

    const extractionReject = checkForbiddenExtraction(userContent);
    if (extractionReject) {
      return NextResponse.json({ error: extractionReject }, { status: 403, headers: SECURITY_HEADERS });
    }

    const dbConfigured = isDbConfigured();

    // Intent Router: определяем нужные таблицы по смыслу вопроса (без лишних API-вызовов)
    const historyContext = historyMessages.slice(-4).map((m) => m.content).join(" ");
    const schemaFull = dbConfigured
      ? getSchemaByIntent(userContent, historyContext)
      : getMacrodataSchemaShort();

    const schemaSamples = dbConfigured ? await getSchemaSamplesText() : "";
    const aiGuide = getAiSchemaGuideContent();
    const sqlExamples = getSqlExamplesContent();

    const now = new Date();
    const dateForPrompt = now.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    const isoDate = now.toISOString().slice(0, 10);
    const curMonth = now.toLocaleString("ru-RU", { month: "long", year: "numeric" });
    const dateContext = `Текущая дата: ${dateForPrompt} (SQL: CURDATE() = '${isoDate}'). Текущий месяц: ${curMonth}. Для «этот месяц» используй DATE_FORMAT(CURDATE(),'%Y-%m-01')…LAST_DAY(CURDATE()).`;

    const samplesBlock = schemaSamples ? `\n\n${schemaSamples}\n` : "";
    const guideBlock = aiGuide ? `\n\n${aiGuide}\n\n` : "";
    const examplesBlock = sqlExamples ? `\n\n## Примеры правильных SQL-запросов (используй как образцы):\n${sqlExamples}\n` : "";
    const clarifyInstructions = buildClarifyInstructions(curMonth);

    const systemForSql = [
      SECURITY_AND_CONFIDENTIALITY,
      COMPANY_CONTEXT,
      MACRODATA_SCHEMA_CONTEXT,
      guideBlock,
      schemaFull,
      dateContext,
      samplesBlock,
      examplesBlock,
      clarifyInstructions,
      ASSISTANT_INSTRUCTIONS_SQL,
    ].join("\n");

    const systemForFormat = `${SECURITY_AND_CONFIDENTIALITY}\n${COMPANY_CONTEXT}\n${ASSISTANT_INSTRUCTIONS_FORMAT}\n${CHART_INSTRUCTIONS}\n${SUGGESTIONS_INSTRUCTIONS}`;
    const systemFallback = [
      SECURITY_AND_CONFIDENTIALITY,
      COMPANY_CONTEXT,
      MACRODATA_SCHEMA_CONTEXT,
      dateContext,
      getMacrodataSchemaShort(),
      ASSISTANT_INSTRUCTIONS,
      CHART_INSTRUCTIONS,
      SUGGESTIONS_INSTRUCTIONS,
    ].join("\n\n");

    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 150_000);
    const sqlModelOpts = { model: getSqlModel(), temperature: CHAT_TEMPERATURE, max_completion_tokens: SQL_MAX_TOKENS };
    const formatModelOpts = { model: getFormatModel(), temperature: CHAT_TEMPERATURE, max_completion_tokens: FORMAT_MAX_TOKENS };

    const firstCallMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: dbConfigured ? systemForSql : systemFallback },
      ...historyMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userContent },
    ];

    const t1 = Date.now();
    const completion = await openai.chat.completions.create(
      { ...sqlModelOpts, messages: firstCallMessages },
      { signal: controller.signal }
    );
    const step1Ms = Date.now() - t1;

    let rawReply = completion.choices[0]?.message?.content?.trim() ?? "";
    let finalReply: string;
    let charts: unknown[] = [];
    let suggestions: unknown[] = [];
    let sqlUsed: string | null = null;
    let exportId: string | undefined;
    let exportRowCount: number | undefined;

    log("AI_SQL_STEP", {
      step1Ms,
      rawReplyLength: rawReply.length,
      rawReplyPreview: rawReply.slice(0, 2000),
    });

    // Clarify: модель просит уточнить запрос → возвращаем уточняющие вопросы без SQL
    if (dbConfigured && hasClarifyBlock(rawReply)) {
      const clarifySpec = parseClarifyBlock(rawReply);
      if (clarifySpec) {
        const isPeriodClarify = /период|временной|месяц|квартал|год|дату|даты/i.test(clarifySpec.message);
        const periodAlreadyInRequest = userMessageHasExplicitPeriod(userContent);
        if (isPeriodClarify && periodAlreadyInRequest) {
          log("CLARIFY_SKIP", { reason: "period_clarify_but_period_in_request", messagePreview: userContent.slice(0, 200) });
          const retryClarifyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: "system", content: systemForSql },
            ...historyMessages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userContent },
            { role: "assistant", content: rawReply },
            { role: "user", content: "Период уже указан в запросе (например «за февраль»). Не выводи блок clarify. Сформируй только блок \\`\\`\\`sql с запросом к БД по этому периоду." },
          ];
          const retryClarifyCompletion = await openai.chat.completions.create(
            { ...sqlModelOpts, messages: retryClarifyMessages },
            { signal: controller.signal }
          );
          rawReply = retryClarifyCompletion.choices[0]?.message?.content?.trim() ?? "";
          log("AI_SQL_STEP", { step: "retry_after_clarify_skip", rawReplyLength: rawReply.length, rawReplyPreview: rawReply.slice(0, 1500) });
        } else {
          clearTimeout(timeoutId);
          log("CLARIFY", { message: clarifySpec.message, optionsCount: clarifySpec.options.length });
          const payload = {
            reply: clarifySpec.message,
            charts: [],
            suggestions: clarifySpec.options,
            clarify: clarifySpec,
          };
          if (useStream) {
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
              start(ctrl) {
                ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "e", ...payload })}\n\n`));
                ctrl.close();
              },
            });
            return new Response(stream, {
              headers: { ...SECURITY_HEADERS, "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" },
            });
          }
          return NextResponse.json(payload, { headers: SECURITY_HEADERS });
        }
      }
    }

    let sql = dbConfigured ? extractSqlFromReply(rawReply) : null;

    if (!sql && dbConfigured) {
      const chartMatch = rawReply.match(/```chart\s*([\s\S]*?)```/);
      if (chartMatch) {
        try {
          const parsed = JSON.parse(chartMatch[1].trim()) as Record<string, unknown>;
          if (typeof parsed.suggested_sql === "string" && parsed.suggested_sql.trim().length > 0) {
            sql = parsed.suggested_sql.trim();
            log("SQL_EXTRACTED", { extractedSql: sql.slice(0, 200), source: "chart_suggested_sql" });
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (!sql) log("SQL_EXTRACTED", { extractedSql: "(нет блока sql)" });

    if (sql) {
      let result = await runUserSql(sql);
      log("SQL_RUN", {
        ok: result.ok,
        rowCount: result.ok ? result.rowCount : undefined,
        error: result.ok ? undefined : result.error,
        sqlPreview: sql.slice(0, 500),
      });
      if (!result.ok) {
        const errMsg = result.error ?? "";
        const retryHint =
          /unknown column|field list/i.test(errMsg)
            ? `Ошибка: неверное имя поля — ${errMsg}. Проверь названия колонок по схеме и исправь.`
            : /doesn't exist|no such table/i.test(errMsg)
            ? `Ошибка: таблица не существует — ${errMsg}. Используй только таблицы из разрешённого списка.`
            : /syntax error/i.test(errMsg)
            ? `Синтаксическая ошибка SQL — ${errMsg}. Проверь синтаксис, скобки и кавычки.`
            : `Ошибка выполнения запроса: ${errMsg}. Исправь SQL и выведи только блок \`\`\`sql ... \`\`\`.`;
        const retryMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: systemForSql },
          ...historyMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userContent },
          { role: "assistant", content: rawReply },
          { role: "user", content: retryHint },
        ];
        const retryCompletion = await openai.chat.completions.create(
          { ...sqlModelOpts, messages: retryMessages },
          { signal: controller.signal }
        );
        const retryReply = retryCompletion.choices[0]?.message?.content?.trim() ?? "";
        sql = extractSqlFromReply(retryReply);
        if (sql) result = await runUserSql(sql);
        log("SQL_RETRY", { reason: "error", newSqlPreview: sql?.slice(0, 400), ok: result.ok, rowCount: result.ok ? result.rowCount : undefined });
      }
      if (result.ok && result.rowCount === 0) {
        // Dynamic current-month bounds for hint (avoid hardcoding past dates)
        const curDate = new Date();
        const cy = curDate.getFullYear();
        const cm = String(curDate.getMonth() + 1).padStart(2, "0");
        const firstDay = `${cy}-${cm}-01`;
        const lastDay = new Date(cy, curDate.getMonth() + 1, 0);
        const lastDayStr = `${cy}-${cm}-${String(lastDay.getDate()).padStart(2, "0")}`;
        const emptyRetryMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: systemForSql },
          ...historyMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userContent },
          { role: "assistant", content: rawReply },
          { role: "user", content: `Запрос вернул 0 строк. Обязательно попробуй другой источник данных.\n\nДля «должны заплатить», «к оплате», «задолженность», «график платежей» — используй таблицу finances (поле date_to), НЕ estate_deals.\nТекущий месяц для finances: DATE(f.date_to) >= '${firstDay}' AND DATE(f.date_to) <= '${lastDayStr}'.\nКонтакт покупателя — только через сделку: LEFT JOIN estate_deals ed ON f.deal_id = ed.deal_id → LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id.\nПример полного запроса:\nFROM finances f LEFT JOIN estate_deals ed ON f.deal_id = ed.deal_id LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id LEFT JOIN estate_sells s ON f.estate_sell_id = s.estate_sell_id LEFT JOIN estate_houses h ON s.house_id = h.house_id WHERE f.deal_id IS NOT NULL.\nSELECT: DATE(f.date_to), SUM(f.summa), c.contacts_buy_name, c.contacts_buy_phones, COALESCE(h.name,h.public_house_name) AS house_name, s.plans_name, s.geo_flatnum.\nDедубликация: GROUP BY ed.contacts_buy_id, f.estate_sell_id, DATE(f.date_to); SUM(f.summa); остальное через MAX().\nВыведи только блок \`\`\`sql ... \`\`\`.` },
        ];
        const emptyRetryCompletion = await openai.chat.completions.create(
          { ...sqlModelOpts, messages: emptyRetryMessages },
          { signal: controller.signal }
        );
        const emptyRetryReply = emptyRetryCompletion.choices[0]?.message?.content?.trim() ?? "";
        const sql2 = extractSqlFromReply(emptyRetryReply);
        if (sql2 && sql2 !== sql) {
          const result2 = await runUserSql(sql2);
          if (result2.ok && result2.rowCount > 0) {
            result = result2;
            sql = sql2;
            log("SQL_RETRY", { reason: "empty", usedSecondQuery: true, rowCount: result2.rowCount });
          }
        }
      }
      if (sql) sqlUsed = sql;
      if (result.ok) {
        if (result.rowCount > 0) {
          exportId = randomUUID();
          exportRowCount = result.rowCount;
          setExport(exportId, result.rows);
        }
        const useAnonymize = !noAnonymize;
        const { anonymizedRows, placeholderToReal } = useAnonymize ? anonymizeRows(result.rows) : { anonymizedRows: result.rows, placeholderToReal: new Map<string, string>() };
        const dataBlock = `[Результат запроса к БД (${result.rowCount} строк):]\n\`\`\`\n${formatRowsForAi(anonymizedRows)}\n\`\`\``;
        const formatUserContent = `Вопрос пользователя: ${userContent}\n\n${dataBlock}\n\nСделай данные наглядными. Суммы указывай в KZT (тенге).${result.rowCount >= CSV_EXPORT_THRESHOLD ? " В начале ответа кратко отметь, что показано много строк и доступна выгрузка в CSV." : ""}`;

        log("FORMAT_INPUT", {
          dataBlockLength: dataBlock.length,
          dataPreview: dataBlock.slice(0, 1500),
          userQuestion: userContent,
        });

        if (useStream) {
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            async start(ctrl) {
              ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "step", step: "format" })}\n\n`));
              const formatStream = await openai.chat.completions.create(
                {
                  ...formatModelOpts,
                  stream: true,
                  messages: [
                    { role: "system", content: systemForFormat },
                    { role: "user", content: formatUserContent },
                  ],
                },
                { signal: controller.signal }
              );
              let full = "";
              for await (const chunk of formatStream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
                const delta = chunk.choices[0]?.delta?.content ?? "";
                if (delta) {
                  full += delta;
                  ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "d", c: delta })}\n\n`));
                }
              }
              const fullReplaced = replacePlaceholders(full.trim(), placeholderToReal);
              const parsed = parseReplyBlocks(fullReplaced);
              const reply = parsed.text && parsed.text.length > 0 ? parsed.text : fullReplaced;
              // Диаграммы на фронт/дашборд — с реальными данными; ИИ получал только обезличенные
              const chartsForClient = replacePlaceholdersInObject(parsed.charts ?? [], placeholderToReal) as unknown[];
              const endPayload: { t: string; reply: string; charts: unknown[]; suggestions: unknown[]; sql?: string; exportId?: string; rowCount?: number } = { t: "e", reply, charts: chartsForClient, suggestions: parsed.suggestions ?? [] };
              if (showSql && sqlUsed) endPayload.sql = sqlUsed;
              if (exportId && exportRowCount != null) {
                endPayload.exportId = exportId;
                endPayload.rowCount = exportRowCount;
              }
              ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(endPayload)}\n\n`));
              ctrl.close();
              log("FORMAT_OUTPUT", { replyLength: reply.length, replyPreview: reply.slice(0, 1500), chartsCount: chartsForClient.length, suggestionsCount: parsed.suggestions?.length ?? 0 });
              log("RESPONSE", { stream: true, finalReplyLength: reply.length, sqlReturned: !!sqlUsed, durationMs: Date.now() - t0, source: requestSource ?? "unknown" });
              if (historyMessages.length === 0) setCached(userContent, reply, chartsForClient, parsed.suggestions ?? []);
            },
          });
          clearTimeout(timeoutId);
          return new Response(stream, {
            headers: { ...SECURITY_HEADERS, "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" },
          });
        }

        const formatCompletion = await openai.chat.completions.create(
          {
            ...formatModelOpts,
            messages: [
              { role: "system", content: systemForFormat },
              { role: "user", content: formatUserContent },
            ],
          },
          { signal: controller.signal }
        );
        const formatted = formatCompletion.choices[0]?.message?.content?.trim() ?? "";
        const formattedReplaced = replacePlaceholders(formatted, placeholderToReal);
        const parsed = parseReplyBlocks(formattedReplaced);
        finalReply = parsed.text && parsed.text.length > 0 ? parsed.text : formattedReplaced;
        // Диаграммы на фронт/дашборд — с реальными данными; ИИ получал только обезличенные
        charts = replacePlaceholdersInObject(parsed.charts ?? [], placeholderToReal) as unknown[];
        suggestions = parsed.suggestions ?? [];
        log("FORMAT_OUTPUT", {
          replyLength: finalReply.length,
          replyPreview: finalReply.slice(0, 1500),
          chartsCount: charts.length,
          suggestionsCount: suggestions.length,
        });
      } else {
        finalReply = `Не удалось выполнить запрос к данным: ${result.error}. Уточните вопрос или попробуйте переформулировать.`;
        log("SQL_FAILED", { error: result.error }, "error");
      }
    } else {
      const parsed = parseReplyBlocks(rawReply);
      finalReply = parsed.text && parsed.text.length > 0 ? parsed.text : rawReply;
      charts = parsed.charts ?? [];
      suggestions = parsed.suggestions ?? [];
      log("NO_SQL", { rawReplyPreview: rawReply.slice(0, 1000), finalReplyLength: finalReply.length });
    }

    log("RESPONSE", {
      durationMs: Date.now() - t0,
      finalReplyLength: finalReply.length,
      sqlReturned: !!sqlUsed,
      chartsCount: charts.length,
      suggestionsCount: suggestions.length,
      source: requestSource ?? "unknown",
    });

    clearTimeout(timeoutId);
    if (historyMessages.length === 0) setCached(userContent, finalReply, charts, suggestions);

    if (useStream) {
      const encoder = new TextEncoder();
      const endPayload: { t: string; reply: string; charts: unknown[]; suggestions: unknown[]; sql?: string; exportId?: string; rowCount?: number } = { t: "e", reply: finalReply, charts, suggestions };
      if (showSql && sqlUsed) endPayload.sql = sqlUsed;
      const readable = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ t: "d", c: finalReply })}\n\n`));
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(endPayload)}\n\n`));
          ctrl.close();
        },
      });
      return new Response(readable, {
        headers: { ...SECURITY_HEADERS, "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" },
      });
    }

    if (process.env.NODE_ENV !== "test") {
      console.info("[chat] duration_ms=%d", Date.now() - t0);
    }
    const jsonPayload: { reply: string; charts: unknown[]; suggestions: unknown[]; sql?: string; exportId?: string; rowCount?: number } = { reply: finalReply, charts, suggestions };
    if (showSql && sqlUsed) jsonPayload.sql = sqlUsed;
    if (exportId && exportRowCount != null) {
      jsonPayload.exportId = exportId;
      jsonPayload.rowCount = exportRowCount;
    }
    return NextResponse.json(jsonPayload, { headers: SECURITY_HEADERS });
  } catch (err: unknown) {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    const log = createRequestLogger(randomUUID().slice(0, 8));
    log("ERROR", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, "error");
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Превышено время ожидания. Попробуйте короче вопрос или позже."
          : err.message
        : "Ошибка при обращении к OpenAI";
    const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
    return NextResponse.json(
      { error: msg },
      { status: typeof status === "number" ? status : 500, headers: SECURITY_HEADERS }
    );
  }
}
