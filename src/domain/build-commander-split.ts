/**
 * Build-a-Commander owned/to-buy split — pure, side-effect-free logic.
 *
 * This module turns two inputs into the ownership half of a
 * Build-a-Commander result:
 *   1. the user's decks (each a named list of card names), and
 *   2. EDHREC's recommended cards for the chosen commander selection.
 *
 * From the decks it builds the Owned_Card_Set (the union of the distinct
 * normalized card names across every deck) plus a source-deck index that
 * records, for each normalized card name, which of the user's decks contain
 * it. It then partitions the recommendations into an Owned group and a
 * To-Buy group: a recommendation is owned exactly when its normalized name is
 * in the Owned_Card_Set, and each owned card carries the sorted list of deck
 * names that contain it (Source_Decks).
 *
 * Pricing (usd/cad) is deliberately left null here — CAD conversion and the
 * buy-list total are layered on top by `build-commander-pricing.ts`. This
 * keeps the split logic pure and independent of the FX rate.
 *
 * Card names are normalized with `normalizeCardName` (shared with the cEDH
 * flow) so trivial differences (case, whitespace, and the "A // B" split-card
 * / MDFC face separator) don't cause false mismatches.
 */

import type {
  BuildCommanderCard,
  EdhrecRecommendation,
} from '../types.js';
import { buildCardSet, normalizeCardName } from './deck-similarity.js';

/** A single user deck reduced to its name and its raw card names. */
export interface UserDeckCards {
  /** The deck's display name (used for Source_Decks). */
  name: string;
  /** Raw card names in the deck (normalization happens internally). */
  cardNames: string[];
}

/**
 * The ownership index built from a user's decks:
 *   - `ownedSet` — the Owned_Card_Set (distinct normalized card names), and
 *   - `sourceDecks` — for each normalized name, the deck names that contain it.
 *
 * `deckCount` is the number of decks used to build the index.
 */
export interface OwnedCardIndex {
  /** Union of the distinct normalized card names across all decks. */
  ownedSet: Set<string>;
  /** normalized card name → deck names whose card set contains it. */
  sourceDecks: Map<string, string[]>;
  /** Number of decks that contributed to the index. */
  deckCount: number;
}

/**
 * The result of partitioning recommendations into owned vs. to-buy.
 * Prices are always null here — see `build-commander-pricing.ts`.
 */
export interface OwnedToBuySplit {
  ownedCards: BuildCommanderCard[];
  toBuyCards: BuildCommanderCard[];
  ownedCount: number;
  toBuyCount: number;
}

/**
 * Builds the Owned_Card_Set and source-deck index from the user's decks.
 *
 * The owned set is the union of the distinct normalized card names across all
 * decks (Req 6.2). For every card, every deck whose normalized card set
 * contains it is recorded in `sourceDecks` (Req 10.1, 10.3). Deck names are
 * recorded in the order the decks are supplied and de-duplicated so a single
 * deck can't appear twice for the same card.
 */
export function buildOwnedCardIndex(
  decks: readonly UserDeckCards[],
): OwnedCardIndex {
  const ownedSet = new Set<string>();
  const sourceDecks = new Map<string, string[]>();

  for (const deck of decks) {
    // Normalized, de-duplicated card names for this one deck.
    const deckCardSet = buildCardSet(deck.cardNames);
    for (const normalized of deckCardSet) {
      ownedSet.add(normalized);
      const decksForCard = sourceDecks.get(normalized);
      if (decksForCard) {
        // Guard against the same deck name appearing twice for a card
        // (e.g. two decks that happen to share a display name).
        if (!decksForCard.includes(deck.name)) decksForCard.push(deck.name);
      } else {
        sourceDecks.set(normalized, [deck.name]);
      }
    }
  }

  return { ownedSet, sourceDecks, deckCount: decks.length };
}

/**
 * Partitions EDHREC recommendations into Owned and To-Buy groups.
 *
 * A recommendation is Owned iff its normalized name is in `index.ownedSet`
 * (Req 6.3, 6.4). Owned cards attach their Source_Decks from the index,
 * sorted for deterministic output (Req 10.1, 10.3); to-buy cards carry an
 * empty `sourceDecks`. Prices are left null for the pricing layer. The two
 * groups form a total, disjoint partition of the recommendations, so
 * `ownedCount + toBuyCount === recommendations.length` (Req 7.2, 12.5).
 */
export function partitionRecommendations(
  recommendations: readonly EdhrecRecommendation[],
  index: OwnedCardIndex,
): OwnedToBuySplit {
  const ownedCards: BuildCommanderCard[] = [];
  const toBuyCards: BuildCommanderCard[] = [];

  for (const rec of recommendations) {
    const normalized = normalizeCardName(rec.name);
    const owned = index.ownedSet.has(normalized);

    const card: BuildCommanderCard = {
      name: rec.name,
      category: rec.category,
      owned,
      sourceDecks: owned
        ? [...(index.sourceDecks.get(normalized) ?? [])].sort((a, b) =>
            a.localeCompare(b),
          )
        : [],
      art: null,
      imageUrl: null,
      // Card type is enriched from Scryfall downstream; default to "Other" so
      // the shape is valid even without enrichment.
      cardType: 'Other',
      scryfallId: rec.scryfallId,
      usd: null,
      cad: null,
    };

    if (owned) ownedCards.push(card);
    else toBuyCards.push(card);
  }

  return {
    ownedCards,
    toBuyCards,
    ownedCount: ownedCards.length,
    toBuyCount: toBuyCards.length,
  };
}

/**
 * Convenience wrapper: builds the owned index from the decks and partitions
 * the recommendations in one call, also returning the number of decks used.
 */
export function splitRecommendations(
  recommendations: readonly EdhrecRecommendation[],
  decks: readonly UserDeckCards[],
): OwnedToBuySplit & { deckCount: number } {
  const index = buildOwnedCardIndex(decks);
  const split = partitionRecommendations(recommendations, index);
  return { ...split, deckCount: index.deckCount };
}
