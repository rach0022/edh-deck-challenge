import { describe, it, expect, vi } from 'vitest';
import {
  createEdhrecService,
  EdhrecNotFoundError,
  EdhrecTimeoutError,
  type EdhrecResult,
} from '../src/services/edhrec.js';
import { BrowserFetchError, type BrowserService } from '../src/services/browser.js';
import type { CacheService } from '../src/services/cache.js';
import type { AppConfig } from '../src/config.js';
import type { CommanderSelection } from '../src/types.js';
import { buildEdhrecSlug, commanderSlug } from '../src/domain/edhrec-slug.js';
import { selectionKey } from '../src/domain/selection-key.js';

// ─── Test doubles ────────────────────────────────────────────────────────────

const config = {
  edhrecBaseUrl: 'https://json.edhrec.com',
  edhrecTimeoutMs: 30000,
  cacheTtlSeconds: 900,
} as AppConfig;

type BrowserFetchResult = { status: number; body: unknown };

/**
 * Hand-written fake BrowserService (mirrors tests/moxfield.test.ts). Programmable
 * via a per-URL map and/or an ordered queue. A queued/mapped entry that is an
 * `Error` is thrown, letting us simulate the shared browser failing on a fetch.
 * No real Puppeteer is used.
 */
function createFakeBrowser(options: {
  queue?: Array<BrowserFetchResult | Error>;
  byUrl?: Record<string, BrowserFetchResult | Error>;
  ready?: boolean;
} = {}): BrowserService & { calls: string[]; browserFetch: ReturnType<typeof vi.fn> } {
  const queue = [...(options.queue ?? [])];
  const calls: string[] = [];

  const browserFetch = vi.fn(async (url: string): Promise<BrowserFetchResult> => {
    calls.push(url);
    const mapped = options.byUrl?.[url];
    const next = mapped ?? queue.shift();
    if (next === undefined) {
      throw new Error(`fake browser: no programmed response for ${url}`);
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });

  const initialize = vi.fn(async () => {});
  const shutdown = vi.fn(async () => {});
  const isReady = vi.fn(() => options.ready ?? true);

  return { browserFetch, initialize, shutdown, isReady, calls } as any;
}

/**
 * Hand-written fake CacheService backed by a plain Map. Records the TTL passed
 * to each `set` so tests can assert the configured TTL is used. Never expires
 * entries — expiry is not under test here.
 */
function createFakeCache(seed: Record<string, unknown> = {}): CacheService & {
  store: Map<string, unknown>;
  setCalls: Array<{ key: string; value: unknown; ttl?: number }>;
  deleteCalls: string[];
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  const store = new Map<string, unknown>(Object.entries(seed));
  const setCalls: Array<{ key: string; value: unknown; ttl?: number }> = [];
  const deleteCalls: string[] = [];

  const get = vi.fn(async (key: string) => {
    return store.has(key) ? (store.get(key) as unknown) : null;
  });
  const set = vi.fn(async (key: string, value: unknown, ttl?: number) => {
    setCalls.push({ key, value, ttl });
    store.set(key, value);
  });
  const del = vi.fn(async (key: string) => {
    deleteCalls.push(key);
    store.delete(key);
  });
  const isConnected = vi.fn(() => true);

  return { get, set, delete: del, isConnected, store, setCalls, deleteCalls } as any;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const commanderUrl = (slug: string) => `${config.edhrecBaseUrl}/pages/commanders/${slug}.json`;

/**
 * A small but realistic EDHREC commander payload: two panels under
 * `container.json_dict.cardlists`, each with a couple of cardviews carrying
 * the fields the parser reads (name, synergy, num_decks/potential_decks, id).
 */
function edhrecPayload(
  panels: Array<{ header: string; cardviews: Array<Record<string, unknown>> }>,
): unknown {
  return { container: { json_dict: { cardlists: panels } } };
}

const commanderPayload = edhrecPayload([
  {
    header: 'High Synergy Cards',
    cardviews: [
      { name: 'Sol Ring', id: 'sol-ring-id', synergy: 0.42, num_decks: 900, potential_decks: 1000 },
      { name: 'Arcane Signet', id: 'arcane-id', synergy: 0.31, num_decks: 800, potential_decks: 1000 },
    ],
  },
  {
    header: 'Top Cards',
    cardviews: [
      { name: 'Command Tower', id: 'command-id', synergy: 0.1, num_decks: 950, potential_decks: 1000 },
    ],
  },
]);

const ok = (body: unknown): BrowserFetchResult => ({ status: 200, body });

const soloSelection: CommanderSelection = {
  commander: 'Atraxa, Praetors Voice',
  partner: null,
  companion: null,
};

// ─── Cache hit ──────────────────────────────────────────────────────────────

describe('EdhrecService.getRecommendations — cache', () => {
  it('returns the cached result without touching the browser on a cache hit', async () => {
    const slug = buildEdhrecSlug(soloSelection);
    const cacheKey = `edh:edhrec:${selectionKey(soloSelection)}`;
    const cachedResult: EdhrecResult = {
      slug,
      rank: 135,
      numDecks: 14429,
      recommendations: [
        {
          name: 'Sol Ring',
          category: 'High Synergy Cards',
          inclusion: 0.9,
          synergy: 0.42,
          scryfallId: 'sol-ring-id',
          setCode: null,
          collectorNumber: null,
        },
      ],
    };
    const cache = createFakeCache({ [cacheKey]: cachedResult });
    const browser = createFakeBrowser();

    const service = createEdhrecService(config, cache, browser);
    const result = await service.getRecommendations(soloSelection);

    expect(result).toEqual(cachedResult);
    expect(cache.get).toHaveBeenCalledWith(cacheKey);
    expect(browser.browserFetch).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('on a cache miss fetches, parses, and caches the result with the configured TTL', async () => {
    const slug = buildEdhrecSlug(soloSelection);
    const cacheKey = `edh:edhrec:${selectionKey(soloSelection)}`;
    const cache = createFakeCache();
    const browser = createFakeBrowser({
      byUrl: { [commanderUrl(slug)]: ok(commanderPayload) },
    });

    const service = createEdhrecService(config, cache, browser);
    const result = await service.getRecommendations(soloSelection);

    // Fetched the commander JSON for the resolved slug.
    expect(browser.calls).toEqual([commanderUrl(slug)]);
    expect(result.slug).toBe(slug);

    // Parsed all three cardviews across both panels.
    expect(result.recommendations.map((r) => r.name)).toEqual([
      'Sol Ring',
      'Arcane Signet',
      'Command Tower',
    ]);
    expect(result.recommendations[0]).toMatchObject({
      name: 'Sol Ring',
      category: 'High Synergy Cards',
      synergy: 0.42,
      scryfallId: 'sol-ring-id',
    });

    // No card block in this fixture → rank/numDecks are null.
    expect(result.rank).toBeNull();
    expect(result.numDecks).toBeNull();

    // Cached under the selection key with the configured TTL.
    expect(cache.setCalls).toHaveLength(1);
    expect(cache.setCalls[0].key).toBe(cacheKey);
    expect(cache.setCalls[0].ttl).toBe(config.cacheTtlSeconds);
    expect(cache.setCalls[0].value).toEqual(result);
  });
});

// ─── Error mapping ────────────────────────────────────────────────────────────

describe('EdhrecService.getRecommendations — error mapping', () => {
  it('maps a 404 to EdhrecNotFoundError and does not cache', async () => {
    const slug = buildEdhrecSlug(soloSelection);
    const cache = createFakeCache();
    const browser = createFakeBrowser({
      byUrl: { [commanderUrl(slug)]: { status: 404, body: {} } },
    });

    const service = createEdhrecService(config, cache, browser);

    await expect(service.getRecommendations(soloSelection)).rejects.toBeInstanceOf(
      EdhrecNotFoundError,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('maps a non-2xx status to EdhrecTimeoutError', async () => {
    const slug = buildEdhrecSlug(soloSelection);
    const cache = createFakeCache();
    const browser = createFakeBrowser({
      byUrl: { [commanderUrl(slug)]: { status: 503, body: {} } },
    });

    const service = createEdhrecService(config, cache, browser);

    await expect(service.getRecommendations(soloSelection)).rejects.toBeInstanceOf(
      EdhrecTimeoutError,
    );
  });

  it('maps a BrowserFetchError to EdhrecTimeoutError', async () => {
    const slug = buildEdhrecSlug(soloSelection);
    const cache = createFakeCache();
    const browser = createFakeBrowser({
      byUrl: { [commanderUrl(slug)]: new BrowserFetchError() },
    });

    const service = createEdhrecService(config, cache, browser);

    await expect(service.getRecommendations(soloSelection)).rejects.toBeInstanceOf(
      EdhrecTimeoutError,
    );
  });

  it('maps an exceeded fetch timeout to EdhrecTimeoutError', async () => {
    const slug = buildEdhrecSlug(soloSelection);
    const cache = createFakeCache();
    // A browser that never resolves; the service's own timeout must fire.
    const browser = {
      browserFetch: vi.fn(() => new Promise<never>(() => {})),
      initialize: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
      isReady: vi.fn(() => true),
    } as unknown as BrowserService;

    const service = createEdhrecService(
      { ...config, edhrecTimeoutMs: 1 },
      cache,
      browser,
    );

    await expect(service.getRecommendations(soloSelection)).rejects.toBeInstanceOf(
      EdhrecTimeoutError,
    );
  });
});

// ─── Companion constraint ─────────────────────────────────────────────────────

describe('EdhrecService.getRecommendations — companion', () => {
  it('fetches the companion page and constrains results to its legal set', async () => {
    const selection: CommanderSelection = {
      commander: 'Atraxa, Praetors Voice',
      partner: null,
      companion: 'Jegantha, the Wellspring',
    };
    const slug = buildEdhrecSlug(selection);
    const companionUrl = commanderUrl(commanderSlug(selection.companion!));
    const cacheKey = `edh:edhrec:${selectionKey(selection)}`;

    // The companion page's legal set contains only Sol Ring + Command Tower,
    // so Arcane Signet (present in the commander payload) must be filtered out.
    const companionPayload = edhrecPayload([
      {
        header: 'Cards',
        cardviews: [
          { name: 'Sol Ring', id: 'sol-ring-id' },
          { name: 'Command Tower', id: 'command-id' },
        ],
      },
    ]);

    const cache = createFakeCache();
    const browser = createFakeBrowser({
      byUrl: {
        [commanderUrl(slug)]: ok(commanderPayload),
        [companionUrl]: ok(companionPayload),
      },
    });

    const service = createEdhrecService(config, cache, browser);
    const result = await service.getRecommendations(selection);

    // Two fetches: the commander page and the companion page.
    expect(browser.calls).toContain(commanderUrl(slug));
    expect(browser.calls).toContain(companionUrl);
    expect(browser.browserFetch).toHaveBeenCalledTimes(2);

    // Only companion-legal cards survive; Arcane Signet is dropped.
    expect(result.recommendations.map((r) => r.name).sort()).toEqual([
      'Command Tower',
      'Sol Ring',
    ]);
    expect(cache.setCalls[0].key).toBe(cacheKey);
  });

  it('yields an empty recommendation set when the companion page is unreachable', async () => {
    const selection: CommanderSelection = {
      commander: 'Atraxa, Praetors Voice',
      partner: null,
      companion: 'Jegantha, the Wellspring',
    };
    const slug = buildEdhrecSlug(selection);
    const companionUrl = commanderUrl(commanderSlug(selection.companion!));

    const cache = createFakeCache();
    const browser = createFakeBrowser({
      byUrl: {
        [commanderUrl(slug)]: ok(commanderPayload),
        // Companion fetch fails → best-effort empty legal set → nothing survives.
        [companionUrl]: new BrowserFetchError(),
      },
    });

    const service = createEdhrecService(config, cache, browser);
    const result = await service.getRecommendations(selection);

    expect(result.recommendations).toEqual([]);
  });
});

// ─── Malformed payload ────────────────────────────────────────────────────────

describe('EdhrecService.getRecommendations — malformed payload', () => {
  it('returns empty recommendations for a malformed payload and still caches', async () => {
    const slug = buildEdhrecSlug(soloSelection);
    const cacheKey = `edh:edhrec:${selectionKey(soloSelection)}`;
    const cache = createFakeCache();
    const browser = createFakeBrowser({
      // 2xx but not the expected shape.
      byUrl: { [commanderUrl(slug)]: ok({ unexpected: 'shape' }) },
    });

    const service = createEdhrecService(config, cache, browser);
    const result = await service.getRecommendations(soloSelection);

    expect(result.recommendations).toEqual([]);
    expect(cache.setCalls[0].key).toBe(cacheKey);
    expect(cache.setCalls[0].ttl).toBe(config.cacheTtlSeconds);
  });
});
