/**
 * Build-a-Commander orchestrator service — turns a `CommanderSelection` and a
 * Moxfield username into a `BuildCommanderResponse`.
 *
 * This service is the coordination layer for the "Build a Commander" feature.
 * It mirrors `cedh.ts`'s `fetchAndMatch`: it emits the same SSE progress
 * phases used by `LoadingPage`, fans out to the Moxfield, EDHREC and FX
 * services (all fronted by the cache), delegates every piece of pure logic to
 * the domain modules, and caches the assembled result.
 *
 * Responsibilities:
 *   1. Fetch the user's commander decks (Moxfield) and build the Owned_Card_Set
 *      + source-deck index from them (`domain/build-commander-split.ts`).
 *   2. Fetch EDHREC's recommendations for the selection (EDHREC service).
 *   3. Partition the recommendations into owned / to-buy, attaching each owned
 *      card's source decks (`domain/build-commander-split.ts`).
 *   4. Price the to-buy cards to CAD using the cached FX rate
 *      (`domain/build-commander-pricing.ts` + FX service).
 *   5. Assemble and cache the `BuildCommanderResponse` under the build cache
 *      key (`domain/selection-key.ts`).
 *
 * Ownership is derived **only** from the user's decks — there is no
 * collection/binder request (Req 6.5). If the user has no commander decks the
 * owned set is empty, every recommendation is classified to-buy, and the
 * response's `noDecks` flag is set (Req 12.5).
 */

import type { AppConfig } from '../config.js';
import type { CacheService } from './cache.js';
import type { MoxfieldService } from './moxfield.js';
import type { EdhrecService } from './edhrec.js';
import type { FxService } from './fx.js';
import type { ScryfallService } from './scryfall.js';
import type { ProgressCallback } from './challenge.js';
import { extractDeckCardNames, extractDeckBoardCards } from './cedh.js';
import {
  buildOwnedCardIndex,
  partitionRecommendations,
  type UserDeckCards,
} from '../domain/build-commander-split.js';
import { computeBuyListTotalCad, priceCards } from '../domain/build-commander-pricing.js';
import { buildSections } from '../domain/build-commander-sections.js';
import { buildCacheKey } from '../domain/selection-key.js';
import { classifyCardType } from '../domain/card-type.js';
import type {
  BuildCommanderCard,
  BuildCommanderResponse,
  CommanderImage,
  CommanderSelection,
} from '../types.js';

export interface BuildCommanderService {
  getResult(
    selection: CommanderSelection,
    username: string,
    onProgress?: ProgressCallback,
  ): Promise<{ data: BuildCommanderResponse; cached: boolean }>;
  refreshResult(
    selection: CommanderSelection,
    username: string,
  ): Promise<BuildCommanderResponse>;
}

export function createBuildCommanderService(
  config: AppConfig,
  cache: CacheService,
  moxfield: MoxfieldService,
  edhrec: EdhrecService,
  fx: FxService,
  scryfall: ScryfallService,
): BuildCommanderService {
  /**
   * Enriches cards in-place-ish (returns new objects) with Scryfall data:
   * card type (for section sub-grouping), art + full image (for the owned
   * gallery), and USD price (for the buy list). Cards whose id Scryfall can't
   * resolve keep their defaults (cardType 'Other', null images/price).
   */
  async function enrichCards(
    cards: BuildCommanderCard[],
  ): Promise<BuildCommanderCard[]> {
    const ids = cards
      .map((c) => c.scryfallId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length === 0) return cards;

    const details = await scryfall.getCardsByIds(ids);
    return cards.map((card) => {
      const d = card.scryfallId ? details.get(card.scryfallId) : undefined;
      if (!d) return card;
      return {
        ...card,
        cardType: classifyCardType(d.typeLine),
        art: d.art,
        imageUrl: d.imageUrl,
        usd: d.usd,
      };
    });
  }

  /**
   * Resolves the selected commander (and partner) to full card images for the
   * page header. Each name is looked up by exact name (giving its Scryfall id),
   * then a single batch fetch pulls the full "normal" card image. Names that
   * can't be resolved are omitted rather than failing the build — the header
   * simply falls back to text. A Scryfall outage degrades to no images.
   */
  async function resolveCommanderImages(
    selection: CommanderSelection,
  ): Promise<CommanderImage[]> {
    const names = [selection.commander, selection.partner].filter(
      (n): n is string => typeof n === 'string' && n.trim().length > 0,
    );
    if (names.length === 0) return [];

    try {
      // name -> scryfall id (+ name), in selection order.
      const resolved = await Promise.all(
        names.map(async (name) => {
          const card = await scryfall.getCardByName(name);
          return { name, scryfallId: card?.scryfallId ?? null };
        }),
      );

      // Batch-fetch full images for the ids we found.
      const ids = resolved
        .map((r) => r.scryfallId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      const details = ids.length > 0 ? await scryfall.getCardsByIds(ids) : new Map();

      return resolved.map((r) => {
        const d = r.scryfallId ? details.get(r.scryfallId) : undefined;
        return {
          name: r.name,
          imageUrl: d?.imageUrl ?? null,
          scryfallId: r.scryfallId,
        };
      });
    } catch {
      // Scryfall unavailable — header falls back to text.
      return names.map((name) => ({ name, imageUrl: null, scryfallId: null }));
    }
  }
  /**
   * Fetches the user's decks and reduces each to its name + raw card names,
   * emitting `connecting` / `connected` / `loading-decks` progress along the
   * way. Returns an empty array when the user has no commander decks
   * (Req 12.5) — the caller uses that to drive the no-decks path.
   */
  async function loadUserDecks(
    username: string,
    emit: ProgressCallback,
  ): Promise<UserDeckCards[]> {
    emit({ phase: 'connecting', message: 'Connecting to Moxfield...', progress: 5 });
    const summaries = await moxfield.fetchUserDecks(username);
    emit({
      phase: 'connected',
      message: `Found ${summaries.length} decks`,
      progress: 15,
      detail: `${summaries.length} commander decks found`,
    });

    const decks: UserDeckCards[] = [];
    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      const progress = 15 + Math.round(((i + 1) / Math.max(summaries.length, 1)) * 45);
      emit({
        phase: 'loading-decks',
        message: `Loading deck ${i + 1} of ${summaries.length}`,
        progress,
        detail: summary.name,
      });

      const detail = await moxfield.fetchDeckDetail(summary.publicId);
      decks.push({
        name: detail.name,
        cardNames: extractDeckCardNames(detail),
        boardCards: extractDeckBoardCards(detail),
      });
    }

    return decks;
  }

  /**
   * The core pipeline: decks → owned set → recommendations → owned/to-buy
   * split → CAD-priced to-buy cards → assembled response. Shared by
   * `getResult` (cache miss) and `refreshResult`.
   */
  async function fetchAndBuild(
    selection: CommanderSelection,
    username: string,
    onProgress?: ProgressCallback,
  ): Promise<BuildCommanderResponse> {
    const emit = onProgress ?? (() => {});

    // 1. Fetch the user's decks and build the owned set + source-deck index.
    //    No decks → empty owned set, everything is to-buy (Req 12.5).
    const decks = await loadUserDecks(username, emit);
    const noDecks = decks.length === 0;
    const index = buildOwnedCardIndex(decks);

    // 2. Fetch EDHREC's recommendations for the selection (Req 5).
    emit({
      phase: 'matching',
      message: 'Fetching recommendations...',
      progress: 70,
      detail: selection.commander,
    });
    const {
      recommendations,
      rank: edhrecRank,
      numDecks: edhrecNumDecks,
    } = await edhrec.getRecommendations(selection);

    // Preserve EDHREC's panel order for section ordering on the results page.
    const sectionOrder: string[] = [];
    for (const rec of recommendations) {
      const name = rec.category || 'Other';
      if (!sectionOrder.includes(name)) sectionOrder.push(name);
    }

    // 3. Partition into owned / to-buy, attaching each owned card's source
    //    decks (Req 6.3, 6.4, 10.1, 10.3).
    const split = partitionRecommendations(recommendations, index);

    // 4. Enrich every card with Scryfall type/image/price so the results page
    //    can sub-group by card type and show owned cards as images.
    emit({
      phase: 'finalizing',
      message: 'Loading card details...',
      progress: 85,
      detail: `${recommendations.length} cards`,
    });
    const [ownedEnriched, toBuyEnrichedRaw, commanderImages] = await Promise.all([
      enrichCards(split.ownedCards),
      enrichCards(split.toBuyCards),
      resolveCommanderImages(selection),
    ]);

    // 5. Price the to-buy cards to CAD using the cached FX rate (Req 8).
    emit({
      phase: 'finalizing',
      message: 'Pricing buy list...',
      progress: 92,
      detail: `${split.toBuyCount} cards to buy`,
    });
    const fxInfo = await fx.getUsdToCad();
    const ownedCards = ownedEnriched;
    const toBuyCards = priceCards(toBuyEnrichedRaw, fxInfo.usdToCad);
    const buyListTotalCad = computeBuyListTotalCad(toBuyCards);

    // 6. Group into EDHREC sections → card-type sub-groups for the page.
    const sections = buildSections(ownedCards, toBuyCards, sectionOrder);

    // 7. Assemble the response (flat lists retained for the summary + tests).
    return {
      username,
      selection,
      sections,
      commanderImages,
      ownedCards,
      toBuyCards,
      ownedCount: split.ownedCount,
      toBuyCount: split.toBuyCount,
      buyListTotalCad,
      deckCount: index.deckCount,
      fx: fxInfo,
      noDecks,
      edhrecRank,
      edhrecNumDecks,
    };
  }

  return {
    async getResult(selection, username, onProgress) {
      const key = buildCacheKey(username, selection);

      // Cache hit → return without touching Moxfield/EDHREC (Req 11.2).
      onProgress?.({ phase: 'cache-check', message: 'Checking cache...', progress: 2 });
      const cached = await cache.get<BuildCommanderResponse>(key);
      if (cached) {
        onProgress?.({ phase: 'complete', message: 'Loaded from cache!', progress: 100 });
        return { data: cached, cached: true };
      }

      // Cache miss — build fresh and cache under the TTL (Req 11.1, 11.3).
      const data = await fetchAndBuild(selection, username, onProgress);
      await cache.set(key, data, config.cacheTtlSeconds);
      onProgress?.({ phase: 'complete', message: 'Done!', progress: 100 });
      return { data, cached: false };
    },

    async refreshResult(selection, username) {
      // Force a recompute: delete the cached result, rebuild, and re-cache
      // (Req 11.4).
      const key = buildCacheKey(username, selection);
      await cache.delete(key);
      const data = await fetchAndBuild(selection, username);
      await cache.set(key, data, config.cacheTtlSeconds);
      return data;
    },
  };
}
