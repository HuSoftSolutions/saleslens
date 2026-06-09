import { Timestamp } from "firebase/firestore";

export interface Organization {
  name: string;
  createdAt: Timestamp;
  cloverMerchantId?: string;
  cloverConnectedAt?: Timestamp;
}

export interface OrgUser {
  email: string;
  role: "owner" | "admin" | "member";
  createdAt: Timestamp;
}

export interface CloverIntegration {
  merchantId: string;
  status: "active" | "disconnected" | "error";
  environment: "sandbox" | "production";
  accessToken: string;
  refreshToken?: string;
  /** IANA timezone of the merchant, used to interpret date ranges. */
  timezone?: string | null;
  connectedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChatThread {
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: Timestamp;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResultSummary?: string;
}

export interface SalesSummary {
  grossTotal: number;
  paymentCount: number;
  averagePayment: number;
  tipTotal: number;
  taxTotal: number;
  refundTotal: number;
  startDate: string;
  endDate: string;
  /** True if the Clover result set hit the pagination ceiling and is incomplete. */
  truncated?: boolean;
}

export interface TopSellingItem {
  name: string;
  quantity: number;
  grossSales: number;
}

export interface RefundSummary {
  refundCount: number;
  refundTotal: number;
  startDate: string;
  endDate: string;
  /** True if the Clover result set hit the pagination ceiling and is incomplete. */
  truncated?: boolean;
}

export interface HourlySalesBreakdown {
  hour: number;
  label: string;
  orderCount: number;
  itemCount: number;
  grossSales: number;
  topItems: { name: string; quantity: number }[];
}

export interface PeriodComparison {
  periodA: SalesSummary;
  periodB: SalesSummary;
  deltas: {
    grossTotal: number;
    paymentCount: number;
    averagePayment: number;
    tipTotal: number;
    taxTotal: number;
    refundTotal: number;
  };
}
