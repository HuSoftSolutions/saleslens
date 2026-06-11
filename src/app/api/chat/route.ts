import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveOrg } from "@/lib/auth/requireActiveOrg";
import { adminDb } from "@/lib/firebase/admin";
import {
  getOpenAIClient,
  getModel,
  getMaxOutputTokens,
  getSystemPrompt,
} from "@/lib/ai/openai";
import { enforceRateLimit } from "@/lib/limits/rateLimit";
import { toolDefinitions, simToolDefinitions } from "@/lib/ai/toolSchemas";
import { resolveAnalytics } from "@/lib/analytics/resolve";
import { getLocations } from "@/lib/analytics/bigquery";
import {
  ymdInTz,
  resolveBasePeriod,
  resolveComparePeriod,
  type ResolvedPeriod,
} from "@/lib/analytics/dates";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const chatRequestSchema = z.object({
  threadId: z.string().optional(),
  message: z.string().min(1).max(2000),
  location: z.string().max(120).optional(),
});

// TODO: Add query result caching for repeated date ranges

interface BarChartPayload {
  type: "bar";
  title: string;
  unit: "qty" | "currency";
  data: { label: string; value: number }[];
}

interface ComparisonPayload {
  type: "comparison";
  title: string;
  current: { label: string };
  baseline: { label: string };
  metrics: {
    key: string;
    label: string;
    unit: "currency" | "number";
    current: number;
    baseline: number;
    deltaPct: number;
    goodWhenUp: boolean;
  }[];
}

type ChartPayload = BarChartPayload | ComparisonPayload;

interface PeriodSpec {
  preset?: string;
  startDate?: string;
  endDate?: string;
}

/** Resolve the "current" side: explicit range wins, else a named base preset. */
function resolveCurrent(spec: PeriodSpec | undefined, today: string): ResolvedPeriod {
  if (spec?.startDate && spec?.endDate) {
    return {
      startDate: spec.startDate,
      endDate: spec.endDate,
      label: `${spec.startDate} – ${spec.endDate}`,
    };
  }
  return resolveBasePeriod(spec?.preset ?? "this_week", today);
}

/** Resolve the comparison side relative to the current period. */
function resolveBaseline(
  spec: PeriodSpec | undefined,
  current: ResolvedPeriod,
  today: string
): ResolvedPeriod {
  if (spec?.startDate && spec?.endDate) {
    return {
      startDate: spec.startDate,
      endDate: spec.endDate,
      label: `${spec.startDate} – ${spec.endDate}`,
    };
  }
  return resolveComparePeriod(spec?.preset ?? "previous_period", current, today);
}

/** Build a chart payload from a chartable tool result (most recent wins). */
function buildChart(name: string, result: unknown): ChartPayload | null {
  if (name === "getTopSellingItems" && Array.isArray(result)) {
    const data = (result as { name: string; quantity: number }[])
      .slice(0, 8)
      .map((i) => ({ label: i.name, value: i.quantity }));
    if (data.length)
      return { type: "bar", title: "Top selling items", unit: "qty", data };
  }
  if (name === "getSalesByHour" && Array.isArray(result)) {
    const data = (result as { label: string; grossSales: number }[]).map((h) => ({
      label: h.label,
      value: h.grossSales,
    }));
    if (data.length)
      return { type: "bar", title: "Sales by hour", unit: "currency", data };
  }
  if (name === "getRevenueByCategory" && Array.isArray(result)) {
    const data = (result as { category: string; grossSales: number }[]).map((c) => ({
      label: c.category,
      value: c.grossSales,
    }));
    if (data.length)
      return { type: "bar", title: "Revenue by category", unit: "currency", data };
  }
  if (name === "getBayUtilization" && Array.isArray(result)) {
    const data = (result as { bayName: string; location: string; utilizationPct: number }[])
      .slice(0, 12)
      .map((b) => ({ label: `${b.location.split("— ").pop()} ${b.bayName}`, value: b.utilizationPct }));
    if (data.length)
      return { type: "bar", title: "Bay utilization (%)", unit: "qty", data };
  }
  if (name === "getPeakBookingHours" && Array.isArray(result)) {
    const data = (result as { label: string; bookings: number }[]).map((h) => ({
      label: h.label,
      value: h.bookings,
    }));
    if (data.length)
      return { type: "bar", title: "Bookings by hour", unit: "qty", data };
  }
  if (name === "getSalesByLocation" && Array.isArray(result)) {
    const data = (result as { name: string; grossSales: number }[])
      .slice(0, 12)
      .map((l) => ({ label: l.name, value: l.grossSales }));
    if (data.length)
      return { type: "bar", title: "Sales by location", unit: "currency", data };
  }
  if (
    name === "comparePeriods" &&
    result &&
    typeof result === "object" &&
    "current" in result
  ) {
    const r = result as {
      current: Record<string, number> & { label: string };
      baseline: Record<string, number> & { label: string };
      deltasPct: Record<string, number>;
    };
    const metric = (
      key: string,
      label: string,
      unit: "currency" | "number",
      goodWhenUp: boolean
    ) => ({
      key,
      label,
      unit,
      current: Number(r.current[key] ?? 0),
      baseline: Number(r.baseline[key] ?? 0),
      deltaPct: Number(r.deltasPct?.[key] ?? 0),
      goodWhenUp,
    });
    return {
      type: "comparison",
      title: `${r.current.label} vs ${r.baseline.label}`,
      current: { label: r.current.label },
      baseline: { label: r.baseline.label },
      metrics: [
        metric("grossTotal", "Gross sales", "currency", true),
        metric("paymentCount", "Payments", "number", true),
        metric("averagePayment", "Avg ticket", "currency", true),
        metric("tipTotal", "Tips", "currency", true),
        metric("refundTotal", "Refunds", "currency", false),
      ],
    };
  }
  return null;
}

export async function POST(request: NextRequest) {
  const ctx = await requireActiveOrg();
  if (!ctx.ok) return ctx.response;
  const { user, org } = ctx;

  // Validate request body
  let body: z.infer<typeof chatRequestSchema>;
  try {
    const raw = await request.json();
    body = chatRequestSchema.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Rate limit per user (per-minute + per-day) before any metered work.
  const rl = await enforceRateLimit(org.orgId, user.uid, Date.now());
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error:
          rl.reason === "day"
            ? `Daily question limit reached (${rl.limits.perDay}). Try again tomorrow or ask an admin to raise your limit.`
            : "You're sending questions too quickly. Please wait a moment and try again.",
      },
      {
        status: 429,
        headers: rl.retryAfterSeconds
          ? { "Retry-After": String(rl.retryAfterSeconds) }
          : undefined,
      }
    );
  }

  // Resolve the analytics backend (BigQuery warehouse or live Clover).
  const resolved = await resolveAnalytics(org.orgId);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: "Clover not connected. Please connect Clover in Settings." },
      { status: 400 }
    );
  }
  const { analytics, timeZone, source, allowedLocationIds } = resolved;

  // Prompt extras: in BigQuery mode, list locations so the model can filter by
  // name; honor an optional global location scope from the UI selector.
  let promptExtra = "";
  if (source === "bigquery") {
    try {
      const locs = await getLocations(allowedLocationIds);
      if (locs.length) {
        promptExtra +=
          `\n\nThis business has ${locs.length} locations. When the user names a location, pass its name to the \`location\` tool argument; omit \`location\` to report all locations combined. Locations: ` +
          locs.map((l) => l.name).join("; ") +
          ".";
      }
    } catch {
      // proceed without a location list
    }
    promptExtra +=
      "\n\nThis is a golf-simulator + bar business. Simulator bay bookings are sold through Clover as 'Sim Time' line items. For bay/simulator questions, use getBayUtilization (how busy bays are), getPeakBookingHours (busiest booking times), and getRevenueByCategory (sim vs food/drink revenue mix). getTopSellingItems covers food & drink menu items only (it excludes bay bookings).";
  }
  if (body.location) {
    promptExtra += `\n\nThe user has scoped this conversation to a single location: "${body.location}". Pass location="${body.location}" to every tool call unless they explicitly ask about a different location or all locations.`;
  }

  // Create or load thread
  const orgRef = adminDb.collection("organizations").doc(org.orgId);
  let threadId = body.threadId;

  if (!threadId) {
    const threadRef = orgRef.collection("chatThreads").doc();
    await threadRef.set({
      createdBy: user.uid,
      title: body.message.slice(0, 60),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    threadId = threadRef.id;
  }

  const threadRef = orgRef.collection("chatThreads").doc(threadId);
  const messagesRef = threadRef.collection("messages");

  // Save user message
  await messagesRef.add({
    role: "user",
    content: body.message,
    createdAt: new Date(),
  });

  // Load conversation history. Tool results live in the same collection, so a
  // small limit would be consumed by them and starve the model of actual
  // conversation. Pull a generous window, then keep the last 20 user/assistant
  // turns.
  const historySnapshot = await messagesRef
    .orderBy("createdAt", "asc")
    .limitToLast(80)
    .get();

  const conversationHistory: ChatCompletionMessageParam[] = historySnapshot.docs
    .filter((doc) => {
      const role = doc.data().role;
      return role === "user" || role === "assistant";
    })
    .slice(-20)
    .map((doc) => {
      const data = doc.data();
      return {
        role: data.role as "user" | "assistant",
        content: data.content,
      };
    });

  // Call OpenAI with tool definitions. Sim tools are only offered in BigQuery
  // mode (bay bookings + categories live in the warehouse).
  const openai = getOpenAIClient();
  // Per-tenant cost attribution in the AI Gateway dashboard (native OpenAI `user` param).
  const aiUser = `${org.orgId}:${user.uid}`;
  const tools =
    source === "bigquery"
      ? [...toolDefinitions, ...simToolDefinitions]
      : toolDefinitions;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: getSystemPrompt(timeZone) + promptExtra },
    ...conversationHistory,
  ];

  let chart: ChartPayload | null = null;

  try {
    let response = await openai.chat.completions.create({
      model: getModel(),
      messages,
      tools,
      tool_choice: "auto",
      max_completion_tokens: getMaxOutputTokens(),
      user: aiUser,
    });

    // Handle tool calls in a loop (max 5 iterations to prevent runaway)
    let iterations = 0;
    while (
      response.choices[0]?.finish_reason === "tool_calls" &&
      iterations < 5
    ) {
      const toolCalls = response.choices[0].message.tool_calls;
      if (!toolCalls?.length) break;

      // Add assistant message with tool calls to history
      messages.push(response.choices[0].message);

      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") continue;
        const args = JSON.parse(toolCall.function.arguments);
        let result: unknown;

        try {
          switch (toolCall.function.name) {
            case "getSalesSummary":
              result = await analytics.getSalesSummary(
                args.startDate,
                args.endDate,
                args.location
              );
              break;
            case "compareSalesPeriods":
              result = await analytics.compareSalesPeriods(
                args.periodA,
                args.periodB,
                args.location
              );
              break;
            case "comparePeriods": {
              // Resolve presets to concrete dates server-side, in the merchant's
              // timezone, so the model never does fragile date math.
              const today = ymdInTz(new Date(), timeZone);
              const current = resolveCurrent(args.period, today);
              const baseline = resolveBaseline(args.compareTo, current, today);
              const cmp = await analytics.compareSalesPeriods(
                { startDate: baseline.startDate, endDate: baseline.endDate },
                { startDate: current.startDate, endDate: current.endDate },
                args.location
              );
              result = {
                current: { label: current.label, ...cmp.periodB },
                baseline: { label: baseline.label, ...cmp.periodA },
                deltasPct: cmp.deltas,
              };
              break;
            }
            case "getTopSellingItems":
              result = await analytics.getTopSellingItems(
                args.startDate,
                args.endDate,
                args.limit,
                args.location
              );
              break;
            case "getRefundSummary":
              result = await analytics.getRefundSummary(
                args.startDate,
                args.endDate,
                args.location
              );
              break;
            case "getSalesByHour":
              result = await analytics.getSalesByHour(
                args.startDate,
                args.endDate,
                args.itemName,
                args.location
              );
              break;
            case "getRevenueByCategory":
              result = analytics.getRevenueByCategory
                ? await analytics.getRevenueByCategory(
                    args.startDate,
                    args.endDate,
                    args.location
                  )
                : { error: "Category breakdown is not available in this mode." };
              break;
            case "getBayUtilization":
              result = analytics.getBayUtilization
                ? await analytics.getBayUtilization(
                    args.startDate,
                    args.endDate,
                    args.location
                  )
                : { error: "Bay utilization is not available in this mode." };
              break;
            case "getPeakBookingHours":
              result = analytics.getPeakBookingHours
                ? await analytics.getPeakBookingHours(
                    args.startDate,
                    args.endDate,
                    args.location
                  )
                : { error: "Booking hours are not available in this mode." };
              break;
            case "getSalesByLocation":
              result = analytics.getSalesByLocation
                ? await analytics.getSalesByLocation(args.startDate, args.endDate)
                : { error: "Per-location breakdown is not available in this mode." };
              break;
            default:
              result = { error: "Unknown tool" };
          }
        } catch (err) {
          console.error(
            `[chat] tool "${toolCall.function.name}" failed (org=${org.orgId}, source=${source}, args=${JSON.stringify(args)}):`,
            err
          );
          result = {
            error: `Tool execution failed: ${err instanceof Error ? err.message : "unknown error"}`,
          };
        }

        // Capture a chartable result for the UI (most recent wins).
        chart = buildChart(toolCall.function.name, result) ?? chart;

        const resultStr = JSON.stringify(result);

        // Save tool call to Firestore
        await messagesRef.add({
          role: "tool",
          content: resultStr,
          createdAt: new Date(),
          toolName: toolCall.function.name,
          toolArgs: args,
          toolResultSummary: resultStr.slice(0, 500),
        });

        messages.push({
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: resultStr,
        });
      }

      // Call OpenAI again with tool results
      response = await openai.chat.completions.create({
        model: getModel(),
        messages,
        tools: toolDefinitions,
        tool_choice: "auto",
        max_completion_tokens: getMaxOutputTokens(),
        user: aiUser,
      });

      iterations++;
    }

    const assistantContent =
      response.choices[0]?.message?.content ?? "I was unable to generate a response.";

    // Save assistant message (with any chart)
    await messagesRef.add({
      role: "assistant",
      content: assistantContent,
      chart: chart ?? null,
      createdAt: new Date(),
    });

    // Update thread timestamp
    await threadRef.update({ updatedAt: new Date() });

    return NextResponse.json({
      threadId,
      answer: assistantContent,
      chart: chart ?? null,
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Failed to process your question. Please try again." },
      { status: 500 }
    );
  }
}
