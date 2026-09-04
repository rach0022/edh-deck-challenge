import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createScryfallService,
  cheapestPrintingUsd,
  ScryfallUnavailableError,
  type CardSuggestion,
} from '../src/services/scryfall.js';
import type { CacheService } from '../src/services/cache.js';
import type { AppConfig } from '../src/config.js';

// ─── Test doubles ────────────────────────────────────────────────────────────

const config = {
  scryfallBaseUrl: 'https://api.scryfall.com',
  scryfallTimeoutMs: 5000,
  cacheTtlSeconds: 900,
} as AppConfig;

/**
 * Hand-written fake CacheService backed by a Map. Records every `set` call
 * (key, value, ttl) and every `get`/`delete` key so tests can assert the
 * service's caching behavior — cache hits, empty-result caching, and the TTL
 * used — without any real Redis. `get` can be pre-seeded to simulate a hit.
 */
function createFakeCache(seed: Record<string, unknown> = {}): CacheService & {
  store: Map<string, unknown>;
  sets: Array<{ key: string; value: unknown; ttl?: number }>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  const store = new Map<string, unknown>(Object.entries(seed));
  const sets: Array<{ key: string; value: unknown; ttl?: number }> = [];

  const get = vi.fn(async (key: string) => {
    return store.has(key) ? store.get(key) : null;
  });
  const set = vi.fn(async (key: string, value: unknown, ttl?: number) => {
    store.set(key, value);
    sets.push({ key, value, ttl });
  });
  const del = vi.fn(async (key: string) => {
    store.delete(key);
  });
  const isConnected = vi.fn(() => true);

  return { store, sets, get, set, delete: del, isConnected } as any;
}

/**
 * Builds a mock `Response`-like object with `.status`, `.ok`, and a `.json()`
 * that resolves to the given body (or rejects when `jsonThrows` is set, to
 * exercise the service's tolerance of non-JSON error payloads).
 */
function mockResponse(
  status: number,
  body: unknown,
  opts: { jsonThrows?: boolean } = {},
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: opts.jsonThrows
      ? vi.fn(async () => {
          throw new Error('not json');
        })
      : vi.fn(async () => body),
  } as unknown as Response;
}

/** Stubs global fetch to resolve the given Response. Returns the spy. */
function stubFetchResolve(response: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

/** Stubs global fetch to reject with the given error. Returns the spy. */
function stubFetchReject(error: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);
}

/** A representative raw Scryfall search card. */
function scryfallCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-id-1',
    name: 'Sol Ring',
    set: 'lea',
    collector_number: '270',
    color_identity: [],
    image_uris: {
      small: 'https://img/small.jpg',
      normal: 'https://img/normal.jpg',
      art_crop: 'https://img/art.jpg',
    },
    prices: { usd: '1.50', usd_foil: '9.99' },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── searchCommanders / searchCompanions ─────────────────────────────────────

describe('ScryfallService.searchCommanders', () => {
  it('returns [] with no fetch and no cache write when the query is below the 2-char minimum', async () => {
    const cache = createFakeCache();
    const fetchSpy = stubFetchResolve(mockResponse(200, {}));
    const service = createScryfallService(config, cache);

    const result = await service.searchCommanders('s');

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('returns the cached suggestions without calling fetch on a cache hit', async () => {
    const cached: CardSuggestion[] = [
      {
        name: 'Sol Ring',
        imageUrl: 'https://img/art.jpg',
        setCode: 'lea',
        collectorNumber: '270',
        scryfallId: 'card-id-1',
        usd: 1.5,
        colorIdentity: [],
      },
    ];
    const cache = createFakeCache({ 'edh:scryfall:commander:sol': cached });
    const fetchSpy = stubFetchResolve(mockResponse(200, {}));
    const service = createScryfallService(config, cache);

    const result = await service.searchCommanders('Sol');

    expect(result).toEqual(cached);
    expect(cache.get).toHaveBeenCalledWith('edh:scryfall:commander:sol');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('fetches, maps Scryfall cards to CardSuggestion, and caches with the configured TTL on a cache miss', async () => {
    const cache = createFakeCache();
    const fetchSpy = stubFetchResolve(
      mockResponse(200, { object: 'list', data: [scryfallCard()] }),
    );
    const service = createScryfallService(config, cache);

    const result = await service.searchCommanders('Sol Ring');

    expect(result).toEqual([
      {
        name: 'Sol Ring',
        imageUrl: 'https://img/art.jpg',
        setCode: 'lea',
        collectorNumber: '270',
        scryfallId: 'card-id-1',
        usd: 1.5,
        colorIdentity: [],
      },
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Cached under the normalized (query, legality) key with cacheTtlSeconds.
    expect(cache.set).toHaveBeenCalledWith(
      'edh:scryfall:commander:sol ring',
      result,
      config.cacheTtlSeconds,
    );
  });

  it('caps mapped results at 20', async () => {
    const cache = createFakeCache();
    const data = Array.from({ length: 50 }, (_, i) =>
      scryfallCard({ id: `id-${i}`, name: `Card ${i}`, collector_number: `${i}` }),
    );
    stubFetchResolve(mockResponse(200, { data }));
    const service = createScryfallService(config, cache);

    const result = await service.searchCommanders('card');

    expect(result).toHaveLength(20);
  });

  it('sends the is:commander filter token in the fetched URL', async () => {
    const cache = createFakeCache();
    const fetchSpy = stubFetchResolve(mockResponse(200, { data: [] }));
    const service = createScryfallService(config, cache);

    await service.searchCommanders('Sol');

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent('is:commander'));
  });

  it('treats a 404 as no matches: returns [] and caches the empty result', async () => {
    const cache = createFakeCache();
    const fetchSpy = stubFetchResolve(
      mockResponse(404, { object: 'error', code: 'not_found' }),
    );
    const service = createScryfallService(config, cache);

    const result = await service.searchCommanders('zzzznomatch');

    expect(result).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(
      'edh:scryfall:commander:zzzznomatch',
      [],
      config.cacheTtlSeconds,
    );
  });

  it('throws ScryfallUnavailableError on a non-2xx, non-404 status (e.g. 500)', async () => {
    const cache = createFakeCache();
    stubFetchResolve(mockResponse(500, {}));
    const service = createScryfallService(config, cache);

    await expect(service.searchCommanders('sol')).rejects.toBeInstanceOf(
      ScryfallUnavailableError,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('throws ScryfallUnavailableError when fetch rejects (network failure)', async () => {
    const cache = createFakeCache();
    stubFetchReject(new Error('network down'));
    const service = createScryfallService(config, cache);

    await expect(service.searchCommanders('sol')).rejects.toBeInstanceOf(
      ScryfallUnavailableError,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('throws ScryfallUnavailableError when fetch aborts (timeout / AbortError)', async () => {
    const cache = createFakeCache();
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    stubFetchReject(abortError);
    const service = createScryfallService(config, cache);

    await expect(service.searchCommanders('sol')).rejects.toBeInstanceOf(
      ScryfallUnavailableError,
    );
  });
});

describe('ScryfallService.searchCompanions', () => {
  it('sends the is:companion filter token in the fetched URL', async () => {
    const cache = createFakeCache();
    const fetchSpy = stubFetchResolve(mockResponse(200, { data: [] }));
    const service = createScryfallService(config, cache);

    await service.searchCompanions('lurr');

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent('is:companion'));
  });

  it('caches companion results under the companion legality key', async () => {
    const cache = createFakeCache();
    stubFetchResolve(mockResponse(200, { data: [scryfallCard({ name: 'Lurrus' })] }));
    const service = createScryfallService(config, cache);

    await service.searchCompanions('Lurrus');

    expect(cache.set).toHaveBeenCalledWith(
      'edh:scryfall:companion:lurrus',
      expect.any(Array),
      config.cacheTtlSeconds,
    );
  });
});

// ─── getCardByName ────────────────────────────────────────────────────────────

describe('ScryfallService.getCardByName', () => {
  it('maps an exact-name success to a CardSuggestion and caches it', async () => {
    const cache = createFakeCache();
    const fetchSpy = stubFetchResolve(mockResponse(200, scryfallCard()));
    const service = createScryfallService(config, cache);

    const result = await service.getCardByName('Sol Ring');

    expect(result).toEqual({
      name: 'Sol Ring',
      imageUrl: 'https://img/art.jpg',
      setCode: 'lea',
      collectorNumber: '270',
      scryfallId: 'card-id-1',
      usd: 1.5,
      colorIdentity: [],
    });
    // Exact-name endpoint queried and cached under the named key.
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/cards/named?exact=');
    expect(cache.set).toHaveBeenCalledWith(
      'edh:scryfall:named:sol ring',
      result,
      config.cacheTtlSeconds,
    );
  });

  it('returns a cached card without calling fetch on a cache hit', async () => {
    const cached: CardSuggestion = {
      name: 'Sol Ring',
      imageUrl: 'https://img/art.jpg',
      setCode: 'lea',
      collectorNumber: '270',
      scryfallId: 'card-id-1',
      usd: 1.5,
      colorIdentity: [],
    };
    const cache = createFakeCache({ 'edh:scryfall:named:sol ring': cached });
    const fetchSpy = stubFetchResolve(mockResponse(200, {}));
    const service = createScryfallService(config, cache);

    const result = await service.getCardByName('Sol Ring');

    expect(result).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null and caches the miss when the card is not found (404)', async () => {
    const cache = createFakeCache();
    stubFetchResolve(mockResponse(404, { object: 'error', code: 'not_found' }));
    const service = createScryfallService(config, cache);

    const result = await service.getCardByName('Not A Real Card');

    expect(result).toBeNull();
    expect(cache.set).toHaveBeenCalledWith(
      'edh:scryfall:named:not a real card',
      null,
      config.cacheTtlSeconds,
    );
  });

  it('throws ScryfallUnavailableError on a non-2xx, non-404 status', async () => {
    const cache = createFakeCache();
    stubFetchResolve(mockResponse(500, {}));
    const service = createScryfallService(config, cache);

    await expect(service.getCardByName('Sol Ring')).rejects.toBeInstanceOf(
      ScryfallUnavailableError,
    );
  });

  it('throws ScryfallUnavailableError when fetch rejects', async () => {
    const cache = createFakeCache();
    stubFetchReject(new Error('network down'));
    const service = createScryfallService(config, cache);

    await expect(service.getCardByName('Sol Ring')).rejects.toBeInstanceOf(
      ScryfallUnavailableError,
    );
  });

  it('returns null for empty/whitespace-only names without calling fetch', async () => {
    const cache = createFakeCache();
    const fetchSpy = stubFetchResolve(mockResponse(200, {}));
    const service = createScryfallService(config, cache);

    expect(await service.getCardByName('   ')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── cheapestPrintingUsd (pure reducer) ──────────────────────────────────────

describe('cheapestPrintingUsd', () => {
  it('returns the minimum non-foil usd across printings', () => {
    const printings = [
      { prices: { usd: '5.00', usd_foil: '20.00' } },
      { prices: { usd: '1.25', usd_foil: '9.99' } },
      { prices: { usd: '3.00', usd_foil: null } },
    ];
    expect(cheapestPrintingUsd(printings as any)).toBe(1.25);
  });

  it('falls back to usd_foil for a printing with no non-foil price', () => {
    const printings = [
      { prices: { usd: null, usd_foil: '2.50' } },
      { prices: { usd: '4.00', usd_foil: '30.00' } },
    ];
    expect(cheapestPrintingUsd(printings as any)).toBe(2.5);
  });

  it('skips printings with no usable price and returns null when none have a price', () => {
    const printings = [
      { prices: { usd: null, usd_foil: null } },
      { prices: {} },
      {},
    ];
    expect(cheapestPrintingUsd(printings as any)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(cheapestPrintingUsd([])).toBeNull();
  });
});

// ─── getCheapestUsdByName ─────────────────────────────────────────────────────

describe('ScryfallService.getCheapestUsdByName', () => {
  it('queries prints with the commander-legal filter and returns the cheapest usd', async () => {
    const cache = createFakeCache();
    const data = [
      scryfallCard({ prices: { usd: '5.00', usd_foil: '25.00' } }),
      scryfallCard({ id: 'card-id-2', prices: { usd: '0.75', usd_foil: '8.00' } }),
    ];
    const fetchSpy = stubFetchResolve(mockResponse(200, { object: 'list', data }));
    const service = createScryfallService(config, cache);

    const usd = await service.getCheapestUsdByName('Sol Ring');
    expect(usd).toBe(0.75);

    // The request restricts to commander-legal printings and asks for one row
    // per printing.
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/cards/search?q=');
    expect(decodeURIComponent(url)).toContain('!"Sol Ring" legal:commander');
    expect(url).toContain('unique=prints');
  });

  it('caches the resolved price (including a null "no price" outcome)', async () => {
    const cache = createFakeCache();
    stubFetchResolve(mockResponse(200, { object: 'list', data: [scryfallCard({ prices: { usd: '2.00' } })] }));
    const service = createScryfallService(config, cache);

    await service.getCheapestUsdByName('Sol Ring');
    // Cached under the cheapest-printing key with the configured TTL.
    const setCall = cache.sets.find((s) => s.key === 'edh:scryfall:cheapest:sol ring');
    expect(setCall).toBeDefined();
    expect(setCall!.value).toEqual({ usd: 2 });
    expect(setCall!.ttl).toBe(config.cacheTtlSeconds);
  });

  it('serves a cached price without calling fetch', async () => {
    const cache = createFakeCache({ 'edh:scryfall:cheapest:sol ring': { usd: 1.11 } });
    const fetchSpy = stubFetchResolve(mockResponse(200, {}));
    const service = createScryfallService(config, cache);

    expect(await service.getCheapestUsdByName('Sol Ring')).toBe(1.11);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null (no throw) when the card has no commander-legal printing (404)', async () => {
    const cache = createFakeCache();
    stubFetchResolve(mockResponse(404, { object: 'error', code: 'not_found' }));
    const service = createScryfallService(config, cache);

    expect(await service.getCheapestUsdByName('Not Legal Here')).toBeNull();
  });

  it('degrades to null (no throw) when Scryfall is unavailable', async () => {
    const cache = createFakeCache();
    stubFetchReject(new Error('network down'));
    const service = createScryfallService(config, cache);

    expect(await service.getCheapestUsdByName('Sol Ring')).toBeNull();
  });

  it('returns null for empty/whitespace names without calling fetch', async () => {
    const cache = createFakeCache();
    const fetchSpy = stubFetchResolve(mockResponse(200, {}));
    const service = createScryfallService(config, cache);

    expect(await service.getCheapestUsdByName('  ')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
