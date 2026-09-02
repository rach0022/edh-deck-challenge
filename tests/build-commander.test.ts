import { describe, it, expect, vi } from 'vitest';
import { createBuildCommanderService } from '../src/services/build-commander.js';
import type { CacheService } from '../src/services/cache.js';
import type { MoxfieldService } from '../src/services/moxfield.js';
import type { EdhrecService, EdhrecResult } from '../src/services/edhrec.js';
import type { FxService } from '../src/services/fx.js';
import type { ScryfallService, CardDetails } from '../src/services/scryfall.js';
import type { ProgressEvent } from '../src/services/challenge.js';
import type { AppConfig } from '../src/config.js';
import type {
  BuildCommanderResponse,
  CommanderSelection,
  EdhrecRecommendation,
  FxInfo,
  MoxfieldCardEntry,
  MoxfieldDeckDetail,
  MoxfieldDeckSummary,
} from '../src/types.js';
import { buildCacheKey } from '../src/domain/selection-key.js';

// ─── Test doubles ────────────────────────────────────────────────────────────

const config = {
  cacheTtlSeconds: 900,
} as AppConfig;

/**
 * Hand-written fake CacheService backed by a plain Map (mirrors the fakes in
 * tests/edhrec.test.ts). Records the TTL passed to each `set` and the keys
 * passed to `delete` so tests can assert caching/refresh behavior. Never
 * expires entries — expiry is not under test here.
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

/** Builds a Moxfield deck summary with just the fields the service reads. */
function deckSummary(publicId: string, name: string): MoxfieldDeckSummary {
  return {
    publicId,
    name,
    format: 'commander',
    publicUrl: `https://moxfield.com/decks/${publicId}`,
    createdAtUtc: '2024-01-01T00:00:00Z',
    lastUpdatedAtUtc: '2024-01-02T00:00:00Z',
  };
}

/** Wraps a bare card name into the Moxfield mainboard entry shape. */
function cardEntry(name: string): MoxfieldCardEntry {
  return {
    quantity: 1,
    card: { name, color_identity: [], set: 'xxx', cn: '1' },
  } as MoxfieldCardEntry;
}

/** Builds a deck detail whose mainboard holds the given card names. */
function deckDetail(publicId: string, name: string, cardNames: string[]): MoxfieldDeckDetail {
  const mainboard: Record<string, MoxfieldCardEntry> = {};
  for (const cardName of cardNames) mainboard[cardName] = cardEntry(cardName);
  return {
    id: `internal-${publicId}`,
    publicId,
    name,
    format: 'commander',
    commanders: {},
    mainboard,
  };
}

/**
 * Hand-written fake MoxfieldService. Programmable with a set of deck summaries
 * and a publicId → detail map. Only the two methods the orchestrator uses
 * (`fetchUserDecks`, `fetchDeckDetail`) are backed; the rest are inert stubs.
 * No real Puppeteer/network.
 */
function createFakeMoxfield(options: {
  summaries?: MoxfieldDeckSummary[];
  details?: Record<string, MoxfieldDeckDetail>;
} = {}): MoxfieldService & {
  fetchUserDecks: ReturnType<typeof vi.fn>;
  fetchDeckDetail: ReturnType<typeof vi.fn>;
} {
  const summaries = options.summaries ?? [];
  const details = options.details ?? {};

  const fetchUserDecks = vi.fn(async (_username: string) => summaries);
  const fetchDeckDetail = vi.fn(async (publicId: string) => {
    const detail = details[publicId];
    if (!detail) throw new Error(`fake moxfield: no detail for ${publicId}`);
    return detail;
  });
  const initialize = vi.fn(async () => {});
  const shutdown = vi.fn(async () => {});
  const isReady = vi.fn(() => true);

  return { fetchUserDecks, fetchDeckDetail, initialize, shutdown, isReady } as any;
}

/**
 * Hand-written fake EdhrecService returning a fixed recommendation list.
 */
function createFakeEdhrec(
  recommendations: EdhrecRecommendation[],
  slug = 'atraxa-praetors-voice',
): EdhrecService & { getRecommendations: ReturnType<typeof vi.fn> } {
  const getRecommendations = vi.fn(
    async (_selection: CommanderSelection): Promise<EdhrecResult> => ({
      slug,
      recommendations,
      rank: 42,
      numDecks: 1234,
    }),
  );
  return { getRecommendations } as any;
}

/** Hand-written fake FxService returning a fixed rate. */
function createFakeFx(usdToCad = 1.35, live = true): FxService & {
  getUsdToCad: ReturnType<typeof vi.fn>;
} {
  const fx: FxInfo = { usdToCad, fetchedAt: '2024-06-01T00:00:00Z', live };
  const getUsdToCad = vi.fn(async () => fx);
  return { getUsdToCad } as any;
}

/**
 * Hand-written fake ScryfallService. Only `getCardsByIds` is used by the build
 * service; it returns type/image/price details keyed by the ids in the fixture
 * recommendations (`<name>-id`). `typeLine` drives the card-type sub-grouping;
 * `usd` feeds the pricing layer.
 */
function createFakeScryfall(
  detailsByName: Record<string, { typeLine: string; usd: number | null }> = {},
): ScryfallService & { getCardsByIds: ReturnType<typeof vi.fn> } {
  const getCardsByIds = vi.fn(async (ids: string[]) => {
    const map = new Map<string, CardDetails>();
    for (const id of ids) {
      const name = id.replace(/-id$/, '');
      const d = detailsByName[name];
      if (!d) continue;
      map.set(id, {
        scryfallId: id,
        name,
        typeLine: d.typeLine,
        art: 'https://img/art/' + name,
        imageUrl: 'https://img/normal/' + name,
        usd: d.usd,
      });
    }
    return map;
  });
  const searchCommanders = vi.fn(async () => []);
  const searchCompanions = vi.fn(async () => []);
  const getCardByName = vi.fn(async (name: string) => ({
    name,
    imageUrl: null,
    setCode: '',
    collectorNumber: '',
    scryfallId: `${name}-id`,
    usd: null,
  }));
  return { searchCommanders, searchCompanions, getCardByName, getCardsByIds } as any;
}

/** Default card details for the fixture recommendations. */
const cardDetails = {
  'Sol Ring': { typeLine: 'Artifact', usd: 1.5 },
  'Arcane Signet': { typeLine: 'Artifact', usd: 0.5 },
  'Rhystic Study': { typeLine: 'Enchantment', usd: 25 },
  'Smothering Tithe': { typeLine: 'Enchantment', usd: 30 },
  'Atraxa, Praetors Voice': { typeLine: 'Legendary Creature — Phyrexian Angel Horror', usd: 12 },
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const selection: CommanderSelection = {
  commander: 'Atraxa, Praetors Voice',
  partner: null,
  companion: null,
};

/** A recommendation carrying only the fields the split/pricing layers read. */
function rec(name: string): EdhrecRecommendation {
  return {
    name,
    category: 'High Synergy Cards',
    inclusion: null,
    synergy: null,
    scryfallId: `${name}-id`,
    setCode: null,
    collectorNumber: null,
  };
}

/**
 * Recommendation list where "Sol Ring" and "Arcane Signet" are owned (seeded
 * into decks below) and "Rhystic Study" + "Smothering Tithe" are to-buy. The
 * split layer discards raw USD from the recommendation, so the orchestrator's
 * to-buy cards start with usd:null → cad:null; we assert on that pricing path.
 */
const recommendations: EdhrecRecommendation[] = [
  rec('Sol Ring'),
  rec('Arcane Signet'),
  rec('Rhystic Study'),
  rec('Smothering Tithe'),
];

/**
 * Two decks: deck A owns Sol Ring + Command Tower, deck B owns Sol Ring +
 * Arcane Signet. So the owned set covers Sol Ring (in both) and Arcane Signet
 * (in B). Neither owns Rhystic Study nor Smothering Tithe → those are to-buy.
 */
const summaries = [deckSummary('deckA', 'Aggro Atraxa'), deckSummary('deckB', 'Superfriends')];
const details = {
  deckA: deckDetail('deckA', 'Aggro Atraxa', ['Sol Ring', 'Command Tower']),
  deckB: deckDetail('deckB', 'Superfriends', ['Sol Ring', 'Arcane Signet']),
};

const username = 'testuser';
const cacheKey = buildCacheKey(username, selection);

// ─── Cache hit ─────────────────────────────────────────────────────────────

describe('BuildCommanderService.getResult — cache hit', () => {
  it('returns the cached result without calling Moxfield or EDHREC', async () => {
    const cachedResponse = {
      username,
      selection,
      sections: [],
      commanderImages: [],
      ownedCards: [],
      toBuyCards: [],
      ownedCount: 0,
      toBuyCount: 0,
      buyListTotalCad: 0,
      deckCount: 0,
      fx: { usdToCad: 1.35, fetchedAt: '2024-06-01T00:00:00Z', live: true },
      noDecks: false,
      edhrecRank: null,
      edhrecNumDecks: null,
    } satisfies BuildCommanderResponse;

    const cache = createFakeCache({ [cacheKey]: cachedResponse });
    const moxfield = createFakeMoxfield({ summaries, details });
    const edhrec = createFakeEdhrec(recommendations);
    const fx = createFakeFx();

    const service = createBuildCommanderService(config, cache, moxfield, edhrec, fx, createFakeScryfall(cardDetails));
    const { data, cached } = await service.getResult(selection, username);

    expect(cached).toBe(true);
    expect(data).toEqual(cachedResponse);
    expect(cache.get).toHaveBeenCalledWith(cacheKey);

    // Nothing downstream was touched.
    expect(moxfield.fetchUserDecks).not.toHaveBeenCalled();
    expect(moxfield.fetchDeckDetail).not.toHaveBeenCalled();
    expect(edhrec.getRecommendations).not.toHaveBeenCalled();
    expect(fx.getUsdToCad).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});

// ─── Cache miss → orchestration ───────────────────────────────────────────

describe('BuildCommanderService.getResult — cache miss', () => {
  it('orchestrates the pipeline, splits owned/to-buy, prices to CAD, and caches', async () => {
    const cache = createFakeCache();
    const moxfield = createFakeMoxfield({ summaries, details });
    const edhrec = createFakeEdhrec(recommendations);
    const fx = createFakeFx(1.35);

    const service = createBuildCommanderService(config, cache, moxfield, edhrec, fx, createFakeScryfall(cardDetails));
    const { data, cached } = await service.getResult(selection, username);

    expect(cached).toBe(false);

    // Orchestration fanned out to all four collaborators.
    expect(moxfield.fetchUserDecks).toHaveBeenCalledWith(username);
    expect(moxfield.fetchDeckDetail).toHaveBeenCalledWith('deckA');
    expect(moxfield.fetchDeckDetail).toHaveBeenCalledWith('deckB');
    expect(edhrec.getRecommendations).toHaveBeenCalledWith(selection);
    expect(fx.getUsdToCad).toHaveBeenCalledTimes(1);

    // Owned/to-buy split: Sol Ring + Arcane Signet owned, the other two to-buy.
    expect(data.ownedCards.map((c) => c.name).sort()).toEqual(['Arcane Signet', 'Sol Ring']);
    expect(data.toBuyCards.map((c) => c.name).sort()).toEqual([
      'Rhystic Study',
      'Smothering Tithe',
    ]);
    expect(data.ownedCount).toBe(2);
    expect(data.toBuyCount).toBe(2);
    expect(data.ownedCount + data.toBuyCount).toBe(recommendations.length);

    // Owned cards carry their source decks; to-buy cards do not.
    const solRing = data.ownedCards.find((c) => c.name === 'Sol Ring')!;
    expect(solRing.sourceDecks).toEqual(['Aggro Atraxa', 'Superfriends']);
    const arcane = data.ownedCards.find((c) => c.name === 'Arcane Signet')!;
    expect(arcane.sourceDecks).toEqual(['Superfriends']);
    for (const c of data.toBuyCards) expect(c.sourceDecks).toEqual([]);

    // To-buy cards are run through the pricing layer (cad derived from usd).
    for (const c of data.toBuyCards) {
      expect(c.cad).toBe(c.usd == null ? null : Math.round(c.usd * 1.35 * 100) / 100);
    }

    // Assembled response fields.
    expect(data.username).toBe(username);
    expect(data.selection).toEqual(selection);
    expect(data.deckCount).toBe(2);
    expect(data.noDecks).toBe(false);
    expect(data.fx).toEqual({ usdToCad: 1.35, fetchedAt: '2024-06-01T00:00:00Z', live: true });
    expect(data.buyListTotalCad).toBe(
      Math.round(data.toBuyCards.reduce((s, c) => s + (c.cad ?? 0), 0) * 100) / 100,
    );

    // Cards are enriched with Scryfall type/image/price.
    expect(solRing.cardType).toBe('Artifact');
    expect(solRing.imageUrl).toBe('https://img/normal/Sol Ring');
    const rhystic = data.toBuyCards.find((c) => c.name === 'Rhystic Study')!;
    expect(rhystic.cardType).toBe('Enchantment');
    expect(rhystic.usd).toBe(25);
    expect(rhystic.cad).toBe(Math.round(25 * 1.35 * 100) / 100);

    // Sections mirror EDHREC panels; all fixture cards share "High Synergy
    // Cards", so there is one section split into owned/to-buy by card type.
    expect(data.sections.length).toBeGreaterThan(0);
    const hs = data.sections.find((sec) => sec.name === 'High Synergy Cards')!;
    expect(hs).toBeDefined();
    expect(hs.ownedCount).toBe(2);
    expect(hs.toBuyCount).toBe(2);
    // Owned cards are all Artifacts here → a single owned type group.
    expect(hs.ownedGroups.map((g) => g.type)).toEqual(['Artifact']);
    // To-buy cards are all Enchantments → a single to-buy type group.
    expect(hs.toBuyGroups.map((g) => g.type)).toEqual(['Enchantment']);

    // Cached under the build cache key with the configured TTL.
    expect(cache.setCalls).toHaveLength(1);
    expect(cache.setCalls[0].key).toBe(cacheKey);
    expect(cache.setCalls[0].ttl).toBe(config.cacheTtlSeconds);
    expect(cache.setCalls[0].value).toEqual(data);
  });

  it('emits progress phases ending in a complete/100 phase', async () => {
    const cache = createFakeCache();
    const moxfield = createFakeMoxfield({ summaries, details });
    const edhrec = createFakeEdhrec(recommendations);
    const fx = createFakeFx();

    const events: ProgressEvent[] = [];
    const onProgress = (e: ProgressEvent) => events.push(e);

    const service = createBuildCommanderService(config, cache, moxfield, edhrec, fx, createFakeScryfall(cardDetails));
    await service.getResult(selection, username, onProgress);

    expect(events.length).toBeGreaterThan(0);
    const phases = events.map((e) => e.phase);
    // Progresses through the loading phases before finishing.
    expect(phases).toContain('connecting');
    expect(phases).toContain('loading-decks');
    expect(phases).toContain('matching');
    expect(phases).toContain('finalizing');

    // Final phase is the terminal complete/100 phase.
    const last = events[events.length - 1];
    expect(last.phase).toBe('complete');
    expect(last.progress).toBe(100);
  });
});

// ─── No-decks case ───────────────────────────────────────────────────────────

describe('BuildCommanderService.getResult — no decks', () => {
  it('sets noDecks:true and classifies every recommendation as to-buy', async () => {
    const cache = createFakeCache();
    // User has no commander decks.
    const moxfield = createFakeMoxfield({ summaries: [], details: {} });
    const edhrec = createFakeEdhrec(recommendations);
    const fx = createFakeFx();

    const service = createBuildCommanderService(config, cache, moxfield, edhrec, fx, createFakeScryfall(cardDetails));
    const { data } = await service.getResult(selection, username);

    expect(data.noDecks).toBe(true);
    expect(data.deckCount).toBe(0);
    expect(data.ownedCards).toEqual([]);
    expect(data.ownedCount).toBe(0);
    // Every recommendation is to-buy.
    expect(data.toBuyCount).toBe(recommendations.length);
    expect(data.toBuyCards.map((c) => c.name).sort()).toEqual(
      recommendations.map((r) => r.name).sort(),
    );
    // Deck detail is never fetched when there are no decks.
    expect(moxfield.fetchDeckDetail).not.toHaveBeenCalled();
  });
});

// ─── refreshResult ───────────────────────────────────────────────────────────

describe('BuildCommanderService.refreshResult', () => {
  it('deletes the cache key, recomputes, and re-caches under the TTL', async () => {
    // Seed a stale cached result so we can prove it is discarded.
    const stale = { username, selection, stale: true } as unknown as BuildCommanderResponse;
    const cache = createFakeCache({ [cacheKey]: stale });
    const moxfield = createFakeMoxfield({ summaries, details });
    const edhrec = createFakeEdhrec(recommendations);
    const fx = createFakeFx(1.35);

    const service = createBuildCommanderService(config, cache, moxfield, edhrec, fx, createFakeScryfall(cardDetails));
    const data = await service.refreshResult(selection, username);

    // The stale key was deleted before recomputing.
    expect(cache.deleteCalls).toContain(cacheKey);

    // Recomputed from the collaborators (not the stale cache value).
    expect(moxfield.fetchUserDecks).toHaveBeenCalledWith(username);
    expect(edhrec.getRecommendations).toHaveBeenCalledWith(selection);
    expect(fx.getUsdToCad).toHaveBeenCalledTimes(1);
    expect((data as unknown as { stale?: boolean }).stale).toBeUndefined();
    expect(data.ownedCount).toBe(2);
    expect(data.toBuyCount).toBe(2);

    // Re-cached under the build key with the configured TTL.
    expect(cache.setCalls).toHaveLength(1);
    expect(cache.setCalls[0].key).toBe(cacheKey);
    expect(cache.setCalls[0].ttl).toBe(config.cacheTtlSeconds);
    expect(cache.setCalls[0].value).toEqual(data);
  });
});
