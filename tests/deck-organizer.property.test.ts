import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { organizeDecks } from '../src/domain/deck-organizer.js';
import { COLOR_COMBINATIONS } from '../src/domain/color-combinations.js';
import { colorIdentityToKey } from '../src/domain/color-identity.js';
import type { ExtractionResult } from '../src/domain/commander-extractor.js';
import type { Color } from '../src/types.js';

// Feature: edh-deck-challenge-checker, Property 3: Every deck maps to exactly one color combination slot

const WUBRG: Color[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * Arbitrary that generates a valid color identity (a subset of WUBRG, sorted in WUBRG order).
 * Since there are exactly 32 subsets of {W,U,B,R,G} (including the empty set)
 * and exactly 32 color combination slots, each identity maps to exactly one slot.
 */
const arbColorIdentity: fc.Arbitrary<Color[]> = fc
  .subarray(WUBRG, { minLength: 0, maxLength: 5 })
  .map((colors) => WUBRG.filter((c) => colors.includes(c)));

/**
 * Creates a mock ExtractionResult with the given color identity.
 */
function makeExtractionResult(colorIdentity: Color[], index: number): ExtractionResult {
  return {
    deckName: `Test Deck ${index}`,
    deckId: `deck-${index}`,
    commanders: [
      {
        name: `Commander ${index}`,
        colorIdentity,
        imageUrl: null,
        setCode: 'tst',
        collectorNumber: `${index}`,
      },
    ],
    skipped: false,
  };
}

describe('Property 3: Every deck maps to exactly one color combination slot', () => {
  /**
   * **Validates: Requirements 4.2**
   *
   * For any valid color identity (a subset of WUBRG including the empty set),
   * there exists exactly one matching slot among the 32 color combinations.
   */
  it('every valid color identity maps to exactly one of the 32 slots via organizeDecks', () => {
    fc.assert(
      fc.property(arbColorIdentity, (colorIdentity) => {
        // Create a single mock deck with the generated color identity
        const extraction = makeExtractionResult(colorIdentity, 1);

        const progress = organizeDecks([extraction], 'test-user');

        // Count how many slots contain the deck
        const slotsWithDeck = progress.slots.filter(
          (slot) => slot.decks.length > 0
        );

        // Verify: exactly one slot contains the deck
        expect(slotsWithDeck.length).toBe(1);

        // Verify: that slot contains exactly one deck entry
        expect(slotsWithDeck[0].decks.length).toBe(1);
        expect(slotsWithDeck[0].decks[0].deckName).toBe('Test Deck 1');
      }),
      { numRuns: 100 }
    );
  });

  it('the matched slot key corresponds to the deck color identity key', () => {
    fc.assert(
      fc.property(arbColorIdentity, (colorIdentity) => {
        const extraction = makeExtractionResult(colorIdentity, 1);
        const progress = organizeDecks([extraction], 'test-user');

        const slotsWithDeck = progress.slots.filter(
          (slot) => slot.decks.length > 0
        );

        // The slot key should match the colorIdentityToKey of the input
        const expectedKey = colorIdentityToKey(colorIdentity);
        expect(slotsWithDeck[0].key).toBe(expectedKey);
      }),
      { numRuns: 100 }
    );
  });

  it('exhaustive: all 32 possible color identities each map to a unique slot', () => {
    // Generate all 32 subsets of WUBRG
    const allSubsets: Color[][] = [];
    for (let mask = 0; mask < 32; mask++) {
      const subset: Color[] = [];
      for (let i = 0; i < 5; i++) {
        if (mask & (1 << i)) {
          subset.push(WUBRG[i]);
        }
      }
      allSubsets.push(subset);
    }

    // Verify each subset maps to exactly one slot
    const matchedSlotKeys = new Set<string>();

    for (let i = 0; i < allSubsets.length; i++) {
      const extraction = makeExtractionResult(allSubsets[i], i);
      const progress = organizeDecks([extraction], 'test-user');

      const slotsWithDeck = progress.slots.filter(
        (slot) => slot.decks.length > 0
      );

      // Exactly one slot matches
      expect(slotsWithDeck.length).toBe(1);

      // Track matched slots to verify uniqueness
      matchedSlotKeys.add(slotsWithDeck[0].key);
    }

    // All 32 slots are covered by the 32 identities
    expect(matchedSlotKeys.size).toBe(32);
    expect(COLOR_COMBINATIONS.length).toBe(32);
  });
});

// Feature: edh-deck-challenge-checker, Property 4: Organization preserves all input decks

/**
 * Arbitrary that generates a non-skipped ExtractionResult with a random color identity.
 */
const arbNonSkippedExtraction: fc.Arbitrary<ExtractionResult> = fc
  .tuple(arbColorIdentity, fc.nat({ max: 9999 }))
  .map(([colorIdentity, idx]) => makeExtractionResult(colorIdentity, idx));

/**
 * Arbitrary that generates a skipped ExtractionResult.
 */
const arbSkippedExtraction: fc.Arbitrary<ExtractionResult> = fc
  .nat({ max: 9999 })
  .map((idx) => ({
    deckName: `Skipped Deck ${idx}`,
    deckId: `skipped-deck-${idx}`,
    commanders: [],
    skipped: true,
    skipReason: `No commander found in deck "Skipped Deck ${idx}"`,
  }));

/**
 * Arbitrary that generates a mix of skipped and non-skipped extraction results.
 */
const arbMixedExtractions: fc.Arbitrary<ExtractionResult[]> = fc.array(
  fc.oneof(
    { weight: 3, arbitrary: arbNonSkippedExtraction },
    { weight: 1, arbitrary: arbSkippedExtraction }
  ),
  { minLength: 0, maxLength: 40 }
);

describe('Property 4: Organization preserves all input decks', () => {
  /**
   * **Validates: Requirements 4.2, 4.3**
   *
   * For any list of extraction results where `skipped` is false,
   * the total number of deck entries across all 32 slots after organization
   * SHALL equal the number of non-skipped input decks.
   */
  it('total deck entries across all slots equals non-skipped input count', () => {
    fc.assert(
      fc.property(arbMixedExtractions, (extractions) => {
        const progress = organizeDecks(extractions, 'test-user');

        const nonSkippedCount = extractions.filter((e) => !e.skipped).length;
        const totalDeckEntries = progress.slots.reduce(
          (sum, slot) => sum + slot.decks.length,
          0
        );

        expect(totalDeckEntries).toBe(nonSkippedCount);
      }),
      { numRuns: 100 }
    );
  });

  it('skipped decks are collected separately with reasons', () => {
    fc.assert(
      fc.property(arbMixedExtractions, (extractions) => {
        const progress = organizeDecks(extractions, 'test-user');

        const skippedCount = extractions.filter((e) => e.skipped).length;
        expect(progress.skippedDecks).toHaveLength(skippedCount);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: edh-deck-challenge-checker, Property 5: Filled count equals count of non-empty slots

describe('Property 5: Filled count equals count of non-empty slots', () => {
  /**
   * **Validates: Requirements 5.5, 8.2**
   *
   * For any challenge progress result, the `filledCount` SHALL equal
   * the number of slots in `slots` that have at least one deck entry.
   */
  it('filledCount equals the number of slots with at least one deck', () => {
    fc.assert(
      fc.property(arbMixedExtractions, (extractions) => {
        const progress = organizeDecks(extractions, 'test-user');

        const nonEmptySlotCount = progress.slots.filter(
          (slot) => slot.decks.length > 0
        ).length;

        expect(progress.filledCount).toBe(nonEmptySlotCount);
      }),
      { numRuns: 100 }
    );
  });

  it('filledCount is always between 0 and 32 inclusive', () => {
    fc.assert(
      fc.property(arbMixedExtractions, (extractions) => {
        const progress = organizeDecks(extractions, 'test-user');

        expect(progress.filledCount).toBeGreaterThanOrEqual(0);
        expect(progress.filledCount).toBeLessThanOrEqual(32);
      }),
      { numRuns: 100 }
    );
  });

  it('totalSlots is always 32', () => {
    fc.assert(
      fc.property(arbMixedExtractions, (extractions) => {
        const progress = organizeDecks(extractions, 'test-user');
        expect(progress.totalSlots).toBe(32);
      }),
      { numRuns: 100 }
    );
  });
});
