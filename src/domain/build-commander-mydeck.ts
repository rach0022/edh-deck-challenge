/**
 * "Your Deck vs EDHREC" comparison — pure, side-effect-free logic.
 *
 * When the user has already built a deck for the commander they're now
 * exploring, we can show how their build compares to EDHREC's aggregate
 * recommendations:
 *
 *   - `edhrecCardsUsed` — how many of the user's deck cards are also EDHREC
 *     recommendations for this commander (the "on-theme" overlap), and
 *   - `uniqueness`     — the fraction of the user's deck cards that are NOT in
 *     EDHREC's recommendation set (higher = spicier / more off-meta).
 *
 * Matching a selection to one of the user's decks is done purely by commander
 * name(s): a deck matches when its commander set equals the selection's
 * commander set (primary + optional partner), compared with the shared
 * `normalizeCardName` so case / whitespace / split-face differences don't
 * cause false mismatches. Companion is intentionally ignored for matching
 * (it's a deckbuilding constraint, not part of the command zone identity).
 */

import type {
  CommanderSelection,
  EdhrecRecommendation,
  MyDeckComparison,
  MyDeckCommanderPrinting,
} from '../types.js';
import { normalizeCardName } from './deck-similarity.js';

/**
 * A user deck reduced to what's needed for commander matching + comparison:
 * its display name, Moxfield id, the commander name(s) in its command zone,
 * and the distinct card names across all of its boards.
 */
export interface UserDeckForMatch {
  name: string;
  publicId: string | null;
  /** Commander card name(s) from the deck's command zone. */
  commanderNames: string[];
  /**
   * The exact commander printing(s) the user runs in this deck — name plus the
   * printing's image and set/collector number — so the results header can show
   * the user's actual printing rather than a generic Scryfall lookup.
   */
  commanderPrintings: MyDeckCommanderPrinting[];
  /** All (raw) card names in the deck across every board. */
  cardNames: string[];
}

/** Builds the normalized command-zone identity set for a selection. */
function selectionCommanderSet(selection: CommanderSelection): Set<string> {
  const set = new Set<string>();
  const primary = normalizeCardName(selection.commander);
  if (primary) set.add(primary);
  if (selection.partner) {
    const partner = normalizeCardName(selection.partner);
    if (partner) set.add(partner);
  }
  return set;
}

/** True when two normalized string sets contain exactly the same members. */
function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Finds the user's deck whose command zone matches the selected commander(s).
 *
 * A deck matches when its set of normalized commander names is exactly equal
 * to the selection's (primary + optional partner). Returns the first match in
 * the order the decks were supplied, or null when the user has no such deck.
 */
export function findMatchingUserDeck(
  selection: CommanderSelection,
  decks: readonly UserDeckForMatch[],
): UserDeckForMatch | null {
  const target = selectionCommanderSet(selection);
  if (target.size === 0) return null;

  for (const deck of decks) {
    const deckSet = new Set<string>();
    for (const name of deck.commanderNames) {
      const normalized = normalizeCardName(name);
      if (normalized) deckSet.add(normalized);
    }
    if (sameSet(deckSet, target)) return deck;
  }
  return null;
}

/**
 * Computes the comparison of a matched user deck against EDHREC's
 * recommendations for the same commander.
 *
 * `edhrecCardsUsed` counts the distinct deck cards that appear in EDHREC's
 * recommendation set; `uniqueness` is the complementary fraction of deck cards
 * that don't. Commander cards themselves are excluded from the deck's card
 * count so they can't skew the ratio (EDHREC never recommends the commander).
 */
export function computeMyDeckComparison(
  deck: UserDeckForMatch,
  recommendations: readonly EdhrecRecommendation[],
): MyDeckComparison {
  // EDHREC recommendation name set (normalized).
  const recSet = new Set<string>();
  for (const rec of recommendations) {
    const normalized = normalizeCardName(rec.name);
    if (normalized) recSet.add(normalized);
  }

  // The deck's distinct non-commander cards (normalized).
  const commanderSet = new Set<string>();
  for (const name of deck.commanderNames) {
    const normalized = normalizeCardName(name);
    if (normalized) commanderSet.add(normalized);
  }

  const deckCards = new Set<string>();
  for (const name of deck.cardNames) {
    const normalized = normalizeCardName(name);
    if (normalized && !commanderSet.has(normalized)) deckCards.add(normalized);
  }

  let edhrecCardsUsed = 0;
  for (const card of deckCards) {
    if (recSet.has(card)) edhrecCardsUsed++;
  }

  const deckCardCount = deckCards.size;
  const uniqueness =
    deckCardCount === 0 ? 0 : (deckCardCount - edhrecCardsUsed) / deckCardCount;

  return {
    deckName: deck.name,
    publicId: deck.publicId,
    commanderPrintings: deck.commanderPrintings,
    deckCardCount,
    edhrecCardsUsed,
    edhrecTotal: recSet.size,
    uniqueness,
  };
}
