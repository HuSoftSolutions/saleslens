/**
 * OpenAI function/tool definitions for the chat endpoint.
 * These schemas define what the LLM can call.
 */

export const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "getSalesSummary",
      description:
        "Get a summary of sales/payment data for a date range. Returns gross total, payment count, average payment, tip total, tax total, and refund total from Clover payment records.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format",
          },
          endDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format",
          },
          location: {
            type: "string",
            description:
              "Optional: a specific location name or ID to filter to. Omit to include all locations combined.",
          },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "compareSalesPeriods",
      description:
        "Compare sales metrics between two date periods. Returns summaries for both periods and percentage deltas for each metric.",
      parameters: {
        type: "object",
        properties: {
          periodA: {
            type: "object",
            properties: {
              startDate: { type: "string", description: "YYYY-MM-DD" },
              endDate: { type: "string", description: "YYYY-MM-DD" },
            },
            required: ["startDate", "endDate"],
          },
          periodB: {
            type: "object",
            properties: {
              startDate: { type: "string", description: "YYYY-MM-DD" },
              endDate: { type: "string", description: "YYYY-MM-DD" },
            },
            required: ["startDate", "endDate"],
          },
          location: {
            type: "string",
            description:
              "Optional: a specific location name or ID to filter to. Omit to include all locations combined.",
          },
        },
        required: ["periodA", "periodB"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getTopSellingItems",
      description:
        "Get the top-selling items by quantity for a date range. Returns item name, quantity sold, and estimated gross sales. Data comes from Clover order line items.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format",
          },
          endDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format",
          },
          limit: {
            type: "number",
            description: "Maximum number of items to return (default: 10)",
          },
          location: {
            type: "string",
            description:
              "Optional: a specific location name or ID to filter to. Omit to include all locations combined.",
          },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getRefundSummary",
      description:
        "Get a summary of refunds for a date range. Returns refund count and total refund amount from Clover payment records.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format",
          },
          endDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format",
          },
          location: {
            type: "string",
            description:
              "Optional: a specific location name or ID to filter to. Omit to include all locations combined.",
          },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getSalesByHour",
      description:
        "Get sales broken down by hour of day for a date range. Shows order count, item count, gross sales, and top-selling items for each hour. Optionally filter to a specific item name to see when that item sells most. Useful for questions about peak hours, busy times, or when a specific item sells.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format",
          },
          endDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format",
          },
          itemName: {
            type: "string",
            description:
              "Optional: filter to a specific item name to see its hourly sales pattern",
          },
          location: {
            type: "string",
            description:
              "Optional: a specific location name or ID to filter to. Omit to include all locations combined.",
          },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
];

const dateLocationParams = {
  type: "object",
  properties: {
    startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
    endDate: { type: "string", description: "End date in YYYY-MM-DD format" },
    location: {
      type: "string",
      description:
        "Optional: a specific location name or ID to filter to. Omit for all locations.",
    },
  },
  required: ["startDate", "endDate"],
} as const;

/**
 * Simulator-business tools — only offered when analytics are served from the
 * BigQuery warehouse (golf-sim bay bookings + categories live there).
 */
export const simToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "getRevenueByCategory",
      description:
        "Break revenue down by category (e.g. 'Sim Time' for golf-simulator bay bookings vs 'Food' and 'Drinks'). Use for questions comparing simulator/bay revenue to food & beverage revenue, or revenue mix.",
      parameters: dateLocationParams,
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getBayUtilization",
      description:
        "Golf-simulator bay utilization for a date range: per bay, the number of bookings, booked hours, gross revenue, and utilization percentage (booked time vs available). Use for questions about how busy the bays are, which bays/tiers perform best, or capacity.",
      parameters: dateLocationParams,
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getPeakBookingHours",
      description:
        "Simulator bay bookings broken down by hour of day: booking count and revenue per hour. Use for questions about the busiest times to book a bay or peak booking demand.",
      parameters: dateLocationParams,
    },
  },
];
