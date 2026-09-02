import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildScryfallQuery,
  buildScryfallQueryParam,
  normalizeQuery,
  meetsMinimumLength,
  type Legality,
} from '../src/domain/scryfall-query.js';

// Feature: build-a-commander, Property 3: Autocomplete query building applies the legality filter

/** The legality filter token expected for each legality. */
const EXPECTED_FILTER: Record<Legality, string> = {
  commander: 'is:commander',
  companion: 'is:companion',
};

/** Arbitrary legality: 'commander' or 'companion'. */
const arbLegality: fc.Arbitrary<Legality> = fc.constantFrom('commander', 'companion');

/**
 * Arbitrary search text that is guaranteed to meet the 2-character minimum
 * after normalization. We generate an arbitrary string, then reject any that
 * normalizes below the minimum length so the property covers only the
 * "at least 2 characters" precondition from the design.
 */
const arbValidQuery: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => meetsMinimumLength(s));

describe('Autocomplete query building applies the legality filter - Property Tests', () => {
  // **Validates: Requirements 4.1, 4.2, 4.3**
  it('Property 3: built query contains the matching legality filter and includes the normalized search text', () => {
    fc.assert(
      fc.property(arbValidQuery, arbLegality, (query, legality) => {
        const built = buildScryfallQuery(query, legality);
        const normalized = normalizeQuery(query);
        const filter = EXPECTED_FILTER[legality];

        // Contains the correct legality filter token.
        expect(built).toContain(filter);

        // Does not leak the other legality's filter token.
        const otherLegality: Legality = legality === 'commander' ? 'companion' : 'commander';
        expect(built).not.toContain(EXPECTED_FILTER[otherLegality]);

        // Includes the user's (normalized) search text.
        expect(built).toContain(normalized);
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
  it('Property 3 (encoded param): URL-encoded query param carries the encoded search text and encoded filter', () => {
    fc.assert(
      fc.property(arbValidQuery, arbLegality, (query, legality) => {
        const param = buildScryfallQueryParam(query, legality);
        const normalized = normalizeQuery(query);
        const filter = EXPECTED_FILTER[legality];

        // The param is the encoded form of the raw built query.
        expect(param).toBe(encodeURIComponent(buildScryfallQuery(query, legality)));

        // Decoding recovers both the normalized search text and the filter token.
        const decoded = decodeURIComponent(param);
        expect(decoded).toContain(normalized);
        expect(decoded).toContain(filter);
      }),
      { numRuns: 100 }
    );
  });
});
