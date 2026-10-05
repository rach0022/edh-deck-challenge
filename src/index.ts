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
import { networkInterfaces } from 'node:os';
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
import { createDeckAnalysisService } from './services/deck-analysis.js';
import { createCommanderFinderService } from './services/commander-finder.js';
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
const deckAnalysisService = createDeckAnalysisService(
  config,
  cache,
  moxfield,
  edhrecService,
);
const commanderFinderService = createCommanderFinderService(
  config,
  cache,
  moxfield,
  scryfallService,
  edhrecService,
  spellbook,
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
  createPageRoutes(challengeService, cedhService, scryfallService, buildCommanderService, deckAnalysisService, commanderFinderService),
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

// Bind to all interfaces so the server is reachable from outside the container
// (Docker port forwarding, WSL → Windows host). Binding to localhost/127.0.0.1
// would make the port unreachable from the host even when published.
const hostname = '0.0.0.0';

/**
 * Collects this machine's non-internal IPv4 addresses — the LAN/"home network"
 * IPs other devices (phones, tablets, another laptop) can use to reach the
 * server. Skips loopback and internal interfaces; returns an empty list when
 * no external interface is found (e.g. inside a container with only the
 * loopback and a bridged interface that doesn't expose a routable IP).
 */
function getLanAddresses(): string[] {
  const addresses: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    if (!iface) continue;
    for (const net of iface) {
      // Node ≥18 reports family as the string 'IPv4'; older/typed as 4.
      const isIpv4 = net.family === 'IPv4' || (net.family as unknown as number) === 4;
      if (isIpv4 && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

console.log(`
🃏 The Command Crypt API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Port:        ${config.port}
  Host:        ${hostname}
  Environment: ${config.nodeEnv}
  Cache:       ${cacheDriverLabel[config.cacheDriver]}
  Cache TTL:   ${config.cacheTtlSeconds}s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname,
  },
  (info) => {
    // `info.address` is the bound interface (0.0.0.0 in the container).
    // Print the URLs you actually use to reach the app from the host.
    console.log('✅ Server listening. Open one of these URLs:');
    console.log(`   • http://localhost:${info.port}  (this machine)`);
    console.log(`   • http://127.0.0.1:${info.port}  (this machine)`);

    // LAN URL — share this to reach the app from other devices on the same
    // home/office network (phone, tablet, another computer).
    //
    // Prefer the host-provided LAN_HOST (via config.lanHost) with the
    // host-facing published port (config.publicPort). A container can only see
    // Docker's internal bridge network, so the real host LAN IP must be passed
    // in from the host — see docker-compose.yml / the LAN_HOST one-liner in the
    // README. When LAN_HOST isn't set (e.g. running natively), fall back to
    // auto-detecting this machine's own interfaces.
    if (config.lanHost) {
      console.log('   On your network (open from other devices):');
      console.log(`   • http://${config.lanHost}:${config.publicPort}`);
    } else {
      const lanAddresses = getLanAddresses();
      if (lanAddresses.length > 0) {
        console.log('   On your network (open from other devices):');
        for (const address of lanAddresses) {
          console.log(`   • http://${address}:${config.publicPort}`);
        }
      } else {
        console.log(
          '   (no LAN address detected — set LAN_HOST to your host\'s IP to show a shareable URL)',
        );
      }
    }

    console.log(
      `   (container bound to ${info.address}:${info.port} — reachable via published Docker port)`,
    );
    console.log(
      '   In Docker: make sure the port is published, e.g. "docker run -p 3000:3000 ..." or the ports: mapping in docker-compose.yml.',
    );
  },
);

// ─── Graceful shutdown ──────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log('\n🛑 Shutting down...');
  await browser.shutdown();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
