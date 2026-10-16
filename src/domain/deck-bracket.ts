/**
 * Commander bracket estimation from a deck's combo profile — pure,
 * side-effect-free logic.
 *
 * Wizards of the Coast's official Commander "bracket" system rates decks 1–5:
 *   1 Exhibition · 2 Core · 3 Upgraded · 4 Optimized · 5 cEDH
 * Two-card infinite combos and the density of combos are a central signal in
 * that framework (a Core/Upgraded deck is expected to avoid, or run few,
 * early two-card wins; Optimized/cEDH lean into them).
 *
 * The 32-deck challenge view already fetches each deck's full Commander
 * Spellbook combo list (for the combo-count badge), so we can derive a cheap,
 * transparent bracket from that data with no extra network calls:
 *   - the number of complete combos present in the deck, and
 *   - how many of those are compact two-card combos (a stronger high-power
 *     signal than longer, more fragile combos).
 *
 * This is a heuristic ESTIMATE, not an official ruling — it's surfaced in the
 * UI as such. A deck with no detected combos stays at the casual baseline.
 */

/** A combo reduced to just what the bracket heuristic needs. */
export interface BracketComboInput {
  /** Number of distinct cards the combo uses (Spellbook `cardCount`). */
  cardCount: number;
}

/** Where a deck's final bracket came from. */
export type BracketSource = 'moxfield' | 'estimated';

/** The estimated Commander bracket plus the signals behind it. */
export interface BracketEstimate {
  /** 1–5 Commander bracket. */
  bracket: number;
  /** Official WotC bracket name (Exhibition … cEDH). */
  label: string;
  /** Short, human-readable reasons for the estimate. */
  rationale: string[];
  /**
   * Whether the bracket is Moxfield's own value or our heuristic estimate.
   * Lets the UI mark estimated brackets with a "~" / tooltip.
   */
  source: BracketSource;
}

/** Official WotC Commander bracket names, indexed 1–5. */
export const BRACKET_LABELS: Record<number, string> = {
  1: 'Exhibition',
  2: 'Core',
  3: 'Upgraded',
  4: 'Optimized',
  5: 'cEDH',
};

/** Returns the official bracket name for a 1–5 bracket number. */
export function bracketLabel(bracket: number): string {
  return BRACKET_LABELS[bracket] ?? 'Unknown';
}

/**
 * Estimates a Commander bracket (1–5) from the deck's combos AND its EDHREC
 * "Game Changers" — used as a FALLBACK when Moxfield has no bracket for a deck.
 *
 * Signals (all transparent, additive from a baseline):
 *   - Game Changers: WotC's bracket framework is built around them — several
 *     present is a strong high-power signal.
 *   - Combo density: more complete combos nudges the bracket up.
 *   - Compact two-card combos: fast, resilient win conditions push higher.
 *
 * A deck with no combos and no Game Changers stays at the casual baseline.
 *
 * @param comboCount       Number of complete combos present in the deck.
 * @param combos           Those combos reduced to each one's `cardCount`.
 * @param gameChangerCount Number of EDHREC "Game Changer" cards in the deck.
 */
export function estimateBracketFromCombos(params: {
  comboCount: number;
  combos: readonly BracketComboInput[];
  gameChangerCount?: number;
}): BracketEstimate {
  const { comboCount, combos, gameChangerCount = 0 } = params;
  const twoCardCombos = combos.filter((c) => c.cardCount <= 2).length;
  const rationale: string[] = [];

  // Baseline casual/core deck; each signal nudges it upward.
  let score = 2;

  // Game Changers — the strongest single signal in WotC's framework.
  if (gameChangerCount >= 3) {
    score += 2;
    rationale.push(`${gameChangerCount} Game Changers present — a strong high-power signal.`);
  } else if (gameChangerCount >= 1) {
    score += 1;
    rationale.push(
      `${gameChangerCount} Game Changer${gameChangerCount === 1 ? '' : 's'} present.`,
    );
  } else {
    rationale.push('No EDHREC "Game Changer" cards detected.');
  }

  // Combo density.
  if (comboCount >= 6) {
    score += 2;
    rationale.push(`${comboCount} combos present — a high combo density.`);
  } else if (comboCount >= 3) {
    score += 1;
    rationale.push(`${comboCount} combos present.`);
  } else if (comboCount > 0) {
    rationale.push(`${comboCount} combo${comboCount === 1 ? '' : 's'} present.`);
  } else {
    rationale.push('No two-card or multi-card combos detected.');
  }

  // Compact two-card combos are a strong high-power signal.
  if (twoCardCombos >= 3) {
    score += 2;
    rationale.push(`${twoCardCombos} two-card combos — fast, compact win conditions.`);
  } else if (twoCardCombos >= 1) {
    score += 1;
    rationale.push(
      `${twoCardCombos} two-card combo${twoCardCombos === 1 ? '' : 's'} present.`,
    );
  }

  const bracket = Math.max(1, Math.min(5, score));
  return { bracket, label: bracketLabel(bracket), rationale, source: 'estimated' };
}

/** The Moxfield-native bracket fields read from the v3 deck detail. */
export interface MoxfieldBracketInfo {
  /** The effective bracket Moxfield reports (1–5), or null when absent. */
  bracket: number | null;
  /** True when the author opted the deck out of brackets. */
  ignoreBrackets?: boolean;
}

/**
 * Resolves a deck's FINAL Commander bracket, preferring Moxfield's own value
 * and falling back to the Game-Changer-aware combo estimate.
 *
 * Moxfield's `bracket` is authoritative when present and the author hasn't
 * opted out (`ignoreBrackets`). Otherwise we estimate from combos + Game
 * Changers. The returned `source` tells the UI which path was taken so it can
 * mark estimates as approximate.
 */
export function resolveDeckBracket(params: {
  moxfield: MoxfieldBracketInfo | null;
  comboCount: number;
  combos: readonly BracketComboInput[];
  gameChangerCount?: number;
}): BracketEstimate {
  const { moxfield, comboCount, combos, gameChangerCount = 0 } = params;

  const mox = moxfield?.bracket;
  if (!moxfield?.ignoreBrackets && typeof mox === 'number' && mox >= 1 && mox <= 5) {
    return {
      bracket: mox,
      label: bracketLabel(mox),
      rationale: ["Moxfield's bracket for this deck."],
      source: 'moxfield',
    };
  }

  return estimateBracketFromCombos({ comboCount, combos, gameChangerCount });
}
