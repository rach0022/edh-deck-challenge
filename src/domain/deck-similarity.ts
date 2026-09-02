/**
 * Deck similarity — pure, side-effect-free logic for matching a user's
 * card collection against reference cEDH decks.
 *
 * The core metric is "owned fraction": of the cards in a reference deck,
 * what proportion does the user already own? This answers the practical
 * question "which cEDH deck am I closest to being able to build?" and makes
 * the missing-card list a natural buy list.
 *
 * Card names are normalized before comparison so trivial differences
 * (case, surrounding whitespace, and the "//" split-card / MDFC face
 * separator) don't cause false mismatches.
 */

import type {
  CedhReferenceDeck,
  CedhMatch,
  ReferenceCard,
  ReferenceCardGroup,
} from '../types.js';
import { CARD_TYPE_ORDER, classifyCardType } from './card-type.js';

/** Rounds a monetary amount to 2 decimal places. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Normalizes a card name for set-membership comparison.
 * - lowercased and trimmed
 * - collapses internal whitespace
 * - reduces double-faced / split names ("A // B") to their front face,
 *   since Moxfield and the reference source aren't always consistent about
 *   whether they store the full "A // B" string or just "A".
 */
export function normalizeCardName(name: string): string {
  const front = name.split('//')[0];
  return front.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Builds a normalized card-name set from a list of raw card names.
 */
export function buildCardSet(names: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    const normalized = normalizeCardName(name);
    if (normalized) set.add(normalized);
  }
  return set;
}

/**
 * Scores a single reference deck against the user's normalized collection.
 *
 * Builds the full reference decklist grouped by card type, flagging each card
 * as owned or missing. Missing cards are priced using the deck's captured USD
 * price (for the printing in the reference decklist), converted to CAD via
 * `usdToCad`. (Owned cards are still priced for reference/display.)
 */
export function scoreDeck(
  deck: CedhReferenceDeck,
  ownedCards: Set<string>,
  usdToCad: number,
): CedhMatch {
  // Bucket cards by type category. The corpus decklist is already
  // de-duplicated, but guard against dupes defensively.
  const seen = new Set<string>();
  const byType = new Map<string, ReferenceCard[]>();
  let ownedCount = 0;
  let missingCount = 0;
  let missingTotalUsd = 0;
  let missingUnpricedCount = 0;

  for (const card of deck.decklist ?? []) {
    const normalized = normalizeCardName(card.name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const owned = ownedCards.has(normalized);
    const usdRaw = typeof card.value === 'number' ? card.value : null;
    // Derive the single grouping category from the parsed type list.
    const type = classifyCardType(card.types.join(' '));

    if (owned) {
      ownedCount++;
    } else {
      missingCount++;
      if (usdRaw == null) {
        missingUnpricedCount++;
      } else {
        missingTotalUsd += usdRaw;
      }
    }

    const entry: ReferenceCard = {
      name: card.name.trim(),
      type,
      types: card.types,
      manaCost: card.manaCost,
      scryfallId: card.scryfallId,
      owned,
      usd: usdRaw == null ? null : roundMoney(usdRaw),
      cad: usdRaw == null ? null : roundMoney(usdRaw * usdToCad),
    };

    const list = byType.get(type);
    if (list) list.push(entry);
    else byType.set(type, [entry]);
  }

  // Build groups in canonical type order; within each: missing first
  // (priciest first), then owned (by name).
  const cardGroups: ReferenceCardGroup[] = [];
  for (const type of CARD_TYPE_ORDER) {
    const cards = byType.get(type);
    if (!cards || cards.length === 0) continue;

    cards.sort((a, b) => {
      if (a.owned !== b.owned) return a.owned ? 1 : -1; // missing first
      if (!a.owned) {
        // both missing: priciest first, then name
        return (b.usd ?? 0) - (a.usd ?? 0) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name); // both owned: by name
    });

    cardGroups.push({
      type,
      cards,
      missingCount: cards.filter((c) => !c.owned).length,
      ownedCount: cards.filter((c) => c.owned).length,
    });
  }

  const totalCount = seen.size;
  const ownedFraction = totalCount === 0 ? 0 : ownedCount / totalCount;

  return {
    deck,
    ownedFraction,
    ownedCount,
    totalCount,
    cardGroups,
    missingTotalUsd: roundMoney(missingTotalUsd),
    missingTotalCad: roundMoney(missingTotalUsd * usdToCad),
    missingCount,
    missingUnpricedCount,
  };
}

/**
 * Ranks all reference decks by how much of each the user already owns.
 *
 * Sort order:
 *   1. Higher owned fraction first (primary).
 *   2. On ties, more owned cards first (a bigger overlap is more meaningful).
 *   3. On ties, deck title alphabetically for stable, deterministic output.
 *
 * Reference decks with no cards (e.g. a Moxfield fetch that returned empty)
 * are excluded so they can't pollute the top matches with a spurious 0/0.
 */
export function rankMatches(
  decks: CedhReferenceDeck[],
  ownedCards: Set<string>,
  usdToCad: number,
  limit = 5,
): CedhMatch[] {
  const scored = decks
    .filter((deck) => (deck.decklist?.length ?? 0) > 0)
    .map((deck) => scoreDeck(deck, ownedCards, usdToCad));

  scored.sort(
    (a, b) =>
      b.ownedFraction - a.ownedFraction ||
      b.ownedCount - a.ownedCount ||
      a.deck.deckTitle.localeCompare(b.deck.deckTitle),
  );

  return scored.slice(0, limit);
}
