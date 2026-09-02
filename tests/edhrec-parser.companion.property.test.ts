import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { applyCompanionConstraint } from '../src/domain/edhrec-parser.js';
import { normalizeCardName } from '../src/domain/deck-similarity.js';
import type { EdhrecRecommendation } from '../src/types.js';

// Feature: build-a-commander, Property 6: Companion constrains the retrieved recommendation set

/**
 * Arbitrary raw card names. Deliberately includes case variation, surrounding
 * whitespace, and "A // B" split-card syntax so the test exercises the
 * `normalizeCardName` boundary (case/whitespace/front-face folding) that the
 * companion constraint relies on — not just distinct clean strings. A few
 * names normalize to the empty string, which `applyCompanionConstraint` treats
 * as "not in any legal set".
 */
const arbCardName: fc.Arbitrary<string> = fc.oneof(
  // Ordinary names, possibly with mixed case and padding.
  fc
    .tuple(
      fc.constantFrom('', '  ', '\t'),
      fc.stringMatching(/^[A-Za-z][A-Za-z '-]{0,20}$/),
      fc.constantFrom('', '  '),
    )
    .map(([pre, body, post]) => `${pre}${body}${post}`),
  // Split / MDFC names — only the front face survives normalization.
  fc
    .tuple(
      fc.stringMatching(/^[A-Za-z][A-Za-z ']{0,15}$/),
      fc.stringMatching(/^[A-Za-z][A-Za-z ']{0,15}$/),
    )
    .map(([front, back]) => `${front} // ${back}`),
  // A few names that normalize to empty (whitespace-only / leading separator).
  fc.constantFrom('   ', '// Back Face', '  //  x'),
);

/** Builds a minimal recommendation carrying just the fields the filter reads. */
function makeRec(name: string, index: number): EdhrecRecommendation {
  return {
    name,
    category: `Category ${index % 4}`,
    inclusion: null,
    synergy: null,
    scryfallId: null,
    setCode: null,
    collectorNumber: null,
  };
}

/** A base recommendation set (possibly empty), with distinct raw names. */
const arbRecommendations: fc.Arbitrary<EdhrecRecommendation[]> = fc
  .array(arbCardName, { minLength: 0, maxLength: 30 })
  .map((names) => names.map((name, i) => makeRec(name, i)));

/**
 * A companion "legal set" of raw names. To make the constraint non-trivial we
 * draw legal names from both fresh arbitrary names and (via the pairing below)
 * some of the recommendations' own names, so the filter has real overlap to
 * exercise rather than almost always filtering to empty.
 */
const arbLegalNames: fc.Arbitrary<string[]> = fc.array(arbCardName, {
  minLength: 0,
  maxLength: 20,
});

/**
 * Pairs a recommendation set with a legal set that mixes some of the set's own
 * names with unrelated names — giving overlap without guaranteeing it.
 */
const arbRecsAndLegal: fc.Arbitrary<{
  recs: EdhrecRecommendation[];
  legal: string[];
}> = arbRecommendations.chain((recs) =>
  fc
    .tuple(
      // A subset of the recommendation names (kept as their raw form).
      fc.subarray(
        recs.map((r) => r.name),
        { minLength: 0, maxLength: recs.length },
      ),
      arbLegalNames,
    )
    .map(([fromRecs, extra]) => ({ recs, legal: [...fromRecs, ...extra] })),
);

describe('Property 6: Companion constrains the retrieved recommendation set', () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * With a non-null legal set, every surviving recommendation's normalized name
   * is in the normalized legal set, the result is a subset of the input, and no
   * card outside the companion-consistent set survives.
   */
  it('every surviving recommendation is in the companion legal set (subset, no outsiders)', () => {
    fc.assert(
      fc.property(arbRecsAndLegal, ({ recs, legal }) => {
        const result = applyCompanionConstraint(recs, legal);

        // Normalized legal set, computed independently of the implementation.
        const legalSet = new Set(
          legal.map((n) => normalizeCardName(n)).filter((n) => n.length > 0),
        );

        // Subset: the result never exceeds the input in size.
        expect(result.length).toBeLessThanOrEqual(recs.length);

        // Every survivor is consistent with the companion's legal set...
        for (const rec of result) {
          expect(legalSet.has(normalizeCardName(rec.name))).toBe(true);
        }

        // ...and no card outside the legal set survives: every input rec that
        // is legal should be present, every input rec that is illegal absent.
        const survivingRefs = new Set(result);
        for (const rec of recs) {
          const legalForRec = legalSet.has(normalizeCardName(rec.name));
          expect(survivingRefs.has(rec)).toBe(legalForRec);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * A null/undefined legal set means "no companion": the recommendation set is
   * unconstrained and returned unchanged.
   */
  it('null/undefined legal names leaves the recommendation set unchanged', () => {
    fc.assert(
      fc.property(arbRecommendations, (recs) => {
        expect(applyCompanionConstraint(recs, null)).toBe(recs);
        expect(applyCompanionConstraint(recs, undefined)).toBe(recs);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * An empty legal set constrains the result to nothing, for any base set.
   */
  it('an empty legal set yields an empty result', () => {
    fc.assert(
      fc.property(arbRecommendations, (recs) => {
        expect(applyCompanionConstraint(recs, [])).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});
