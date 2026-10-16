/**
 * Challenge service — orchestrates Moxfield fetching, domain logic, and caching.
 * This is the main business logic layer that coordinates:
 * 1. Check cache for existing results
 * 2. If miss: fetch from Moxfield → extract commanders → organize into slots
 * 3. Cache the result
 * 4. Return to the caller
 */

import type { AppConfig } from '../config.js';
import type { CacheService } from './cache.js';
import type { MoxfieldService } from './moxfield.js';
import type { SpellbookService } from './spellbook.js';
import type { EdhrecService } from './edhrec.js';
import { EdhrecNotFoundError, EdhrecTimeoutError } from './edhrec.js';
import { extractCommanders } from '../domain/commander-extractor.js';
import { organizeDecks } from '../domain/deck-organizer.js';
import { resolveColorIdentity, colorIdentityToKey } from '../domain/color-identity.js';
import { COLOR_COMBINATIONS } from '../domain/color-combinations.js';
import { classifyCardType, CARD_TYPE_ORDER } from '../domain/card-type.js';
import { resolveDeckBracket } from '../domain/deck-bracket.js';
import { normalizeCardName } from '../domain/deck-similarity.js';
import type {
  ChallengeProgress,
  ChallengeResponse,
  DecksResponse,
  DeckDetailResponse,
  DeckSummaryResponse,
  DeckCombosData,
  SlotCategory,
  MoxfieldDeckDetail,
  CardTypeGroup,
  DeckCardInfo,
  MoxfieldCardEntry,
} from '../types.js';

export interface ProgressEvent {
  phase: string;
  message: string;
  progress: number; // 0-100
  detail?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface ChallengeService {
  getChallenge(username: string): Promise<{ data: ChallengeResponse; cached: boolean }>;
  getChallengeWithProgress(username: string, onProgress: ProgressCallback): Promise<{ data: ChallengeResponse; cached: boolean }>;
  getDecks(username: string): Promise<{ data: DecksResponse; cached: boolean }>;
  getDeckDetail(deckId: string): Promise<{ data: DeckDetailResponse; cached: boolean }>;
  refreshChallenge(username: string): Promise<ChallengeResponse>;
}

export function createChallengeService(
  config: AppConfig,
  cache: CacheService,
  moxfield: MoxfieldService,
  spellbook: SpellbookService,
  edhrec: EdhrecService,
): ChallengeService {

  function cacheKey(type: string, id: string): string {
    return `edh:${type}:${id.toLowerCase()}`;
  }

  /** EDHREC panel header that lists format-defining "Game Changer" cards. */
  const GAME_CHANGERS_CATEGORY = 'game changers';

  /**
   * Counts the EDHREC "Game Changer" cards present in a deck, for the bracket
   * estimate fallback. Best-effort: an EDHREC miss/outage yields 0 rather than
   * failing the challenge build.
   */
  async function countGameChangers(deck: MoxfieldDeckDetail): Promise<number> {
    const extraction = extractCommanders(deck);
    if (extraction.skipped || extraction.commanders.length === 0) return 0;

    const selection = {
      commander: extraction.commanders[0].name,
      partner: extraction.commanders[1]?.name ?? null,
      companion: null,
    };

    let recommendations: { name: string; category: string }[] = [];
    try {
      const result = await edhrec.getRecommendations(selection);
      recommendations = result.recommendations;
    } catch (error) {
      if (error instanceof EdhrecNotFoundError || error instanceof EdhrecTimeoutError) {
        return 0;
      }
      throw error;
    }

    const deckNames = new Set<string>();
    for (const entry of Object.values(deck.commanders ?? {})) {
      deckNames.add(normalizeCardName(entry.card.name));
    }
    for (const entry of Object.values(deck.mainboard ?? {})) {
      deckNames.add(normalizeCardName(entry.card.name));
    }

    let count = 0;
    for (const rec of recommendations) {
      if ((rec.category ?? '').toLowerCase() !== GAME_CHANGERS_CATEGORY) continue;
      if (deckNames.has(normalizeCardName(rec.name))) count++;
    }
    return count;
  }

  async function fetchAndProcessChallenge(username: string, onProgress?: ProgressCallback): Promise<ChallengeResponse> {
    const emit = onProgress ?? (() => {});

    // Phase 1: Connect to Moxfield and fetch deck list
    emit({ phase: 'connecting', message: 'Connecting to Moxfield...', progress: 5 });
    const deckSummaries = await moxfield.fetchUserDecks(username);
    emit({ phase: 'connected', message: `Found ${deckSummaries.length} decks`, progress: 15, detail: `${deckSummaries.length} commander decks found` });

    // Phase 2: Fetch detail for each deck (sequential — Moxfield rate limits)
    const deckDetails: MoxfieldDeckDetail[] = [];
    for (let i = 0; i < deckSummaries.length; i++) {
      const summary = deckSummaries[i];
      const deckProgress = 15 + Math.round(((i + 1) / deckSummaries.length) * 55);
      emit({
        phase: 'loading-decks',
        message: `Loading deck ${i + 1} of ${deckSummaries.length}`,
        progress: deckProgress,
        detail: summary.name,
      });

      const detail = await moxfield.fetchDeckDetail(summary.publicId);
      deckDetails.push(detail);

      // Cache individual deck details
      await cache.set(cacheKey('deck', summary.publicId), detail);
    }

    // Phase 3: Extract commanders and organize into slots
    emit({ phase: 'organizing', message: 'Organizing decks into color slots...', progress: 75 });
    const extractions = deckDetails.map((deck) => extractCommanders(deck));
    const progress = organizeDecks(extractions, username);

    // Phase 4: Fetch combo data for each deck (in parallel) and cache it.
    emit({ phase: 'combos', message: 'Searching for combos...', progress: 78, detail: `Checking ${deckDetails.length} decks for combos` });
    const comboResults = await Promise.all(
      deckDetails.map(async (deck) => {
        const combos = await spellbook.findCombosForDeck(deck);
        // Cache combo data for the deck
        await cache.set(cacheKey('combos', deck.publicId), combos);
        return { deckId: deck.publicId, combos };
      })
    );
    const combosByDeckId = new Map(comboResults.map((r) => [r.deckId, r.combos]));

    // Phase 5: Resolve each deck's Commander bracket. Prefer Moxfield's own
    // bracket (v3 endpoint); fall back to a Game-Changer-aware estimate built
    // from the combos (above) plus the commander's EDHREC "Game Changers".
    emit({ phase: 'brackets', message: 'Analyzing brackets...', progress: 88, detail: `Rating ${deckDetails.length} decks` });
    const bracketResults = await Promise.all(
      deckDetails.map(async (deck) => {
        const combos = combosByDeckId.get(deck.publicId);
        const comboCount = combos?.comboCount ?? 0;
        const comboList = combos?.combos ?? [];

        // Moxfield's native bracket (best-effort, authoritative when present).
        const moxBracket = await moxfield.fetchDeckBracket(deck.publicId);

        // Only pay for the EDHREC Game-Changers lookup when we actually need
        // the estimate (Moxfield gave us no usable bracket).
        const needsEstimate =
          moxBracket?.ignoreBrackets === true ||
          typeof moxBracket?.bracket !== 'number';
        const gameChangerCount = needsEstimate ? await countGameChangers(deck) : 0;

        const estimate = resolveDeckBracket({
          moxfield: moxBracket,
          comboCount,
          combos: comboList,
          gameChangerCount,
        });

        return {
          deckId: deck.publicId,
          comboCount,
          bracket: estimate.bracket,
          bracketLabel: estimate.label,
          bracketSource: estimate.source,
        };
      })
    );

    // Attach combo counts + resolved bracket to slot entries.
    const infoByDeckId = new Map(bracketResults.map((r) => [r.deckId, r]));
    for (const slot of progress.slots) {
      for (const deckEntry of slot.decks) {
        const info = infoByDeckId.get(deckEntry.deckId);
        deckEntry.comboCount = info?.comboCount ?? 0;
        deckEntry.bracket = info?.bracket;
        deckEntry.bracketLabel = info?.bracketLabel;
        deckEntry.bracketSource = info?.bracketSource;
      }
    }

    const totalCombos = bracketResults.reduce((sum, r) => sum + r.comboCount, 0);
    emit({ phase: 'finalizing', message: 'Finalizing results...', progress: 95, detail: `Found ${totalCombos} total combos` });

    // Build summary
    const categoryCounts = buildCategoryCounts(progress);
    const response: ChallengeResponse = {
      username,
      progress,
      summary: {
        filledCount: progress.filledCount,
        totalSlots: progress.totalSlots,
        percentComplete: Math.round((progress.filledCount / progress.totalSlots) * 100),
        categoryCounts,
      },
    };

    return response;
  }

  function buildCategoryCounts(progress: ChallengeProgress): Record<SlotCategory, { filled: number; total: number }> {
    const categories: SlotCategory[] = ['colorless', 'mono', 'two-color', 'three-color', 'four-color', 'five-color'];
    const counts = {} as Record<SlotCategory, { filled: number; total: number }>;

    for (const category of categories) {
      const slotsInCategory = progress.slots.filter((s) => s.category === category);
      counts[category] = {
        filled: slotsInCategory.filter((s) => s.decks.length > 0).length,
        total: slotsInCategory.length,
      };
    }

    return counts;
  }

  return {
    async getChallenge(username: string) {
      // Check cache first
      const cached = await cache.get<ChallengeResponse>(cacheKey('challenge', username));
      if (cached) {
        return { data: cached, cached: true };
      }

      // Cache miss — fetch fresh
      const data = await fetchAndProcessChallenge(username);
      await cache.set(cacheKey('challenge', username), data);

      return { data, cached: false };
    },

    async getChallengeWithProgress(username: string, onProgress: ProgressCallback) {
      // Check cache first
      onProgress({ phase: 'cache-check', message: 'Checking cache...', progress: 2 });
      const cached = await cache.get<ChallengeResponse>(cacheKey('challenge', username));
      if (cached) {
        onProgress({ phase: 'complete', message: 'Loaded from cache!', progress: 100 });
        return { data: cached, cached: true };
      }

      // Cache miss — fetch fresh with progress
      const data = await fetchAndProcessChallenge(username, onProgress);
      await cache.set(cacheKey('challenge', username), data);
      onProgress({ phase: 'complete', message: 'Done!', progress: 100 });

      return { data, cached: false };
    },

    async getDecks(username: string) {
      // Try to get from challenge cache (has all deck info)
      const challengeData = await cache.get<ChallengeResponse>(cacheKey('challenge', username));

      if (challengeData) {
        const decks = buildDecksResponse(challengeData);
        return { data: decks, cached: true };
      }

      // Need to fetch fresh
      const freshChallenge = await fetchAndProcessChallenge(username);
      await cache.set(cacheKey('challenge', username), freshChallenge);
      const decks = buildDecksResponse(freshChallenge);

      return { data: decks, cached: false };
    },

    async getDeckDetail(deckId: string) {
      // Check deck cache
      const cachedDeck = await cache.get<MoxfieldDeckDetail>(cacheKey('deck', deckId));
      if (cachedDeck) {
        const detail = buildDeckDetailResponse(cachedDeck);
        // Check for cached combo data
        const cachedCombos = await cache.get<DeckCombosData>(cacheKey('combos', deckId));
        if (cachedCombos) {
          detail.combos = cachedCombos;
        } else {
          // Fetch combos fresh if not cached
          const combos = await spellbook.findCombosForDeck(cachedDeck);
          await cache.set(cacheKey('combos', deckId), combos);
          detail.combos = combos;
        }
        annotateCardComboCounts(detail);
        return { data: detail, cached: true };
      }

      // Fetch single deck
      const deck = await moxfield.fetchDeckDetail(deckId);
      await cache.set(cacheKey('deck', deckId), deck);
      const detail = buildDeckDetailResponse(deck);

      // Fetch combos
      const combos = await spellbook.findCombosForDeck(deck);
      await cache.set(cacheKey('combos', deckId), combos);
      detail.combos = combos;
      annotateCardComboCounts(detail);

      return { data: detail, cached: false };
    },

    async refreshChallenge(username: string) {
      // Delete cached data and fetch fresh
      await cache.delete(cacheKey('challenge', username));
      const data = await fetchAndProcessChallenge(username);
      await cache.set(cacheKey('challenge', username), data);
      return data;
    },
  };
}

function buildDecksResponse(challenge: ChallengeResponse): DecksResponse {
  const decks: DeckSummaryResponse[] = [];

  for (const slot of challenge.progress.slots) {
    for (const deck of slot.decks) {
      decks.push({
        id: deck.deckId,
        name: deck.deckName,
        commanders: deck.commanders,
        colorIdentityKey: slot.key,
        colorSlotName: slot.name,
        moxfieldUrl: `https://moxfield.com/decks/${deck.deckId}`,
        lastUpdated: '', // Not available from cached progress
      });
    }
  }

  return {
    username: challenge.username,
    decks,
    totalDecks: decks.length,
  };
}

function buildDeckDetailResponse(deck: MoxfieldDeckDetail): DeckDetailResponse {
  const extraction = extractCommanders(deck);
  const colorIdentity = extraction.skipped
    ? []
    : resolveColorIdentity(extraction.commanders);
  const key = colorIdentityToKey(colorIdentity);
  const slotDef = COLOR_COMBINATIONS.find((c) => c.key === key);

  // Group mainboard cards by type
  const cardsByType = groupCardsByType(deck.mainboard);

  return {
    id: deck.publicId,
    name: deck.name,
    commanders: extraction.commanders.map((c) => ({
      name: c.name,
      imageUrl: c.imageUrl,
      setCode: c.setCode,
      collectorNumber: c.collectorNumber,
    })),
    colorIdentityKey: key,
    colorSlotName: slotDef?.name ?? 'Unknown',
    moxfieldUrl: `https://moxfield.com/decks/${deck.publicId}`,
    // Total = command zone + mainboard. Moxfield stores the commander(s)
    // separately from the mainboard, so a 100-card Commander deck has 99
    // mainboard entries + 1 commander; summing only the mainboard undercounts
    // by the number of commanders (showing 99 instead of 100).
    cardCount:
      Object.values(deck.commanders ?? {}).reduce((sum, e) => sum + e.quantity, 0) +
      Object.values(deck.mainboard).reduce((sum, e) => sum + e.quantity, 0),
    cardsByType,
  };
}

/**
 * Annotates each card in the deck detail with the number of complete combos
 * (present in the deck) and potential combos (almost-included, missing one card)
 * that the card participates in. Uses the combo data attached to the detail.
 */
function annotateCardComboCounts(detail: DeckDetailResponse): void {
  const combos = detail.combos;
  if (!combos) return;

  const comboCounts = new Map<string, number>();
  const potentialCounts = new Map<string, number>();

  for (const combo of combos.combos) {
    for (const card of combo.cards) {
      comboCounts.set(card.name, (comboCounts.get(card.name) ?? 0) + 1);
    }
  }

  for (const combo of combos.almostIncluded ?? []) {
    for (const card of combo.cards) {
      potentialCounts.set(card.name, (potentialCounts.get(card.name) ?? 0) + 1);
    }
  }

  for (const group of detail.cardsByType) {
    for (const card of group.cards) {
      card.comboCount = comboCounts.get(card.name) ?? 0;
      card.potentialComboCount = potentialCounts.get(card.name) ?? 0;
    }
  }
}


/**
 * Categorizes cards into type groups based on the type_line.
 * Order and classification come from the shared domain module.
 */

function groupCardsByType(mainboard: Record<string, MoxfieldCardEntry>): CardTypeGroup[] {
  const groups = new Map<string, DeckCardInfo[]>();

  for (const entry of Object.values(mainboard)) {
    const { card, quantity } = entry;
    const typeLine = card.type_line ?? '';
    const type = classifyCardType(typeLine);

    const imageUrl = card.image_uris?.normal
      ?? card.card_faces?.[0]?.image_uris?.normal
      ?? null;

    const cardInfo: DeckCardInfo = {
      name: card.name,
      quantity,
      manaCost: card.mana_cost ?? '',
      cmc: card.cmc ?? 0,
      typeLine,
      setCode: card.set,
      collectorNumber: card.cn,
      imageUrl,
    };

    const existing = groups.get(type);
    if (existing) {
      existing.push(cardInfo);
    } else {
      groups.set(type, [cardInfo]);
    }
  }

  // Sort cards within each group by CMC then name
  for (const cards of groups.values()) {
    cards.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
  }

  // Build output in canonical order, skip empty groups
  const result: CardTypeGroup[] = [];
  for (const type of CARD_TYPE_ORDER) {
    const cards = groups.get(type);
    if (cards && cards.length > 0) {
      result.push({
        type,
        count: cards.reduce((sum, c) => sum + c.quantity, 0),
        cards,
      });
    }
  }

  return result;
}
