/**
 * cEDH match service — "Build a cEDH Deck" feature.
 *
 * Responsibilities:
 *   1. Provide the reference corpus of cEDH decks. The corpus is generated
 *      offline by scripts/build-cedh-corpus.ts and bundled as JSON. At
 *      runtime it can optionally be overridden by a cache entry (so it can be
 *      refreshed without a redeploy), falling back to the bundled file.
 *   2. Build a user's "collection" as the union of all card names across all
 *      their legal commander decks (fetched via the Moxfield service, cached).
 *   3. Rank the reference decks against that collection and return the top
 *      matches plus a per-match missing-card ("buy") list.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../config.js';
import type { CacheService } from './cache.js';
import type { MoxfieldService } from './moxfield.js';
import { extractCommanders } from '../domain/commander-extractor.js';
import { resolveColorIdentity } from '../domain/color-identity.js';
import { normalizeCardName, rankMatches } from '../domain/deck-similarity.js';
import { parseTypeLine } from '../domain/card-type.js';
import type { FxService } from './fx.js';
import type {
  CardBoard,
  CedhCorpus,
  CedhMatchResponse,
  Color,
  DecklistCard,
  MoxfieldDeckDetail,
  UserDeckSummary,
} from '../types.js';
import type { CollectionEntry } from '../domain/collection.js';
import { buildCollectionProvenance, toCollection } from '../domain/collection.js';
import type { ProgressCallback } from './challenge.js';

const CORPUS_CACHE_KEY = 'edh:cedh:corpus';

/** Number of top matches to surface on the page. */
const TOP_MATCHES = 5;

/**
 * Coerces Moxfield's price field (which may be a number, numeric string, or
 * null) into a positive number, or null if unavailable/invalid.
 */
function coercePrice(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extracts the full decklist (commanders + mainboard) from a Moxfield deck
 * detail as an array of self-contained DecklistCard objects: name, USD value,
 * parsed types, mana cost, and Scryfall id.
 *
 * Cards are de-duplicated by normalized name (Moxfield can list a card in both
 * the commander and mainboard zones); on a duplicate the cheaper value is kept.
 *
 * Shared with the build script so the corpus and the user's collection are
 * constructed identically.
 */
export function extractDeckCards(deck: MoxfieldDeckDetail): DecklistCard[] {
  const byKey = new Map<string, DecklistCard>();

  const addEntry = (entry: {
    card?: {
      name?: string;
      type_line?: string;
      mana_cost?: string;
      scryfall_id?: string;
      prices?: { usd?: unknown; usd_foil?: unknown };
    };
  }) => {
    const card = entry?.card;
    const name = card?.name;
    if (!name) return;

    const key = normalizeCardName(name);
    const value = coercePrice(card?.prices?.usd) ?? coercePrice(card?.prices?.usd_foil);

    const existing = byKey.get(key);
    if (existing) {
      // Keep the cheaper known value if the same card appears twice.
      if (value != null && (existing.value == null || value < existing.value)) {
        existing.value = value;
      }
      return;
    }

    byKey.set(key, {
      name,
      value,
      types: parseTypeLine(card?.type_line ?? ''),
      manaCost: card?.mana_cost ?? '',
      scryfallId: card?.scryfall_id ?? null,
    });
  };

  for (const entry of Object.values(deck.commanders ?? {})) addEntry(entry);
  for (const entry of Object.values(deck.mainboard ?? {})) addEntry(entry);

  return [...byKey.values()];
}

/**
 * Convenience wrapper returning just the card names (used where the full
 * card objects aren't needed, e.g. building the user's collection set).
 */
export function extractDeckCardNames(deck: MoxfieldDeckDetail): string[] {
  return extractDeckCards(deck).map((c) => c.name);
}

/**
 * Extracts every card the user has in a deck, tagged with the board it was
 * found on, for building collection provenance. Commanders count as mainboard
 * (they're always played). Covers mainboard, sideboard, and maybeboard so the
 * matchers can credit — and badge — sideboard/considering cards.
 *
 * Unlike `extractDeckCards` (which powers the reference corpus and is
 * mainboard-only), this is used only for the *user's* collection.
 */
export function extractDeckBoardCards(deck: MoxfieldDeckDetail): CollectionEntry[] {
  const entries: CollectionEntry[] = [];

  const addBoard = (
    zone: Record<string, { card?: { name?: string } }> | undefined,
    board: CardBoard,
  ) => {
    for (const entry of Object.values(zone ?? {})) {
      const name = entry?.card?.name;
      if (name) entries.push({ name, board });
    }
  };

  // Commanders are actively played → mainboard.
  addBoard(deck.commanders, 'mainboard');
  addBoard(deck.mainboard, 'mainboard');
  addBoard(deck.sideboard, 'sideboard');
  addBoard(deck.maybeboard, 'maybeboard');

  return entries;
}

export interface CedhService {
  getMatches(
    username: string,
    onProgress?: ProgressCallback,
  ): Promise<{ data: CedhMatchResponse; cached: boolean }>;
  refreshMatches(username: string): Promise<CedhMatchResponse>;
  /** Number of reference decks currently loaded (bundled or cached). */
  getCorpusSize(): Promise<number>;
}

export function createCedhService(
  config: AppConfig,
  cache: CacheService,
  moxfield: MoxfieldService,
  fx: FxService,
): CedhService {
  // Lazily load and memoize the bundled corpus file.
  let bundledCorpus: CedhCorpus | null = null;

  function loadBundledCorpus(): CedhCorpus {
    if (bundledCorpus) return bundledCorpus;
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const corpusPath = join(__dirname, '..', 'data', 'cedh-corpus.json');
      const raw = readFileSync(corpusPath, 'utf-8');
      bundledCorpus = JSON.parse(raw) as CedhCorpus;
    } catch (error) {
      console.error('⚠️  Failed to load bundled cEDH corpus:', error);
      bundledCorpus = { generatedAt: '', deckCount: 0, decks: [] };
    }
    return bundledCorpus;
  }

  /** Corpus resolution: cache override → bundled file. */
  async function getCorpus(): Promise<CedhCorpus> {
    const cached = await cache.get<CedhCorpus>(CORPUS_CACHE_KEY);
    if (cached && cached.decks.length > 0) return cached;
    return loadBundledCorpus();
  }

  function cacheKey(username: string): string {
    return `edh:cedh:match:${username.toLowerCase()}`;
  }

  async function fetchAndMatch(
    username: string,
    onProgress?: ProgressCallback,
  ): Promise<CedhMatchResponse> {
    const emit = onProgress ?? (() => {});

    emit({ phase: 'connecting', message: 'Connecting to Moxfield...', progress: 5 });
    const summaries = await moxfield.fetchUserDecks(username);
    emit({
      phase: 'connected',
      message: `Found ${summaries.length} decks`,
      progress: 15,
      detail: `${summaries.length} commander decks found`,
    });

    // Build the user's collection across ALL boards (mainboard + sideboard +
    // maybeboard), tracking which board each card came from so sideboard /
    // considering matches can be credited and badged.
    const collectionEntries: CollectionEntry[] = [];
    const userDecks: UserDeckSummary[] = [];

    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      const progress = 15 + Math.round(((i + 1) / Math.max(summaries.length, 1)) * 55);
      emit({
        phase: 'loading-decks',
        message: `Loading deck ${i + 1} of ${summaries.length}`,
        progress,
        detail: summary.name,
      });

      const detail = await moxfield.fetchDeckDetail(summary.publicId);
      const cardNames = extractDeckCardNames(detail);

      // Collect every card (all boards) tagged with its board.
      collectionEntries.push(...extractDeckBoardCards(detail));

      // Build the user-facing deck summary.
      const extraction = extractCommanders(detail);
      const colors: Color[] = extraction.skipped
        ? []
        : resolveColorIdentity(extraction.commanders);

      userDecks.push({
        publicId: detail.publicId,
        name: detail.name,
        commanders: extraction.commanders.map((c) => ({
          name: c.name,
          imageUrl: c.imageUrl,
          setCode: c.setCode,
          collectorNumber: c.collectorNumber,
        })),
        colors,
        moxfieldUrl: `https://www.moxfield.com/decks/${detail.publicId}`,
        cardCount: cardNames.length,
      });
    }

    // Rank against the reference corpus, priced in CAD using the cached rate.
    const collection = toCollection(buildCollectionProvenance(collectionEntries));
    emit({
      phase: 'matching',
      message: 'Matching against cEDH decks...',
      progress: 80,
      detail: `Comparing ${collection.size} cards`,
    });
    const corpus = await getCorpus();
    const fxInfo = await fx.getUsdToCad();
    const matches = rankMatches(corpus.decks, collection, fxInfo.usdToCad, TOP_MATCHES);

    emit({ phase: 'finalizing', message: 'Finalizing results...', progress: 95 });

    // Sort user decks by name for stable display.
    userDecks.sort((a, b) => a.name.localeCompare(b.name));

    return {
      username,
      userDecks,
      collectionSize: collection.size,
      matches,
      fx: fxInfo,
    };
  }

  return {
    async getMatches(username, onProgress) {
      onProgress?.({ phase: 'cache-check', message: 'Checking cache...', progress: 2 });
      const cached = await cache.get<CedhMatchResponse>(cacheKey(username));
      if (cached) {
        onProgress?.({ phase: 'complete', message: 'Loaded from cache!', progress: 100 });
        return { data: cached, cached: true };
      }

      const data = await fetchAndMatch(username, onProgress);
      await cache.set(cacheKey(username), data);
      onProgress?.({ phase: 'complete', message: 'Done!', progress: 100 });
      return { data, cached: false };
    },

    async refreshMatches(username) {
      await cache.delete(cacheKey(username));
      const data = await fetchAndMatch(username);
      await cache.set(cacheKey(username), data);
      return data;
    },

    async getCorpusSize() {
      const corpus = await getCorpus();
      return corpus.decks.length;
    },
  };
}
