/**
 * Build-a-Commander section grouping — pure, side-effect-free.
 *
 * Turns the flat owned / to-buy card lists (already enriched with each card's
 * EDHREC `category` and canonical `cardType`) into the section-and-type tree
 * the results page renders:
 *
 *   BuildSection[]                       // one per EDHREC panel, in EDHREC order
 *     ├─ ownedGroups: BuildTypeGroup[]   // owned cards, grouped by card type
 *     └─ toBuyGroups: BuildTypeGroup[]   // to-buy cards, grouped by card type
 *
 * EDHREC lists some cards under multiple panels (e.g. a card can be both a
 * "Top Card" and a "Creature"); we mirror that — a card appears in every
 * section its recommendations name. Section order follows the order sections
 * are first encountered in the input (which the service preserves from the
 * EDHREC payload). Card-type sub-groups follow CARD_TYPE_ORDER.
 */

import type {
  BuildCommanderCard,
  BuildSection,
  BuildTypeGroup,
} from '../types.js';
import { CARD_TYPE_ORDER } from './card-type.js';

/** Rounds a monetary amount to 2 decimal places. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Groups a list of cards by their canonical `cardType`, returning the groups
 * in CARD_TYPE_ORDER (types with no cards are omitted). Within a type, card
 * order is preserved from the input.
 */
function groupByType(cards: BuildCommanderCard[]): BuildTypeGroup[] {
  const byType = new Map<string, BuildCommanderCard[]>();
  for (const card of cards) {
    const type = card.cardType || 'Other';
    const bucket = byType.get(type);
    if (bucket) bucket.push(card);
    else byType.set(type, [card]);
  }

  const groups: BuildTypeGroup[] = [];
  // Known types first, in canonical order...
  for (const type of CARD_TYPE_ORDER) {
    const cardsOfType = byType.get(type);
    if (cardsOfType && cardsOfType.length > 0) {
      groups.push({ type, cards: cardsOfType });
      byType.delete(type);
    }
  }
  // ...then any unexpected types not in CARD_TYPE_ORDER, alphabetically.
  for (const type of [...byType.keys()].sort((a, b) => a.localeCompare(b))) {
    groups.push({ type, cards: byType.get(type)! });
  }
  return groups;
}

/**
 * Builds the ordered `BuildSection[]` from the flat owned / to-buy lists.
 *
 * `sectionOrder` fixes the section ordering (EDHREC panel order); any section
 * present on a card but absent from `sectionOrder` is appended in first-seen
 * order. A section with neither owned nor to-buy cards is omitted.
 */
export function buildSections(
  ownedCards: readonly BuildCommanderCard[],
  toBuyCards: readonly BuildCommanderCard[],
  sectionOrder: readonly string[],
): BuildSection[] {
  const ownedBySection = new Map<string, BuildCommanderCard[]>();
  const toBuyBySection = new Map<string, BuildCommanderCard[]>();
  const seen: string[] = [];

  const record = (
    map: Map<string, BuildCommanderCard[]>,
    card: BuildCommanderCard,
  ) => {
    const key = card.category || 'Other';
    const bucket = map.get(key);
    if (bucket) bucket.push(card);
    else map.set(key, [card]);
    if (!seen.includes(key)) seen.push(key);
  };

  for (const card of ownedCards) record(ownedBySection, card);
  for (const card of toBuyCards) record(toBuyBySection, card);

  // Section iteration order: the provided EDHREC order first, then any extra
  // sections in first-seen order.
  const orderedSections: string[] = [];
  for (const name of sectionOrder) {
    if ((ownedBySection.has(name) || toBuyBySection.has(name)) &&
        !orderedSections.includes(name)) {
      orderedSections.push(name);
    }
  }
  for (const name of seen) {
    if (!orderedSections.includes(name)) orderedSections.push(name);
  }

  const sections: BuildSection[] = [];
  for (const name of orderedSections) {
    const owned = ownedBySection.get(name) ?? [];
    const toBuy = toBuyBySection.get(name) ?? [];
    if (owned.length === 0 && toBuy.length === 0) continue;

    const toBuyTotalCad = roundMoney(
      toBuy.reduce((sum, card) => sum + (card.cad ?? 0), 0),
    );

    sections.push({
      name,
      ownedGroups: groupByType(owned),
      toBuyGroups: groupByType(toBuy),
      ownedCount: owned.length,
      toBuyCount: toBuy.length,
      toBuyTotalCad,
    });
  }

  return sections;
}
