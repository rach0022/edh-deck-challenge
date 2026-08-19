import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { truncateName, renderASCII } from '../src/renderers/ascii-renderer.js';
import { COLOR_COMBINATIONS } from '../src/domain/color-combinations.js';
import { organizeDecks } from '../src/domain/deck-organizer.js';
import type { ExtractionResult } from '../src/domain/commander-extractor.js';
import type { Color } from '../src/types.js';

// Feature: edh-deck-challenge-checker, Property 6: Name truncation preserves length invariant

describe('Property 6: Name truncation preserves length invariant', () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * For any string input and a max length of 30, truncateName SHALL produce
   * output of length ≤ 33 (max + ellipsis length). If the input is ≤ 30
   * characters, the output SHALL equal the input unchanged.
   */
  it('output is always ≤ 33 characters (30 + "..." = 33)', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = truncateName(input, 30);
        return result.length <= 33;
      }),
      { numRuns: 100 }
    );
  });

  it('if input ≤ 30 characters, output equals input unchanged', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 30 }),
        (input) => {
          const result = truncateName(input, 30);
          return result === input;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: edh-deck-challenge-checker, Property 7: ASCII output contains all 32 color combination names

const WUBRG: Color[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * Arbitrary that generates a valid color identity (a subset of WUBRG, sorted in WUBRG order).
 */
const arbColorIdentity: fc.Arbitrary<Color[]> = fc
  .subarray(WUBRG, { minLength: 0, maxLength: 5 })
  .map((colors) => WUBRG.filter((c) => colors.includes(c)));

/**
 * Creates a mock ExtractionResult with the given color identity.
 */
function makeExtraction(colorIdentity: Color[], index: number): ExtractionResult {
  return {
    deckName: `Deck ${index}`,
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

/**
 * Arbitrary that generates a list of ExtractionResult objects (0 to 40 entries).
 */
const arbExtractions: fc.Arbitrary<ExtractionResult[]> = fc.array(
  fc.tuple(arbColorIdentity, fc.nat({ max: 9999 })).map(([identity, idx]) =>
    makeExtraction(identity, idx)
  ),
  { minLength: 0, maxLength: 40 }
);

describe('Property 7: ASCII output contains all 32 color combination names', () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * For any valid ChallengeProgress input, the rendered ASCII string
   * SHALL contain the name of every one of the 32 color combinations.
   */
  it('rendered ASCII output contains all 32 color combination names', () => {
    fc.assert(
      fc.property(arbExtractions, (extractions) => {
        const progress = organizeDecks(extractions, 'test-user');
        const output = renderASCII(progress);

        for (const combo of COLOR_COMBINATIONS) {
          expect(output).toContain(combo.name);
        }
      }),
      { numRuns: 100 }
    );
  });
});
