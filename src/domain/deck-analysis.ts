/**
 * Deck salt / power-level / bracket estimation — pure, side-effect-free logic.
 *
 * EDHREC publishes a global "salt" score per card (how much players dislike
 * seeing it — Stasis, Winter Orb, Cyclonic Rift, etc.). We join a deck's cards
 * against that dataset to compute how "salty" a deck plays, and combine it with
 * a couple of other EDHREC signals (the "Game Changers" panel for the commander
 * and the commander's popularity) into a rough Commander-bracket ESTIMATE.
 *
 * Everything here is heuristic and clearly surfaced as an estimate in the UI —
 * there is no authoritative power formula for Commander, so this is a
 * conversation-starter, not a verdict.
 */

import type { DeckSaltAnalysis, SaltyCard } from '../types.js';
import { normalizeCardName } from './deck-similarity.js';

/** A deck card reduced to what salt analysis needs. */
export interface SaltInputCard {
  name: string;
  scryfallId: string | null;
}

/** A single global salt score keyed by card name. */
export interface SaltScore {
  name: string;
  salt: number;
}

/** Rounds to 2 decimals. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** How many top salty cards to surface in the breakdown. */
const TOP_SALTY_LIMIT = 10;

/** Salt threshold above which a single card is considered "notably salty". */
const HIGH_SALT_THRESHOLD = 1.5;

/**
 * Builds a normalized-name → salt lookup from the global salt dataset.
 * Later duplicates (same normalized name) keep the higher salt score.
 */
export function buildSaltIndex(scores: readonly SaltScore[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const s of scores) {
    const key = normalizeCardName(s.name);
    if (!key) continue;
    const existing = index.get(key);
    if (existing == null || s.salt > existing) index.set(key, s.salt);
  }
  return index;
}

/**
 * Estimates a Commander bracket (1–5) from the salt profile, the number of
 * "Game Changer" cards present, and the commander's EDHREC popularity, and
 * returns the estimate plus a short rationale.
 *
 * The mapping is intentionally simple and transparent:
 *   - Game Changers are the strongest signal (WotC's own bracket framework is
 *     built around them): 0 → nudges lower, several → nudges toward 4–5.
 *   - Average salt of the deck's salty cards captures "stax/oppressive" feel.
 *   - A large count of high-salt cards reinforces a higher bracket.
 * These are combined into a 1–5 clamp. This is an estimate, not a ruling.
 */
export function estimateBracket(params: {
  averageSalt: number;
  highSaltCount: number;
  gameChangerCount: number;
}): { bracket: number; rationale: string[] } {
  const { averageSalt, highSaltCount, gameChangerCount } = params;
  const rationale: string[] = [];

  // Start from a baseline "casual/optimized" bracket and adjust upward.
  let score = 2;

  if (gameChangerCount >= 3) {
    score += 2;
    rationale.push(`${gameChangerCount} Game Changers present — a strong high-power signal.`);
  } else if (gameChangerCount >= 1) {
    score += 1;
    rationale.push(`${gameChangerCount} Game Changer${gameChangerCount === 1 ? '' : 's'} present.`);
  } else {
    rationale.push('No EDHREC "Game Changer" cards detected.');
  }

  if (averageSalt >= 1.8) {
    score += 1;
    rationale.push(`High average salt (${round2(averageSalt)}) — several oppressive/feel-bad cards.`);
  } else if (averageSalt > 0) {
    rationale.push(`Moderate average salt (${round2(averageSalt)}).`);
  } else {
    rationale.push('No notably salty cards detected.');
  }

  if (highSaltCount >= 8) {
    score += 1;
    rationale.push(`${highSaltCount} cards above the "salty" threshold.`);
  } else if (highSaltCount > 0) {
    rationale.push(`${highSaltCount} card${highSaltCount === 1 ? '' : 's'} above the "salty" threshold.`);
  }

  const bracket = Math.max(1, Math.min(5, score));
  return { bracket, rationale };
}

/**
 * Computes the salt / power / bracket analysis for a deck.
 *
 * @param cards        The deck's non-commander cards (names + ids).
 * @param saltIndex    normalized-name → salt score (from `buildSaltIndex`).
 * @param gameChangers Names of the commander's EDHREC "Game Changers" that are
 *                     present in the deck (already filtered to the deck).
 */
export function analyzeDeckSalt(
  cards: readonly SaltInputCard[],
  saltIndex: ReadonlyMap<string, number>,
  gameChangers: readonly string[],
): DeckSaltAnalysis {
  const salty: SaltyCard[] = [];
  let totalSalt = 0;
  let highSaltCount = 0;

  for (const card of cards) {
    const salt = saltIndex.get(normalizeCardName(card.name));
    if (salt == null) continue;
    salty.push({ name: card.name, scryfallId: card.scryfallId, salt: round2(salt) });
    totalSalt += salt;
    if (salt >= HIGH_SALT_THRESHOLD) highSaltCount++;
  }

  const saltyCardCount = salty.length;
  const averageSalt = saltyCardCount === 0 ? 0 : totalSalt / saltyCardCount;

  const topSaltyCards = [...salty]
    .sort((a, b) => b.salt - a.salt || a.name.localeCompare(b.name))
    .slice(0, TOP_SALTY_LIMIT);

  const uniqueGameChangers = [...new Set(gameChangers)].sort((a, b) =>
    a.localeCompare(b),
  );

  const { bracket, rationale } = estimateBracket({
    averageSalt,
    highSaltCount,
    gameChangerCount: uniqueGameChangers.length,
  });

  return {
    saltyCardCount,
    totalSalt: round2(totalSalt),
    averageSalt: round2(averageSalt),
    topSaltyCards,
    gameChangerCount: uniqueGameChangers.length,
    gameChangers: uniqueGameChangers,
    estimatedBracket: bracket,
    bracketRationale: rationale,
  };
}
