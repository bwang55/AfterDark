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
│  │  S3 + CloudFront │  ← (not yet provisioned)          │
│  │  Static frontend │                                   │
│  └──────────────────┘                                   │
└─────────────────────────────────────────────────────────┘
```

The app has two deployable parts:

| Component | What it does | AWS Service | Status |
|-----------|-------------|-------------|--------|
| **Backend API** | Serves place data (seed + Mapbox live POI) | Lambda + API Gateway | ✅ CDK ready |
| **Frontend** | Next.js static export (SPA) | S3 + CloudFront | ⬜ Manual / TBD |

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
| `ALLOW_ORIGIN` | No | CORS origin header. Defaults to `*`. Set to your frontend domain in production. |
| `MAPBOX_ACCESS_TOKEN` | Yes (for live POI) | Mapbox API token. Without it, only seed data is returned. |

### Infrastructure (CDK)

Defined in `infra/lib/afterdark-stack.ts`:

- **`PlacesHandler`** — `NodejsFunction` (Node.js 20, 512 MB, 12s timeout). CDK bundles the TypeScript handler with esbuild automatically.
- **`AfterDarkApi`** — `RestApi` with a single `GET /places` route, deployed to the `prod` stage. CORS is pre-configured.
- **Output: `PlacesApiEndpoint`** — The full URL of the deployed API (e.g. `https://abc123.execute-api.us-east-1.amazonaws.com/prod/places`).

---

## Part 2 — Frontend (Static Export)

### What it does

A Next.js app that renders a cinematic, time-aware map UI. It can be exported as a fully static site (HTML + JS + CSS) with no server-side rendering required.

**Key files:**
- `app/page.tsx` — Main page (client component)
- `app/layout.tsx` — Root layout
- `components/` — UI components (MapCanvas, PlaceCard, TimeSlider, etc.)
- `lib/api.ts` — API client that calls the backend

### How the frontend connects to the backend

`lib/api.ts` reads `NEXT_PUBLIC_PLACES_API_URL` at build time. If set, it fetches from the API Gateway endpoint. If unset, it falls back to the built-in seed data (offline mode).

### Hosting options

The simplest approach is **S3 + CloudFront**:

1. Build the static export: `npm run build:static` → outputs to `out/`
2. Upload `out/` to an S3 bucket
3. Serve via CloudFront for HTTPS + CDN caching

This is not yet automated in the CDK stack.

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
export ALLOW_ORIGIN="*"                # lock down to your domain later

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

### Step 5 — Build and deploy the frontend

```bash
# Set the API URL from Step 3
export NEXT_PUBLIC_PLACES_API_URL="https://abc123.execute-api.us-east-1.amazonaws.com/prod/places"

# Build static export
npm run build:static

# Upload to S3 (create bucket first if needed)
aws s3 sync out/ s3://YOUR_BUCKET_NAME --delete

# Optionally invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
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
| S3 | < $1/month |
| CloudFront | Free tier (1 TB/month) |
| **Total** | **< $5/month** for light usage |
