# Margin AI

Big questions. Clear answers. Built by Jagrat.

A general-purpose AI chatbot for writing, planning, learning, everyday questions, and programming with streamed Markdown answers, code examples, follow-up questions, a Stop button, and light/dark themes. React + TypeScript + Express + Groq. No accounts, PDF uploads, local AI models, Pinecone, or Supabase are required. Conversation history stays in browser memory and resets on refresh; relevant messages are sent to Groq for answers.

## Local setup

Use Node.js 22. Run npm ci, copy .env.example to .env, set GROQ_API_KEY and GROQ_MODEL, then run npm run dev. Open http://127.0.0.1:5173.

Generate SESSION_SECRET with:

    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

Never commit .env or expose credentials with VITE_ prefixes.

## Render backend

Create a free Node web service from this repository (render.yaml also provides a Blueprint). Build: npm ci --include=dev. Start: npm start. Health check: /api/health.

Set GROQ_API_KEY, GROQ_MODEL, SESSION_SECRET (at least 32 characters), APP_ORIGIN (exact public Vercel origin, no trailing slash), NODE_ENV=production, HOST=0.0.0.0, and TRUST_PROXY_HOPS=1. Render supplies PORT. Only trust the immediate platform proxy; do not set trust proxy to true.

The free backend can sleep when idle. Opening Margin automatically checks readiness, retrying transient failures up to 12 times with 10-second request timeouts and 2-second pauses. Sending a question checks readiness again, then submits it once. Stop cancels the wait and restores your draft. No background keep-alive schedule is used. No embedding download is needed.

## Vercel frontend

Framework: Vite. Build: npm run build. Output: dist. No API secrets belong on Vercel for this split deployment. Configure vercel.json with a rewrite from /api/:path* to the actual Render URL followed by /api/:path*, before the SPA fallback. This keeps API calls and signed session cookies on the frontend origin. Direct cross-origin API calls are intentionally not used.

After deployment verify /api/health, /api/status, and a streamed chat response through the Vercel domain. Render APP_ORIGIN must match that domain. Preview domains require their own backend configuration; they are not automatically trusted.

## Checks and limits

npm run build — TypeScript and frontend build.
npm test — chat validation, removed upload route, SSE delivery, cancellation, and decoding.
npm run check:services — a real Groq streaming request; uses API quota.

Maximum question: 4,000 characters. The provider receives at most six history messages of 2,200 characters each. Answers: up to 1,800 tokens. Chat: 12 requests per minute per IP; general API: 90 per minute. Groq account quotas also apply. Limits and session locks are in-memory, intended for a single backend instance.

## Previous PDF data

Removing the integration does not delete existing files, database rows, or vectors from your Supabase/Pinecone accounts. The old automatic cleanup is no longer running. Remove any old study documents from those services manually if no longer needed. Existing local credentials for those services are ignored.

## Web search

Add `TAVILY_API_KEY` to the Render backend environment (or local `.env`) and redeploy. Never use a `VITE_` prefix for this secret. Turn on **Web** in the composer for current information and source links. Each enabled question makes one basic Tavily search, shared across visitors. Ordinary chat does not use Tavily. Explicit today/latest news queries use a one-day window. Dates are interpreted relative to UTC; source dates can reflect updates. Search failures are shown explicitly.
