import { CloverClient } from "@/lib/clover/client";
import {
  getSalesSummary as cloverSalesSummary,
  compareSalesPeriods as cloverComparePeriods,
  getTopSellingItems as cloverTopItems,
  getRefundSummary as cloverRefundSummary,
  getSalesByHour as cloverSalesByHour,
} from "@/lib/clover/tools";
import { createBigQueryAnalytics } from "./bigquery";
import type {
  SalesSummary,
  PeriodComparison,
  TopSellingItem,
  RefundSummary,
  HourlySalesBreakdown,
} from "@/types";

/**
 * Unified analytics interface used by the chat tool dispatch. Two backends:
 * - Clover: live REST (single merchant; `location` is ignored).
 * - BigQuery: the warehouse (multi-location; `location` filters by name/id).
 */
export interface AnalyticsProvider {
  getSalesSummary(
    startDate: string,
    endDate: string,
    location?: string
  ): Promise<SalesSummary>;
  compareSalesPeriods(
    periodA: { startDate: string; endDate: string },
    periodB: { startDate: string; endDate: string },
    location?: string
  ): Promise<PeriodComparison>;
  getTopSellingItems(
    startDate: string,
    endDate: string,
    limit?: number,
    location?: string
  ): Promise<TopSellingItem[]>;
  getRefundSummary(
    startDate: string,
    endDate: string,
    location?: string
  ): Promise<RefundSummary>;
  getSalesByHour(
    startDate: string,
    endDate: string,
    itemName?: string,
    location?: string
  ): Promise<HourlySalesBreakdown[]>;

  // Simulator-business tools — BigQuery backend only (undefined in Clover mode).
  getRevenueByCategory?(
    startDate: string,
    endDate: string,
    location?: string
  ): Promise<{ category: string; grossSales: number; quantity: number }[]>;
  getBayUtilization?(
    startDate: string,
    endDate: string,
    location?: string
  ): Promise<
    {
      location: string;
      bayName: string;
      tier: string;
      bookings: number;
      bookedHours: number;
      grossSales: number;
      utilizationPct: number;
    }[]
  >;
  getPeakBookingHours?(
    startDate: string,
    endDate: string,
    location?: string
  ): Promise<
    { hour: number; label: string; bookings: number; grossSales: number }[]
  >;
}

export type AnalyticsSource = "bigquery" | "clover";

export function getAnalyticsSource(): AnalyticsSource {
  return process.env.ANALYTICS_SOURCE === "bigquery" ? "bigquery" : "clover";
}

/** Clover-backed provider. `location` is ignored (single merchant per client). */
export function createCloverAnalytics(client: CloverClient): AnalyticsProvider {
  return {
    getSalesSummary: (s, e) => cloverSalesSummary(client, s, e),
    compareSalesPeriods: (a, b) => cloverComparePeriods(client, a, b),
    getTopSellingItems: (s, e, limit) => cloverTopItems(client, s, e, limit),
    getRefundSummary: (s, e) => cloverRefundSummary(client, s, e),
    getSalesByHour: (s, e, item) => cloverSalesByHour(client, s, e, item),
  };
}

export { createBigQueryAnalytics };
