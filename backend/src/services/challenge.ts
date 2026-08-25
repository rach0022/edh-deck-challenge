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
import { extractCommanders } from '../domain/commander-extractor.js';
import { organizeDecks } from '../domain/deck-organizer.js';
import { resolveColorIdentity, colorIdentityToKey } from '../domain/color-identity.js';
import { COLOR_COMBINATIONS } from '../domain/color-combinations.js';
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

export interface ChallengeService {
  getChallenge(username: string): Promise<{ data: ChallengeResponse; cached: boolean }>;
  getDecks(username: string): Promise<{ data: DecksResponse; cached: boolean }>;
  getDeckDetail(deckId: string): Promise<{ data: DeckDetailResponse; cached: boolean }>;
  refreshChallenge(username: string): Promise<ChallengeResponse>;
}

export function createChallengeService(
  config: AppConfig,
  cache: CacheService,
  moxfield: MoxfieldService,
  spellbook: SpellbookService,
): ChallengeService {

  function cacheKey(type: string, id: string): string {
    return `edh:${type}:${id.toLowerCase()}`;
  }

  async function fetchAndProcessChallenge(username: string): Promise<ChallengeResponse> {
    // Fetch all decks from Moxfield
    const deckSummaries = await moxfield.fetchUserDecks(username);

    // Fetch detail for each deck
    const deckDetails: MoxfieldDeckDetail[] = [];
    for (const summary of deckSummaries) {
      const detail = await moxfield.fetchDeckDetail(summary.publicId);
      deckDetails.push(detail);

      // Cache individual deck details
      await cache.set(cacheKey('deck', summary.publicId), detail);
    }

    // Extract commanders and organize
    const extractions = deckDetails.map((deck) => extractCommanders(deck));
    const progress = organizeDecks(extractions, username);

    // Fetch combo counts for each deck (in parallel, non-blocking)
    const comboResults = await Promise.all(
      deckDetails.map(async (deck) => {
        const combos = await spellbook.findCombosForDeck(deck);
        // Cache combo data for the deck
        await cache.set(cacheKey('combos', deck.publicId), combos);
        return { deckId: deck.publicId, comboCount: combos.comboCount };
      })
    );

    // Attach combo counts to slot entries
    const comboCountMap = new Map(comboResults.map((r) => [r.deckId, r.comboCount]));
    for (const slot of progress.slots) {
      for (const deckEntry of slot.decks) {
        deckEntry.comboCount = comboCountMap.get(deckEntry.deckId) ?? 0;
      }
    }

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
    cardCount: Object.values(deck.mainboard).reduce((sum, e) => sum + e.quantity, 0),
    cardsByType,
  };
}

/**
 * Categorizes cards into type groups based on the type_line.
 * Order: Creatures, Planeswalkers, Instants, Sorceries, Artifacts,
 * Enchantments, Lands, Other
 */
const TYPE_ORDER = [
  'Creature',
  'Planeswalker',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
  'Battle',
  'Other',
];

function classifyCardType(typeLine: string): string {
  // Check in priority order — a card like "Artifact Creature" → Creature
  const normalized = typeLine.toLowerCase();

  if (normalized.includes('creature')) return 'Creature';
  if (normalized.includes('planeswalker')) return 'Planeswalker';
  if (normalized.includes('instant')) return 'Instant';
  if (normalized.includes('sorcery')) return 'Sorcery';
  if (normalized.includes('battle')) return 'Battle';
  // Artifact and Enchantment checked after creature (for "Enchantment Creature" etc.)
  if (normalized.includes('artifact')) return 'Artifact';
  if (normalized.includes('enchantment')) return 'Enchantment';
  if (normalized.includes('land')) return 'Land';
  return 'Other';
}

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
  for (const type of TYPE_ORDER) {
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
