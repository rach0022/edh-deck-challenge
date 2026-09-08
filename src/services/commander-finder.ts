/**
 * Find-a-Commander service — powers `GET /find-commander/:deckId`.
 *
 * For a single Moxfield deck it answers "which commanders could I build from
 * the cards already in this deck, and how well does the deck support each?":
 *
 *   1. Fetch the deck (Moxfield) and flatten it to a card list.
 *   2. Ask Scryfall which of those cards are legal commanders
 *      (`is:commander legal:commander`).
 *   3. For each candidate commander, pull EDHREC's recommendation set and
 *      compute how many of the deck's cards EDHREC recommends for it (the
 *      "support" count) plus their total synergy.
 *   4. Detect combos already present in the deck (Commander Spellbook) and flag
 *      candidates that participate in one — those get a ranking boost.
 *   5. Rank the candidates (support + synergy + combo boost) and return them,
 *      each with a per-commander decklist of the supporting cards.
 *
 * All the fuzzy math lives in the pure `domain/commander-finder.ts` module;
 * this service only orchestrates fetch → join → assemble → cache. EDHREC
 * failures for an individual candidate are non-fatal (that candidate degrades
 * to `noEdhrecData` with an empty support list) so one dead page can't sink the
 * whole result.
 */

import type { AppConfig } from '../config.js';
import type { CacheService } from './cache.js';
import type { MoxfieldService } from './moxfield.js';
import type { EdhrecService } from './edhrec.js';
import { EdhrecNotFoundError, EdhrecTimeoutError } from './edhrec.js';
import type { ScryfallService } from './scryfall.js';
import type { SpellbookService } from './spellbook.js';
import { extractDeckCards } from './cedh.js';
import { normalizeCardName } from '../domain/deck-similarity.js';
import {
  buildSupportCards,
  couldBeCommander,
  groupSupportByType,
  rankCandidates,
  scoreCandidate,
  sumPositiveSynergy,
  type FinderDeckCard,
} from '../domain/commander-finder.js';
import type { ProgressCallback } from './challenge.js';
import type {
  Color,
  CommanderCandidate,
  DeckCombosData,
  FindCommanderResponse,
  MoxfieldCard,
  MoxfieldCardEntry,
  MoxfieldDeckDetail,
} from '../types.js';

/**
 * Upper bound on how many candidate commanders we run EDHREC lookups for.
 * A typical deck has a handful of legendary creatures; this caps the fan-out
 * for pathological "every legend" brews so we don't issue dozens of EDHREC
 * fetches. Candidates beyond this are dropped after the (cheap) Scryfall
 * legality pass but before the (expensive) EDHREC pass.
 */
const MAX_CANDIDATES = 12;

export interface CommanderFinderService {
  getSuggestions(
    deckId: string,
    onProgress?: ProgressCallback,
  ): Promise<{ data: FindCommanderResponse; cached: boolean }>;
  refreshSuggestions(deckId: string): Promise<FindCommanderResponse>;
}

export function createCommanderFinderService(
  config: AppConfig,
  cache: CacheService,
  moxfield: MoxfieldService,
  scryfall: ScryfallService,
  edhrec: EdhrecService,
  spellbook: SpellbookService,
): CommanderFinderService {
  function cacheKey(deckId: string): string {
    return `edh:find-commander:${deckId.toLowerCase()}`;
  }

  /**
   * Builds a lookup from a normalized card name to the art-crop image of the
   * exact printing the user runs in this deck. Prefers Moxfield's inline
   * `image_uris.art_crop` (the printing in the decklist); when absent, falls
   * back to a Scryfall art-crop URL built from the card's set + collector
   * number, so we still show the user's printing rather than a generic one.
   * Covers double-faced cards via the front face.
   */
  function buildDeckArtCropIndex(deck: MoxfieldDeckDetail): Map<string, string> {
    const index = new Map<string, string>();

    const artCropOf = (card: MoxfieldCard): string | null => {
      const inline =
        card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop;
      if (inline) return inline;
      // Fall back to Scryfall's art-crop image for the exact printing.
      if (card.set && card.cn) {
        return `https://api.scryfall.com/cards/${encodeURIComponent(card.set)}/${encodeURIComponent(card.cn)}?format=image&version=art_crop`;
      }
      return null;
    };

    const addEntry = (entry: MoxfieldCardEntry | undefined) => {
      const card = entry?.card;
      if (!card?.name) return;
      const key = normalizeCardName(card.name);
      if (!key || index.has(key)) return;
      const art = artCropOf(card);
      if (art) index.set(key, art);
    };

    for (const entry of Object.values(deck.commanders ?? {})) addEntry(entry);
    for (const entry of Object.values(deck.mainboard ?? {})) addEntry(entry);
    return index;
  }

  /**
   * Builds a lookup from a normalized commander name to the set of combo
   * "produces" strings for combos in the deck that the commander participates
   * in. Empty when the deck has no combos.
   */
  function buildComboIndex(combos: DeckCombosData | null): Map<string, string[]> {
    const index = new Map<string, string[]>();
    if (!combos) return index;
    for (const combo of combos.combos ?? []) {
      const produces = combo.produces.map((p) => p.name);
      for (const card of combo.cards) {
        const key = normalizeCardName(card.name);
        if (!key) continue;
        const existing = index.get(key);
        if (existing) existing.push(...produces);
        else index.set(key, [...produces]);
      }
    }
    return index;
  }

  async function fetchAndFind(
    deckId: string,
    onProgress?: ProgressCallback,
  ): Promise<FindCommanderResponse> {
    const emit = onProgress ?? (() => {});

    emit({ phase: 'connecting', message: 'Connecting to Moxfield…', progress: 5 });
    const deck = await moxfield.fetchDeckDetail(deckId);

    // Flatten the deck to a card list (name, types, scryfallId), reused for
    // both the legality pass and the per-commander support join.
    const deckCards = extractDeckCards(deck);
    const finderCards: FinderDeckCard[] = deckCards.map((c) => ({
      name: c.name,
      scryfallId: c.scryfallId,
      types: c.types,
    }));

    // Art-crop of each card as the user prints it in this deck, so a candidate
    // commander's tile shows their copy rather than a generic printing.
    const deckArtCrop = buildDeckArtCropIndex(deck);

    emit({
      phase: 'connected',
      message: `Loaded ${deckCards.length} cards`,
      progress: 12,
      detail: deck.name,
    });

    // 1. Which of the deck's cards are legal commanders?
    //
    // First cheaply narrow to cards that *could* be commanders using the type
    // line Moxfield already gave us (legendary creatures / planeswalkers) — no
    // network. Only those survivors are confirmed via Scryfall's authoritative
    // `is:commander` check. This is what keeps us from issuing ~100 Scryfall
    // searches per deck (the source of the rate limiting): a typical deck has a
    // handful of legends, so we make a handful of calls instead.
    const eligible = finderCards.filter((c) => couldBeCommander(c.types));
    emit({
      phase: 'loading-decks',
      message: `Checking ${eligible.length} legendary card${eligible.length === 1 ? '' : 's'} on Scryfall…`,
      progress: 20,
      detail:
        eligible.length > 0
          ? eligible.map((c) => c.name).slice(0, 4).join(', ') +
            (eligible.length > 4 ? `, +${eligible.length - 4} more` : '')
          : 'No legendary creatures found',
    });

    const legalCommanders = await scryfall.findLegalCommanders(
      eligible.map((c) => c.name),
    );

    // 2. Combos already in the deck (best-effort; empty on failure).
    emit({
      phase: 'combos',
      message: 'Detecting combos in your deck…',
      progress: 32,
    });
    let combos: DeckCombosData | null = null;
    try {
      combos = await spellbook.findCombosForDeck(deck);
    } catch {
      combos = null;
    }
    const comboIndex = buildComboIndex(combos);

    // Cap the candidate fan-out (see MAX_CANDIDATES). Prefer combo commanders
    // so a highly-relevant build-around isn't dropped by the cap.
    const prioritized = [...legalCommanders].sort((a, b) => {
      const aCombo = comboIndex.has(normalizeCardName(a.name)) ? 1 : 0;
      const bCombo = comboIndex.has(normalizeCardName(b.name)) ? 1 : 0;
      return bCombo - aCombo || a.name.localeCompare(b.name);
    });
    const candidatesToCheck = prioritized.slice(0, MAX_CANDIDATES);

    emit({
      phase: 'matching',
      message: `Found ${legalCommanders.length} legal commander${legalCommanders.length === 1 ? '' : 's'} — checking EDHREC…`,
      progress: 40,
      detail:
        candidatesToCheck.length < legalCommanders.length
          ? `Analysing the top ${candidatesToCheck.length}`
          : undefined,
    });

    // 3. For each candidate, pull EDHREC recs and compute support + synergy.
    // Progress ramps from 40% → 92% across the candidates so the bar advances
    // per commander, each event naming the commander being analysed.
    const candidates: CommanderCandidate[] = [];
    const total = candidatesToCheck.length;
    for (let i = 0; i < total; i++) {
      const commander = candidatesToCheck[i];
      const progress = 40 + Math.round(((i + 1) / Math.max(total, 1)) * 52);
      emit({
        phase: 'matching',
        message: `Analysing commander ${i + 1} of ${total}`,
        progress,
        detail: commander.name,
      });

      const key = normalizeCardName(commander.name);
      const comboFeatures = dedupe(comboIndex.get(key) ?? []);
      const inCombo = comboFeatures.length > 0;

      let noEdhrecData = false;
      let rank: number | null = null;
      let numDecks: number | null = null;
      let supportCards = [] as CommanderCandidate['supportCards'];

      try {
        const result = await edhrec.getRecommendations({
          commander: commander.name,
          partner: null,
          companion: null,
        });
        rank = result.rank;
        numDecks = result.numDecks;
        const support = buildSupportCards(
          finderCards,
          result.recommendations,
          commander.name,
        );
        supportCards = groupSupportByType(support);
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

      const supportCount = supportCards.length;
      const synergyScore = sumPositiveSynergy(supportCards);
      const score = scoreCandidate(supportCount, synergyScore, inCombo);

      candidates.push({
        name: commander.name,
        scryfallId: commander.scryfallId,
        imageUrl: deckArtCrop.get(key) ?? commander.imageUrl,
        colorIdentity: (commander.colorIdentity as Color[]) ?? [],
        edhrecRank: rank,
        edhrecNumDecks: numDecks,
        supportCount,
        synergyScore: round2(synergyScore),
        inCombo,
        comboFeatures,
        score: round2(score),
        noEdhrecData,
        supportCards,
      });
    }

    emit({ phase: 'finalizing', message: 'Ranking commanders…', progress: 95 });
    rankCandidates(candidates);

    return {
      deckId: deck.publicId,
      deckName: deck.name,
      moxfieldUrl: `https://www.moxfield.com/decks/${deck.publicId}`,
      scannedCardCount: deckCards.length,
      candidates,
    };
  }

  return {
    async getSuggestions(deckId, onProgress) {
      onProgress?.({ phase: 'cache-check', message: 'Checking cache…', progress: 2 });
      const key = cacheKey(deckId);
      const cached = await cache.get<FindCommanderResponse>(key);
      if (cached) {
        onProgress?.({ phase: 'complete', message: 'Loaded from cache!', progress: 100 });
        return { data: cached, cached: true };
      }

      const data = await fetchAndFind(deckId, onProgress);
      await cache.set(key, data, config.cacheTtlSeconds);
      onProgress?.({ phase: 'complete', message: 'Done!', progress: 100 });
      return { data, cached: false };
    },

    async refreshSuggestions(deckId) {
      const key = cacheKey(deckId);
      await cache.delete(key);
      const data = await fetchAndFind(deckId);
      await cache.set(key, data, config.cacheTtlSeconds);
      return data;
    },
  };
}

/** De-duplicates a string list, preserving first-seen order. */
function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Rounds to 2 decimal places. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
