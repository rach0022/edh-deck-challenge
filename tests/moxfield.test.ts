import { describe, it, expect, vi } from 'vitest';
import {
  createMoxfieldService,
  parseMoxfieldDeckId,
  MoxfieldUserNotFoundError,
  MoxfieldAPIError,
  MoxfieldTimeoutError,
} from '../src/services/moxfield.js';
import { BrowserFetchError, type BrowserService } from '../src/services/browser.js';
import type { AppConfig } from '../src/config.js';
import type { MoxfieldDeckDetail, MoxfieldDeckListResponse } from '../src/types.js';

// ─── Test doubles ────────────────────────────────────────────────────────────

const config = {
  moxfieldBaseUrl: 'https://api2.moxfield.com/v2',
} as AppConfig;

type BrowserFetchResult = { status: number; body: unknown };

/**
 * Hand-written fake BrowserService. `browserFetch` is programmable: it can be
 * given a queue of responses (returned in order) and/or a per-URL response map.
 * A queued entry that is an `Error` (or `BrowserFetchError`) is thrown, letting
 * us simulate the shared browser failing on a fetch. No real Puppeteer is used.
 */
function createFakeBrowser(options: {
  queue?: Array<BrowserFetchResult | Error>;
  byUrl?: Record<string, BrowserFetchResult | Error>;
  ready?: boolean;
} = {}): BrowserService & {
  calls: string[];
  initialize: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
  isReady: ReturnType<typeof vi.fn>;
} {
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

function deckSummary(publicId: string, overrides: Record<string, unknown> = {}) {
  return {
    publicId,
    name: `Deck ${publicId}`,
    format: 'commander',
    publicUrl: `https://moxfield.com/decks/${publicId}`,
    createdAtUtc: '2024-01-01T00:00:00Z',
    lastUpdatedAtUtc: '2024-01-02T00:00:00Z',
    ...overrides,
  };
}

function searchPage(
  data: ReturnType<typeof deckSummary>[],
  totalPages: number,
  pageNumber: number,
): MoxfieldDeckListResponse {
  return {
    pageNumber,
    pageSize: 100,
    totalResults: data.length * totalPages,
    totalPages,
    data,
  } as MoxfieldDeckListResponse;
}

const ok = (body: unknown): BrowserFetchResult => ({ status: 200, body });

// ─── parseMoxfieldDeckId ──────────────────────────────────────────────────────

describe('parseMoxfieldDeckId', () => {
  it('extracts the id from canonical www URLs', () => {
    expect(parseMoxfieldDeckId('https://www.moxfield.com/decks/abc123')).toBe('abc123');
  });

  it('extracts the id without www and with http', () => {
    expect(parseMoxfieldDeckId('http://moxfield.com/decks/def-456')).toBe('def-456');
  });

  it('extracts the id ignoring trailing path segments and query strings', () => {
    expect(parseMoxfieldDeckId('moxfield.com/decks/xyz_789/primer?foo=bar')).toBe('xyz_789');
  });

  it('returns null for non-Moxfield URLs', () => {
    expect(parseMoxfieldDeckId('https://archidekt.com/decks/abc123')).toBeNull();
  });

  it('returns null for Moxfield non-deck URLs', () => {
    expect(parseMoxfieldDeckId('https://moxfield.com/users/someone')).toBeNull();
  });

  it('returns null for non-string input', () => {
    // @ts-expect-error intentionally passing a non-string to exercise the guard
    expect(parseMoxfieldDeckId(undefined)).toBeNull();
  });
});

// ─── fetchUserDecks ───────────────────────────────────────────────────────────

describe('MoxfieldService.fetchUserDecks', () => {
  it('fetches decks from a single page via the injected browser and maps fields', async () => {
    const browser = createFakeBrowser({
      queue: [
        ok({}), // profile lookup
        ok(searchPage([deckSummary('abc123', { name: 'Kozilek Deck' })], 1, 1)),
      ],
    });
    const service = createMoxfieldService(config, browser);

    const decks = await service.fetchUserDecks('testuser');

    expect(decks).toHaveLength(1);
    expect(decks[0]).toMatchObject({
      publicId: 'abc123',
      name: 'Kozilek Deck',
      format: 'commander',
      publicUrl: 'https://moxfield.com/decks/abc123',
      createdAtUtc: '2024-01-01T00:00:00Z',
      lastUpdatedAtUtc: '2024-01-02T00:00:00Z',
    });
    // Verified the injected browser is what did the fetching.
    expect(browser.browserFetch).toHaveBeenCalled();
    expect(browser.calls[0]).toContain('/v1/users/testuser');
  });

  it('defaults format and publicUrl when the payload omits them', async () => {
    const browser = createFakeBrowser({
      queue: [
        ok({}),
        ok(searchPage([deckSummary('nofmt', { format: '', publicUrl: '' })], 1, 1)),
      ],
    });
    const service = createMoxfieldService(config, browser);

    const decks = await service.fetchUserDecks('testuser');

    expect(decks[0].format).toBe('commander');
    expect(decks[0].publicUrl).toBe('https://moxfield.com/decks/nofmt');
  });

  it('paginates across multiple pages and concatenates results', async () => {
    const browser = createFakeBrowser({
      queue: [
        ok({}), // profile lookup
        ok(searchPage([deckSummary('deck1')], 2, 1)),
        ok(searchPage([deckSummary('deck2')], 2, 2)),
      ],
    });
    const service = createMoxfieldService(config, browser);

    const decks = await service.fetchUserDecks('testuser');

    expect(decks.map((d) => d.publicId)).toEqual(['deck1', 'deck2']);
    // profile + 2 search pages = 3 browser fetches
    expect(browser.browserFetch).toHaveBeenCalledTimes(3);
  });

  it('throws MoxfieldUserNotFoundError when the profile lookup returns 404', async () => {
    const browser = createFakeBrowser({ queue: [{ status: 404, body: {} }] });
    const service = createMoxfieldService(config, browser);

    await expect(service.fetchUserDecks('ghost')).rejects.toBeInstanceOf(
      MoxfieldUserNotFoundError,
    );
  });

  it('throws MoxfieldAPIError when the profile lookup returns a non-2xx status', async () => {
    const browser = createFakeBrowser({ queue: [{ status: 500, body: {} }] });
    const service = createMoxfieldService(config, browser);

    await expect(service.fetchUserDecks('testuser')).rejects.toBeInstanceOf(
      MoxfieldAPIError,
    );
  });

  it('throws MoxfieldAPIError when a search page returns a non-2xx status', async () => {
    const browser = createFakeBrowser({
      queue: [ok({}), { status: 503, body: {} }],
    });
    const service = createMoxfieldService(config, browser);

    await expect(service.fetchUserDecks('testuser')).rejects.toBeInstanceOf(
      MoxfieldAPIError,
    );
  });

  it('maps a BrowserFetchError to MoxfieldTimeoutError', async () => {
    const browser = createFakeBrowser({ queue: [new BrowserFetchError()] });
    const service = createMoxfieldService(config, browser);

    await expect(service.fetchUserDecks('testuser')).rejects.toBeInstanceOf(
      MoxfieldTimeoutError,
    );
  });
});

// ─── fetchDeckDetail ──────────────────────────────────────────────────────────

describe('MoxfieldService.fetchDeckDetail', () => {
  it('fetches deck detail via the injected browser and returns the body', async () => {
    const detail: MoxfieldDeckDetail = {
      id: 'internal-id',
      publicId: 'abc123',
      name: 'Kozilek Deck',
      format: 'commander',
      commanders: {},
      mainboard: {},
    };
    const browser = createFakeBrowser({ queue: [ok(detail)] });
    const service = createMoxfieldService(config, browser);

    const result = await service.fetchDeckDetail('abc123');

    expect(result).toEqual(detail);
    expect(browser.calls[0]).toBe('https://api2.moxfield.com/v2/decks/all/abc123');
  });

  it('encodes the public id in the request URL', async () => {
    const browser = createFakeBrowser({
      queue: [ok({ id: 'x', publicId: 'a b', name: 'n', format: 'commander', commanders: {}, mainboard: {} })],
    });
    const service = createMoxfieldService(config, browser);

    await service.fetchDeckDetail('a b');

    expect(browser.calls[0]).toBe('https://api2.moxfield.com/v2/decks/all/a%20b');
  });

  it('throws MoxfieldAPIError on 404', async () => {
    const browser = createFakeBrowser({ queue: [{ status: 404, body: {} }] });
    const service = createMoxfieldService(config, browser);

    await expect(service.fetchDeckDetail('nope')).rejects.toBeInstanceOf(
      MoxfieldAPIError,
    );
  });

  it('throws MoxfieldAPIError on a non-2xx status', async () => {
    const browser = createFakeBrowser({ queue: [{ status: 500, body: {} }] });
    const service = createMoxfieldService(config, browser);

    await expect(service.fetchDeckDetail('abc123')).rejects.toBeInstanceOf(
      MoxfieldAPIError,
    );
  });

  it('maps a BrowserFetchError to MoxfieldTimeoutError', async () => {
    const browser = createFakeBrowser({ queue: [new BrowserFetchError()] });
    const service = createMoxfieldService(config, browser);

    await expect(service.fetchDeckDetail('abc123')).rejects.toBeInstanceOf(
      MoxfieldTimeoutError,
    );
  });
});

// ─── Lifecycle delegation ─────────────────────────────────────────────────────

describe('MoxfieldService lifecycle', () => {
  it('delegates isReady to the injected browser', () => {
    const browser = createFakeBrowser({ ready: true });
    const service = createMoxfieldService(config, browser);

    expect(service.isReady()).toBe(true);
    expect(browser.isReady).toHaveBeenCalled();
  });

  it('delegates initialize to the injected browser', async () => {
    const browser = createFakeBrowser();
    const service = createMoxfieldService(config, browser);

    await service.initialize();

    expect(browser.initialize).toHaveBeenCalledTimes(1);
  });

  it('delegates shutdown to the injected browser', async () => {
    const browser = createFakeBrowser();
    const service = createMoxfieldService(config, browser);

    await service.shutdown();

    expect(browser.shutdown).toHaveBeenCalledTimes(1);
  });
});
