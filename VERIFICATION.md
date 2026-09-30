# Verification

Verified locally on 2026-09-30 using Node.js 22.22.0.

- Production TypeScript/build check passed.
- Nine automated tests passed. They cover real PDF parsing, physical page references, unsupported files, chunk boundaries, citation validation, code-index preservation, request validation, and HTTP upload/chat/replace/delete/session-isolation flows.
- API integration tests use fake external services. They do not claim live Groq, Pinecone, or Supabase connectivity.
- The real quantized MiniLM embedding model was downloaded and produced a finite 384-dimensional embedding.
- Browser verification covered the initial workspace, suggested-question input, missing-key setup dialog, mobile drawer/new-conversation interaction, and desktop layout. No browser console errors were observed.
- The dependency audit after patch updates reported zero known vulnerabilities.

## Connected services and streaming update

The user configured the services. All four connection checks passed: Groq model access, Pinecone index, Supabase schema, and private storage bucket. The configured Groq model was changed to an available Qwen model.

- Twelve automated tests now pass, including SSE frame boundaries/Unicode, metadata trailer hiding, early delivery before completion, stream errors, and upstream cancellation on disconnect.
- The final TypeScript and production build passed.
- A live general CS response rendered with Markdown code in the browser. The Stop button successfully stopped a live request and labeled the partial answer.
- An isolated real PDF test uploaded the generated one-page stacks-and-queues handout, extracted four chunks, indexed them, retrieved evidence, and streamed a cited answer in **143 deltas**. The citation referenced page 1 of that document. The test document was deleted afterwards.
- JSON-mode output was observed to arrive in one chunk; generation now uses native text streaming with a hidden final classification trailer, followed by citation validation.
- The Kimi-inspired redesign was visually checked at desktop and mobile widths in dark/light themes. Sidebar collapse and the mobile drawer were exercised.

These checks establish one working live PDF path, not exhaustive answer-quality evaluation. Citation-ID validation is not a factual-entailment guarantee.

## Running preview

Development frontend: http://127.0.0.1:5173

API: http://127.0.0.1:3001

Run `npm run dev` again if the local process has stopped.
