import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { resolveColorIdentity, colorIdentityToKey } from '../src/domain/color-identity.js';
import type { Color } from '../src/types.js';

// Feature: edh-deck-challenge-checker, Property 1: Color identity resolution produces WUBRG-sorted subset

const WUBRG: Color[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * Arbitrary that generates a subset of WUBRG colors.
 * Each color is independently included or excluded.
 */
const arbColorSubset: fc.Arbitrary<Color[]> = fc
  .subarray(WUBRG, { minLength: 0, maxLength: 5 })
  .map((colors) => [...colors]); // Ensure we get a fresh array

describe('Color Identity Resolution - Property Tests', () => {
  // **Validates: Requirements 3.2, 3.4**
  it('Property 1: resolveColorIdentity produces a WUBRG-sorted subset with no duplicates', () => {
    fc.assert(
      fc.property(arbColorSubset, (colors) => {
        // Create a mock commander with the generated color identity
        const commanders = [{ colorIdentity: colors }];
        const result = resolveColorIdentity(commanders);

        // Verify: result is a subset of WUBRG
        for (const color of result) {
          expect(WUBRG).toContain(color);
        }

        // Verify: result is sorted in WUBRG order (W=0, U=1, B=2, R=3, G=4)
        for (let i = 1; i < result.length; i++) {
          const prevIndex = WUBRG.indexOf(result[i - 1]);
          const currIndex = WUBRG.indexOf(result[i]);
          expect(prevIndex).toBeLessThan(currIndex);
        }

        // Verify: no duplicates
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 1 (extended): resolveColorIdentity with duplicated inputs still produces sorted, deduplicated output', () => {
    fc.assert(
      fc.property(arbColorSubset, arbColorSubset, (colorsA, colorsB) => {
        // Create a single commander with potentially duplicated colors
        const combinedColors = [...colorsA, ...colorsB] as Color[];
        const commanders = [{ colorIdentity: combinedColors }];
        const result = resolveColorIdentity(commanders);

        // Verify: result is a subset of WUBRG
        for (const color of result) {
          expect(WUBRG).toContain(color);
        }

        // Verify: sorted in WUBRG order
        for (let i = 1; i < result.length; i++) {
          const prevIndex = WUBRG.indexOf(result[i - 1]);
          const currIndex = WUBRG.indexOf(result[i]);
          expect(prevIndex).toBeLessThan(currIndex);
        }

        // Verify: no duplicates
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);

        // Verify: result contains exactly the union of input colors
        const expectedColors = new Set([...colorsA, ...colorsB]);
        expect(unique.size).toBe(expectedColors.size);
        for (const color of expectedColors) {
          expect(result).toContain(color);
        }
      }),
      { numRuns: 100 }
    );
  });
});


// Feature: edh-deck-challenge-checker, Property 2: Partner color identity is the union of individual identities

describe('Partner Color Identity Union - Property Tests', () => {
  // **Validates: Requirements 3.4**
  it('Property 2: resolveColorIdentity with two commanders produces the sorted, deduplicated union of their identities', () => {
    const arbColorSubset: fc.Arbitrary<Color[]> = fc.subarray(WUBRG, {
      minLength: 0,
      maxLength: 5,
    });

    fc.assert(
      fc.property(arbColorSubset, arbColorSubset, (colorsA, colorsB) => {
        // Create two partner commanders with distinct color identities
        const commanderA = { colorIdentity: colorsA };
        const commanderB = { colorIdentity: colorsB };

        const result = resolveColorIdentity([commanderA, commanderB]);

        // Compute expected union: deduplicated, sorted in WUBRG order
        const unionSet = new Set([...colorsA, ...colorsB]);
        const expectedUnion = WUBRG.filter((c) => unionSet.has(c));

        // Verify: result equals the sorted, deduplicated union
        expect(result).toEqual(expectedUnion);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 2 (commutativity): partner union is commutative', () => {
    const arbColorSubset: fc.Arbitrary<Color[]> = fc.subarray(WUBRG, {
      minLength: 0,
      maxLength: 5,
    });

    fc.assert(
      fc.property(arbColorSubset, arbColorSubset, (colorsA, colorsB) => {
        const commanderA = { colorIdentity: colorsA };
        const commanderB = { colorIdentity: colorsB };

        // Order A, B
        const resultAB = resolveColorIdentity([commanderA, commanderB]);
        // Order B, A
        const resultBA = resolveColorIdentity([commanderB, commanderA]);

        // Verify: result is the same regardless of order
        expect(resultAB).toEqual(resultBA);
      }),
      { numRuns: 100 }
    );
  });
});
