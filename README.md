# Clover Insights

A chat-first web app that lets business owners connect their Clover POS account and ask natural-language questions about their business data.

## Stack

- **Next.js** (App Router, TypeScript)
- **Tailwind CSS** + shadcn/ui
- **Firebase Auth** (email/password)
- **Firestore** (data storage)
- **Firebase Admin SDK** (server-side auth verification)
- **Clover OAuth** (POS integration)
- **OpenAI API** (LLM with tool/function calling)

## Getting Started

### 1. Prerequisites

- Node.js 18+
- A Firebase project with Firestore and Authentication (email/password) enabled
- A Clover developer account with a sandbox app
- An OpenAI API key

### 2. Clone and install

```bash
git clone <repo-url>
cd clover-insights
npm install
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in all values in `.env.local`:

- **Firebase Client**: Get from Firebase Console > Project Settings > Your Apps > Web App
- **Firebase Admin**: Set `FIREBASE_PROJECT_ID`. For local dev, optionally set `FIREBASE_SERVICE_ACCOUNT_KEY` with the JSON contents of a service account key file (escaped as a single-line JSON string)
- **Clover**: Create an app at [Clover Developer Dashboard](https://sandbox.dev.clover.com/developer-home/create-account). Set the OAuth redirect URI to `http://localhost:3000/api/clover/oauth/callback`
- **OpenAI**: Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. First use

1. Sign up with email/password on the login page
2. Navigate to Settings and connect your Clover account
3. Open Chat and start asking questions

## Available Chat Queries

The AI assistant can answer questions using these tools:

- **Sales Summary**: "What were my total sales last week?"
- **Period Comparison**: "Compare this month's sales to last month"
- **Top Selling Items**: "What are my top 5 selling items this month?"
- **Refund Summary**: "How many refunds did I have in May?"

The assistant will always cite the data source and date range, and will clearly state when something cannot be answered from Clover data alone.

## Architecture

```
Browser                          Server
  |                                |
  |-- Firebase Auth (login) ------>|
  |                                |
  |-- GET /api/clover/status ----->|-- Verify Firebase token
  |                                |-- Query Firestore
  |                                |
  |-- GET /api/clover/oauth/start->|-- Generate OAuth state
  |                                |-- Redirect to Clover
  |                                |
  |-- POST /api/chat ------------>|-- Verify Firebase token
  |                                |-- Load Clover credentials from Firestore
  |                                |-- Call OpenAI with tool definitions
  |                                |-- Execute tools against Clover API
  |                                |-- Return assistant response
```

Key security rules:
- Clover tokens never reach the browser
- The LLM cannot call Clover directly — only approved backend tools
- All API routes verify Firebase ID tokens server-side
- OAuth state is signed and single-use

## Project Structure

```
src/
  app/
    login/page.tsx          # Firebase Auth login
    app/
      layout.tsx            # Protected app shell with nav
      page.tsx              # Dashboard home
      chat/page.tsx         # Chat interface
      settings/page.tsx     # Clover connection settings
    api/
      chat/route.ts         # Chat endpoint with OpenAI tool calling
      clover/
        oauth/start/route.ts    # Start Clover OAuth
        oauth/callback/route.ts # Handle Clover OAuth callback
        status/route.ts         # Check Clover connection
  lib/
    firebase/
      client.ts             # Firebase client SDK setup
      admin.ts              # Firebase Admin SDK setup
      auth-context.tsx       # React auth context provider
    auth/
      getCurrentUser.ts      # Server-side token verification
    orgs/
      getUserOrg.ts          # Organization resolution
    clover/
      client.ts              # Clover REST API client
      oauth.ts               # Clover OAuth helpers
      tools.ts               # Analytics tool implementations
    ai/
      openai.ts              # OpenAI client setup
      toolSchemas.ts         # Tool definitions for function calling
  types/
    index.ts                 # Shared TypeScript types
```

## Production TODOs

- [ ] Move Clover access tokens from Firestore to Google Secret Manager
- [ ] Add rate limiting to API routes
- [ ] Add query result caching for Clover API calls
- [ ] Handle Clover API pagination for high-volume merchants
- [ ] Add Clover disconnect flow
- [ ] Add streaming responses for better chat UX
- [ ] Add error monitoring (Sentry or similar)
- [ ] Set up Firestore security rules
