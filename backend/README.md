# 🃏 EDH 32 Deck Challenge — Backend

A full-stack Hono application that serves both a server-side rendered web UI and a JSON REST API for the EDH 32 Deck Challenge. Enter a Moxfield username and see which of the 32 color identity slots have been filled with Commander decks — plus discover infinite combos in each deck powered by Commander Spellbook.

No auth. No database. No sign-up. Just enter a username and go.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Web Framework** | [Hono](https://hono.dev) v4.7 | HTTP routing, middleware, JSX SSR |
| **Runtime** | Node.js 22+ | ES modules, native fetch |
| **Rendering** | Hono JSX | Server-side rendered HTML (no React, no client JS) |
| **Browser Automation** | [Puppeteer](https://pptr.dev) v25 | Headless Chrome for Cloudflare bypass |
| **Combo Detection** | [Commander Spellbook API](https://commanderspellbook.com) | Find EDH combos in decks |
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
┌──────────────────────────────────────────────────────────────────────────┐
│                            Browser (User)                                 │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                       HTTP Request (GET /challenge/:username)
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           Hono Server (:3000)                             │
│                                                                          │
│  ┌───────────────┐  ┌────────────────────┐  ┌────────────────────────┐  │
│  │  Middleware    │  │   Page Routes      │  │    API Routes          │  │
│  │  • Logger      │  │   • GET /          │  │    • GET /api/...      │  │
│  │  • CORS        │  │   • GET /challenge │  │    • POST /api/...     │  │
│  │               │  │   • GET /deck      │  │                        │  │
│  └───────────────┘  └─────────┬──────────┘  └───────────┬────────────┘  │
│                               │                         │                │
│                               ▼                         ▼                │
│                    ┌──────────────────────────────────────────┐          │
│                    │          Challenge Service               │          │
│                    │    (orchestration + business logic)      │          │
│                    └──────────────────┬───────────────────────┘          │
│                                       │                                  │
│              ┌────────────────────────┼─────────────────────┐            │
│              ▼                        ▼                     ▼            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Cache Service    │  │ Spellbook Service│  │  Moxfield Service    │  │
│  │                  │  │                  │  │                      │  │
│  │  • Upstash (HTTP)│  │  • REST API      │  │  • Puppeteer browser │  │
│  │  • ioredis (TCP) │  │  • find-my-combos│  │  • Cloudflare bypass │  │
│  │  • In-memory     │  │                  │  │  • API fetching      │  │
│  └──────────────────┘  └────────┬─────────┘  └───────────┬──────────┘  │
│                                 │                         │              │
└─────────────────────────────────┼─────────────────────────┼──────────────┘
                                  │                         │
                                  ▼                         │
                   ┌────────────────────────────┐    Headless Chrome
                   │  Commander Spellbook API    │    (Puppeteer)
                   │  (Public REST — no auth)    │           │
                   └────────────────────────────┘           │
                                                            ▼
                                             ┌────────────────────────────┐
                                             │     Moxfield API (v2)      │
                                             │  (behind Cloudflare WAF)   │
                                             └────────────────────────────┘
```

### Entity Relationship & Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       ENTITY & DATA FLOW DIAGRAM                        │
│                                                                         │
│  Shows how entities flow between external APIs → services → views       │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────────────┐
                    │       MOXFIELD API (v2)        │
                    │  api2.moxfield.com             │
                    ├───────────────────────────────┤
                    │                               │
                    │  GET /v1/users/:username       │
                    │    → Validates user exists     │
                    │                               │
                    │  GET /v2/decks/search          │
                    │    → MoxfieldDeckSummary[]     │
                    │    {publicId, name, format}    │
                    │                               │
                    │  GET /v2/decks/all/:id         │
                    │    → MoxfieldDeckDetail        │
                    │    {commanders, mainboard}     │
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                                    │ Puppeteer (headless Chrome)
                                    │ page.evaluate(fetch(...))
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  MOXFIELD SERVICE                                                       │
│  services/moxfield.ts                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  fetchUserDecks(username)  → MoxfieldDeckSummary[]                      │
│    • Paginated (100/page), filtered to fmt=commander                    │
│                                                                         │
│  fetchDeckDetail(publicId) → MoxfieldDeckDetail                         │
│    • Full deck: commanders + mainboard (Record<string, CardEntry>)      │
│    • Each CardEntry: { quantity, card: MoxfieldCard }                   │
│    • MoxfieldCard: { name, color_identity[], type_line, mana_cost }     │
│                                                                         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     │ MoxfieldDeckDetail[]
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CHALLENGE SERVICE                                                      │
│  services/challenge.ts — ORCHESTRATION LAYER                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  fetchAndProcessChallenge(username)                               │  │
│  │                                                                   │  │
│  │  1. Fetch all decks → MoxfieldDeckDetail[]                        │  │
│  │  2. Extract commanders for each deck                              │  │
│  │  3. Organize into 32 color slots                                  │  │
│  │  4. Fetch combo counts (parallel) via Spellbook Service           │  │
│  │  5. Attach comboCount to each DeckSlotEntry                       │  │
│  │  6. Build summary stats → ChallengeResponse                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  getDeckDetail(deckId)                                            │  │
│  │                                                                   │  │
│  │  1. Fetch deck detail (cache or Moxfield)                         │  │
│  │  2. Build card groups by type                                     │  │
│  │  3. Fetch combos via Spellbook Service                            │  │
│  │  4. Attach DeckCombosData → DeckDetailResponse                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└───────────────┬─────────────────────────────────────┬───────────────────┘
                │                                     │
                │ Card names from deck                │ ChallengeResponse /
                ▼                                     │ DeckDetailResponse
┌─────────────────────────────────────┐               │
│  COMMANDER SPELLBOOK API            │               │
│  backend.commanderspellbook.com     │               │
├─────────────────────────────────────┤               │
│                                     │               │
│  POST /find-my-combos               │               │
│                                     │               │
│  Request Body:                      │               │
│  {                                  │               │
│    "commanders": [                  │               │
│      {"card": "Thrasios..."},       │               │
│      {"card": "Tymna..."}           │               │
│    ],                               │               │
│    "main": [                        │               │
│      {"card": "Sol Ring"},          │               │
│      {"card": "Hullbreaker..."},    │               │
│      ...all mainboard cards         │               │
│    ]                                │               │
│  }                                  │               │
│                                     │               │
│  Response:                          │               │
│  {                                  │               │
│    "results": {                     │               │
│      "identity": "BGU",             │               │
│      "included": [                  │               │
│        {                            │               │
│          "id": "513-5034--46",      │               │
│          "uses": [...cards],        │               │
│          "produces": [              │               │
│            {"feature": {            │               │
│              "name": "Infinite      │               │
│               colorless mana"       │               │
│            }}                        │               │
│          ],                         │               │
│          "description": "...",      │               │
│          "bracketTag": "E"          │               │
│        }                            │               │
│      ],                             │               │
│      "almostIncluded": [...]        │               │
│    }                                │               │
│  }                                  │               │
│                                     │               │
└───────────────┬─────────────────────┘               │
                │                                     │
                │ SpellbookCombo[]                     │
                ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SPELLBOOK SERVICE                                                      │
│  services/spellbook.ts                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  findCombosForDeck(deck: MoxfieldDeckDetail) → DeckCombosData           │
│                                                                         │
│  1. Extract commander names from deck.commanders                        │
│  2. Extract mainboard card names from deck.mainboard                    │
│  3. POST to /find-my-combos with all card names                         │
│  4. Transform raw API variants → SpellbookCombo[]                       │
│  5. Return { comboCount, combos[] }                                     │
│                                                                         │
│  SpellbookCombo shape:                                                  │
│  {                                                                      │
│    id, cards[], produces[], requires[],                                  │
│    description, identity, popularity,                                   │
│    prices, cardCount, bracketTag,                                       │
│    easyPrerequisites, spellbookUrl                                      │
│  }                                                                      │
│                                                                         │
│  Error handling: returns { comboCount: 0, combos: [] } on failure       │
│  (non-blocking — Spellbook is a nice-to-have, not critical path)        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

                                     │
                                     │ DeckDetailResponse (with combos)
                                     │ ChallengeResponse (with comboCount)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SSR VIEWS (Hono JSX)                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ChallengePage (views/challenge.tsx)                                     │
│  ├── Progress bar (percentage)                                          │
│  ├── Category sections (colorless → 5-color)                            │
│  │   └── SlotCard for each of 32 slots                                  │
│  │       ├── Commander art (Scryfall art_crop)                          │
│  │       ├── Multi-deck badge (if >1 deck)                              │
│  │       ├── ♾️ Combo count badge (if comboCount > 0)  ← NEW            │
│  │       └── Deck info carousel (CSS animation)                         │
│  └── Skipped decks list                                                 │
│                                                                         │
│  DeckDetailPage (views/deck-detail.tsx)                                  │
│  ├── Commander card images                                              │
│  ├── Color identity + metadata                                          │
│  ├── ♾️ Combos Section (if combos found)              ← NEW             │
│  │   └── ComboCard for each combo                                       │
│  │       ├── Card names (highlighted)                                   │
│  │       ├── Produces badges ("Infinite mana", etc.)                    │
│  │       ├── Bracket tag                                                │
│  │       ├── Step-by-step description                                   │
│  │       ├── Card thumbnail images                                      │
│  │       └── Link to Commander Spellbook                                │
│  └── Decklist (cards grouped by type)                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
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
│  8. spellbook.findCombosForDeck(deck) for each deck      │
│     → POST card names to Commander Spellbook API         │
│     → Returns: { comboCount, combos[] }                  │
│     → Runs in parallel for all decks (Promise.all)       │
│     → Cache each result: edh:combos:{deckId}             │
│     → Attach comboCount to each DeckSlotEntry            │
│                                                          │
│  9. Build ChallengeResponse with summary stats           │
│     → percentComplete, categoryCounts, filledCount       │
│                                                          │
│ 10. Cache result: SET edh:challenge:mainframe (TTL 900s) │
│                                                          │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌─ SSR Renderer ───────────────────────────────────────────┐
│                                                          │
│ 11. Render ChallengePage JSX component                   │
│     → Progress bar with percentage                       │
│     → 32-slot grid grouped by category                   │
│     → Commander art from Scryfall (art_crop)             │
│     → Combo count badge on slots with combos             │
│     → Multi-deck carousel (CSS keyframe animation)       │
│                                                          │
│ 12. Return HTML response                                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Request Flow — Deck Detail (with Combos)

```
User visits /deck/abc123
         │
         ▼
┌─ Page Route Handler ─────────────────────────────────────┐
│                                                          │
│  1. Validate deckId                                      │
│  2. Call challengeService.getDeckDetail("abc123")        │
│                                                          │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌─ Challenge Service ──────────────────────────────────────┐
│                                                          │
│  3. Check cache: GET edh:deck:abc123                     │
│     ├─ HIT → use cached MoxfieldDeckDetail               │
│     └─ MISS → fetch from Moxfield, cache it             │
│                                                          │
│  4. buildDeckDetailResponse(deck)                        │
│     → Extract commanders + color identity                │
│     → Group mainboard cards by type                      │
│     → Sort by CMC then name                             │
│                                                          │
│  5. Check combo cache: GET edh:combos:abc123             │
│     ├─ HIT → attach cached DeckCombosData                │
│     └─ MISS → call spellbook.findCombosForDeck(deck)    │
│              → POST card names to Spellbook API          │
│              → Cache result: SET edh:combos:abc123       │
│              → Attach combos to response                 │
│                                                          │
│  6. Return DeckDetailResponse (with combos)              │
│                                                          │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌─ SSR Renderer ───────────────────────────────────────────┐
│                                                          │
│  7. Render DeckDetailPage JSX component                  │
│     → Commander card images                              │
│     → Combos section (combo cards with details)          │
│     → Decklist grouped by card type                      │
│                                                          │
│  8. Return HTML response                                 │
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
┌─────────────────────────────────────────────────────────┐
│                     Cache Layer                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Key Pattern:                                           │
│    edh:challenge:{username}  → ChallengeResponse        │
│    edh:deck:{publicId}       → MoxfieldDeckDetail       │
│    edh:combos:{publicId}     → DeckCombosData           │
│                                                         │
│  TTL: 900 seconds (15 minutes) by default               │
│                                                         │
│  Driver Selection (priority):                           │
│    1. Explicit CACHE_DRIVER env var                      │
│    2. Auto-detect from credentials:                     │
│       • UPSTASH_REDIS_REST_URL set → upstash            │
│       • REDIS_URL set → ioredis                         │
│       • Neither → in-memory                             │
│                                                         │
│  Behavior:                                              │
│    • GET /challenge/:user → checks challenge cache      │
│    • On MISS → fetches all decks, caches each           │
│    • On MISS → fetches combos for each deck             │
│    • POST /refresh/:user → deletes + re-fetches         │
│    • Individual deck details cached separately          │
│    • Individual combo data cached separately            │
│    • Combo cache checked before Spellbook API call      │
│                                                         │
└─────────────────────────────────────────────────────────┘
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

### Commander Spellbook Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│              COMBO DETECTION ALGORITHM                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Input: MoxfieldDeckDetail                                              │
│    ├── deck.commanders: Record<string, { card: { name } }>             │
│    └── deck.mainboard:  Record<string, { card: { name } }>             │
│                                                                         │
│  Step 1: Extract card names                                             │
│    commanderNames = Object.values(deck.commanders).map(e → e.card.name)│
│    mainboardNames = Object.values(deck.mainboard).map(e → e.card.name) │
│                                                                         │
│  Step 2: POST to Commander Spellbook API                                │
│    URL: https://backend.commanderspellbook.com/find-my-combos           │
│    Body: {                                                              │
│      commanders: [{card: "Name1"}, {card: "Name2"}],                    │
│      main: [{card: "Sol Ring"}, {card: "Mana Vault"}, ...]             │
│    }                                                                    │
│                                                                         │
│  Step 3: Receive categorized results                                    │
│    response.results = {                                                 │
│      identity: "BGU",              // deck's color identity             │
│      included: [...]               // combos fully present in deck      │
│      almostIncluded: [...]         // combos missing 1 card             │
│      includedByChangingCommanders  // would work with diff commander    │
│    }                                                                    │
│                                                                         │
│  Step 4: Transform "included" variants into SpellbookCombo[]            │
│    For each variant:                                                    │
│      • Extract card names + images from uses[]                          │
│      • Extract result names from produces[].feature                     │
│      • Extract template requirements from requires[].template           │
│      • Build spellbookUrl from variant ID                               │
│                                                                         │
│  Step 5: Return DeckCombosData                                          │
│    { comboCount: included.length, combos: SpellbookCombo[] }            │
│                                                                         │
│  Error Handling:                                                        │
│    • API timeout/error → return { comboCount: 0, combos: [] }           │
│    • Never throws — combo detection is non-critical                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Caching:
  • Combo results cached at: edh:combos:{deckId}
  • Same TTL as deck data (15 min default)
  • Challenge page: combo counts fetched in parallel (Promise.all)
  • Deck detail page: checks combo cache before calling API

Display:
  • Challenge page: purple "♾️ N combos" badge on slot cards
  • Deck detail page: full combo cards between commanders and decklist
    └── Each combo shows: card names, result badges, bracket tag,
        step-by-step description, card thumbnails, Spellbook link
```

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts                    # Server entry point, route mounting
│   ├── config.ts                   # Environment variable loading + cache driver detection
│   ├── types.ts                    # All TypeScript interfaces (Moxfield, Spellbook, domain, responses)
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
│   │   ├── moxfield.ts             # Puppeteer-based Moxfield scraper
│   │   └── spellbook.ts            # Commander Spellbook combo detection API client
│   │
│   ├── routes/                     # HTTP route handlers
│   │   ├── challenge.ts            # JSON API endpoints (/api/*)
│   │   ├── health.ts               # Health check endpoint
│   │   └── pages.tsx               # SSR page routes (/, /challenge, /deck)
│   │
│   ├── views/                      # Hono JSX components (server-rendered)
│   │   ├── layout.tsx              # Base HTML shell + all CSS
│   │   ├── home.tsx                # Landing page with search form
│   │   ├── challenge.tsx           # 32-slot progress grid (with combo badges)
│   │   ├── deck-detail.tsx         # Single deck with card list + combos section
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
            "comboCount": 2,
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

### Example Deck Detail Response (with Combos)

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "Omnislash Voltron",
    "commanders": [{ "name": "Cloud, Midgar Mercenary", "imageUrl": "...", "setCode": "pip", "collectorNumber": "1" }],
    "colorIdentityKey": "W",
    "colorSlotName": "Mono White",
    "moxfieldUrl": "https://moxfield.com/decks/abc123",
    "cardCount": 99,
    "cardsByType": [{ "type": "Creature", "count": 28, "cards": ["..."] }],
    "combos": {
      "comboCount": 2,
      "combos": [
        {
          "id": "513-5034--46",
          "cards": [
            { "id": 513, "name": "Hullbreaker Horror", "typeLine": "Creature — Kraken Horror", "imageUriFrontSmall": "https://..." },
            { "id": 5034, "name": "Sol Ring", "typeLine": "Artifact", "imageUriFrontSmall": "https://..." }
          ],
          "produces": [
            { "id": 11, "name": "Infinite colorless mana" },
            { "id": 17, "name": "Infinite storm count" }
          ],
          "requires": [{ "id": 46, "name": "Permanent Castable for {C}" }],
          "description": "Activate Sol Ring by tapping it...",
          "identity": "U",
          "popularity": 342114,
          "prices": { "tcgplayer": "6.69", "cardmarket": "4.43", "cardkingdom": "11.78" },
          "cardCount": 3,
          "bracketTag": "E",
          "easyPrerequisites": "",
          "spellbookUrl": "https://commanderspellbook.com/combo/513-5034--46/"
        }
      ]
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
| Commander Spellbook for combos | Free public REST API, no auth required, comprehensive combo database |
| Non-blocking combo detection | Spellbook failures gracefully degrade (empty combos) — never breaks page |
| Parallel combo fetching | All deck combo lookups run via Promise.all during challenge load |
| Separate combo cache key | Combo data cached independently (`edh:combos:{id}`) so deck detail pages can reuse without re-fetching |
| Lazy browser init | Don't block startup; health checks stay fast on hosting platforms |
| Shared browser instance | One Chromium process for all requests; auto-reconnects if stale |
| Multi-cache driver | Works anywhere: free hosting (Upstash), local dev (Docker Redis), or zero-config (memory) |
| Cache individual decks | Deck detail page hits cache directly; no full re-scrape needed |
| CSS-only animations | Multi-deck slot carousel uses keyframes, no JavaScript |
| Domain logic is pure | `domain/` modules have no I/O — easily testable, reusable from CLI |

---

## Behavioral Notes

- **First request is slow (~10-30s)** — Puppeteer launches Chromium and solves the Cloudflare challenge. All subsequent requests reuse the browser session and respond in <1s.
- **Combo detection adds ~1-3s** — The Commander Spellbook API call runs in parallel with other processing. Results are cached so subsequent visits are instant.
- **If Commander Spellbook is down**, combo badges simply don't appear — the page still loads normally with all other data.
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
| [Commander Spellbook](https://commanderspellbook.com) | Combo detection for decks (REST API) | Free (public API, no auth) |
| [Scryfall](https://scryfall.com) | Card images + mana symbol SVGs | Free (public API) |
| [Upstash](https://upstash.com) | Redis caching in production | 10k commands/day |
| [Google Fonts](https://fonts.google.com) | Inter font family | Free |

---

## License

ISC
