# 🃏 EDH 32 Deck Challenge API

A lightweight Hono REST API that serves EDH 32 Deck Challenge progress data. No auth, no database — just enter a Moxfield username and get results.

## Architecture

```
[Browser/Frontend]
      │
      ▼  GET /api/challenge/:username
[Hono API Server]
      │
      ├─ Cache HIT → return cached JSON (Upstash Redis, 15min TTL)
      │
      └─ Cache MISS → Puppeteer scrape → process → cache → return
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API info and endpoint list |
| GET | `/api/health` | Health check (cache + browser status) |
| GET | `/api/challenge/:username` | Full 32-slot challenge progress |
| GET | `/api/decks/:username` | List all commander decks for user |
| GET | `/api/deck/:deckId` | Single deck detail |
| POST | `/api/refresh/:username` | Force cache refresh |

### Example Response: `/api/challenge/mainframe`

```json
{
  "success": true,
  "data": {
    "username": "mainframe",
    "progress": { "slots": [...], "filledCount": 17, "totalSlots": 32 },
    "summary": {
      "filledCount": 17,
      "totalSlots": 32,
      "percentComplete": 53,
      "categoryCounts": {
        "colorless": { "filled": 0, "total": 1 },
        "mono": { "filled": 5, "total": 5 },
        "two-color": { "filled": 6, "total": 10 },
        ...
      }
    }
  },
  "cached": true,
  "fetchedAt": "2026-08-20T12:00:00.000Z"
}
```

## Local Development

### Prerequisites

- Node.js 22+ (check with `node --version`)
- npm 7+ (check with `npm --version`)
- Chrome/Chromium — Puppeteer downloads its own on `npm install`, or you can use a system install

### Setup

```bash
cd backend

# 1. Install dependencies (includes Puppeteer + Chromium download)
npm install

# 2. Copy environment config
cp .env.example .env

# 3. (Optional) Add Upstash Redis credentials to .env
#    Without them, the server uses in-memory cache — totally fine for local dev
```

### Running Locally

```bash
# Development mode with hot reload (uses tsx)
npm run dev

# Or build + run production mode
npm run build
npm start
```

The server starts at `http://localhost:3000`.

### Testing the API

Once the server is running, test it with curl:

```bash
# Check the server is up
curl http://localhost:3000/

# Health check (shows cache + browser status)
curl http://localhost:3000/api/health

# Fetch challenge progress for a Moxfield user
# (first request takes 10-30s while Puppeteer solves Cloudflare)
curl http://localhost:3000/api/challenge/mainframe

# List all decks for a user
curl http://localhost:3000/api/decks/mainframe

# Get detail for a specific deck (use a publicId from the decks response)
curl http://localhost:3000/api/deck/<deck-public-id>

# Force refresh cached data
curl -X POST http://localhost:3000/api/refresh/mainframe
```

### Build & Typecheck

```bash
# Type-check without emitting files
npm run typecheck

# Full build (compiles to dist/)
npm run build
```

### Local Redis (Docker)

The easiest way to get a real cache running locally:

```bash
# Start a Redis container
docker run -d --name redis-local -p 6379:6379 redis:alpine

# Set in your .env
CACHE_DRIVER=redis
REDIS_URL=redis://localhost:6379
```

Or just set `REDIS_URL` — the driver auto-detects when that env var is present.

To stop/restart Redis:
```bash
docker stop redis-local
docker start redis-local
```

### Docker (API Container)

```bash
# Build the Docker image
docker build -t edh-challenge-api .

# Run with local Redis (host network so container can reach localhost Redis)
docker run -p 3000:3000 \
  --network host \
  -e CACHE_DRIVER=redis \
  -e REDIS_URL=redis://localhost:6379 \
  edh-challenge-api

# Or with Upstash
docker run -p 3000:3000 \
  -e UPSTASH_REDIS_REST_URL="your-url" \
  -e UPSTASH_REDIS_REST_TOKEN="your-token" \
  edh-challenge-api

# Or without any Redis (uses in-memory cache)
docker run -p 3000:3000 edh-challenge-api
```

### Notes

- **First request is slow** (~10-30s) — Puppeteer launches Chrome and solves the Cloudflare challenge. Subsequent requests use the existing browser session and are fast.
- **Cached responses** return instantly. The `cached: true` field in the response tells you if it came from cache.
- **Without Redis**, the in-memory cache resets when the server restarts. Fine for development.
- **Set `PUPPETEER_HEADLESS=false`** in `.env` to see the browser window (useful for debugging Cloudflare issues).

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `tsx watch src/index.ts` | Dev server with hot reload |
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm start` | `node dist/index.js` | Run compiled production build |
| `npm run typecheck` | `tsc --noEmit` | Type-check without emitting |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment name |
| `CACHE_DRIVER` | No | auto-detect | Cache backend: `upstash`, `redis`, or `memory` |
| `REDIS_URL` | No | redis://localhost:6379 | Standard Redis URL (for ioredis TCP driver) |
| `UPSTASH_REDIS_REST_URL` | No | — | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | No | — | Upstash Redis REST token |
| `CACHE_TTL_SECONDS` | No | 900 | Cache TTL (seconds) |
| `MOXFIELD_BASE_URL` | No | https://api2.moxfield.com/v2 | Moxfield API base |
| `PUPPETEER_TIMEOUT_MS` | No | 60000 | Browser timeout (ms) |
| `PUPPETEER_HEADLESS` | No | true | Headless browser mode |

**Cache driver auto-detection** (when `CACHE_DRIVER` is not set):
1. If `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set → uses Upstash (HTTP)
2. If `REDIS_URL` is set → uses ioredis (TCP)
3. Otherwise → uses in-memory cache

## Deployment (Free Tier)

### Option A: Render (Recommended)

1. Push this repo to GitHub
2. Create a new **Web Service** on [render.com](https://render.com)
3. Set the **Root Directory** to `backend`
4. Set **Build Command**: `npm install && npm run build`
5. Set **Start Command**: `node dist/index.js`
6. Or use Docker: set **Dockerfile Path** to `backend/Dockerfile`
7. Add environment variables from `.env.example`

For Redis, create a free database on [Upstash](https://upstash.com) and add the credentials.

### Option B: Railway

1. Connect your GitHub repo on [railway.app](https://railway.app)
2. Set root to `backend`
3. Add a Redis plugin (built-in) or use Upstash
4. Deploy — Railway auto-detects the Dockerfile

### Option C: Fly.io

```bash
cd backend
fly launch   # Follow prompts
fly deploy
fly secrets set UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...
```

## Design Decisions

- **No auth/database**: Users just type a username. No accounts needed.
- **Upstash Redis**: HTTP-based, works with free-tier services that spin down. Falls back to in-memory if not configured.
- **Lazy browser init**: Puppeteer launches on first request, not on startup. Keeps health checks fast and avoids wasting resources when idle.
- **Shared browser instance**: One Chromium process handles all Moxfield requests. Re-initializes automatically if disconnected.
- **Generous CORS**: Public API, open to any frontend origin.

## Tech Stack

- **[Hono](https://hono.dev)** — Fast, lightweight web framework
- **[Puppeteer](https://pptr.dev)** — Headless Chrome for Cloudflare bypass
- **[@upstash/redis](https://upstash.com/docs/redis/overall/getstarted)** — Serverless Redis client (HTTP-based)
- **TypeScript** — Strict mode, ES modules
