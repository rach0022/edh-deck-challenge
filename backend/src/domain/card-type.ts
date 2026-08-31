/**
 * Card type classification — maps a Magic type line to a single canonical
 * category used for grouping cards in the UI.
 *
 * Pure, no I/O. Shared by the challenge deck-detail view and the cEDH match
 * page so both group cards identically.
 */

/**
 * Canonical display order for card type groups. Cards are bucketed into
 * exactly one of these; unknown types fall through to "Other".
 */
export const CARD_TYPE_ORDER: readonly string[] = [
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

/**
 * Parses a card's type line into an ordered array of individual types.
 *
 * Uses only the FRONT face for DFCs / split cards. Splits on the em-dash (or
 * hyphen) that separates supertypes+types from subtypes, then tokenizes each
 * side on whitespace. e.g.:
 *   "Legendary Creature — Merfolk Wizard" → ["Legendary","Creature","Merfolk","Wizard"]
 *   "Instant"                              → ["Instant"]
 *   "Land — Island Swamp"                  → ["Land","Island","Swamp"]
 */
export function parseTypeLine(typeLine: string): string[] {
  const front = (typeLine ?? '').split('//')[0];
  // Normalize the em-dash and any hyphen separators to a single delimiter.
  return front
    .replace(/[—–-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Classifies a card's type line into one canonical category.
 *
 * For double-faced / split cards ("A // B"), only the FRONT face's type is
 * considered, matching how these cards are categorized in decklists.
 *
 * Checks are ordered by priority so multi-type cards land in the most
 * meaningful bucket — e.g. "Artifact Creature" → Creature, "Enchantment
 * Creature" → Creature.
 */
export function classifyCardType(typeLine: string): string {
  // Use only the front face for DFCs / split cards.
  const front = (typeLine ?? '').split('//')[0];
  const normalized = front.toLowerCase();

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
