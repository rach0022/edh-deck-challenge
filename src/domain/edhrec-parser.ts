/**
 * EDHREC parser — pure, side-effect-free logic for turning EDHREC's
 * (unofficial) commander JSON payload into a flat list of recommendations,
 * and for applying the companion constraint to a recommendation set.
 *
 * EDHREC's commander endpoint (`https://json.edhrec.com/commanders/<slug>.json`)
 * returns a large object. The recommendation card lists live under
 * `container.json_dict.cardlists`, an array of panels each shaped like:
 *
 *   { header: "High Synergy Cards", tag: "highsynergycards", cardviews: [
 *       { id: "<scryfall-id>", name: "Sol Ring", synergy: -0.0195,
 *         num_decks: 37478, potential_decks: 44077, slug, url, ... },
 *       ...
 *   ] }
 *
 * From each cardview we take:
 *   - name       → the display name
 *   - header     → the category/panel the card came from
 *   - inclusion  → num_decks / potential_decks (a 0..1 inclusion rate),
 *                  or null when the counts are missing/invalid
 *   - synergy    → the raw synergy score, or null when absent
 *   - scryfallId → the cardview `id` (a Scryfall UUID), or null
 *   - setCode / collectorNumber → not present per-card in the panel data, so
 *                  null (kept in the shape for pricing/art hints filled elsewhere)
 *
 * Because the endpoint is unofficial and its shape can drift, every access is
 * defensive: an empty, missing, or malformed payload yields `[]` rather than
 * throwing. This quarantines endpoint fragility to this one module.
 */

import type { CommanderSelection, EdhrecRecommendation } from '../types.js';
import { normalizeCardName } from './deck-similarity.js';

/** Narrows an unknown value to a plain (non-array, non-null) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns a finite number, or null for anything else (NaN, strings, etc.). */
function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Locates the `cardlists` array within an EDHREC payload, tolerating a couple
 * of shapes: the canonical `container.json_dict.cardlists`, plus a top-level
 * `cardlists` fallback (some cached/older shapes surface it there).
 */
function findCardlists(payload: unknown): unknown[] {
  if (!isRecord(payload)) return [];

  const container = payload.container;
  if (isRecord(container)) {
    const jsonDict = container.json_dict;
    if (isRecord(jsonDict) && Array.isArray(jsonDict.cardlists)) {
      return jsonDict.cardlists;
    }
  }

  // Fallbacks: a directly-embedded json_dict, or a top-level cardlists array.
  const jsonDict = payload.json_dict;
  if (isRecord(jsonDict) && Array.isArray(jsonDict.cardlists)) {
    return jsonDict.cardlists;
  }
  if (Array.isArray(payload.cardlists)) {
    return payload.cardlists;
  }

  return [];
}

/**
 * Computes a card's inclusion rate from a cardview's deck counts.
 * `num_decks / potential_decks`, clamped to a sane 0..1 range; null when the
 * counts are missing or the denominator is not positive.
 */
function computeInclusion(cardview: Record<string, unknown>): number | null {
  const numDecks = finiteOrNull(cardview.num_decks);
  const potentialDecks = finiteOrNull(cardview.potential_decks);
  if (numDecks === null || potentialDecks === null || potentialDecks <= 0) {
    return null;
  }
  const ratio = numDecks / potentialDecks;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

/**
 * Converts a single EDHREC cardview into an `EdhrecRecommendation`, or null
 * when the entry is malformed (not an object, or missing a usable name).
 */
function parseCardview(cardview: unknown, category: string): EdhrecRecommendation | null {
  if (!isRecord(cardview)) return null;

  const name = typeof cardview.name === 'string' ? cardview.name.trim() : '';
  if (!name) return null;

  const scryfallId = typeof cardview.id === 'string' && cardview.id ? cardview.id : null;

  return {
    name,
    category,
    inclusion: computeInclusion(cardview),
    synergy: finiteOrNull(cardview.synergy),
    scryfallId,
    // The panel cardviews don't carry printing hints; these stay null and are
    // resolved from Scryfall printing data downstream when pricing/art is needed.
    setCode: null,
    collectorNumber: null,
  };
}

/**
 * Parses an EDHREC commander JSON payload into a flat list of recommendations.
 *
 * Iterates every `cardlist` panel, using its `header` as the recommendation
 * category, and flattens all `cardviews` into `EdhrecRecommendation` entries.
 * Malformed panels/cardviews are skipped; an empty or malformed payload
 * yields an empty array.
 */
/**
 * The commander's own EDHREC popularity stats, extracted from
 * `container.json_dict.card`: its overall `rank` (1 = most-played commander on
 * EDHREC) and `num_decks` (how many decks run it). Both are null when the
 * payload doesn't carry them (older/partnered/malformed shapes).
 */
export interface EdhrecCommanderRank {
  rank: number | null;
  numDecks: number | null;
}

/**
 * Extracts the commander's EDHREC rank + deck count from a payload. Looks at
 * `container.json_dict.card`, with a fallback to a top-level `card`. Missing or
 * malformed data yields `{ rank: null, numDecks: null }` rather than throwing.
 */
export function parseCommanderRank(payload: unknown): EdhrecCommanderRank {
  const empty: EdhrecCommanderRank = { rank: null, numDecks: null };
  if (!isRecord(payload)) return empty;

  let card: unknown;
  const container = payload.container;
  if (isRecord(container) && isRecord(container.json_dict)) {
    card = container.json_dict.card;
  }
  if (!isRecord(card) && isRecord(payload.json_dict)) {
    card = payload.json_dict.card;
  }
  if (!isRecord(card) && isRecord(payload.card)) {
    card = payload.card;
  }
  if (!isRecord(card)) return empty;

  return {
    rank: finiteOrNull(card.rank),
    numDecks: finiteOrNull(card.num_decks),
  };
}

export function parseEdhrecRecommendations(payload: unknown): EdhrecRecommendation[] {
  const cardlists = findCardlists(payload);
  const recommendations: EdhrecRecommendation[] = [];

  for (const panel of cardlists) {
    if (!isRecord(panel)) continue;

    const category = typeof panel.header === 'string' ? panel.header.trim() : '';
    const cardviews = panel.cardviews;
    if (!Array.isArray(cardviews)) continue;

    for (const cardview of cardviews) {
      const parsed = parseCardview(cardview, category);
      if (parsed) recommendations.push(parsed);
    }
  }

  return recommendations;
}

/**
 * Applies the companion constraint (Req 5.3) to a recommendation set.
 *
 * A companion legally restricts a deck's card pool to those cards consistent
 * with the companion's condition. Given the set of card names that are legal
 * under the chosen companion (its "legal set", normalized for comparison),
 * this keeps only recommendations whose normalized name is in that set — no
 * card outside the companion-consistent set survives.
 *
 * When there is no companion (`companionLegalNames` is null/undefined), the
 * recommendation set is unconstrained and returned unchanged. An empty legal
 * set constrains the result to nothing.
 */
export function applyCompanionConstraint(
  recommendations: EdhrecRecommendation[],
  companionLegalNames: Iterable<string> | null | undefined,
): EdhrecRecommendation[] {
  if (companionLegalNames == null) {
    return recommendations;
  }

  const legalSet = new Set<string>();
  for (const name of companionLegalNames) {
    const normalized = normalizeCardName(name);
    if (normalized) legalSet.add(normalized);
  }

  return recommendations.filter((rec) => legalSet.has(normalizeCardName(rec.name)));
}

/**
 * Parses an EDHREC payload and, when the selection includes a companion,
 * constrains the resulting recommendations to the companion's legal set.
 *
 * `companionLegalNames` is the set of card names EDHREC returns as legal under
 * the chosen companion (resolved by the caller from the companion-specific
 * payload/segment). It is only consulted when `selection.companion` is set.
 */
export function parseRecommendationsForSelection(
  payload: unknown,
  selection: CommanderSelection,
  companionLegalNames?: Iterable<string> | null,
): EdhrecRecommendation[] {
  const recommendations = parseEdhrecRecommendations(payload);
  if (!selection.companion) {
    return recommendations;
  }
  return applyCompanionConstraint(recommendations, companionLegalNames ?? []);
}
