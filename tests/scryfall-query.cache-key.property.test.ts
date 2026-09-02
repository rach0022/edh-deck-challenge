import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildAutocompleteCacheKey,
  normalizeQuery,
  type Legality,
} from '../src/domain/scryfall-query.js';

// Feature: build-a-commander, Property 4: Autocomplete cache key is deterministic per (query, legality)

/** Arbitrary legality: 'commander' or 'companion'. */
const arbLegality: fc.Arbitrary<Legality> = fc.constantFrom('commander', 'companion');

/** Arbitrary free-form search text (may include surrounding/internal whitespace and mixed case). */
const arbQuery: fc.Arbitrary<string> = fc.string({ minLength: 0, maxLength: 40 });

/**
 * Produces a "normalization-equivalent" variant of the given text: the same
 * words, but with randomized casing, extra surrounding whitespace, and the
 * internal separators expanded to arbitrary runs of whitespace. Any such
 * variant must normalize to the same value as the original (Req 4.5,
 * Property 4).
 */
const arbWhitespaceRun: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(' ', '\t', '\n', '  '), { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join(''));

function reCase(word: string, seed: number): string {
  return word
    .split('')
    .map((ch, i) => ((seed >> i) & 1 ? ch.toUpperCase() : ch.toLowerCase()))
    .join('');
}

/**
 * Given a base normalized-ish phrase, generate a distinct textual variant that
 * still normalizes to the same value: re-cased words joined by arbitrary
 * whitespace runs, with arbitrary leading/trailing whitespace.
 */
const arbEquivalentPair: fc.Arbitrary<{ a: string; b: string }> = fc
  .array(
    fc.string({ minLength: 1, maxLength: 8 }).filter((w) => !/\s/.test(w) && w.length > 0),
    { minLength: 1, maxLength: 5 }
  )
  .chain((words) =>
    fc.record({
      words: fc.constant(words),
      leadA: arbWhitespaceRun.map((w) => w.slice(1)),
      leadB: arbWhitespaceRun.map((w) => w.slice(1)),
      trailA: arbWhitespaceRun.map((w) => w.slice(1)),
      trailB: arbWhitespaceRun.map((w) => w.slice(1)),
      sepsA: fc.array(arbWhitespaceRun, { minLength: words.length, maxLength: words.length }),
      sepsB: fc.array(arbWhitespaceRun, { minLength: words.length, maxLength: words.length }),
      seedsA: fc.array(fc.integer({ min: 0, max: 255 }), {
        minLength: words.length,
        maxLength: words.length,
      }),
      seedsB: fc.array(fc.integer({ min: 0, max: 255 }), {
        minLength: words.length,
        maxLength: words.length,
      }),
    })
  )
  .map(({ words, leadA, leadB, trailA, trailB, sepsA, sepsB, seedsA, seedsB }) => {
    const build = (leads: string, trails: string, seps: string[], seeds: number[]): string => {
      let out = leads;
      words.forEach((word, i) => {
        out += reCase(word, seeds[i]);
        if (i < words.length - 1) out += seps[i] || ' ';
      });
      return out + trails;
    };
    return {
      a: build(leadA, trailA, sepsA, seedsA),
      b: build(leadB, trailB, sepsB, seedsB),
    };
  });

describe('Autocomplete cache key is deterministic per (query, legality) - Property Tests', () => {
  // **Validates: Requirements 4.5**
  it('Property 4: same (query, legality) always yields the same key (determinism)', () => {
    fc.assert(
      fc.property(arbQuery, arbLegality, (query, legality) => {
        const first = buildAutocompleteCacheKey(query, legality);
        const second = buildAutocompleteCacheKey(query, legality);
        expect(second).toBe(first);
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 4.5**
  it('Property 4: key shape is edh:scryfall:<legality>:<normalizedQuery>', () => {
    fc.assert(
      fc.property(arbQuery, arbLegality, (query, legality) => {
        const key = buildAutocompleteCacheKey(query, legality);
        expect(key).toBe(`edh:scryfall:${legality}:${normalizeQuery(query)}`);
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 4.5**
  it('Property 4: queries that normalize equally (case/whitespace only) share a key', () => {
    fc.assert(
      fc.property(arbEquivalentPair, arbLegality, ({ a, b }, legality) => {
        // Precondition: the two variants really do normalize to the same value.
        fc.pre(normalizeQuery(a) === normalizeQuery(b));

        const keyA = buildAutocompleteCacheKey(a, legality);
        const keyB = buildAutocompleteCacheKey(b, legality);
        expect(keyA).toBe(keyB);
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 4.5**
  it('Property 4: the same query under different legalities produces different keys', () => {
    fc.assert(
      fc.property(arbQuery, (query) => {
        const commanderKey = buildAutocompleteCacheKey(query, 'commander');
        const companionKey = buildAutocompleteCacheKey(query, 'companion');
        expect(commanderKey).not.toBe(companionKey);
      }),
      { numRuns: 100 }
    );
  });
});
