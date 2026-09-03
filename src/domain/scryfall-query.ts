/**
 * Scryfall autocomplete query and cache-key building — pure, side-effect-free.
 *
 * The autocomplete flow proxies Scryfall searches for legal commanders and
 * companions through the backend. This module isolates the two pieces of pure
 * logic that support that flow:
 *
 *   1. Building the Scryfall search query string, applying the legality filter
 *      (`is:commander` / `is:companion`) to the user's typed text.
 *   2. Deriving a deterministic, normalization-stable cache key so that
 *      case/whitespace variants of the same query share a cached result and
 *      the two legalities never collide.
 *
 * No I/O, no network — the Scryfall service (`services/scryfall.ts`) consumes
 * these builders and performs the actual fetch/caching.
 */

/** The kind of card legality an autocomplete search is restricted to. */
export type Legality = 'commander' | 'companion';

/** Minimum number of (trimmed) characters required before a Scryfall search. */
export const MIN_QUERY_LENGTH = 2;

/** Maps a legality to its Scryfall search filter token. */
const LEGALITY_FILTER: Record<Legality, string> = {
  commander: 'is:commander',
  companion: 'is:companion',
};

/**
 * Normalizes autocomplete search text for cache-key and length purposes.
 * - trimmed
 * - internal whitespace collapsed to a single space
 * - lowercased
 *
 * Two search texts that differ only by case or surrounding/internal whitespace
 * normalize to the same value, so they share a cache entry (Property 4).
 */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Returns true when the query has enough characters to issue a Scryfall search.
 * The 2-character minimum is enforced against the normalized text so that
 * whitespace-only or single-character input is rejected.
 */
export function meetsMinimumLength(query: string): boolean {
  return normalizeQuery(query).length >= MIN_QUERY_LENGTH;
}

/**
 * Builds the raw (un-encoded) Scryfall search query for a legality:
 * `<normalizedText> <legalityFilter>`, e.g. `sol ring is:commander`.
 *
 * The legality filter (`is:commander` / `is:companion`) restricts results to
 * cards legal to serve as a commander (Req 4.1, 4.2) or as a companion
 * (Req 4.3). The user's text is included verbatim (post-normalization).
 */
export function buildScryfallQuery(query: string, legality: Legality): string {
  const text = normalizeQuery(query);
  const filter = LEGALITY_FILTER[legality];
  return text ? `${text} ${filter}` : filter;
}

/**
 * Builds the fully URL-encoded value for the Scryfall search `q` parameter,
 * suitable for interpolating into a request URL. Proxied server-side — the
 * browser never calls Scryfall directly (Req 4.4).
 */
export function buildScryfallQueryParam(query: string, legality: Legality): string {
  return encodeURIComponent(buildScryfallQuery(query, legality));
}

/**
 * Builds the deterministic, normalization-stable autocomplete cache key:
 * `edh:scryfall:<legality>:<normalizedQuery>` (Req 4.5).
 *
 * Determinism guarantees (Property 4):
 * - two queries that normalize equally produce the same key;
 * - the same query under different legalities produces different keys.
 */
export function buildAutocompleteCacheKey(query: string, legality: Legality): string {
  return `edh:scryfall:${legality}:${normalizeQuery(query)}`;
}

/**
 * Builds the raw (un-encoded) Scryfall search query that returns *every*
 * commander-legal printing of an exact card name, e.g.
 * `!"Sol Ring" legal:commander`.
 *
 * `!"…"` is Scryfall's exact-name operator (so "Bolt" won't also match
 * "Lightning Bolt"), and `legal:commander` restricts to printings of cards
 * that are legal in the Commander format. Pair this with `unique=prints` on the
 * request so Scryfall returns one row per printing rather than collapsing to a
 * single card — that's what lets the caller pick the cheapest printing.
 */
export function buildCheapestPrintingQuery(cardName: string): string {
  // Escape any embedded double-quotes so the exact-name operator stays valid.
  const safe = cardName.trim().replace(/"/g, '\\"');
  return `!"${safe}" legal:commander`;
}

/**
 * URL-encoded value for the cheapest-printing search `q` parameter. The caller
 * appends `&unique=prints` (and optionally `&order=usd`) to the request URL.
 */
export function buildCheapestPrintingQueryParam(cardName: string): string {
  return encodeURIComponent(buildCheapestPrintingQuery(cardName));
}

/**
 * Deterministic cache key for a cheapest-commander-legal-printing lookup,
 * keyed by the lowercased, whitespace-normalized card name.
 */
export function buildCheapestPrintingCacheKey(cardName: string): string {
  return `edh:scryfall:cheapest:${normalizeQuery(cardName)}`;
}
