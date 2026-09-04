import { describe, it, expect } from 'vitest';
import {
  buildSaltIndex,
  estimateBracket,
  analyzeDeckSalt,
  type SaltInputCard,
  type SaltScore,
} from '../src/domain/deck-analysis.js';

// ─── buildSaltIndex ──────────────────────────────────────────────────────────

describe('buildSaltIndex', () => {
  it('keys by normalized card name', () => {
    const scores: SaltScore[] = [
      { name: 'Cyclonic Rift', salt: 2.36 },
      { name: 'Rhystic Study', salt: 2.73 },
    ];
    const index = buildSaltIndex(scores);
    // Lookup uses normalized (lowercased) names.
    expect(index.get('cyclonic rift')).toBe(2.36);
    expect(index.get('rhystic study')).toBe(2.73);
  });

  it('normalizes "A // B" to the front face and keeps the higher salt on collision', () => {
    const scores: SaltScore[] = [
      { name: 'Fire // Ice', salt: 1.0 },
      { name: 'Fire', salt: 1.5 }, // same normalized key → keep the max
    ];
    const index = buildSaltIndex(scores);
    expect(index.get('fire')).toBe(1.5);
    expect(index.size).toBe(1);
  });

  it('skips entries that normalize to empty', () => {
    const index = buildSaltIndex([{ name: '   ', salt: 3 }]);
    expect(index.size).toBe(0);
  });
});

// ─── estimateBracket ─────────────────────────────────────────────────────────

describe('estimateBracket', () => {
  it('returns a low bracket for a clean, low-salt deck with no game changers', () => {
    const { bracket, rationale } = estimateBracket({
      averageSalt: 0,
      highSaltCount: 0,
      gameChangerCount: 0,
    });
    expect(bracket).toBe(2); // baseline, no upward adjustments
    expect(rationale.some((r) => /No EDHREC "Game Changer"/.test(r))).toBe(true);
  });

  it('pushes toward high brackets with several game changers, high salt, many salty cards', () => {
    const { bracket } = estimateBracket({
      averageSalt: 2.0, // +1
      highSaltCount: 10, // +1
      gameChangerCount: 4, // +2
    });
    // baseline 2 + 2 + 1 + 1 = 6 → clamped to 5.
    expect(bracket).toBe(5);
  });

  it('adds +1 for a single game changer', () => {
    const { bracket } = estimateBracket({
      averageSalt: 0,
      highSaltCount: 0,
      gameChangerCount: 1,
    });
    expect(bracket).toBe(3); // baseline 2 + 1
  });

  it('never returns below 1 or above 5', () => {
    const low = estimateBracket({ averageSalt: 0, highSaltCount: 0, gameChangerCount: 0 });
    expect(low.bracket).toBeGreaterThanOrEqual(1);
    const high = estimateBracket({ averageSalt: 3, highSaltCount: 40, gameChangerCount: 10 });
    expect(high.bracket).toBeLessThanOrEqual(5);
  });
});

// ─── analyzeDeckSalt ─────────────────────────────────────────────────────────

describe('analyzeDeckSalt', () => {
  const saltIndex = buildSaltIndex([
    { name: 'Stasis', salt: 3.06 },
    { name: 'Winter Orb', salt: 2.96 },
    { name: 'Cyclonic Rift', salt: 2.36 },
    { name: 'Sol Ring', salt: 0.5 },
  ]);

  const cards: SaltInputCard[] = [
    { name: 'Stasis', scryfallId: 'a' },
    { name: 'Winter Orb', scryfallId: 'b' },
    { name: 'Cyclonic Rift', scryfallId: 'c' },
    { name: 'Sol Ring', scryfallId: 'd' },
    { name: 'Llanowar Elves', scryfallId: 'e' }, // not salty → ignored
  ];

  it('counts only known-salty cards and computes total + average', () => {
    const result = analyzeDeckSalt(cards, saltIndex, []);
    expect(result.saltyCardCount).toBe(4);
    // 3.06 + 2.96 + 2.36 + 0.5 = 8.88
    expect(result.totalSalt).toBeCloseTo(8.88, 2);
    expect(result.averageSalt).toBeCloseTo(8.88 / 4, 2);
  });

  it('sorts top salty cards descending and caps the list', () => {
    const result = analyzeDeckSalt(cards, saltIndex, []);
    expect(result.topSaltyCards[0].name).toBe('Stasis');
    expect(result.topSaltyCards[result.topSaltyCards.length - 1].name).toBe('Sol Ring');
  });

  it('deduplicates and sorts game changers, and reflects them in the bracket', () => {
    const withGC = analyzeDeckSalt(cards, saltIndex, ['Cyclonic Rift', 'Cyclonic Rift', 'Rhystic Study']);
    expect(withGC.gameChangerCount).toBe(2);
    expect(withGC.gameChangers).toEqual(['Cyclonic Rift', 'Rhystic Study']);
    // 2 GCs (+1) and high-salt cards present → bracket above the no-GC baseline.
    expect(withGC.estimatedBracket).toBeGreaterThanOrEqual(3);
  });

  it('returns a zeroed analysis when no cards are salty', () => {
    const result = analyzeDeckSalt(
      [{ name: 'Llanowar Elves', scryfallId: 'e' }],
      saltIndex,
      [],
    );
    expect(result.saltyCardCount).toBe(0);
    expect(result.totalSalt).toBe(0);
    expect(result.averageSalt).toBe(0);
    expect(result.topSaltyCards).toEqual([]);
  });

  it('counts a card at the 1.0 "notably salty" threshold but not one just below', () => {
    const idx = buildSaltIndex([
      { name: 'At Threshold', salt: 1.0 },
      { name: 'Just Below', salt: 0.99 },
    ]);
    const withGC = analyzeDeckSalt(
      [
        { name: 'At Threshold', scryfallId: 'x' },
        { name: 'Just Below', scryfallId: 'y' },
      ],
      idx,
      // 8 high-salt cards would be needed for the +1; here we just assert the
      // rationale reflects exactly one card above the threshold.
      [],
    );
    // Both are "salty" (present in the dataset)...
    expect(withGC.saltyCardCount).toBe(2);
    // ...but only the 1.0 card is "notably salty" (>= 1.0 threshold), so the
    // rationale mentions exactly 1 card above the threshold.
    expect(
      withGC.bracketRationale.some((r) => /1 card above the "salty" threshold/.test(r)),
    ).toBe(true);
  });
});
