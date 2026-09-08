/**
 * Find-a-Commander scoring — pure, side-effect-free logic.
 *
 * Given (a) the deck's cards, (b) EDHREC's recommendation set for a candidate
 * commander, and (c) whether that commander participates in a combo already in
 * the deck, this module computes:
 *
 *   - the "support" list: the deck's cards that EDHREC recommends for the
 *     candidate (each annotated with its EDHREC synergy/inclusion), grouped by
 *     card type and sorted best-first;
 *   - a blended ranking score that rewards commanders the deck already supports
 *     well (more matching cards + higher total synergy) and boosts commanders
 *     that are part of a combo present in the deck.
 *
 * All name joins use the shared `normalizeCardName` so "A // B" faces, case,
 * and whitespace differences don't cause false matches. No I/O — the
 * find-commander service consumes these builders after fetching EDHREC.
 */

import type {
  CommanderCandidate,
  CommanderSupportCard,
  EdhrecRecommendation,
} from '../types.js';
import { normalizeCardName } from './deck-similarity.js';
import { classifyCardType, CARD_TYPE_ORDER } from './card-type.js';

/** A deck card reduced to what the finder needs. */
export interface FinderDeckCard {
  name: string;
  scryfallId: string | null;
  /** Parsed type tokens (from `parseTypeLine`). */
  types: string[];
}

/**
 * Cheap, Scryfall-free pre-filter for commander eligibility using only the
 * card's parsed type tokens (already available from Moxfield's type line).
 *
 * A card can only be a commander if it is **Legendary** and either a
 * **Creature** or a **Planeswalker** (the "<X> can be your commander"
 * planeswalkers are all legendary). This deliberately over-includes — a
 * legendary creature that isn't actually commander-legal (extremely rare) is
 * still confirmed authoritatively by Scryfall's `is:commander` afterwards — but
 * it eliminates the ~95 non-legendary cards in a typical deck up front, so the
 * expensive Scryfall legality check runs on a handful of cards instead of the
 * whole deck. That is the main lever against Scryfall rate limiting.
 *
 * Case-insensitive on the type tokens.
 */
export function couldBeCommander(types: readonly string[]): boolean {
  let legendary = false;
  let creatureOrWalker = false;
  for (const t of types) {
    const token = t.toLowerCase();
    if (token === 'legendary') legendary = true;
    else if (token === 'creature' || token === 'planeswalker') creatureOrWalker = true;
  }
  return legendary && creatureOrWalker;
}

/**
 * Weight applied to the summed synergy of supporting cards when blending it
 * with the raw support count. Support count is the dominant signal (each
 * matching card = 1 point); synergy is a softer tie-breaker (a card with +30%
 * synergy adds ~0.3 * this weight on top of its 1 support point).
 */
const SYNERGY_WEIGHT = 1;

/**
 * Flat bonus added to a candidate's score when it participates in a combo that
 * is already present in the deck. A combo commander is a strong build-around
 * signal, so it should outrank a similarly-supported non-combo commander.
 */
const COMBO_BOOST = 5;

/**
 * Builds the list of deck cards that EDHREC recommends for a candidate
 * commander (the "support" cards). Each supporting card carries the best
 * (highest-synergy) EDHREC entry found for it. The candidate commander itself
 * is excluded. De-duplicated by normalized name.
 *
 * Returned sorted by synergy desc, then inclusion desc, then name — the
 * service groups them by type for display.
 */
export function buildSupportCards(
  deckCards: readonly FinderDeckCard[],
  recommendations: readonly EdhrecRecommendation[],
  commanderName: string,
): CommanderSupportCard[] {
  // Index EDHREC recs by normalized name, keeping the strongest-synergy entry.
  const recByName = new Map<string, EdhrecRecommendation>();
  for (const rec of recommendations) {
    const key = normalizeCardName(rec.name);
    if (!key) continue;
    const existing = recByName.get(key);
    if (!existing || (rec.synergy ?? -Infinity) > (existing.synergy ?? -Infinity)) {
      recByName.set(key, rec);
    }
  }

  const commanderKey = normalizeCardName(commanderName);
  const seen = new Set<string>();
  const support: CommanderSupportCard[] = [];

  for (const card of deckCards) {
    const key = normalizeCardName(card.name);
    if (!key || key === commanderKey || seen.has(key)) continue;

    const rec = recByName.get(key);
    if (!rec) continue; // not an EDHREC pick for this commander → not support
    seen.add(key);

    support.push({
      name: card.name,
      scryfallId: card.scryfallId ?? rec.scryfallId,
      cardType: classifyCardType(card.types.join(' ')),
      synergy: rec.synergy,
      inclusion: rec.inclusion,
      category: rec.category,
    });
  }

  support.sort(
    (a, b) =>
      (b.synergy ?? -Infinity) - (a.synergy ?? -Infinity) ||
      (b.inclusion ?? -Infinity) - (a.inclusion ?? -Infinity) ||
      a.name.localeCompare(b.name),
  );

  return support;
}

/**
 * Orders support cards by canonical card type (CARD_TYPE_ORDER), preserving
 * the best-first order within each type. Used to render the decklist grouped
 * like the rest of the app.
 */
export function groupSupportByType(
  support: readonly CommanderSupportCard[],
): CommanderSupportCard[] {
  const byType = new Map<string, CommanderSupportCard[]>();
  for (const card of support) {
    const list = byType.get(card.cardType);
    if (list) list.push(card);
    else byType.set(card.cardType, [card]);
  }

  const ordered: CommanderSupportCard[] = [];
  for (const type of CARD_TYPE_ORDER) {
    const cards = byType.get(type);
    if (cards) ordered.push(...cards);
  }
  // Append any types not in the canonical order (defensive).
  for (const [type, cards] of byType) {
    if (!CARD_TYPE_ORDER.includes(type)) {
      ordered.push(...cards);
    }
  }
  return ordered;
}

/**
 * Computes the blended ranking score for a candidate from its support count,
 * total positive synergy, and whether it's part of a deck combo.
 *
 *   score = supportCount + SYNERGY_WEIGHT * totalSynergy + (inCombo ? COMBO_BOOST : 0)
 *
 * Only positive synergy contributes (a card that's below-average for the
 * commander shouldn't reduce the score below its "it's a match" value).
 */
export function scoreCandidate(
  supportCount: number,
  synergyScore: number,
  inCombo: boolean,
): number {
  const boost = inCombo ? COMBO_BOOST : 0;
  return supportCount + SYNERGY_WEIGHT * synergyScore + boost;
}

/**
 * Sums the positive synergy across a support list. Cards with null or
 * non-positive synergy contribute 0.
 */
export function sumPositiveSynergy(
  support: readonly CommanderSupportCard[],
): number {
  let total = 0;
  for (const card of support) {
    if (card.synergy != null && card.synergy > 0) total += card.synergy;
  }
  return total;
}

/**
 * Final ranking comparator for candidates: highest blended score first, then
 * more supporting cards, then higher EDHREC popularity (lower rank number),
 * then name for stable output. Combo commanders naturally rise via the score's
 * combo boost. Sorts in place and returns the array.
 */
export function rankCandidates(
  candidates: CommanderCandidate[],
): CommanderCandidate[] {
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.supportCount - a.supportCount ||
      (a.edhrecRank ?? Infinity) - (b.edhrecRank ?? Infinity) ||
      a.name.localeCompare(b.name),
  );
  return candidates;
}
