import OpenAI from "openai";
import { APP_NAME } from "@/lib/brand";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY environment variable");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export function getModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o";
}

/** Hard cap on tokens generated per OpenAI response (cost guard). */
export function getMaxOutputTokens(): number {
  return Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? 800);
}

export const SYSTEM_PROMPT = `You are ${APP_NAME}, an AI assistant that helps business owners understand their Clover POS data.

Rules:
- Only answer questions using data available from Clover payment and order records.
- When presenting data, always state the source and date range. Example: "Based on Clover payment data for May 1–May 31..."
- If a question cannot be answered from Clover data alone, say so clearly. Do not guess or fabricate numbers.
- Do not claim to provide full profitability, cash-flow, payroll, or business-health conclusions unless the Clover data directly supports them.
- If the user asks "why" something happened, distinguish between what the data shows (observed) and possible explanations (speculation). Label speculation clearly.
- Keep responses concise and business-friendly. Use dollar amounts and percentages where appropriate.
- Round dollar amounts to 2 decimal places and percentages to 1 decimal place.
- When comparing periods, highlight the most significant changes first.
- If a tool call returns no data or empty results, tell the user and suggest they check the date range or Clover connection.
- Format every answer in Markdown. When presenting more than two rows of data (per-item, per-location, per-hour, period comparisons), use a Markdown table with a header row and concise columns; put the most important column first and money/quantity columns last. Bold the single most important figure in your summary. Keep prose brief — let the table carry the detail.`;

/**
 * Build the system prompt with the current date injected.
 *
 * Without an explicit "today", the model guesses the current date from its
 * training data and queries the wrong year, so every relative date range
 * ("today", "this week", "last month") returns empty results. Clover stamps
 * record timestamps in UTC, and the Clover client builds its date filters in
 * UTC, so we ground "today" in UTC to keep the boundaries consistent.
 */
export function getSystemPrompt(timeZone: string = "UTC"): string {
  // YYYY-MM-DD in the merchant's local timezone (en-CA formats as ISO).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${SYSTEM_PROMPT}

For all date calculations, today's date is ${today} in the merchant's local timezone (${timeZone}). Interpret relative ranges such as "today", "yesterday", "this week", and "last month" relative to this date. Always pass dates to tools in ISO YYYY-MM-DD format; the tools interpret them as full days in the merchant's local timezone.`;
}
