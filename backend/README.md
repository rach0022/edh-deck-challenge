# 🃏 EDH 32 Deck Challenge — Backend

A full-stack Hono application that serves both a server-side rendered web UI and a JSON REST API for the EDH 32 Deck Challenge. Enter a Moxfield username and see which of the 32 color identity slots have been filled with Commander decks.

No auth. No database. No sign-up. Just enter a username and go.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Web Framework** | [Hono](https://hono.dev) v4.7 | HTTP routing, middleware, JSX SSR |
| **Runtime** | Node.js 22+ | ES modules, native fetch |
| **Rendering** | Hono JSX | Server-side rendered HTML (no React, no client JS) |
| **Browser Automation** | [Puppeteer](https://pptr.dev) v25 | Headless Chrome for Cloudflare bypass |
| **Cache (Production)** | [Upstash Redis](https://upstash.com) | HTTP-based serverless Redis |
| **Cache (Local)** | [ioredis](https://github.com/redis/ioredis) v5 | Standard Redis via TCP (Docker) |
| **Cache (Fallback)** | In-memory Map | Zero-config development fallback |
| **Language** | TypeScript 5.8 | Strict mode, ES2022 target |
| **Bundler** | tsc | Direct TypeScript compilation |
| **Dev Server** | [tsx](https://github.com/privatenumber/tsx) | Hot-reload during development |
| **Deployment** | Docker / Render / Railway / Fly.io | Multi-stage Dockerfile included |

---

## Architecture

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (User)                              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                    HTTP Request (GET /challenge/:username)
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Hono Server (:3000)                          │
│                                                                     │
│  ┌──────────────┐  ┌───────────────────┐  ┌─────────────────────┐  │
│  │  Middleware   │  │   Page Routes     │  │    API Routes       │  │
│  │  • Logger     │  │   • GET /         │  │    • GET /api/...   │  │
│  │  • CORS       │  │   • GET /challenge│  │    • POST /api/...  │  │
│  │              │  │   • GET /deck     │  │                     │  │
│  └──────────────┘  └────────┬──────────┘  └──────────┬──────────┘  │
│                             │                        │              │
│                             ▼                        ▼              │
│                    ┌─────────────────────────────────────┐          │
│                    │        Challenge Service            │          │
│                    │  (orchestration + business logic)   │          │
│                    └──────────┬──────────────────────────┘          │
│                               │                                     │
│              ┌────────────────┼────────────────┐                    │
│              ▼                                 ▼                    │
│  ┌───────────────────┐              ┌───────────────────────┐      │
│  │   Cache Service    │              │   Moxfield Service    │      │
│  │                   │              │                       │      │
│  │  • Upstash (HTTP) │              │  • Puppeteer browser  │      │
│  │  • ioredis (TCP)  │              │  • Cloudflare bypass  │      │
│  │  • In-memory      │              │  • API fetching       │      │
│  └───────────────────┘              └───────────┬───────────┘      │
│                                                 │                   │
└─────────────────────────────────────────────────┼───────────────────┘
                                                  │
                                     Headless Chrome (Puppeteer)
                                                  │
                                                  ▼
                                    ┌─────────────────────────┐
                                    │    Moxfield API (v2)     │
                                    │  (behind Cloudflare WAF) │
                                    └─────────────────────────┘
```

### Request Flow — Challenge Lookup

```
User visits /challenge/mainframe
         │
         ▼
┌─ Page Route Handler ─────────────────────────────────────┐
│                                                          │
│  1. Validate username (2-50 chars)                       │
│  2. Call challengeService.getChallenge("mainframe")      │
│                                                          │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌─ Challenge Service ──────────────────────────────────────┐
│                                                          │
│  3. Check cache: GET edh:challenge:mainframe             │
│     ├─ HIT → return cached ChallengeResponse            │
│     └─ MISS → continue to step 4                        │
│                                                          │
│  4. moxfield.fetchUserDecks("mainframe")                 │
│     → Verify user exists (GET /v1/users/mainframe)       │
│     → Paginated search (GET /v2/decks/search?fmt=cmdr)   │
│     → Returns: DeckSummary[]                             │
│                                                          │
│  5. For each deck: moxfield.fetchDeckDetail(publicId)    │
│     → GET /v2/decks/all/{id}                             │
│     → Returns: full deck with commanders + mainboard     │
│     → Cache individual deck                              │
│                                                          │
│  6. extractCommanders(deck) for each deck                │
│     → Pull cards from deck.commanders zone               │
│     → Resolve image URLs (card_faces fallback)           │
│     → Mark decks with no commander as "skipped"          │
│                                                          │
│  7. organizeDecks(extractions, username)                  │
│     → resolveColorIdentity (union of commander colors)   │
│     → colorIdentityToKey (sort WUBRG → slot key)         │
│     → Place each deck into its matching color slot       │
│     → Return ChallengeProgress with all 32 slots         │
│                                                          │
│  8. Build ChallengeResponse with summary stats           │
│     → percentComplete, categoryCounts, filledCount       │
│                                                          │
│  9. Cache result: SET edh:challenge:mainframe (TTL 900s) │
│                                                          │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌─ SSR Renderer ───────────────────────────────────────────┐
│                                                          │
│  10. Render ChallengePage JSX component                   │
│      → Progress bar with percentage                      │
│      → 32-slot grid grouped by category                  │
│      → Commander art from Scryfall (art_crop)            │
│      → Multi-deck carousel (CSS keyframe animation)      │
│                                                          │
│  11. Return HTML response                                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Color Identity Resolution Algorithm

```
Input: MoxfieldDeckDetail (deck with commanders zone)

1. Extract all cards from deck.commanders
   └─ Each card has card.color_identity: string[]

2. For partner commanders, compute UNION of all color identities:
   Commander A: ["W", "U"]
   Commander B: ["B", "R"]
   Union:       ["W", "U", "B", "R"]

3. Sort result in WUBRG canonical order:
   Filter ['W','U','B','R','G'] by presence in set
   Result: ["W", "U", "B", "R"] (preserves WUBRG order)

4. Convert to slot key:
   Empty → "C" (colorless)
   Otherwise → join("") → "WUBR"

5. Match to one of 32 predefined COLOR_COMBINATIONS:
   "WUBR" → { name: "Yore-Tiller", category: "four-color" }
```

### Deck Detail — Card Type Classification

```
Input: deck.mainboard (Record<string, MoxfieldCardEntry>)

For each card, classify by type_line (priority order):
  1. Contains "creature"     → Creature
  2. Contains "planeswalker" → Planeswalker
  3. Contains "instant"      → Instant
  4. Contains "sorcery"      → Sorcery
  5. Contains "battle"       → Battle
  6. Contains "artifact"     → Artifact      (after creature check)
  7. Contains "enchantment"  → Enchantment   (after creature check)
  8. Contains "land"         → Land
  9. Otherwise               → Other

Note: "Artifact Creature" → Creature (creature takes priority)
      "Enchantment Creature" → Creature

Cards within each group are sorted by: CMC ascending, then name A-Z
Groups are output in the canonical order shown above.
```

### Cache Strategy

```
┌─────────────────────────────────────────────────────┐
│                  Cache Layer                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Key Pattern:                                       │
│    edh:challenge:{username}  → ChallengeResponse    │
│    edh:deck:{publicId}       → MoxfieldDeckDetail   │
│                                                     │
│  TTL: 900 seconds (15 minutes) by default           │
│                                                     │
│  Driver Selection (priority):                       │
│    1. Explicit CACHE_DRIVER env var                  │
│    2. Auto-detect from credentials:                 │
│       • UPSTASH_REDIS_REST_URL set → upstash        │
│       • REDIS_URL set → ioredis                     │
│       • Neither → in-memory                         │
│                                                     │
│  Behavior:                                          │
│    • GET /challenge/:user → checks challenge cache  │
│    • On MISS → fetches all decks, caches each       │
│    • POST /refresh/:user → deletes + re-fetches     │
│    • Individual deck details cached separately      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Puppeteer / Cloudflare Bypass Flow

```
First request (cold start):
  1. Launch headless Chromium (--no-sandbox)
  2. Set realistic User-Agent + viewport
  3. Navigate to https://moxfield.com
  4. Wait for Cloudflare challenge to resolve
     (page title no longer contains "Just a moment")
  5. Browser now has valid cf_clearance cookies
  6. All subsequent API calls use page.evaluate(fetch(...))
     which inherits the browser's cookies automatically

Subsequent requests:
  • Reuse existing browser + page instance
  • If browser disconnects → re-initialize automatically

Shutdown:
  • SIGINT/SIGTERM → close browser gracefully
```

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts                    # Server entry point, route mounting
│   ├── config.ts                   # Environment variable loading + cache driver detection
│   ├── types.ts                    # All TypeScript interfaces (Moxfield API, domain, responses)
│   │
│   ├── domain/                     # Pure business logic (no I/O)
│   │   ├── color-combinations.ts   # 32 color slot definitions
│   │   ├── color-identity.ts       # WUBRG resolution + key conversion
│   │   ├── commander-extractor.ts  # Extract commanders from deck data
│   │   └── deck-organizer.ts       # Map decks to 32 slots
│   │
│   ├── services/                   # I/O and orchestration
│   │   ├── cache.ts                # Multi-driver cache (Upstash / ioredis / memory)
│   │   ├── challenge.ts            # Main business logic orchestrator
│   │   └── moxfield.ts             # Puppeteer-based Moxfield scraper
│   │
│   ├── routes/                     # HTTP route handlers
│   │   ├── challenge.ts            # JSON API endpoints (/api/*)
│   │   ├── health.ts               # Health check endpoint
│   │   └── pages.tsx               # SSR page routes (/, /challenge, /deck)
│   │
│   ├── views/                      # Hono JSX components (server-rendered)
│   │   ├── layout.tsx              # Base HTML shell + all CSS
│   │   ├── home.tsx                # Landing page with search form
│   │   ├── challenge.tsx           # 32-slot progress grid
│   │   ├── deck-detail.tsx         # Single deck with card list
│   │   └── error.tsx               # Error page component
│   │
│   ├── middleware/
│   │   └── error-handler.ts        # Maps domain errors to HTTP responses
│   │
│   └── public/
│       └── favicon.svg             # Skull favicon
│
├── dist/                           # Compiled output (git-ignored)
├── .env.example                    # Environment variable template
├── .gitignore
├── Dockerfile                      # Multi-stage production build
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

---

## Endpoints

### SSR Pages (HTML)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Landing page with username search form |
| GET | `/challenge/:username` | 32-slot progress grid with commander art |
| GET | `/deck/:deckId` | Deck detail with cards grouped by type |
| POST | `/refresh/:username` | Force refresh, redirects to challenge page |
| GET | `/favicon.svg` | Skull favicon |

### JSON API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service health (cache + browser status) |
| GET | `/api/challenge/:username` | Full challenge progress as JSON |
| GET | `/api/decks/:username` | Flat list of all commander decks |
| GET | `/api/deck/:deckId` | Single deck detail with card groupings |
| POST | `/api/refresh/:username` | Force cache refresh, returns fresh data |

### Example API Response

```json
{
  "success": true,
  "data": {
    "username": "mainframe",
    "progress": {
      "slots": [
        {
          "key": "W",
          "name": "Mono White",
          "category": "mono",
          "colors": ["W"],
          "decks": [{
            "deckName": "Omnislash Voltron",
            "deckId": "abc123",
            "commanderNames": ["Cloud, Midgar Mercenary"],
            "commanders": [{
              "name": "Cloud, Midgar Mercenary",
              "imageUrl": "https://...",
              "setCode": "pip",
              "collectorNumber": "1"
            }]
          }]
        }
      ],
      "filledCount": 17,
      "totalSlots": 32,
      "skippedDecks": []
    },
    "summary": {
      "filledCount": 17,
      "totalSlots": 32,
      "percentComplete": 53,
      "categoryCounts": {
        "colorless": { "filled": 0, "total": 1 },
        "mono": { "filled": 5, "total": 5 },
        "two-color": { "filled": 6, "total": 10 },
        "three-color": { "filled": 5, "total": 10 },
        "four-color": { "filled": 1, "total": 5 },
        "five-color": { "filled": 0, "total": 1 }
      }
    }
  },
  "cached": true,
  "fetchedAt": "2026-08-20T12:00:00.000Z"
}
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment (`development`, `production`) |
| `CACHE_DRIVER` | No | auto-detect | Cache backend: `upstash`, `redis`, or `memory` |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL (ioredis TCP driver) |
| `UPSTASH_REDIS_REST_URL` | No | — | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | No | — | Upstash Redis REST token |
| `CACHE_TTL_SECONDS` | No | `900` | Cache TTL in seconds (15 min default) |
| `MOXFIELD_BASE_URL` | No | `https://api2.moxfield.com/v2` | Moxfield API base URL |
| `PUPPETEER_TIMEOUT_MS` | No | `60000` | Puppeteer navigation timeout (ms) |
| `PUPPETEER_HEADLESS` | No | `true` | Set to `false` to see browser window |

### Cache Driver Auto-Detection

When `CACHE_DRIVER` is not explicitly set:

1. If `UPSTASH_REDIS_REST_URL` AND `UPSTASH_REDIS_REST_TOKEN` are set → **Upstash** (HTTP)
2. If `REDIS_URL` is set → **ioredis** (TCP)
3. Otherwise → **In-memory** (resets on restart)

### .env.example

```bash
PORT=3000
NODE_ENV=development

# Cache driver (auto-detects if not set)
CACHE_DRIVER=

# Local Redis (Docker)
REDIS_URL=redis://localhost:6379

# Production Redis (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Cache settings
CACHE_TTL_SECONDS=900

# Moxfield
MOXFIELD_BASE_URL=https://api2.moxfield.com/v2
PUPPETEER_TIMEOUT_MS=60000
PUPPETEER_HEADLESS=true
```

---

## Running Locally

### Prerequisites

- **Node.js 22+** — `node --version`
- **npm 7+** — `npm --version`
- **Chrome/Chromium** — Puppeteer downloads its own on `npm install`

### Quick Start

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000` in your browser.

### With Local Redis

```bash
# Start Redis container
docker run -d --name redis-local -p 6379:6379 redis:alpine

# Add to .env
REDIS_URL=redis://localhost:6379

# Start server
npm run dev
```

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `tsx watch src/index.ts` | Dev server with hot reload |
| `npm run build` | `tsc && cp -r src/public dist/public` | Compile TS + copy static assets |
| `npm start` | `node dist/index.js` | Run compiled production build |
| `npm run typecheck` | `tsc --noEmit` | Type-check without emitting |

### Testing Endpoints

```bash
# Landing page
open http://localhost:3000

# Challenge page (SSR)
open http://localhost:3000/challenge/mainframe

# JSON API
curl http://localhost:3000/api/health
curl http://localhost:3000/api/challenge/mainframe
curl http://localhost:3000/api/decks/mainframe
curl http://localhost:3000/api/deck/<deckId>
curl -X POST http://localhost:3000/api/refresh/mainframe
```

### Docker (Local Build)

```bash
# Build
docker build -t edh-challenge-api .

# Run with local Redis
docker run -p 3000:3000 --network host \
  -e REDIS_URL=redis://localhost:6379 \
  edh-challenge-api

# Run with Upstash
docker run -p 3000:3000 \
  -e UPSTASH_REDIS_REST_URL="https://..." \
  -e UPSTASH_REDIS_REST_TOKEN="..." \
  edh-challenge-api

# Run with in-memory cache (no Redis needed)
docker run -p 3000:3000 edh-challenge-api
```

---

## Deployment (Free Tier Options)

### Option A: Render (Recommended)

| Setting | Value |
|---------|-------|
| Root Directory | `backend` |
| Build Command | `npm install && npm run build` |
| Start Command | `node dist/index.js` |
| Dockerfile (alt) | `backend/Dockerfile` |
| Free Tier | 750 hrs/mo, spins down after 15min inactivity |

Pair with [Upstash](https://upstash.com) free tier (10k commands/day) for caching.

### Option B: Railway

1. Connect GitHub repo on [railway.app](https://railway.app)
2. Set root to `backend`
3. Add Upstash Redis credentials as env vars
4. Deploy — auto-detects Dockerfile

Free: $5 credit/month.

### Option C: Fly.io

```bash
cd backend
fly launch
fly deploy
fly secrets set UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...
```

Free: 3 shared VMs (256MB each).

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| No auth or database | Users just type a username — zero friction |
| Hono JSX for SSR | No client-side JS bundle, fast page loads, single deploy unit |
| Puppeteer for Moxfield | Moxfield API is behind Cloudflare WAF, no official API key available |
| Lazy browser init | Don't block startup; health checks stay fast on hosting platforms |
| Shared browser instance | One Chromium process for all requests; auto-reconnects if stale |
| Multi-cache driver | Works anywhere: free hosting (Upstash), local dev (Docker Redis), or zero-config (memory) |
| Cache individual decks | Deck detail page hits cache directly; no full re-scrape needed |
| CSS-only animations | Multi-deck slot carousel uses keyframes, no JavaScript |
| Domain logic is pure | `domain/` modules have no I/O — easily testable, reusable from CLI |

---

## Behavioral Notes

- **First request is slow (~10-30s)** — Puppeteer launches Chromium and solves the Cloudflare challenge. All subsequent requests reuse the browser session and respond in <1s.
- **Cached responses are instant** — the `cached: true` field in API responses indicates a cache hit.
- **Stale browser reconnects automatically** — if the Puppeteer browser disconnects (timeout, crash), it re-initializes on the next request.
- **In-memory cache resets on restart** — only an issue in development; production should use Redis.
- **Set `PUPPETEER_HEADLESS=false`** to see the browser window for debugging Cloudflare issues.
- **CORS is fully open** — the API is public with no auth, so any frontend origin can call it.

---

## External Services

| Service | What it's used for | Free tier |
|---------|-------------------|-----------|
| [Moxfield](https://moxfield.com) | Source of deck data (scraped via API) | N/A (public data) |
| [Scryfall](https://scryfall.com) | Card images + mana symbol SVGs | Free (public API) |
| [Upstash](https://upstash.com) | Redis caching in production | 10k commands/day |
| [Google Fonts](https://fonts.google.com) | Inter font family | Free |

---

## License

ISC
