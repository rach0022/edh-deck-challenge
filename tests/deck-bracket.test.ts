import {
  estimateBracketFromCombos,
  resolveDeckBracket,
  bracketLabel,
  BRACKET_LABELS,
  type BracketComboInput,
} from '../src/domain/deck-bracket.js';

/** Builds a list of combos with the given card counts. */
function combos(...cardCounts: number[]): BracketComboInput[] {
  return cardCounts.map((cardCount) => ({ cardCount }));
}

// ─── bracketLabel ─────────────────────────────────────────────────────────────

describe('bracketLabel', () => {
  it('maps 1–5 to the official WotC bracket names', () => {
    expect(bracketLabel(1)).toBe('Exhibition');
    expect(bracketLabel(2)).toBe('Core');
    expect(bracketLabel(3)).toBe('Upgraded');
    expect(bracketLabel(4)).toBe('Optimized');
    expect(bracketLabel(5)).toBe('cEDH');
  });

  it('returns Unknown for out-of-range values', () => {
    expect(bracketLabel(0)).toBe('Unknown');
    expect(bracketLabel(6)).toBe('Unknown');
  });

  it('BRACKET_LABELS covers brackets 1 through 5', () => {
    expect(Object.keys(BRACKET_LABELS).sort()).toEqual(['1', '2', '3', '4', '5']);
  });
});

// ─── estimateBracketFromCombos ─────────────────────────────────────────────────

describe('estimateBracketFromCombos', () => {
  it('returns Core (2) for a deck with no combos or game changers', () => {
    const { bracket, label, rationale, source } = estimateBracketFromCombos({
      comboCount: 0,
      combos: [],
    });
    expect(bracket).toBe(2);
    expect(label).toBe('Core');
    expect(source).toBe('estimated');
    expect(rationale.join(' ')).toMatch(/no .*combos/i);
  });

  it('game changers push the bracket up on their own', () => {
    // 3+ Game Changers (+2), no combos → baseline 2 + 2 = 4 (Optimized).
    const { bracket, label } = estimateBracketFromCombos({
      comboCount: 0,
      combos: [],
      gameChangerCount: 3,
    });
    expect(bracket).toBe(4);
    expect(label).toBe('Optimized');
  });

  it('a single game changer adds +1', () => {
    // 1 Game Changer (+1), no combos → 3 (Upgraded).
    const { bracket } = estimateBracketFromCombos({
      comboCount: 0,
      combos: [],
      gameChangerCount: 1,
    });
    expect(bracket).toBe(3);
  });

  it('a single long (3+ card) combo stays around Core/Upgraded', () => {
    // 1 combo (+0), no two-card combos (+0) → baseline 2.
    const { bracket } = estimateBracketFromCombos({
      comboCount: 1,
      combos: combos(3),
    });
    expect(bracket).toBe(2);
  });

  it('a two-card combo nudges the bracket up', () => {
    // 1 combo (+0) + one two-card combo (+1) → 3 (Upgraded).
    const { bracket, label } = estimateBracketFromCombos({
      comboCount: 1,
      combos: combos(2),
    });
    expect(bracket).toBe(3);
    expect(label).toBe('Upgraded');
  });

  it('many combos with several two-card lines reach the top brackets', () => {
    // 6 combos (+2) + 3 two-card combos (+2) → baseline 2 + 4 = 6 → clamped 5.
    const { bracket, label } = estimateBracketFromCombos({
      comboCount: 6,
      combos: combos(2, 2, 2, 3, 4, 5),
    });
    expect(bracket).toBe(5);
    expect(label).toBe('cEDH');
  });

  it('moderate combo density without two-card combos lands at Upgraded', () => {
    // 3 combos (+1), none two-card (+0) → 3 (Upgraded).
    const { bracket } = estimateBracketFromCombos({
      comboCount: 3,
      combos: combos(3, 3, 4),
    });
    expect(bracket).toBe(3);
  });

  it('never returns below 1 or above 5 and always has a label + rationale', () => {
    const result = estimateBracketFromCombos({
      comboCount: 50,
      combos: combos(...Array(50).fill(2)),
    });
    expect(result.bracket).toBeGreaterThanOrEqual(1);
    expect(result.bracket).toBeLessThanOrEqual(5);
    expect(result.label).toBe(BRACKET_LABELS[result.bracket]);
    expect(result.rationale.length).toBeGreaterThan(0);
  });

  it('treats 1-card combos as two-card-or-fewer (compact) too', () => {
    // Defensive: cardCount <= 2 counts as compact.
    const { bracket } = estimateBracketFromCombos({
      comboCount: 1,
      combos: combos(1),
    });
    expect(bracket).toBe(3);
  });
});

// ─── resolveDeckBracket ─────────────────────────────────────────────────────

describe('resolveDeckBracket', () => {
  it('uses Moxfield\'s bracket when present (authoritative)', () => {
    const result = resolveDeckBracket({
      moxfield: { bracket: 4, ignoreBrackets: false },
      // Combo/game-changer signals that would estimate differently are ignored.
      comboCount: 0,
      combos: [],
      gameChangerCount: 0,
    });
    expect(result.bracket).toBe(4);
    expect(result.label).toBe('Optimized');
    expect(result.source).toBe('moxfield');
  });

  it('falls back to the estimate when Moxfield has no bracket', () => {
    const result = resolveDeckBracket({
      moxfield: { bracket: null },
      comboCount: 6,
      combos: combos(2, 2, 2),
      gameChangerCount: 3,
    });
    expect(result.source).toBe('estimated');
    // 3 GC (+2) + 6 combos (+2) + 3 two-card (+2) → clamped 5.
    expect(result.bracket).toBe(5);
  });

  it('falls back to the estimate when the author opted out of brackets', () => {
    const result = resolveDeckBracket({
      moxfield: { bracket: 3, ignoreBrackets: true },
      comboCount: 0,
      combos: [],
      gameChangerCount: 1,
    });
    expect(result.source).toBe('estimated');
    expect(result.bracket).toBe(3); // 1 GC (+1) on baseline 2
  });

  it('falls back to the estimate when there is no Moxfield data at all', () => {
    const result = resolveDeckBracket({
      moxfield: null,
      comboCount: 1,
      combos: combos(2),
    });
    expect(result.source).toBe('estimated');
    expect(result.bracket).toBe(3);
  });
});
