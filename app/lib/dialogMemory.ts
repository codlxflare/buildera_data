/**
 * Экономичная память диалога: при длинной истории старые сообщения сжимаются в краткий контекст
 * одним запросом к дешёвой модели, чтобы не терять смысл и не слать все сообщения в каждом запросе.
 */

import type OpenAI from "openai";
import { getSummaryModel, useDialogSummary } from "./chatModels";

const SUMMARY_THRESHOLD = 12; // если сообщений больше — сжимаем старую часть
const KEEP_RECENT_PAIRS = 6;  // последние N пар user+assistant оставляем целиком
const SUMMARY_SYSTEM = `Сократи историю диалога до 5–7 предложений. Сохрани: о чём спрашивал пользователь (темы: сделки, заявки, финансы, долги, каналы, дома и т.д.), периоды (месяцы, годы), числа и сущности (дома, отделы), что уточнял и какой ответ получил. Язык: русский. Только текст без заголовков.`;

export type HistoryMessage = { role: "user" | "assistant"; content: string };

/**
 * Если включена суммаризация и сообщений много — вызывает модель и возвращает
 * список из одного блока "Контекст диалога: ..." + последние KEEP_RECENT_PAIRS пар.
 * Иначе возвращает исходный list без изменений.
 */
export async function buildEconomicalHistory(
  openai: OpenAI,
  list: HistoryMessage[]
): Promise<HistoryMessage[]> {
  if (!useDialogSummary() || list.length <= SUMMARY_THRESHOLD) return list;

  const toSummarizeCount = list.length - KEEP_RECENT_PAIRS * 2;
  if (toSummarizeCount < 2) return list;

  const toSummarize = list.slice(0, toSummarizeCount);
  const recent = list.slice(toSummarizeCount);

  const text = toSummarize
    .map((m) => `${m.role === "user" ? "Пользователь" : "Ассистент"}: ${m.content.slice(0, 1500)}`)
    .join("\n\n");

  try {
    const completion = await openai.chat.completions.create({
      model: getSummaryModel(),
      temperature: 0.1,
      max_completion_tokens: 500,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM },
        { role: "user", content: text },
      ],
    });
    const summary = completion.choices[0]?.message?.content?.trim() ?? "";
    if (summary.length > 0) {
      return [
        { role: "user" as const, content: `[Контекст предыдущего диалога: ${summary}]` },
        ...recent,
      ];
    }
  } catch {
    // при ошибке суммаризации возвращаем исходный список (могут обрезаться по токенам дальше)
  }
  return list;
}
