import { getCloverUrls } from "./oauth";

/**
 * Clover REST API client.
 *
 * Reference: https://docs.clover.com/dev/reference/api-reference-overview
 *
 * Key notes from Clover docs:
 * - Base URL (sandbox): https://apisandbox.dev.clover.com
 * - Auth: Authorization: Bearer {token}
 * - All endpoints under: /v3/merchants/{mId}/...
 * - Amounts are in cents
 * - Pagination: offset + limit (default 100, max 1000)
 * - Expand: max 3 fields per call, dot notation for nested (e.g. lineItems.taxRates)
 * - Filter: ?filter=field>value&filter=field<value (separate filter params per condition)
 */

interface CloverClientConfig {
  accessToken: string;
  merchantId: string;
  /** IANA timezone (e.g. "America/New_York") used to interpret date ranges. Defaults to UTC. */
  timeZone?: string;
}

export interface CloverPayment {
  id: string;
  amount: number;
  tipAmount?: number;
  taxAmount?: number;
  /** Payment outcome, e.g. "SUCCESS". Absent on some records. */
  result?: string;
  createdTime: number;
  refunds?: {
    elements: Array<{ amount: number }>;
  };
}

export interface CloverOrder {
  id: string;
  total?: number;
  createdTime: number;
  lineItems?: {
    elements: Array<{
      name: string;
      price: number;
      unitQty?: number;
      item?: { id?: string };
    }>;
  };
}

export interface CloverItem {
  id: string;
  name: string;
  /** First category name, if the item is categorized in Clover. */
  category: string | null;
}

/**
 * Offset (localWallTime - UTC) in ms for a given instant in a timezone.
 * Used to convert a merchant-local calendar day into the UTC millisecond
 * boundaries Clover filters on.
 */
function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcMs;
}

/** Start of `dateStr` (YYYY-MM-DD) in `timeZone`, as a UTC millisecond timestamp. */
function zonedStartOfDayMs(dateStr: string, timeZone: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return guess - timeZoneOffsetMs(guess, timeZone);
}

/** End of `dateStr` (YYYY-MM-DD, inclusive) in `timeZone`, as a UTC millisecond timestamp. */
function zonedEndOfDayMs(dateStr: string, timeZone: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  return guess - timeZoneOffsetMs(guess, timeZone);
}

export class CloverClient {
  private accessToken: string;
  private merchantId: string;
  private apiBase: string;
  private timeZone: string;

  constructor(config: CloverClientConfig) {
    this.accessToken = config.accessToken;
    this.merchantId = config.merchantId;
    this.apiBase = getCloverUrls().apiBase;
    this.timeZone = config.timeZone ?? "UTC";
  }

  private async request<T>(
    path: string,
    params?: Record<string, string>,
    filters?: string[]
  ): Promise<T> {
    const url = new URL(`/v3/merchants/${this.merchantId}${path}`, this.apiBase);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    // Clover filter syntax: each condition is a separate "filter" query param
    // e.g. ?filter=createdTime>=1234567890&filter=createdTime<=9876543210
    if (filters) {
      for (const f of filters) {
        url.searchParams.append("filter", f);
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Clover API error: ${res.status} ${path} - ${text}`);
    }

    return res.json();
  }

  /**
   * Fetch every page of a Clover list endpoint and concatenate the elements.
   *
   * Clover caps each response at 1000 elements (offset + limit pagination), so
   * a single request silently truncates high-volume ranges and produces wrong
   * totals. This pages until a short (or empty) page is returned, with a hard
   * ceiling to bound worst-case work and cost.
   *
   * If the ceiling is hit, `truncated` is true so callers can surface that the
   * result is incomplete rather than reporting a confident-but-wrong number.
   */
  private async requestAllElements<T>(
    path: string,
    params: Record<string, string>,
    filters: string[]
  ): Promise<{ elements: T[]; truncated: boolean }> {
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 50; // safety ceiling: up to 50k records per query
    const all: T[] = [];
    let truncated = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.request<{ elements?: T[] }>(
        path,
        { ...params, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) },
        filters
      );
      const elements = res.elements ?? [];
      all.push(...elements);
      if (elements.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    return { elements: all, truncated };
  }

  /**
   * Fetch all payments within a date range (paginated).
   *
   * Endpoint: GET /v3/merchants/{mId}/payments
   * Filters use millisecond timestamps on the createdTime field.
   * expand=refunds so refund totals are populated (not returned by default).
   */
  async getPayments(startDate: string, endDate: string) {
    const startMs = zonedStartOfDayMs(startDate, this.timeZone);
    const endMs = zonedEndOfDayMs(endDate, this.timeZone);

    return this.requestAllElements<CloverPayment>(
      "/payments",
      { expand: "refunds" },
      [`createdTime>=${startMs}`, `createdTime<=${endMs}`]
    );
  }

  /**
   * Fetch all orders within a date range with line items expanded (paginated).
   *
   * Endpoint: GET /v3/merchants/{mId}/orders
   * Uses expand=lineItems to include line item details.
   * Clover docs: max 3 expand fields per call.
   */
  async getOrders(startDate: string, endDate: string) {
    const startMs = zonedStartOfDayMs(startDate, this.timeZone);
    const endMs = zonedEndOfDayMs(endDate, this.timeZone);

    return this.requestAllElements<CloverOrder>(
      "/orders",
      { expand: "lineItems" },
      [`createdTime>=${startMs}`, `createdTime<=${endMs}`]
    );
  }

  /**
   * Fetch the merchant's basic info.
   *
   * Endpoint: GET /v3/merchants/{mId}
   */
  async getMerchantInfo() {
    interface MerchantResponse {
      id: string;
      name: string;
      address?: {
        city?: string;
        state?: string;
      };
    }

    return this.request<MerchantResponse>("");
  }

  /**
   * Fetch the merchant's inventory items with their Clover category, so synced
   * line items can be tagged (Food / Drinks / Sim Time / …).
   *
   * Endpoint: GET /v3/merchants/{mId}/items?expand=categories
   */
  async getItems(): Promise<CloverItem[]> {
    interface ItemEl {
      id: string;
      name: string;
      categories?: { elements?: Array<{ name?: string }> };
    }
    const { elements } = await this.requestAllElements<ItemEl>(
      "/items",
      { expand: "categories" },
      []
    );
    return elements.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.categories?.elements?.[0]?.name ?? null,
    }));
  }

  /**
   * Fetch the merchant's IANA timezone (e.g. "America/New_York").
   *
   * Endpoint: GET /v3/merchants/{mId}/properties
   * Returns null if the merchant has no timezone configured.
   */
  async getMerchantTimezone(): Promise<string | null> {
    interface PropertiesResponse {
      timezone?: string;
    }
    const props = await this.request<PropertiesResponse>("/properties");
    return props.timezone ?? null;
  }
}
