/**
 * Cut / upgrade suggestions — pure, side-effect-free logic.
 *
 * Given a deck's cards and EDHREC's recommendation set for the deck's
 * commander, this produces two lists:
 *
 *   - CUT candidates: non-land, non-commander cards the deck runs that don't
 *     appear anywhere in EDHREC's recommendation set for this commander. A card
 *     absent from every EDHREC panel is an off-meta / personal pick — a
 *     reasonable "consider cutting" signal (never a mandate; the UI frames it
 *     as a suggestion).
 *   - ADD suggestions: high-synergy / high-inclusion EDHREC recommendations the
 *     deck is missing, so the user has a concrete upgrade shortlist.
 *
 * All joins use the shared `normalizeCardName` so "A // B" faces, case, and
 * whitespace differences don't cause false matches.
 */

import type {
  AddSuggestion,
  CutCandidate,
  EdhrecRecommendation,
} from '../types.js';
import { normalizeCardName } from './deck-similarity.js';
import { classifyCardType } from './card-type.js';

/** A deck card reduced to what suggestion logic needs. */
export interface SuggestionInputCard {
  name: string;
  scryfallId: string | null;
  /** Parsed type tokens (from `parseTypeLine`), used to skip lands. */
  types: string[];
}

/**
 * Synergy at or above which a missing EDHREC card is worth suggesting as an
 * add. EDHREC synergy is roughly -0.2..+0.3; 0.15 captures the genuinely
 * on-theme cards without flooding the list with generic staples.
 */
const ADD_SYNERGY_THRESHOLD = 0.15;

/**
 * Inclusion at or above which a missing card is worth suggesting even if its
 * synergy is modest (i.e. a near-ubiquitous staple for this commander).
 */
const ADD_INCLUSION_THRESHOLD = 0.5;

/** Max add suggestions returned (keeps the shortlist actionable). */
const MAX_ADDS = 25;

/** True when the card's front-face type line is a Land (excluded from cuts). */
function isLand(types: readonly string[]): boolean {
  return classifyCardType(types.join(' ')) === 'Land';
}

/**
 * Computes cut candidates: the deck's non-land, non-commander cards that are
 * NOT in the EDHREC recommendation set for this commander.
 *
 * @param deckCards      The deck's cards (mainboard, incl. commanders — filtered out here).
 * @param recommendations EDHREC recommendations for the commander.
 * @param commanderNames Commander name(s) to exclude from cut candidates.
 */
export function findCutCandidates(
  deckCards: readonly SuggestionInputCard[],
  recommendations: readonly EdhrecRecommendation[],
  commanderNames: readonly string[],
): CutCandidate[] {
  const recByName = new Map<string, EdhrecRecommendation>();
  for (const rec of recommendations) {
    const key = normalizeCardName(rec.name);
    if (key && !recByName.has(key)) recByName.set(key, rec);
  }

  const commanderSet = new Set<string>();
  for (const name of commanderNames) {
    const key = normalizeCardName(name);
    if (key) commanderSet.add(key);
  }

  const seen = new Set<string>();
  const cuts: CutCandidate[] = [];

  for (const card of deckCards) {
    const key = normalizeCardName(card.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    if (commanderSet.has(key)) continue; // never suggest cutting the commander
    if (isLand(card.types)) continue; // lands are out of scope for cuts

    // A card that IS an EDHREC pick is kept (not a cut candidate), regardless
    // of how low its synergy is — being a recognized pick is enough signal.
    if (recByName.has(key)) continue;

    cuts.push({
      name: card.name,
      scryfallId: card.scryfallId,
      type: classifyCardType(card.types.join(' ')),
      inclusion: null,
      synergy: null,
      reason: 'Not an EDHREC pick for this commander',
    });
  }

  // Group by type order-ish then name for stable, scannable output.
  cuts.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  return cuts;
}

/**
 * Computes add suggestions: EDHREC recommendations the deck is missing whose
 * synergy or inclusion clears the thresholds, sorted best-first (synergy desc,
 * then inclusion desc, then name). Commander cards and cards already in the
 * deck are excluded. De-duplicated by normalized name (EDHREC lists a card in
 * multiple panels).
 */
export function findAddSuggestions(
  deckCards: readonly SuggestionInputCard[],
  recommendations: readonly EdhrecRecommendation[],
  commanderNames: readonly string[],
): AddSuggestion[] {
  const owned = new Set<string>();
  for (const card of deckCards) {
    const key = normalizeCardName(card.name);
    if (key) owned.add(key);
  }
  for (const name of commanderNames) {
    const key = normalizeCardName(name);
    if (key) owned.add(key);
  }

  const seen = new Set<string>();
  const adds: AddSuggestion[] = [];

  for (const rec of recommendations) {
    const key = normalizeCardName(rec.name);
    if (!key || owned.has(key) || seen.has(key)) continue;

    const synergy = rec.synergy;
    const inclusion = rec.inclusion;
    const worthy =
      (synergy != null && synergy >= ADD_SYNERGY_THRESHOLD) ||
      (inclusion != null && inclusion >= ADD_INCLUSION_THRESHOLD);
    if (!worthy) continue;

    seen.add(key);
    adds.push({
      name: rec.name,
      scryfallId: rec.scryfallId,
      category: rec.category,
      inclusion,
      synergy,
    });
  }

  adds.sort(
    (a, b) =>
      (b.synergy ?? -Infinity) - (a.synergy ?? -Infinity) ||
      (b.inclusion ?? -Infinity) - (a.inclusion ?? -Infinity) ||
      a.name.localeCompare(b.name),
  );

  return adds.slice(0, MAX_ADDS);
}
