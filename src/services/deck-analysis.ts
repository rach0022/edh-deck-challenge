/**
 * Deck analysis service — powers `GET /analyze/:deckId`.
 *
 * For a single Moxfield deck it produces:
 *   - Feature #4: a salt / power-level / bracket ESTIMATE, by joining the
 *     deck's cards against EDHREC's global salt dataset and the commander's
 *     "Game Changers" panel.
 *   - Feature #2: cut candidates (deck cards that aren't EDHREC picks for the
 *     commander) and add suggestions (high-synergy EDHREC cards the deck lacks).
 *
 * It reuses the existing Moxfield + EDHREC services and the shared domain logic
 * (commander extraction, mainboard extraction, EDHREC slugging). All the fuzzy
 * math lives in the pure `domain/deck-analysis.ts` and `domain/deck-suggestions.ts`
 * modules; this service only orchestrates fetch → join → assemble → cache.
 */

import type { AppConfig } from '../config.js';
import type { CacheService } from './cache.js';
import type { MoxfieldService } from './moxfield.js';
import type { EdhrecService } from './edhrec.js';
import { EdhrecNotFoundError, EdhrecTimeoutError } from './edhrec.js';
import { extractDeckCards } from './cedh.js';
import { extractCommanders } from '../domain/commander-extractor.js';
import { resolveColorIdentity } from '../domain/color-identity.js';
import { normalizeCardName } from '../domain/deck-similarity.js';
import { analyzeDeckSalt } from '../domain/deck-analysis.js';
import { findCutCandidates, findAddSuggestions } from '../domain/deck-suggestions.js';
import type {
  Color,
  CommanderImage,
  DeckAnalysisResponse,
  EdhrecRecommendation,
} from '../types.js';

/** EDHREC panel header that lists format-defining "Game Changer" cards. */
const GAME_CHANGERS_CATEGORY = 'game changers';

export interface DeckAnalysisService {
  getAnalysis(
    deckId: string,
  ): Promise<{ data: DeckAnalysisResponse; cached: boolean }>;
  refreshAnalysis(deckId: string): Promise<DeckAnalysisResponse>;
}

export function createDeckAnalysisService(
  config: AppConfig,
  cache: CacheService,
  moxfield: MoxfieldService,
  edhrec: EdhrecService,
): DeckAnalysisService {
  function cacheKey(deckId: string): string {
    return `edh:analyze:${deckId.toLowerCase()}`;
  }

  /**
   * Builds the deck-analysis response for a deck id. Fetches the deck, derives
   * the commander selection, pulls EDHREC recs + the global salt dataset, and
   * runs the pure analysis. If EDHREC has no page for the commander, the salt +
   * suggestion analysis degrades gracefully (empty suggestions, salt still
   * computed from the global dataset) with `noEdhrecData: true`.
   */
  async function fetchAndAnalyze(deckId: string): Promise<DeckAnalysisResponse> {
    const deck = await moxfield.fetchDeckDetail(deckId);

    const extraction = extractCommanders(deck);
    const commanderNames = extraction.commanders.map((c) => c.name);
    const colorIdentity: Color[] = extraction.skipped
      ? []
      : resolveColorIdentity(extraction.commanders);

    // Header commander images (reuse the printing from the deck when present).
    const commanders: CommanderImage[] = extraction.commanders.map((c) => ({
      name: c.name,
      imageUrl: c.imageUrl,
      scryfallId: null,
      role: 'commander' as const,
    }));

    // The deck's cards (commanders + mainboard), each with parsed types + id.
    const deckCards = extractDeckCards(deck);
    const suggestionCards = deckCards.map((c) => ({
      name: c.name,
      scryfallId: c.scryfallId,
      types: c.types,
    }));
    const saltCards = deckCards.map((c) => ({
      name: c.name,
      scryfallId: c.scryfallId,
    }));

    // EDHREC recommendations for the commander (best-effort — no page is not
    // fatal; we still show the salt analysis).
    let recommendations: EdhrecRecommendation[] = [];
    let edhrecRank: number | null = null;
    let edhrecNumDecks: number | null = null;
    let noEdhrecData = false;

    if (commanderNames.length > 0) {
      const selection = {
        commander: commanderNames[0],
        partner: commanderNames[1] ?? null,
        companion: null,
      };
      try {
        const result = await edhrec.getRecommendations(selection);
        recommendations = result.recommendations;
        edhrecRank = result.rank;
        edhrecNumDecks = result.numDecks;
      } catch (error) {
        if (
          error instanceof EdhrecNotFoundError ||
          error instanceof EdhrecTimeoutError
        ) {
          noEdhrecData = true;
        } else {
          throw error;
        }
      }
    } else {
      noEdhrecData = true;
    }

    // Global salt dataset (best-effort; empty on failure).
    const saltEntries = await edhrec.getSaltScores();
    const saltIndex = new Map<string, number>();
    for (const entry of saltEntries) {
      const key = normalizeCardName(entry.name);
      if (!key) continue;
      const existing = saltIndex.get(key);
      if (existing == null || entry.salt > existing) saltIndex.set(key, entry.salt);
    }

    // Game Changers present in the deck (from the EDHREC panel of that name).
    const deckNameSet = new Set(
      suggestionCards.map((c) => normalizeCardName(c.name)).filter(Boolean),
    );
    const gameChangers: string[] = [];
    for (const rec of recommendations) {
      if ((rec.category ?? '').toLowerCase() !== GAME_CHANGERS_CATEGORY) continue;
      if (deckNameSet.has(normalizeCardName(rec.name))) gameChangers.push(rec.name);
    }

    const salt = analyzeDeckSalt(saltCards, saltIndex, gameChangers);

    const cutCandidates = findCutCandidates(
      suggestionCards,
      recommendations,
      commanderNames,
    );
    const addSuggestions = findAddSuggestions(
      suggestionCards,
      recommendations,
      commanderNames,
    );

    // Non-land, non-commander count considered for suggestions (for display).
    const commanderSet = new Set(
      commanderNames.map((n) => normalizeCardName(n)).filter(Boolean),
    );
    const analyzedCardCount = suggestionCards.filter((c) => {
      const key = normalizeCardName(c.name);
      return key && !commanderSet.has(key);
    }).length;

    return {
      deckId: deck.publicId,
      deckName: deck.name,
      moxfieldUrl: `https://www.moxfield.com/decks/${deck.publicId}`,
      commanders,
      colorIdentity,
      edhrecRank,
      edhrecNumDecks,
      analyzedCardCount,
      salt,
      cutCandidates,
      addSuggestions,
      noEdhrecData,
    };
  }

  return {
    async getAnalysis(deckId) {
      const key = cacheKey(deckId);
      const cached = await cache.get<DeckAnalysisResponse>(key);
      if (cached) return { data: cached, cached: true };

      const data = await fetchAndAnalyze(deckId);
      await cache.set(key, data, config.cacheTtlSeconds);
      return { data, cached: false };
    },

    async refreshAnalysis(deckId) {
      const key = cacheKey(deckId);
      await cache.delete(key);
      const data = await fetchAndAnalyze(deckId);
      await cache.set(key, data, config.cacheTtlSeconds);
      return data;
    },
  };
}
