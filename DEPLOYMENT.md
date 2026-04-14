# AfterDark — AWS Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                        AWS Cloud                        │
│                                                         │
│  ┌──────────────┐      ┌───────────────────────────┐    │
│  │ API Gateway   │──────│  Lambda (PlacesHandler)   │    │
│  │ (REST, /prod) │      │  Node.js 20.x, 512 MB    │    │
│  │               │      │                           │    │
│  │ GET /places   │      │  - SEED_PLACES (built-in) │    │
│  │ OPTIONS /     │      │  - Mapbox Search API call │    │
│  └──────────────┘      └───────────────────────────┘    │
│                                                         │
│  ┌──────────────────┐                                   │
│  │  AWS Amplify      │  ← git push 自动构建 + CDN 部署  │
│  │  Static frontend  │                                   │
│  └──────────────────┘                                   │
└─────────────────────────────────────────────────────────┘
```

The app has two deployable parts:

| Component | What it does | AWS Service | Status |
|-----------|-------------|-------------|--------|
| **Backend API** | Serves place data (seed + Mapbox live POI) | Lambda + API Gateway | ✅ CDK ready |
| **Frontend** | Next.js static export (SPA) | AWS Amplify Hosting | ✅ amplify.yml ready |

---

## Part 1 — Backend (Lambda + API Gateway)

### What it does

A single Lambda function behind API Gateway that:

1. Returns a built-in list of curated places (`SEED_PLACES` from `shared/places.ts`)
2. Optionally calls the **Mapbox Search API** to discover live POIs within a bounding box
3. Merges, filters by search query, and ranks results by time/tags/proximity
4. Returns JSON via `GET /places`

**Source code:** `services/api/handler.ts`

### Query parameters

| Param | Description | Default |
|-------|-------------|---------|
| `time` | Hour of day (0–30 range) | `22` |
| `tags` | Comma-separated place tags | (none) |
| `limit` | Max results | `40` |
| `lng`, `lat` | User location for proximity ranking | (none) |
| `bbox` | Bounding box `west,south,east,north` — triggers Mapbox search | (none) |
| `q` / `query` | Free-text search filter | (none) |

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ALLOW_ORIGIN` | No | CORS origin header. Defaults to `*`. Set to your Amplify domain in production. |
| `MAPBOX_ACCESS_TOKEN` | Yes (for live POI) | Mapbox API token. Without it, only seed data is returned. |

### Infrastructure (CDK)

Defined in `infra/lib/afterdark-stack.ts`:

- **`PlacesHandler`** — `NodejsFunction` (Node.js 20, 512 MB, 12s timeout). CDK bundles the TypeScript handler with esbuild automatically.
- **`AfterDarkApi`** — `RestApi` with a single `GET /places` route, deployed to the `prod` stage. CORS is pre-configured.
- **Output: `PlacesApiEndpoint`** — The full URL of the deployed API (e.g. `https://abc123.execute-api.us-east-1.amazonaws.com/prod/places`).

---

## Part 2 — Frontend (AWS Amplify Hosting)

### What it does

A Next.js app that renders a cinematic, time-aware map UI. It is exported as a fully static site (HTML + JS + CSS) and deployed via AWS Amplify Hosting.

### How it works

Amplify Hosting connects to the Git repo and auto-deploys on every push to `main`. The build process is defined in `amplify.yml`:

1. `npm ci` — install dependencies
2. `npm run build:static` — static export to `out/`
3. Amplify serves `out/` via its built-in CDN (CloudFront)

### How the frontend connects to the backend

`lib/api.ts` reads `NEXT_PUBLIC_PLACES_API_URL` at build time. If set, it fetches from the API Gateway endpoint. If unset, it falls back to the built-in seed data (offline mode).

### Amplify environment variables

Set these in Amplify Console → App settings → Environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Yes | Mapbox public token for the map |
| `NEXT_PUBLIC_PLACES_API_URL` | No | API Gateway endpoint from CDK output. Omit for offline mode. |
| `NEXT_OUTPUT_MODE` | Auto | Set to `export` by `build:static` script — no manual config needed |

### Custom domain

Amplify Console → Domain management → Add custom domain. Amplify handles SSL certificate provisioning and DNS validation automatically.

---

## Deployment Steps

### Prerequisites

- AWS CLI configured with credentials (`aws configure`)
- Node.js 20+
- CDK CLI: `npm install -g aws-cdk` (or use `npx`)
- A Mapbox access token (get one at https://account.mapbox.com)

### Step 1 — Install dependencies

```bash
npm install
cd infra && npm install && cd ..
```

### Step 2 — Bootstrap CDK (first time only)

```bash
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1
```

### Step 3 — Deploy the backend

```bash
export MAPBOX_ACCESS_TOKEN="pk.your_mapbox_token_here"
export ALLOW_ORIGIN="*"                # lock down to your Amplify domain later

npm run cdk:deploy
```

CDK will print the API endpoint URL in the output:

```
Outputs:
AfterDarkStack.PlacesApiEndpoint = https://abc123.execute-api.us-east-1.amazonaws.com/prod/places
```

### Step 4 — Verify the API

```bash
curl "https://abc123.execute-api.us-east-1.amazonaws.com/prod/places?time=22&limit=5"
```

### Step 5 — Set up Amplify Hosting (first time only)

1. Open AWS Amplify Console
2. **New app** → **Host web app** → connect your Git repo
3. Amplify auto-detects `amplify.yml` — no build settings to configure
4. Add environment variables:
   - `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` = your Mapbox token
   - `NEXT_PUBLIC_PLACES_API_URL` = the endpoint from Step 3
5. Save and deploy

After initial setup, every `git push` to `main` triggers an automatic build and deploy.

### Step 6 — Lock down CORS

Once Amplify assigns a domain (e.g. `https://main.d1abc2def3.amplifyapp.com`), update the backend:

```bash
export ALLOW_ORIGIN="https://main.d1abc2def3.amplifyapp.com"
npm run cdk:deploy
```

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local dev server |
| `npm run build:static` | Build static export to `out/` |
| `npm run preview:static` | Preview static build locally (port 4173) |
| `npm run test` | Run tests |
| `npm run cdk:synth` | Synthesize CloudFormation template (dry run) |
| `npm run cdk:deploy` | Deploy backend to AWS |

## Cost Estimate

With low traffic (< 1M requests/month):

| Service | Estimated Cost |
|---------|---------------|
| Lambda | Free tier (1M requests/month free) |
| API Gateway | ~$3.50 per million requests |
| Amplify Hosting | Free tier (1000 build min/month, 15 GB served/month) |
| **Total** | **< $5/month** for light usage |
