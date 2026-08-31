# 🃏 EDH 32 Deck Challenge Checker

A CLI tool that connects to your [Moxfield](https://www.moxfield.com) account, scans your Commander/EDH decks, and maps them to all 32 possible color identity slots — showing your progress toward the EDH 32 Deck Challenge.

Produces both an ASCII terminal diagram and a self-contained HTML file with commander card art.

---

## Features

- Fetches all your public Commander decks from Moxfield (handles pagination)
- Bypasses Cloudflare bot protection using a headless browser (Puppeteer)
- Identifies commanders and resolves color identity (supports partner commanders)
- Maps decks to all 32 color combination slots (colorless through 5-color)
- Renders a formatted ASCII progress chart to the terminal
- Generates a standalone HTML file with commander card images and dark theme
- Handles errors gracefully (user not found, timeouts, API errors)

## Prerequisites

- **Node.js** 18 or later (uses native `fetch`; recommended: 22+)
- **npm** 7 or later
- **Chrome/Chromium** (automatically downloaded by Puppeteer on install)

## Installation

```bash
# Clone the repository
git clone https://github.com/rach0022/edh-deck-challenge.git
cd edh-deck-challenge

# Install dependencies (includes Puppeteer which downloads Chromium)
npm install

# Build the project
npm run build
```

## Running with Docker

The easiest way to run the full app (API + Redis) locally is with Docker Compose.
Everything runs in containers — no local Node or Redis setup required.

```bash
# Build and start in the background
docker compose up -d --build

# View logs
docker compose logs -f

# Stop and remove the containers
docker compose down
```

Once running, open http://localhost:3000.

### Choosing the port

The host port is configurable via the `APP_PORT` environment variable. The
container always listens on 3000 internally; `APP_PORT` only changes which port
on your machine maps to it. It defaults to `3000` when unset.

```bash
# Run on a custom port — app available at http://localhost:8080
APP_PORT=8080 docker compose up -d --build
```

Or set it persistently by copying `.env.example` to `.env` (Docker Compose loads
`.env` from this directory automatically) and editing the value:

```bash
cp .env.example .env
# then edit APP_PORT in .env
docker compose up -d --build
```

## Usage

```bash
# Run directly with node
node dist/index.js <your-moxfield-username>

# Or use npm start
npm start -- <your-moxfield-username>

# Or link globally and run anywhere
npm link
edh-deck-challenge <your-moxfield-username>
```

### Example

```bash
node dist/index.js mainframe
```

This will:
1. Launch a headless browser to get past Cloudflare protection
2. Fetch all public Commander decks for the given Moxfield user
3. Print an ASCII progress chart to your terminal
4. Write an HTML file (`<username>-edh-challenge.html`) to your current directory

### Example ASCII Output

```
═══════════════════════════════════════════════════
  EDH 32 Deck Challenge - mainframe
═══════════════════════════════════════════════════

── Colorless ─────────────────────────────────────
  Colorless : [empty]

── Mono Color ────────────────────────────────────
  Mono White : Cloud, Midgar Mercenary
  Mono Blue  : Thassa, Deep-Dwelling
  Mono Black : Liliana, Heretical Healer // L...
  Mono Red   : Clive, Ifrit's Dominant // Ifr...
  Mono Green : Tifa Lockhart

── Two Color ─────────────────────────────────────
  Azorius (WU)  : [empty]
  Orzhov (WB)   : Teysa Karlov
  ...

═══════════════════════════════════════════════════
  Progress: 17/32 slots filled
═══════════════════════════════════════════════════
```

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type-check without emitting
npx tsc --noEmit

# Build
npm run build
```

### Project Structure

```
src/
├── index.ts                    # CLI entry point & pipeline orchestrator
├── types.ts                    # Shared TypeScript interfaces
├── validator.ts                # Username input validation
├── api/
│   ├── moxfield-client.ts     # Direct fetch client (types + errors)
│   └── browser-client.ts      # Puppeteer-based client (Cloudflare bypass)
├── domain/
│   ├── color-combinations.ts   # 32 color slot definitions
│   ├── color-identity.ts       # Color identity resolution
│   ├── commander-extractor.ts  # Commander extraction from deck data
│   └── deck-organizer.ts       # Maps decks to color slots
└── renderers/
    ├── ascii-renderer.ts       # Terminal ASCII output
    └── html-renderer.ts        # Self-contained HTML generator

tests/
├── validator.test.ts
├── validator.property.test.ts
├── moxfield-client.test.ts
├── commander-extractor.test.ts
├── color-identity.property.test.ts
├── deck-organizer.property.test.ts
├── ascii-renderer.test.ts
├── ascii-renderer.property.test.ts
├── html-renderer.test.ts
└── integration.test.ts
```

### Testing Approach

The project uses a combination of:
- **Unit tests** (vitest) for each module
- **Property-based tests** (fast-check) to verify invariants like WUBRG sort order, slot mapping bijection, and name truncation bounds
- **Integration tests** that exercise the full pipeline with mocked API responses

## How It Works

1. **Cloudflare Bypass** — Launches a headless Chrome instance via Puppeteer, navigates to moxfield.com to solve the Cloudflare challenge and obtain valid session cookies
2. **Deck Fetching** — Uses the browser context to call Moxfield's search API (`/v2/decks/search?authorUserNames=...&fmt=commander`) which returns all commander decks for the user
3. **Detail Fetching** — Fetches full deck data (`/v2/decks/all/{id}`) for each deck to get commander card information
4. **Color Resolution** — Extracts commander(s) from each deck, computes the combined color identity (union for partners), and maps to one of 32 slots
5. **Rendering** — Produces both an ASCII diagram (stdout) and a standalone HTML file with card art

## Error Handling

| Condition | Message | Exit Code |
|---|---|---|
| No username argument | `Usage: edh-challenge <moxfield-username>` | 1 |
| Empty/whitespace username | `Error: Username is invalid...` | 1 |
| User not found (404) | `Error: Moxfield user "X" not found.` | 1 |
| API error (non-404) | `Error: Moxfield API returned an error (status)...` | 1 |
| Connection timeout | `Error: Could not reach Moxfield...` | 1 |
| No public decks | `No public decks found for user "X".` | 1 |
| Deck has no commander | Skipped (logged to stderr), continues | — |

## Tech Stack

- **TypeScript** 7.x — strict mode, ES modules
- **Puppeteer** — headless Chrome for Cloudflare bypass
- **Vitest** — test runner
- **fast-check** — property-based testing
- **Node.js native fetch** — HTTP client (used within browser context)

---

## 🤖 AI Disclaimer

This project was built entirely with [Kiro](https://kiro.dev), an AI-powered development environment by Amazon. The code, tests, specs, and this README were generated using **Claude Sonnet 4** (Anthropic) as the underlying model, orchestrated through Kiro's spec-driven workflow (requirements → design → tasks → implementation).

No code was manually written — this serves as a demonstration of AI-assisted software development with spec-first methodology and property-based testing.

## License

ISC
