/**
 * Scryfall autocomplete + card-lookup service.
 *
 * Proxies Scryfall searches server-side so the browser never calls Scryfall
 * directly (Req 4.4). Two things happen here:
 *
 *   1. Type-ahead search restricted to legal commanders / companions
 *      (`searchCommanders` / `searchCompanions`), using the pure query and
 *      cache-key builders in `domain/scryfall-query.ts` (Req 4.1–4.3, 4.5).
 *   2. An exact-name lookup (`getCardByName`) used for validation and to pull
 *      art/printing hints for the results page.
 *
 * Results are cached in the shared Cache keyed by (query, legality); a cache
 * hit skips the network call entirely (Req 4.6). Queries shorter than the
 * 2-character minimum return `[]` without any network call (Req 4.7). A
 * timeout or upstream failure surfaces as a typed `ScryfallUnavailableError`
 * so the route can degrade gracefully and let the user keep typing (Req 4.8).
 *
 * Scryfall's public REST API does not require the Puppeteer browser, so this
 * uses plain `fetch` with an `AbortController` timeout of
 * `config.scryfallTimeoutMs`.
 */

import type { AppConfig } from '../config.js';
import type { CacheService } from './cache.js';
import {
  buildScryfallQueryParam,
  buildAutocompleteCacheKey,
  buildCheapestPrintingQueryParam,
  buildCheapestPrintingCacheKey,
  meetsMinimumLength,
  type Legality,
} from '../domain/scryfall-query.js';

export type { Legality } from '../domain/scryfall-query.js';

/** Maximum suggestions returned/cached for a single autocomplete query. */
const MAX_SUGGESTIONS = 20;

/**
 * Request headers sent on every Scryfall call. Scryfall REJECTS requests that
 * use an HTTP library's default User-Agent (HTTP 400 "generic_user_agent"), so
 * a descriptive User-Agent is REQUIRED — not optional — per Scryfall's API
 * guidelines. `Accept` is set to JSON as recommended.
 */
const SCRYFALL_HEADERS = {
  'User-Agent': 'edh-deck-challenge/1.0 (https://github.com/rach0022/edh-deck-challenge)',
  Accept: 'application/json',
} as const;

/**
 * Raised when a Scryfall search/lookup times out or the upstream API is
 * unavailable. The autocomplete route maps this to a non-fatal error
 * indication so the user can keep typing (Req 4.8).
 */
export class ScryfallUnavailableError extends Error {
  constructor(message = 'Scryfall is temporarily unavailable.') {
    super(message);
    this.name = 'ScryfallUnavailableError';
  }
}

/** A single autocomplete suggestion / resolved card printing. */
export interface CardSuggestion {
  /** Display name, e.g. "Sol Ring". */
  name: string;
  /** art_crop / small image for the suggestion row and later result art. */
  imageUrl: string | null;
  setCode: string;
  collectorNumber: string;
  scryfallId: string | null;
  /** Cheapest known USD price for the printing, or null if unavailable. */
  usd: number | null;
}

/**
 * Full-ish card details resolved from a Scryfall id — used to enrich EDHREC
 * recommendations with a type line, images, and price. Keyed by scryfall id.
 */
export interface CardDetails {
  scryfallId: string;
  name: string;
  /** Full Scryfall type line, e.g. "Legendary Creature — Dwarf Scout". */
  typeLine: string;
  /** Art crop (compact) image, or null. */
  art: string | null;
  /** Full card image (normal), or null. */
  imageUrl: string | null;
  usd: number | null;
}

export interface ScryfallService {
  /** Suggestions restricted to legal commanders (is:commander). */
  searchCommanders(query: string): Promise<CardSuggestion[]>;
  /** Suggestions restricted to legal companions (is:companion). */
  searchCompanions(query: string): Promise<CardSuggestion[]>;
  /** Exact-name lookup for validation + art/price; null if not found. */
  getCardByName(name: string): Promise<CardSuggestion | null>;
  /**
   * Batch-resolves card details by Scryfall id (type line, images, price) via
   * the /cards/collection endpoint (<=75 ids/request). Returns a Map keyed by
   * scryfall id; ids Scryfall can't resolve are simply absent from the map.
   * Individual batch failures degrade to "absent" rather than throwing.
   */
  getCardsByIds(ids: string[]): Promise<Map<string, CardDetails>>;
  /**
   * Resolves the cheapest USD price across *all commander-legal printings* of
   * an exact card name (non-foil price preferred, foil as a fallback per
   * printing). Returns null when the card has no known price or isn't legal in
   * Commander. Cached per card name. A Scryfall outage degrades to null rather
   * than throwing so a corpus build can proceed.
   */
  getCheapestUsdByName(cardName: string): Promise<number | null>;
}

// ─── Scryfall API response shapes (only the fields we consume) ───────────────

interface ScryfallCard {
  id?: string;
  name?: string;
  type_line?: string;
  set?: string;
  collector_number?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
  };
  card_faces?: Array<{
    image_uris?: {
      small?: string;
      normal?: string;
      large?: string;
      art_crop?: string;
    };
  }>;
  prices?: {
    usd?: string | number | null;
    usd_foil?: string | number | null;
    [key: string]: unknown;
  };
}

interface ScryfallSearchResponse {
  object?: string;
  total_cards?: number;
  data?: ScryfallCard[];
}

/**
 * Coerces a Scryfall price field (string, number, null, or missing) into a
 * positive number, or null if unavailable/invalid.
 */
function coercePrice(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Sleeps for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses an HTTP `Retry-After` header into milliseconds. Supports both the
 * delta-seconds form (e.g. "5") and the HTTP-date form. Returns 0 when the
 * header is absent or unparseable, letting the caller fall back to its own
 * backoff schedule.
 */
function parseRetryAfterMs(header: string | null): number {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return 0;
}

/**
 * Reduces a list of Scryfall printings to the cheapest known USD price. Each
 * printing contributes its non-foil `usd` when present, otherwise its
 * `usd_foil`; printings with no usable price are skipped. Returns null when no
 * printing has a price. Exported for unit testing the cheapest-of logic.
 */
export function cheapestPrintingUsd(cards: readonly ScryfallCard[]): number | null {
  let cheapest: number | null = null;
  for (const card of cards) {
    const price = coercePrice(card.prices?.usd) ?? coercePrice(card.prices?.usd_foil);
    if (price == null) continue;
    if (cheapest == null || price < cheapest) cheapest = price;
  }
  return cheapest;
}

/**
 * Picks the best available image for display, preferring art_crop, then
 * normal, then small. Falls back to the front face for double-faced cards.
 */
function pickImageUrl(card: ScryfallCard): string | null {
  const uris = card.image_uris ?? card.card_faces?.[0]?.image_uris;
  return uris?.art_crop ?? uris?.normal ?? uris?.small ?? null;
}

/** Maps a raw Scryfall card into a display-ready CardSuggestion. */
function toSuggestion(card: ScryfallCard): CardSuggestion {
  return {
    name: card.name ?? '',
    imageUrl: pickImageUrl(card),
    setCode: card.set ?? '',
    collectorNumber: card.collector_number ?? '',
    scryfallId: card.id ?? null,
    usd: coercePrice(card.prices?.usd) ?? coercePrice(card.prices?.usd_foil),
  };
}

/** Picks the art-crop image (compact), falling back to DFC front face. */
function pickArtCrop(card: ScryfallCard): string | null {
  const uris = card.image_uris ?? card.card_faces?.[0]?.image_uris;
  return uris?.art_crop ?? null;
}

/** Picks the full card image (normal), falling back to DFC front face. */
function pickFullImage(card: ScryfallCard): string | null {
  const uris = card.image_uris ?? card.card_faces?.[0]?.image_uris;
  return uris?.normal ?? uris?.large ?? uris?.small ?? null;
}

/** Maps a raw Scryfall card into enrichment CardDetails (requires an id). */
function toDetails(card: ScryfallCard): CardDetails | null {
  if (!card.id) return null;
  return {
    scryfallId: card.id,
    name: card.name ?? '',
    typeLine: card.type_line ?? '',
    art: pickArtCrop(card),
    imageUrl: pickFullImage(card),
    usd: coercePrice(card.prices?.usd) ?? coercePrice(card.prices?.usd_foil),
  };
}

export function createScryfallService(
  config: AppConfig,
  cache: CacheService,
): ScryfallService {
  /**
   * Performs a GET against Scryfall with an AbortController timeout of
   * `config.scryfallTimeoutMs`. Returns the parsed JSON body plus HTTP status.
   * Throws `ScryfallUnavailableError` only on timeout/network failure — HTTP
   * error statuses are returned to the caller to interpret (a 404 from the
   * exact-name endpoint means "not found", not "unavailable").
   *
   * Automatically retries on HTTP 429 (rate limited) with exponential backoff,
   * honoring the `Retry-After` response header when present. Scryfall throttles
   * aggressively when a client bursts requests, so a single transient 429 must
   * not be surfaced as "no price" — that would silently blank out most cards
   * during a corpus build. After exhausting retries the 429 is returned to the
   * caller like any other status.
   */
  async function scryfallGet(url: string): Promise<{ status: number; body: unknown }> {
    const maxRetries = 4;
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.scryfallTimeoutMs);
      try {
        const res = await fetch(url, {
          headers: SCRYFALL_HEADERS,
          signal: controller.signal,
        });

        // Rate limited: back off and retry (honoring Retry-After) unless we've
        // run out of attempts.
        if (res.status === 429 && attempt < maxRetries) {
          clearTimeout(timer);
          const retryAfter = parseRetryAfterMs(res.headers.get('retry-after'));
          // Exponential backoff (1s, 2s, 4s, 8s) with jitter, floored by any
          // server-provided Retry-After hint.
          const backoff = Math.max(retryAfter, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
          console.warn(`Scryfall rate limited (429); retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries}).`);
          await sleep(backoff);
          continue;
        }

        // Scryfall returns JSON for both success and error payloads.
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        return { status: res.status, body };
      } catch (error) {
        // AbortError (timeout) or a network failure — neither is recoverable here.
        console.error('Scryfall request failed:', error);
        throw new ScryfallUnavailableError();
      } finally {
        clearTimeout(timer);
      }
    }
  }

  /**
   * POSTs a JSON body to Scryfall with the same timeout/headers as scryfallGet.
   * Used by the /cards/collection batch endpoint.
   */
  async function scryfallPost(
    url: string,
    payload: unknown,
  ): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.scryfallTimeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...SCRYFALL_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } catch (error) {
      console.error('Scryfall collection request failed:', error);
      throw new ScryfallUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Shared autocomplete implementation for a given legality. Enforces the
   * 2-character minimum, serves from cache when possible, otherwise queries
   * Scryfall, caps at 20 results, and caches the outcome.
   */
  async function search(query: string, legality: Legality): Promise<CardSuggestion[]> {
    // Too short → no network call, no cache write (Req 4.7).
    if (!meetsMinimumLength(query)) return [];

    // 1. Cache hit skips the Scryfall call entirely (Req 4.6).
    const cacheKey = buildAutocompleteCacheKey(query, legality);
    const cached = await cache.get<CardSuggestion[]>(cacheKey);
    if (cached) return cached;

    // 2. Query Scryfall via the pure query builder (Req 4.1–4.4).
    const q = buildScryfallQueryParam(query, legality);
    const url = `${config.scryfallBaseUrl}/cards/search?q=${q}`;
    const { status, body } = await scryfallGet(url);

    // Scryfall answers 404 with an error object when nothing matches — that is
    // a valid "no results" outcome, not a failure (Req 4.7).
    if (status === 404) {
      await cache.set(cacheKey, [], config.cacheTtlSeconds);
      return [];
    }
    if (status < 200 || status >= 300) {
      throw new ScryfallUnavailableError(`Scryfall search returned HTTP ${status}.`);
    }

    const data = (body as ScryfallSearchResponse | null)?.data ?? [];
    const suggestions = data.slice(0, MAX_SUGGESTIONS).map(toSuggestion);

    // 3. Cache the outcome (including empty results) with the configured TTL.
    await cache.set(cacheKey, suggestions, config.cacheTtlSeconds);
    return suggestions;
  }

  return {
    searchCommanders(query: string): Promise<CardSuggestion[]> {
      return search(query, 'commander');
    },

    searchCompanions(query: string): Promise<CardSuggestion[]> {
      return search(query, 'companion');
    },

    async getCardByName(name: string): Promise<CardSuggestion | null> {
      const trimmed = name.trim();
      if (!trimmed) return null;

      const cacheKey = `edh:scryfall:named:${trimmed.toLowerCase()}`;
      const cached = await cache.get<CardSuggestion | null>(cacheKey);
      // Distinguish a cached miss (null value stored) from an absent entry.
      if (cached !== null) return cached;

      const url = `${config.scryfallBaseUrl}/cards/named?exact=${encodeURIComponent(trimmed)}`;
      const { status, body } = await scryfallGet(url);

      if (status === 404) {
        await cache.set(cacheKey, null, config.cacheTtlSeconds);
        return null;
      }
      if (status < 200 || status >= 300) {
        throw new ScryfallUnavailableError(`Scryfall lookup returned HTTP ${status}.`);
      }

      const suggestion = toSuggestion(body as ScryfallCard);
      await cache.set(cacheKey, suggestion, config.cacheTtlSeconds);
      return suggestion;
    },

    async getCheapestUsdByName(cardName: string): Promise<number | null> {
      const trimmed = cardName.trim();
      if (!trimmed) return null;

      // Serve from cache first (null is a valid, cacheable outcome — distinguish
      // an absent entry from a cached "no price" using a sentinel wrapper).
      const cacheKey = buildCheapestPrintingCacheKey(trimmed);
      const cached = await cache.get<{ usd: number | null }>(cacheKey);
      if (cached) return cached.usd;

      // `unique=prints` returns one row per printing; `order=usd` puts the
      // cheapest first, but we still reduce defensively across the page in case
      // some rows lack a price.
      const q = buildCheapestPrintingQueryParam(trimmed);
      const url = `${config.scryfallBaseUrl}/cards/search?q=${q}&unique=prints&order=usd&dir=asc`;

      let usd: number | null = null;
      try {
        const { status, body } = await scryfallGet(url);
        // 404 = no commander-legal printing matched → no price.
        if (status === 404) {
          usd = null;
        } else if (status < 200 || status >= 300) {
          // Unexpected status: don't poison the cache, just return null.
          console.error(`Scryfall cheapest-printing returned HTTP ${status}.`);
          return null;
        } else {
          const data = (body as ScryfallSearchResponse | null)?.data ?? [];
          usd = cheapestPrintingUsd(data);
        }
      } catch {
        // Scryfall unavailable — degrade to null without caching.
        return null;
      }

      await cache.set(cacheKey, { usd }, config.cacheTtlSeconds);
      return usd;
    },

    async getCardsByIds(ids: string[]): Promise<Map<string, CardDetails>> {
      const result = new Map<string, CardDetails>();

      // De-duplicate ids (a card can appear in multiple EDHREC sections) and
      // serve per-id from cache where possible to shrink the batch.
      const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
      const misses: string[] = [];
      for (const id of unique) {
        const cached = await cache.get<CardDetails | null>(`edh:scryfall:card:${id}`);
        if (cached) result.set(id, cached);
        else misses.push(id);
      }
      if (misses.length === 0) return result;

      // Scryfall's collection endpoint accepts up to 75 identifiers per call.
      const BATCH = 75;
      const url = `${config.scryfallBaseUrl}/cards/collection`;
      for (let i = 0; i < misses.length; i += BATCH) {
        const chunk = misses.slice(i, i + BATCH);
        try {
          const { status, body } = await scryfallPost(url, {
            identifiers: chunk.map((id) => ({ id })),
          });
          if (status < 200 || status >= 300) {
            // A failed batch degrades to "absent" for those ids — the build
            // still renders, just without enrichment for the missing cards.
            console.error(`Scryfall collection returned HTTP ${status}.`);
            continue;
          }
          const data = (body as ScryfallSearchResponse | null)?.data ?? [];
          for (const raw of data) {
            const details = toDetails(raw);
            if (details) {
              result.set(details.scryfallId, details);
              await cache.set(
                `edh:scryfall:card:${details.scryfallId}`,
                details,
                config.cacheTtlSeconds,
              );
            }
          }
        } catch {
          // ScryfallUnavailableError from a batch — skip this chunk, keep going.
          continue;
        }
      }

      return result;
    },
  };
}
