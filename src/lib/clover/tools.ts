import { CloverClient } from "./client";
import type {
  SalesSummary,
  PeriodComparison,
  TopSellingItem,
  RefundSummary,
  HourlySalesBreakdown,
} from "@/types";

/**
 * Get a sales summary for a date range.
 *
 * Aggregates payment data from Clover into gross total, count,
 * average, tips, tax, and refunds.
 */
export async function getSalesSummary(
  client: CloverClient,
  startDate: string,
  endDate: string
): Promise<SalesSummary> {
  const payments = await client.getPayments(startDate, endDate);
  const elements = payments.elements ?? [];

  let grossTotal = 0;
  let tipTotal = 0;
  let taxTotal = 0;
  let refundTotal = 0;
  let paymentCount = 0;

  for (const payment of elements) {
    // Skip explicitly non-successful payments (voided/declined) so they don't
    // inflate totals. Records without a result are counted (backward-compatible).
    if (payment.result && payment.result !== "SUCCESS") continue;

    // Clover amounts are in cents
    const amount = payment.amount ?? 0;
    grossTotal += amount;
    tipTotal += payment.tipAmount ?? 0;
    taxTotal += payment.taxAmount ?? 0;
    paymentCount++;

    // Refunds may be nested under the payment
    if (payment.refunds?.elements) {
      for (const refund of payment.refunds.elements) {
        refundTotal += refund.amount ?? 0;
      }
    }
  }

  // Convert cents to dollars
  return {
    grossTotal: grossTotal / 100,
    paymentCount,
    averagePayment: paymentCount > 0 ? grossTotal / 100 / paymentCount : 0,
    tipTotal: tipTotal / 100,
    taxTotal: taxTotal / 100,
    refundTotal: refundTotal / 100,
    startDate,
    endDate,
    truncated: payments.truncated,
  };
}

/**
 * Compare sales between two date periods.
 */
export async function compareSalesPeriods(
  client: CloverClient,
  periodA: { startDate: string; endDate: string },
  periodB: { startDate: string; endDate: string }
): Promise<PeriodComparison> {
  const [summaryA, summaryB] = await Promise.all([
    getSalesSummary(client, periodA.startDate, periodA.endDate),
    getSalesSummary(client, periodB.startDate, periodB.endDate),
  ]);

  function pctDelta(a: number, b: number): number {
    if (a === 0) return b === 0 ? 0 : 100;
    return ((b - a) / Math.abs(a)) * 100;
  }

  return {
    periodA: summaryA,
    periodB: summaryB,
    deltas: {
      grossTotal: pctDelta(summaryA.grossTotal, summaryB.grossTotal),
      paymentCount: pctDelta(summaryA.paymentCount, summaryB.paymentCount),
      averagePayment: pctDelta(summaryA.averagePayment, summaryB.averagePayment),
      tipTotal: pctDelta(summaryA.tipTotal, summaryB.tipTotal),
      taxTotal: pctDelta(summaryA.taxTotal, summaryB.taxTotal),
      refundTotal: pctDelta(summaryA.refundTotal, summaryB.refundTotal),
    },
  };
}

/**
 * Get the top-selling items by quantity in a date range.
 *
 * NOTE: Clover order/line item structures can vary across merchant
 * configurations. Some merchants may not have line item data populated.
 * This implementation is defensive and skips items without names.
 */
export async function getTopSellingItems(
  client: CloverClient,
  startDate: string,
  endDate: string,
  limit: number = 10
): Promise<TopSellingItem[]> {
  const orders = await client.getOrders(startDate, endDate);
  const elements = orders.elements ?? [];

  const itemMap = new Map<string, { quantity: number; grossSales: number }>();

  for (const order of elements) {
    const lineItems = order.lineItems?.elements ?? [];
    for (const item of lineItems) {
      const name = item.name?.trim();
      if (!name) continue;

      const existing = itemMap.get(name) ?? { quantity: 0, grossSales: 0 };
      const qty = item.unitQty != null ? item.unitQty / 1000 : 1;
      existing.quantity += qty;
      // Price is in cents
      existing.grossSales += (item.price ?? 0) * qty / 100;
      itemMap.set(name, existing);
    }
  }

  return Array.from(itemMap.entries())
    .map(([name, data]) => ({
      name,
      quantity: Math.round(data.quantity),
      grossSales: Math.round(data.grossSales * 100) / 100,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

/**
 * Get refund summary for a date range.
 */
export async function getRefundSummary(
  client: CloverClient,
  startDate: string,
  endDate: string
): Promise<RefundSummary> {
  const payments = await client.getPayments(startDate, endDate);
  const elements = payments.elements ?? [];

  let refundCount = 0;
  let refundTotal = 0;

  for (const payment of elements) {
    if (payment.refunds?.elements) {
      for (const refund of payment.refunds.elements) {
        refundCount++;
        refundTotal += refund.amount ?? 0;
      }
    }
  }

  return {
    refundCount,
    refundTotal: refundTotal / 100,
    startDate,
    endDate,
    truncated: payments.truncated,
  };
}

/**
 * Get sales broken down by hour of day.
 * Shows order count, item count, gross sales, and top items per hour.
 * Uses order createdTime timestamps to bucket by hour.
 */
export async function getSalesByHour(
  client: CloverClient,
  startDate: string,
  endDate: string,
  itemName?: string
): Promise<HourlySalesBreakdown[]> {
  const orders = await client.getOrders(startDate, endDate);
  const elements = orders.elements ?? [];

  const hourBuckets = new Map<
    number,
    { orderCount: number; itemCount: number; grossSales: number; items: Map<string, number> }
  >();

  // Initialize all 24 hours
  for (let h = 0; h < 24; h++) {
    hourBuckets.set(h, { orderCount: 0, itemCount: 0, grossSales: 0, items: new Map() });
  }

  for (const order of elements) {
    const hour = new Date(order.createdTime).getHours();
    const bucket = hourBuckets.get(hour)!;
    bucket.orderCount++;

    const lineItems = order.lineItems?.elements ?? [];
    for (const item of lineItems) {
      const name = item.name?.trim();
      if (!name) continue;

      // If filtering by item name, skip non-matching items
      if (itemName && name.toLowerCase() !== itemName.toLowerCase()) continue;

      const qty = item.unitQty != null ? item.unitQty / 1000 : 1;
      bucket.itemCount += qty;
      bucket.grossSales += (item.price ?? 0) * qty / 100;
      bucket.items.set(name, (bucket.items.get(name) ?? 0) + qty);
    }
  }

  function hourLabel(h: number): string {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  }

  return Array.from(hourBuckets.entries())
    .map(([hour, data]) => ({
      hour,
      label: hourLabel(hour),
      orderCount: data.orderCount,
      itemCount: Math.round(data.itemCount),
      grossSales: Math.round(data.grossSales * 100) / 100,
      topItems: Array.from(data.items.entries())
        .map(([name, quantity]) => ({ name, quantity: Math.round(quantity) }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 3),
    }))
    .filter((h) => h.orderCount > 0 || h.itemCount > 0);
}
