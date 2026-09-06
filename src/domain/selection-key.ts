/**
 * Selection / build cache-key building — pure, side-effect-free logic for
 * turning a `CommanderSelection` (and a Moxfield username) into the stable
 * cache keys used by the EDHREC and Build-a-Commander caches.
 *
 * Cache keys follow the app-wide `edh:<type>:<id>` convention and are
 * lowercased. The `<id>` for a selection is a deterministic,
 * normalization-stable join of the normalized commander (plus any partner and
 * companion) names: selections that differ only by the case or surrounding
 * whitespace of their names — or, for a partnered pair, by which slot each
 * commander was typed into — collapse to the same key. This guarantees a
 * repeat lookup for the "same" selection is a cache hit.
 */

import type { CommanderSelection } from '../types.js';
import { normalizeCardName } from './deck-similarity.js';

/** Separator between the commander component parts within a selection key. */
const SELECTION_SEPARATOR = '|';

/**
 * Builds the deterministic, normalization-stable selection key for a
 * `CommanderSelection`.
 *
 * The commander and (optional) partner are normalized and sorted so a
 * partnered pair produces the same key regardless of which commander was
 * entered first. The (optional) companion is appended as a distinct
 * component — it is a separate role, so swapping a companion with a commander
 * yields a different selection and therefore a different key.
 *
 * Normalization reuses `normalizeCardName`, so names differing only by case,
 * surrounding/internal whitespace, or a `//` split-card face collapse to the
 * same key.
 */
export function selectionKey(selection: CommanderSelection): string {
  const commander = normalizeCardName(selection.commander);
  const partner = selection.partner ? normalizeCardName(selection.partner) : '';

  // Sort the commander pair into a canonical order so the same pairing is
  // stable regardless of which slot each name was typed into. A missing
  // partner drops out entirely rather than contributing an empty component.
  const commanders = [commander, partner]
    .filter((part) => part.length > 0)
    .sort();

  const companion = selection.companion
    ? normalizeCardName(selection.companion)
    : '';

  const parts = [...commanders];
  // Always reserve the companion slot so a selection with a companion is
  // distinguishable from one without, even when the companion normalizes away.
  parts.push(companion);

  return parts.join(SELECTION_SEPARATOR);
}

/**
 * Builds the Build-a-Commander result cache key for a username + selection.
 *
 * Format: `edh:build:<username>:<selectionKey>[:<deckSelectionKey>]`,
 * lowercased per the app-wide cache-key convention. The username is normalized
 * (trimmed, whitespace collapsed, lowercased) so usernames differing only by
 * case or surrounding whitespace resolve to the same cached result.
 *
 * When `selectedDeckIds` is supplied, a deterministic (sorted, de-duplicated)
 * component derived from the chosen Moxfield deck publicIds is appended so a
 * build seeded from a subset of decks doesn't collide with the all-decks build
 * or with a build from a different subset. `undefined` (no deck selection made
 * — the default all-decks flow) appends nothing, preserving the original key
 * so existing cached results still hit.
 */
export function buildCacheKey(
  username: string,
  selection: CommanderSelection,
  selectedDeckIds?: readonly string[],
): string {
  const normalizedUsername = username.trim().replace(/\s+/g, ' ').toLowerCase();
  const base = `edh:build:${normalizedUsername}:${selectionKey(selection)}`;
  if (selectedDeckIds === undefined) return base;
  return `${base}:${deckSelectionKey(selectedDeckIds)}`;
}

/**
 * Builds a deterministic, order-independent key component for a set of chosen
 * Moxfield deck publicIds. Ids are trimmed, lowercased, de-duplicated, and
 * sorted so the same set of decks always yields the same component regardless
 * of the order they were submitted in. An empty selection yields the sentinel
 * `none` so "explicitly picked no decks" is distinguishable from a populated
 * selection.
 */
export function deckSelectionKey(deckIds: readonly string[]): string {
  const normalized = Array.from(
    new Set(deckIds.map((id) => id.trim().toLowerCase()).filter(Boolean)),
  ).sort();
  return normalized.length > 0 ? `decks:${normalized.join(',')}` : 'decks:none';
}

/**
 * Builds the cache key for a user's selectable deck list (the projection shown
 * on the deck-selection screen). Format: `edh:decklist:<username>`, with the
 * username normalized the same way as the build key.
 */
export function deckListCacheKey(username: string): string {
  const normalizedUsername = username.trim().replace(/\s+/g, ' ').toLowerCase();
  // Version suffix (v3) so entries cached before art_crop portraits + color
  // identity were added don't collide — old entries lacked those fields.
  return `edh:decklist:v3:${normalizedUsername}`;
}
