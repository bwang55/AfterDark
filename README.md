<div align="center">

# AfterDark

**A time-aware city discovery app. Time is the theme engine for the entire interface.**

### [→ Live Demo](https://main.dne6np3xoou1r.amplifyapp.com)

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![AWS](https://img.shields.io/badge/AWS-Lambda%20%2B%20CDK-ff9900?logo=amazonaws&logoColor=white)](#aws-architecture)
[![Mapbox](https://img.shields.io/badge/Mapbox-GL%20JS%203-4264fb?logo=mapbox&logoColor=white)](https://mapbox.com)
[![OpenAI](https://img.shields.io/badge/OpenAI-gpt--4o-412991?logo=openai&logoColor=white)](https://platform.openai.com)

</div>

---

<div align="center">
  <img src="assets/screenshot-1.png" width="48%" />
  <img src="assets/screenshot-4.png" width="48%" />
</div>

---

## What it is

A full-screen 3D map of Providence RI where **time is a first-class design primitive**. Drag the time slider and the map style, place visibility, gradient background, and AI chat personality all interpolate together. An OpenAI assistant recommends places from the live POI set and drives the map directly via function calls.

End-to-end production build: static Next.js on AWS Amplify, 4 TypeScript Lambdas behind API Gateway, 1 streaming Lambda Function URL, DynamoDB for chat persistence, and a CDK stack that ships it all with one command.

## Engineering highlights

- **Time as theme engine** — 4 named themes (morning/afternoon/dusk/night) driving semantic state, plus continuous RGB interpolation across 7 keyframes driving gradient/glow/tint. Decoupled so the bucket can jump while pixels stay smooth. `shared/time-theme.ts`
- **AI chat with function calling + response streaming** — OpenAI `gpt-4o` with 4 tools (`navigate_to_place`, `set_time`, `show_open_now`, `filter_category`). Two-phase flow: first call streams tool invocations, server executes them, second call streams the natural-language reply. Actions are dispatched to Zustand so the map reacts live. `services/ai-chat/handler.ts`
- **Lambda Function URL streaming** — `awslambda.streamifyResponse` + NDJSON frames (`{t:"d",v:"text"}` deltas, `{t:"done",actions}` final). Bypasses API Gateway's 30s response buffer so tokens arrive in ~100ms instead of 3-10s.
- **Three-layer POI rate limiting** — 10-min LRU cache + in-flight Promise dedupe + 6 calls/60s token bucket. Plus `usePlaces()` only fires Mapbox on mount; all filter/time/query changes re-rank client-side. Net result: ~3 Mapbox calls per user session. `lib/discovery.ts`
- **Dual-mode data source** — API mode (Lambda), direct-to-Mapbox (publishable `pk.*` token, no backend), or offline (seed only). Decided by env at build time; same `usePlaces()` hook serves all three.
- **Session chat persistence** — DynamoDB with `sessionId` PK + `timestamp` SK + 7-day TTL. Fire-and-forget writes inside the streaming handler, flushed with `Promise.allSettled` before Lambda terminates.

## AWS architecture

```
      ┌─── Amplify Hosting (frontend, static export + CDN) ───┐
      │                                                        │
      ▼                   ▼                   ▼                ▼
  API Gateway       Lambda Function URL   Mapbox API      Google Places
  (REST /prod)      (streaming NDJSON)    (Search Box)    (photo proxy)
   │   │   │             │
   ▼   ▼   ▼             ▼
  Places ChatHist Photo  AiChat ──► OpenAI gpt-4o
  λ      λ        λ      λ           │
                           └────► DynamoDB (chat-history, 7d TTL)
```

Key decisions:

- **Lambda Function URL for AI chat, REST API for the rest** — API Gateway REST buffers the full response, killing NDJSON streaming. Function URL with `INVOKE_MODE=RESPONSE_STREAM` keeps the TCP connection open.
- **DynamoDB over RDS** — chat is session-scoped, no joins. `PAY_PER_REQUEST` + native TTL handles cleanup for free. No capacity planning.
- **CORS at the gateway** — `defaultCorsPreflightOptions` on REST API + Function URL's own `cors` config. Handlers never set `access-control-*` headers (avoids duplicate-header rejection).
- **IAM least-privilege** — `chatTable.grantWriteData(aiChatHandler)` + `grantReadData(chatHistoryHandler)`. No wildcard perms.
- **NodejsFunction + esbuild** — auto-bundles TypeScript with source maps, so CloudWatch stack traces point at original TS lines.
- **One-command deploy** — `npm run cdk:deploy` provisions 4 Lambdas, REST API, Function URL, DynamoDB, IAM, CORS in a single CloudFormation stack. Outputs feed Amplify env vars; next `git push` rebuilds against new endpoints.

Steady-state cost at low traffic: **< $1/month AWS** (free tier absorbs Lambda + DynamoDB + Amplify). OpenAI `gpt-4o` is the real variable (~$0.006 per chat turn).

Full walkthrough in [DEPLOYMENT.md](DEPLOYMENT.md).

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, static export) + React 19 |
| Language | TypeScript 5.8 strict |
| State | Zustand 5 + `persist` (localStorage) |
| Styling | Tailwind CSS 3.4 + Framer Motion 12 |
| Map | Mapbox GL JS 3 (3D buildings, light presets) |
| AI | OpenAI gpt-4o (function calling + SSE streaming) |
| Backend | AWS Lambda (Node 20), API Gateway REST, Lambda Function URL |
| Database | DynamoDB (on-demand, TTL) |
| IaC | AWS CDK v2 |
| Testing | Vitest + Playwright |
| Hosting | AWS Amplify (static + CDN) |

## Project structure

```
app/              Next.js app router
components/       MapCanvas, TimeSlider, AIChatPill, UI overlays
hooks/            usePlaces (unified data source), useThemeMode
shared/           Types, seed data, time-theme engine, ranking — used by both frontend & Lambda
lib/              API client, Mapbox discovery (3-layer rate limit), geocoding
services/         Lambda handlers (api, ai-chat, chat-history, place-photo)
infra/            CDK stack — 4 Lambdas, REST API, Function URL, DynamoDB
store/            Single Zustand store
```

## Quick start

```bash
npm install
cp .env.example .env.local
# At minimum: NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.xxx
npm run dev
```

Offline mode works out of the box. Add `NEXT_PUBLIC_PLACES_API_URL` and `NEXT_PUBLIC_AI_CHAT_URL` (from `npm run cdk:deploy` outputs) for full API mode.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build:static` | Static export → `out/` |
| `npm run test` / `test:e2e` | Vitest / Playwright |
| `npm run cdk:deploy` | Deploy full AWS stack |

## License

MIT
