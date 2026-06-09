# SalesLens — Data Flow

How a chat question travels from the browser, through the AI tool loop, out to the
Clover REST API, and back — including what triggers a fresh Clover fetch and what
carries over between conversation turns.

## End-to-end flow

```mermaid
flowchart TD
    subgraph Browser["🖥️ Browser — app/chat/page.tsx"]
        U["User types message + Send/Enter"]
        U --> GT["getIdToken() — Firebase"]
        GT --> POST["POST /api/chat<br/>body: { threadId?, message }<br/>header: Bearer ID token"]
        RESP["Render answer<br/>setThreadId · append message<br/>auto-scroll viewport"]
    end

    POST --> AUTH

    subgraph API["⚙️ Route handler — api/chat/route.ts"]
        AUTH["getCurrentUser()<br/>verify Firebase token"] -->|invalid| BAD1["401 Unauthorized"]
        AUTH --> ORG["ensureUserOrg()<br/>Firestore: get/create org"]
        ORG --> VAL["Validate body (zod)<br/>message 1–2000 chars"]
        VAL --> INT["Load integration<br/>Firestore: organizations/{orgId}/<br/>integrations/clover"]
        INT -->|missing / not active| BAD2["400 Clover not connected"]
        INT --> TZ{"integration.timezone<br/>stored?"}
        TZ -->|no| TZF["getMerchantTimezone()<br/>GET /merchants/{mId}/properties<br/>backfill → Firestore"]
        TZ -->|yes| CL
        TZF --> CL["new CloverClient(<br/>accessToken, merchantId, timeZone)"]
        CL --> TH["Create/load thread<br/>Firestore: chatThreads"]
        TH --> SAVEU["Save USER message<br/>Firestore: messages"]
        SAVEU --> HIST["Load last 20 messages<br/>⚠ filter: user/assistant ONLY<br/>(prior tool results excluded)"]
        HIST --> BUILD["Build prompt:<br/>system + today's date (merchant TZ)<br/>+ conversation history"]
        BUILD --> OAI1["OpenAI chat.completions<br/>tools + tool_choice: auto"]
    end

    OAI1 --> DEC

    subgraph LOOP["🔁 Tool-call loop — max 5 iterations"]
        DEC{"finish_reason<br/>== 'tool_calls'?"}
        DEC -->|no| FINAL["Final assistant text"]
        DEC -->|yes| DISPATCH["For each tool call:<br/>parse name + JSON args<br/>(LLM chose tool + date range)"]
        DISPATCH --> TOOLS
        TOOLS --> SAVET["Save tool result<br/>Firestore: role 'tool'"]
        SAVET --> OAI2["OpenAI again<br/>(tool results appended to context)"]
        OAI2 --> DEC
    end

    subgraph TOOLS["🧮 Aggregation — tools.ts"]
        T1["getSalesSummary → getPayments ×1"]
        T2["compareSalesPeriods → getPayments ×2"]
        T3["getTopSellingItems → getOrders ×1"]
        T4["getRefundSummary → getPayments ×1"]
        T5["getSalesByHour → getOrders ×1"]
    end

    TOOLS --> CLOVER

    subgraph CLOVER["☁️ CloverClient → Clover REST API — live, NO cache"]
        CP["GET /v3/merchants/{mId}/payments<br/>filter=createdTime (TZ-aware day bounds)"]
        CO["GET /v3/merchants/{mId}/orders<br/>expand=lineItems"]
    end

    CLOVER -->|"cents→dollars, aggregated JSON"| SAVET

    FINAL --> SAVEA["Save ASSISTANT message<br/>update thread.updatedAt"]
    SAVEA --> RET["Return { threadId, answer }"]
    RET --> RESP
```

## What triggers a fresh fetch to Clover

- **Every tool call hits Clover live — there is no caching layer.** (`client.ts` and
  `route.ts` both carry `TODO` notes for caching/rate-limiting.)
- A single user message triggers **0 or more** Clover requests, decided by the LLM:
  - The model may answer with no tool call → **0 fetches**.
  - One tool call → 1 fetch (or **2** for `compareSalesPeriods`).
  - The loop can run up to **5 iterations**, so one message can fan out to several fetches.
- **Repeated/identical questions re-fetch every time** — nothing is memoized, not even
  the same date range asked twice in a row.
- Each distinct **(endpoint × date range)** is its own request; payments and orders are
  separate endpoints, so a question needing both (rare here) hits both.

## What relies on conversation context

- **Follow-ups work** because the last 20 `user`/`assistant` messages are replayed to
  OpenAI each turn (e.g. "what about last week?" resolves against the prior turn).
- The LLM derives **which tool** and **which date range** from that history **plus** the
  injected "today's date (merchant timezone)" in the system prompt.
- ⚠ **Prior tool results are NOT replayed.** History loading filters to `user`/`assistant`
  roles only, so raw Clover data from earlier turns isn't re-sent. Across turns the model
  relies on its **own earlier prose answers** — or it **re-fetches**. (Within a single
  turn, tool results stay in context so the model can reason over them.)

## Identity & connection prerequisites (set up once, before any chat)

```mermaid
flowchart LR
    L["Settings → Dev Connect / OAuth"] --> W["Write integration doc<br/>Firestore: organizations/{orgId}/<br/>integrations/clover<br/>{ accessToken, merchantId,<br/>timezone, status: 'active' }"]
    W --> R["Chat route reads this doc<br/>on every request"]
```

- **Firebase ID token** → `user` → `org` → the **integration doc** (Clover access token +
  merchant ID + timezone). The chat route reads that doc on every request; if it's absent
  or `status !== "active"`, the request is rejected with `400` before any AI/Clover work.
