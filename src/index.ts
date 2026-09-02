/**
 * EDH 32 Deck Challenge API + SSR Pages
 *
 * Hono-based server that serves both:
 * - JSON API endpoints under /api/*
 * - Server-side rendered HTML pages at /
 *
 * Uses Puppeteer for Moxfield scraping and Redis for caching.
 *
 * Architecture:
 *   Browser → Hono → Cache (Redis) → Moxfield (via Puppeteer)
 *
 * The browser is lazily initialized on first request to avoid
 * blocking startup (important for health checks on Render).
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createCacheService } from './services/cache.js';
import { createBrowserService } from './services/browser.js';
import { createMoxfieldService } from './services/moxfield.js';
import { createSpellbookService } from './services/spellbook.js';
import { createChallengeService } from './services/challenge.js';
import { createCedhService } from './services/cedh.js';
import { createFxService } from './services/fx.js';
import { createScryfallService } from './services/scryfall.js';
import { createEdhrecService } from './services/edhrec.js';
import { createBuildCommanderService } from './services/build-commander.js';
import { createChallengeRoutes } from './routes/challenge.js';
import { createHealthRoutes } from './routes/health.js';
import { createPageRoutes } from './routes/pages.js';

const config = loadConfig();

// ─── Initialize services ────────────────────────────────────────────────────

const cache = createCacheService(config);
const browser = createBrowserService(config);
const moxfield = createMoxfieldService(config, browser);
const spellbook = createSpellbookService();
const challengeService = createChallengeService(config, cache, moxfield, spellbook);
const fxService = createFxService(cache);
const cedhService = createCedhService(config, cache, moxfield, fxService);
const scryfallService = createScryfallService(config, cache);
const edhrecService = createEdhrecService(config, cache, browser);
const buildCommanderService = createBuildCommanderService(
  config,
  cache,
  moxfield,
  edhrecService,
  fxService,
  scryfallService,
);

// ─── Create Hono app ────────────────────────────────────────────────────────

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*', // Allow all origins (no auth, public API)
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// Mount routes — API first, then static assets, then SSR pages
app.route('/api', createChallengeRoutes(challengeService));
app.route('/api', createHealthRoutes(cache, moxfield));

// Serve favicon
const __dirname = join(fileURLToPath(import.meta.url), '..');
const faviconSvg = readFileSync(join(__dirname, 'public', 'favicon.svg'), 'utf-8');

app.get('/favicon.svg', (c) => {
  return c.body(faviconSvg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=86400',
  });
});

app.get('/favicon.ico', (c) => {
  // Redirect .ico requests to the SVG
  return c.redirect('/favicon.svg', 301);
});

app.route(
  '/',
  createPageRoutes(challengeService, cedhService, scryfallService, buildCommanderService),
);

// 404 fallback
app.notFound((c) => {
  // Return JSON for /api/* requests, HTML for everything else
  if (c.req.path.startsWith('/api')) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }
  return c.html(
    '<html><body style="background:#1a1a2e;color:#e0e0e0;font-family:sans-serif;text-align:center;padding:4rem;"><h1 style="color:#ff6060;">Page Not Found</h1><p><a href="/" style="color:#f0c040;">← Back to home</a></p></body></html>',
    404
  );
});

// ─── Start server ───────────────────────────────────────────────────────────

const cacheDriverLabel = {
  upstash: 'Upstash Redis (HTTP)',
  redis: `Redis (TCP) → ${config.redisConnectionUrl}`,
  memory: 'In-memory',
} as const;

console.log(`
🃏 Necro Nerds API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Port:        ${config.port}
  Environment: ${config.nodeEnv}
  Cache:       ${cacheDriverLabel[config.cacheDriver]}
  Cache TTL:   ${config.cacheTtlSeconds}s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

serve({
  fetch: app.fetch,
  port: config.port,
});

// ─── Graceful shutdown ──────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log('\n🛑 Shutting down...');
  await browser.shutdown();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
