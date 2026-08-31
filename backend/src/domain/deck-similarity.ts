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

import type { CedhReferenceDeck, CedhMatch, MissingCard } from '../types.js';

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
 * Each missing card is priced using the deck's captured USD price (for the
 * printing in the reference decklist) and converted to CAD via `usdToCad`.
 */
export function scoreDeck(
  deck: CedhReferenceDeck,
  ownedCards: Set<string>,
  usdToCad: number,
): CedhMatch {
  // Deduplicate reference cards by normalized name, but keep the original
  // display name for the missing list.
  const seen = new Set<string>();
  const referenceCards: { display: string; normalized: string }[] = [];
  for (const name of deck.cardNames) {
    const normalized = normalizeCardName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    referenceCards.push({ display: name.trim(), normalized });
  }

  const prices = deck.cardPrices ?? {};
  const missingCards: MissingCard[] = [];
  let ownedCount = 0;
  let missingTotalUsd = 0;
  let missingUnpricedCount = 0;

  for (const card of referenceCards) {
    if (ownedCards.has(card.normalized)) {
      ownedCount++;
      continue;
    }

    const usd = typeof prices[card.normalized] === 'number' ? prices[card.normalized] : null;
    if (usd == null) {
      missingUnpricedCount++;
    } else {
      missingTotalUsd += usd;
    }

    missingCards.push({
      name: card.display,
      usd: usd == null ? null : roundMoney(usd),
      cad: usd == null ? null : roundMoney(usd * usdToCad),
    });
  }

  const totalCount = referenceCards.length;
  const ownedFraction = totalCount === 0 ? 0 : ownedCount / totalCount;

  // Sort: priciest cards first (most impactful buys), then by name.
  missingCards.sort(
    (a, b) => (b.usd ?? 0) - (a.usd ?? 0) || a.name.localeCompare(b.name),
  );

  return {
    deck,
    ownedFraction,
    ownedCount,
    totalCount,
    missingCards,
    missingTotalUsd: roundMoney(missingTotalUsd),
    missingTotalCad: roundMoney(missingTotalUsd * usdToCad),
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
    .filter((deck) => deck.cardNames.length > 0)
    .map((deck) => scoreDeck(deck, ownedCards, usdToCad));

  scored.sort(
    (a, b) =>
      b.ownedFraction - a.ownedFraction ||
      b.ownedCount - a.ownedCount ||
      a.deck.deckTitle.localeCompare(b.deck.deckTitle),
  );

  return scored.slice(0, limit);
}
