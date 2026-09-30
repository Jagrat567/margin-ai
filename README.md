# Margin — Study Notes Tutor

A React + TypeScript study workspace for general computer science questions and PDF-grounded answers. No signup or login. Node.js runs the API, PDF extraction, and a free local embedding model. Groq supplies AI answers, Pinecone handles vector search, and Supabase stores private PDFs and passages.

## Start locally

Requires **Node.js 22.13 or newer** and npm. Open a terminal in this folder:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open **http://127.0.0.1:5173**. Without credentials the actual interface runs in setup mode; it does not invent AI answers or pretend uploads succeeded. Use the same hostname consistently so the session cookie stays available.

## Connect the free services

You create accounts with the infrastructure providers; students using the app do not need accounts. Free tiers have quotas and can change. Never put keys in React, add a `VITE_` prefix to secrets, commit `.env`, or paste keys into chat.

### 1. Groq: general AI answers

1. Create a free account at https://console.groq.com and generate an API key at https://console.groq.com/keys.
2. In `.env`, set `GROQ_API_KEY`.
3. The default `GROQ_MODEL=llama-3.1-8b-instant` is configurable. Confirm your account has access and check https://console.groq.com/docs/rate-limits. Select a chat model supporting JSON object output.
4. Restart the server. General CS chat now works even before PDF services are configured.

### 2. Pinecone: PDF vector search

1. Create a Starter/free project at https://app.pinecone.io.
2. Create a **dense, bring-your-own-vectors index**, for example `margin-notes`.
3. Choose **384 dimensions**, **cosine** metric, and a region available on your free plan. Do not choose an integrated-embedding index: this app creates its own vectors.
4. Copy the index **Host** into `PINECONE_INDEX_HOST`, including `https://` and no trailing path.
5. Generate a project API key and set `PINECONE_API_KEY`.

Each document uses its own namespace. The server verifies the private browser session before searching that namespace. The model is fixed to `Xenova/all-MiniLM-L6-v2`; changing models requires reindexing documents and matching the index dimension.

### 3. Supabase: files and metadata

1. Create a free project at https://supabase.com/dashboard.
2. Open **SQL Editor** and run the complete contents of `supabase/schema.sql`.
3. This creates `documents` and `chunks`, indexes, row-level security, and a **private** `study-pdfs` storage bucket. No anonymous browser table access is granted.
4. Copy the project URL into `SUPABASE_URL`.
5. Set `SUPABASE_SERVICE_ROLE_KEY` to your server-side **service_role key** (or a Supabase secret API key). Do not use the public anon/publishable key for the backend.
6. Leave `SUPABASE_STORAGE_BUCKET=study-pdfs` unless you also change the bucket created by the SQL script.

### 4. Stable session secret

Generate a random secret and copy it to `SESSION_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Restart `npm run dev` after editing `.env`. Without a configured secret, development uses a temporary one and sessions are reset on restart.

### 5. Verify and download the embedding model

```powershell
npm run check:services
npm run warmup
```

`check:services` checks model access with a tiny AI request, the vector dimension, both database tables, and the private bucket. It does not print secrets. `warmup` downloads a quantized free embedding model to `.cache/models` and verifies its 384-dimensional output. This requires internet once, then uses the local model cache. No embedding API key, GPU, or per-request embedding charge is needed. Host compute and storage still have costs/limits.

## How it works

```text
PDF → private Supabase storage → extract pages → overlapping chunks
    → tokenizer-aware splitting → local MiniLM embeddings
    → Pinecone vectors + Supabase passage text

Question → optional document retrieval → evidence + recent conversation
         → Groq → validated citation IDs → Markdown answer + source cards
```

- Without a PDF, answers come from general model knowledge.
- With a PDF, related passages are retrieved; unsupported topics can use general knowledge, clearly labeled.
- **PDF only** restricts answers to retrieved evidence. Unsupported uncited responses become an insufficient-evidence message.
- Citations open an excerpt and link to the original PDF's physical page number.
- Answers stream from Groq as native text over server-sent events. The Stop button cancels the upstream request; partial stopped/interrupted answers are labeled and excluded from future model history. Source cards and the final answer label appear after citation validation.
- The interface uses a minimal, Kimi-inspired layout with a collapsible sidebar, centered composer, responsive mobile drawer, and saved light/dark theme preference.
- Short follow-ups include the previous question in retrieval. Explicit `page 8` questions fetch that page's passages directly.
- Retrieved documents are untrusted evidence, never system instructions. Citation ID checks validate references, not factual entailment; important claims still need review.

## Boundaries and privacy

- One active PDF per browser session; 10 MB, 80 pages, and 250,000 extracted characters maximum. Text-based English CS notes work best. Scans, handwritten notes, diagrams, complex tables, and mathematical notation are not reliably supported.
- Uploading a replacement clears the current conversation. Chats live only in React memory and disappear on refresh. PDF access persists in a signed, HttpOnly, SameSite cookie for up to 24 hours; no user identity or account is created.
- Documents become inaccessible after 24 hours. A cleanup task removes expired files, vectors, and records every 15 minutes **while the server is running** and retries on failure. When the server is off, physical deletion waits until it starts again. This is not a guarantee that provider backups disappear immediately.
- Providers receive different data: Supabase stores PDFs/text, Pinecone stores embeddings and identifiers, Groq receives questions, recent conversation, and retrieved passages. Original PDFs are not sent to Groq.
- Secrets are server-only. Each read, retrieval, and deletion checks session ownership. API requests are same-origin, rate-limited, and size-limited.
- Backend errors are surfaced, not silently converted into general answers when document retrieval fails.

## Development commands

| Command | Purpose |
|---|---|
| `npm run dev` | API on 3001 + Vite frontend on 5173 |
| `npm run build` | TypeScript check and frontend production build |
| `npm test` | Real PDF parsing and API integration tests with fake external services |
| `npm run warmup` | Download and verify real local embeddings |
| `npm run check:services` | Verify configured live service access |
| `npm start` | Serve built frontend and API together on port 3001 |

## Deployment notes

This is a **single Node server** application, not a static-only site. Build with `npm run build`, configure environment variables, and run `npm start`. For local built preview, set `APP_ORIGIN=http://127.0.0.1:3001`. For public hosting use HTTPS, set `NODE_ENV=production`, `APP_ORIGIN` to the exact public origin, and a persistent `SESSION_SECRET`.

The server binds to loopback by default. Use `HOST=0.0.0.0` when a container host requires it. Run behind an HTTPS reverse proxy and configure trusted proxy handling deliberately for that provider before relying on per-IP limits. Never enable blanket trust proxy.

Keep a persistent writable model cache. Avoid short-lived serverless functions: local model loading and PDF processing can exceed their memory and execution limits. The first version uses a bounded in-process job queue (two concurrent uploads), not a durable distributed worker. Interrupted jobs are marked failed on restart and can be retried by replacing the PDF. Run one server instance; horizontal scaling requires a durable queue, distributed locks/rate limiting, and a scheduled cleanup worker. Whole-book summaries need a separate comprehensive summarization pipeline; ordinary retrieval only supplies a handful of passages.

## Manual acceptance checks after setup

1. Ask “Explain recursion using a Python example” without a PDF.
2. Upload lecture notes, wait for “Ready”, and ask a question covered by them. Open the cited source and PDF page.
3. Ask an unrelated CS question; it should be labeled general knowledge, with no fabricated PDF citations.
4. Enable PDF only and ask something absent; it should acknowledge insufficient evidence.
5. Open a separate private browser session: the first session’s document must not be visible.
6. Replace and delete PDFs; verify their previous URLs are no longer accessible.

The automated tests use fake Groq/Pinecone/Supabase services and do not prove live provider connectivity or answer quality. Run live checks after adding credentials. With the generated sample PDF present and the app running, `node --import tsx scripts/smoke-rag.ts` checks real ingestion, streaming, and citations in a fresh session, then deletes only its test document. This uses provider quotas.
