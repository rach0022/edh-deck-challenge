/**
 * EDHREC recommendation service.
 *
 * Turns a `CommanderSelection` into EDHREC's recommended card list by
 * fetching EDHREC's (unofficial) commander JSON endpoint through the shared
 * Puppeteer browser (Req 5.1) — the same Cloudflare-cleared browser Moxfield
 * uses — and parsing the payload into a flat `EdhrecRecommendation[]`.
 *
 * All the fragile bits are delegated to pure, unit-tested domain modules:
 *   - slug building lives in `domain/edhrec-slug.ts`
 *   - payload parsing + the companion constraint live in `domain/edhrec-parser.ts`
 *   - the cache-key shape lives in `domain/selection-key.ts`
 *
 * This service only orchestrates: build the slug, fetch (with a timeout),
 * parse, apply the companion constraint, and cache the result — translating
 * HTTP status and browser/timeout failures into typed EDHREC errors.
 */

import type { AppConfig } from '../config.js';
import type { CacheService } from './cache.js';
import type { BrowserService } from './browser.js';
import type { CommanderSelection, EdhrecRecommendation } from '../types.js';
import { buildEdhrecSlug, commanderSlug } from '../domain/edhrec-slug.js';
import {
  parseCommanderRank,
  parseEdhrecRecommendations,
  parseRecommendationsForSelection,
} from '../domain/edhrec-parser.js';
import { selectionKey } from '../domain/selection-key.js';

/** Thrown when EDHREC has no page for the resolved commander slug (404). */
export class EdhrecNotFoundError extends Error {
  constructor(slug: string) {
    super(`EDHREC has no recommendations for "${slug}".`);
    this.name = 'EdhrecNotFoundError';
  }
}

/** Thrown when the EDHREC fetch times out or the endpoint is unreachable. */
export class EdhrecTimeoutError extends Error {
  constructor() {
    super('Could not reach EDHREC. The service may be temporarily unavailable.');
    this.name = 'EdhrecTimeoutError';
  }
}

/** The result of an EDHREC lookup: the slug used plus the parsed recommendations. */
export interface EdhrecResult {
  /** The resolved slug used, for logging/debugging + cache traceability. */
  slug: string;
  recommendations: EdhrecRecommendation[];
  /** The commander's overall EDHREC rank (1 = most played), or null. */
  rank: number | null;
  /** How many EDHREC decks run this commander, or null. */
  numDecks: number | null;
}

export interface EdhrecService {
  getRecommendations(selection: CommanderSelection): Promise<EdhrecResult>;
}

/** Cache-key prefix for EDHREC recommendation lookups. */
const EDHREC_CACHE_PREFIX = 'edh:edhrec:';

export function createEdhrecService(
  config: AppConfig,
  cache: CacheService,
  browser: BrowserService,
): EdhrecService {
  /**
   * Runs a browser fetch against `url`, racing it against the configured
   * EDHREC timeout. A browser failure or an exceeded timeout both surface as
   * an `EdhrecTimeoutError` so callers get a single "unreachable" signal.
   */
  async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new EdhrecTimeoutError()), config.edhrecTimeoutMs);
    });

    try {
      return await Promise.race([browser.browserFetch(url), timeout]);
    } catch (error) {
      // A stale/unreachable browser (BrowserFetchError) or the timeout above
      // both mean we could not reach EDHREC.
      if (error instanceof EdhrecTimeoutError) throw error;
      throw new EdhrecTimeoutError();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Builds the EDHREC commander JSON URL for a slug.
   *
   * EDHREC's JSON lives under the `/pages/` prefix
   * (`https://json.edhrec.com/pages/commanders/<slug>.json`); the bare
   * `/commanders/<slug>.json` path returns 403 AccessDenied.
   */
  function commanderUrl(slug: string): string {
    return `${config.edhrecBaseUrl}/pages/commanders/${slug}.json`;
  }

  /**
   * Fetches EDHREC's commander JSON for a slug, mapping HTTP status to typed
   * errors: 404 → `EdhrecNotFoundError`, any other non-2xx → treated as
   * unreachable (`EdhrecTimeoutError`).
   */
  async function fetchPayload(slug: string): Promise<unknown> {
    const { status, body } = await fetchJson(commanderUrl(slug));

    if (status === 404) {
      throw new EdhrecNotFoundError(slug);
    }
    if (status < 200 || status >= 300) {
      throw new EdhrecTimeoutError();
    }
    return body;
  }

  /**
   * When a companion is selected, resolves the set of card names EDHREC
   * considers legal under that companion by fetching the companion's own
   * EDHREC page and flattening its recommendations to their names. A missing
   * or unreachable companion page yields an empty legal set (which constrains
   * the recommendations to nothing), never an error.
   */
  async function fetchCompanionLegalNames(companion: string): Promise<string[]> {
    try {
      const payload = await fetchPayload(commanderSlug(companion));
      return parseEdhrecRecommendations(payload).map((rec) => rec.name);
    } catch {
      // The companion segment is a best-effort narrowing; if it can't be
      // fetched, fall back to an empty legal set rather than failing the
      // whole request.
      return [];
    }
  }

  async function getRecommendations(selection: CommanderSelection): Promise<EdhrecResult> {
    const slug = buildEdhrecSlug(selection);
    const cacheKey = `${EDHREC_CACHE_PREFIX}${selectionKey(selection)}`;

    // 1. Cache hit → return without touching EDHREC (Req 5.5).
    const cached = await cache.get<EdhrecResult>(cacheKey);
    if (cached) return cached;

    // 2. Fetch the commander (or partnered pairing) payload (Req 5.1, 5.2).
    const payload = await fetchPayload(slug);

    // 3. Resolve the companion legal set when a companion is present (Req 5.3).
    const companionLegalNames = selection.companion
      ? await fetchCompanionLegalNames(selection.companion)
      : null;

    // 4. Parse + apply the companion constraint (empty/malformed → []).
    const recommendations = parseRecommendationsForSelection(
      payload,
      selection,
      companionLegalNames,
    );

    // The commander's own EDHREC rank + deck count come from the primary
    // payload's card block.
    const { rank, numDecks } = parseCommanderRank(payload);

    const result: EdhrecResult = { slug, recommendations, rank, numDecks };

    // 5. Cache the result under the selection key with the configured TTL
    //    (Req 5.4, 5.6).
    await cache.set(cacheKey, result, config.cacheTtlSeconds);

    return result;
  }

  return { getRecommendations };
}
