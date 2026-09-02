import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { selectionKey, buildCacheKey } from '../src/domain/selection-key.js';
import { normalizeCardName } from '../src/domain/deck-similarity.js';
import type { CommanderSelection } from '../src/types.js';

// Feature: build-a-commander, Property 7: Selection and build cache keys are deterministic and normalization-stable
//
// For any Moxfield username and CommanderSelection, the build-result cache key
// (and the selection component within it) is deterministic; usernames and
// commander/partner/companion names that differ only by case or surrounding
// whitespace produce the same cache key. A partnered pair produces the same key
// regardless of which slot each commander occupies, and a companion is a
// distinct role (a selection with a companion differs from one without).
//
// **Validates: Requirements 5.4, 11.1**

/** A whitespace run used to build normalization-equivalent variants. */
const arbWhitespaceRun: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(' ', '\t', '\n', '  '), { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join(''));

/** Re-cases each character of a word deterministically from a seed bitmask. */
function reCase(word: string, seed: number): string {
  return word
    .split('')
    .map((ch, i) => ((seed >> i) & 1 ? ch.toUpperCase() : ch.toLowerCase()))
    .join('');
}

/**
 * A single card-name "word": non-empty, no whitespace, no `//` split-face
 * separator (that separator has its own normalization semantics that would
 * otherwise complicate the whitespace-only equivalence we want to exercise).
 */
const arbNameWord: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 8 })
  .filter((w) => w.length > 0 && !/\s/.test(w) && !w.includes('/'));

/**
 * A base card name (1-4 words). Kept free of leading/trailing/collapsible
 * whitespace so it acts as a stable "canonical" form to derive variants from.
 */
const arbBaseName: fc.Arbitrary<string> = fc
  .array(arbNameWord, { minLength: 1, maxLength: 4 })
  .map((words) => words.join(' '));

/** Arbitrary raw card name (may include mixed case / stray whitespace). */
const arbRawName: fc.Arbitrary<string> = fc
  .array(arbNameWord, { minLength: 1, maxLength: 4 })
  .chain((words) =>
    fc.record({
      words: fc.constant(words),
      lead: arbWhitespaceRun,
      trail: arbWhitespaceRun,
      seps: fc.array(arbWhitespaceRun, {
        minLength: words.length,
        maxLength: words.length,
      }),
      seeds: fc.array(fc.integer({ min: 0, max: 255 }), {
        minLength: words.length,
        maxLength: words.length,
      }),
    })
  )
  .map(({ words, lead, trail, seps, seeds }) => {
    let out = lead;
    words.forEach((word, i) => {
      out += reCase(word, seeds[i]);
      if (i < words.length - 1) out += seps[i] || ' ';
    });
    return out + trail;
  });

/** Optional raw name (null models an absent partner/companion slot). */
const arbOptionalRawName: fc.Arbitrary<string | null> = fc.option(arbRawName, {
  nil: null,
});

/** Arbitrary CommanderSelection with raw (un-normalized) names. */
const arbSelection: fc.Arbitrary<CommanderSelection> = fc.record({
  commander: arbRawName,
  partner: arbOptionalRawName,
  companion: arbOptionalRawName,
});

/**
 * Produces a normalization-equivalent variant of a base name: same words, but
 * re-cased and re-spaced (arbitrary surrounding + internal whitespace). Any
 * such variant normalizes to the same value via `normalizeCardName`.
 */
function equivalentVariant(
  base: string,
  lead: string,
  trail: string,
  seps: string[],
  seeds: number[],
): string {
  const words = base.split(' ');
  let out = lead;
  words.forEach((word, i) => {
    out += reCase(word, seeds[i] ?? 0);
    if (i < words.length - 1) out += seps[i] || ' ';
  });
  return out + trail;
}

/** Builds a normalization-equivalent pair of raw names from a base name. */
const arbEquivalentNamePair: fc.Arbitrary<{ a: string; b: string }> = arbBaseName.chain(
  (base) => {
    const wordCount = base.split(' ').length;
    return fc
      .record({
        leadA: arbWhitespaceRun,
        leadB: arbWhitespaceRun,
        trailA: arbWhitespaceRun,
        trailB: arbWhitespaceRun,
        sepsA: fc.array(arbWhitespaceRun, { minLength: wordCount, maxLength: wordCount }),
        sepsB: fc.array(arbWhitespaceRun, { minLength: wordCount, maxLength: wordCount }),
        seedsA: fc.array(fc.integer({ min: 0, max: 255 }), {
          minLength: wordCount,
          maxLength: wordCount,
        }),
        seedsB: fc.array(fc.integer({ min: 0, max: 255 }), {
          minLength: wordCount,
          maxLength: wordCount,
        }),
      })
      .map((r) => ({
        a: equivalentVariant(base, r.leadA, r.trailA, r.sepsA, r.seedsA),
        b: equivalentVariant(base, r.leadB, r.trailB, r.sepsB, r.seedsB),
      }));
  },
);

/** Arbitrary Moxfield username (non-empty, may contain stray whitespace/case). */
const arbUsername: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0);

describe('Selection and build cache keys are deterministic and normalization-stable - Property Tests', () => {
  // **Validates: Requirements 5.4, 11.1**
  it('Property 7: selectionKey is deterministic (same selection → same key)', () => {
    fc.assert(
      fc.property(arbSelection, (selection) => {
        expect(selectionKey(selection)).toBe(selectionKey(selection));
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 5.4, 11.1**
  it('Property 7: buildCacheKey is deterministic and has the edh:build:<user>:<selectionKey> shape', () => {
    fc.assert(
      fc.property(arbUsername, arbSelection, (username, selection) => {
        const key = buildCacheKey(username, selection);
        expect(buildCacheKey(username, selection)).toBe(key);

        const normalizedUsername = username.trim().replace(/\s+/g, ' ').toLowerCase();
        expect(key).toBe(`edh:build:${normalizedUsername}:${selectionKey(selection)}`);
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 5.4, 11.1**
  it('Property 7: selections differing only by name case/whitespace share a selectionKey', () => {
    fc.assert(
      fc.property(
        arbEquivalentNamePair, // commander variants
        fc.option(arbEquivalentNamePair, { nil: null }), // partner variants (or both absent)
        fc.option(arbEquivalentNamePair, { nil: null }), // companion variants (or both absent)
        (commanderPair, partnerPair, companionPair) => {
          // Precondition: each variant pair truly normalizes equally.
          fc.pre(normalizeCardName(commanderPair.a) === normalizeCardName(commanderPair.b));
          if (partnerPair) {
            fc.pre(normalizeCardName(partnerPair.a) === normalizeCardName(partnerPair.b));
          }
          if (companionPair) {
            fc.pre(normalizeCardName(companionPair.a) === normalizeCardName(companionPair.b));
          }

          const selectionA: CommanderSelection = {
            commander: commanderPair.a,
            partner: partnerPair ? partnerPair.a : null,
            companion: companionPair ? companionPair.a : null,
          };
          const selectionB: CommanderSelection = {
            commander: commanderPair.b,
            partner: partnerPair ? partnerPair.b : null,
            companion: companionPair ? companionPair.b : null,
          };

          expect(selectionKey(selectionA)).toBe(selectionKey(selectionB));
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 5.4, 11.1**
  it('Property 7: a partnered pair yields the same key regardless of commander/partner slot', () => {
    fc.assert(
      fc.property(arbRawName, arbRawName, arbOptionalRawName, (a, b, companion) => {
        const straight: CommanderSelection = { commander: a, partner: b, companion };
        const swapped: CommanderSelection = { commander: b, partner: a, companion };
        expect(selectionKey(straight)).toBe(selectionKey(swapped));
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 5.4, 11.1**
  it('Property 7: a companion is a distinct role — with vs without a companion differ', () => {
    fc.assert(
      fc.property(arbRawName, arbOptionalRawName, arbRawName, (commander, partner, companion) => {
        // A companion that normalizes to a non-empty value is a distinct role,
        // so a selection carrying it must not collapse to the companion-less key.
        fc.pre(normalizeCardName(companion).length > 0);

        const withCompanion: CommanderSelection = { commander, partner, companion };
        const withoutCompanion: CommanderSelection = { commander, partner, companion: null };

        expect(selectionKey(withCompanion)).not.toBe(selectionKey(withoutCompanion));
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 5.4, 11.1**
  it('Property 7: usernames differing only by case/whitespace produce the same build key', () => {
    fc.assert(
      fc.property(
        fc
          .array(
            fc
              .string({ minLength: 1, maxLength: 8 })
              .filter((w) => w.length > 0 && !/\s/.test(w)),
            { minLength: 1, maxLength: 4 }
          )
          .chain((words) =>
            fc.record({
              words: fc.constant(words),
              leadA: arbWhitespaceRun,
              leadB: arbWhitespaceRun,
              trailA: arbWhitespaceRun,
              trailB: arbWhitespaceRun,
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
          .map((r) => {
            const build = (lead: string, trail: string, seps: string[], seeds: number[]) => {
              let out = lead;
              r.words.forEach((word, i) => {
                out += reCase(word, seeds[i]);
                if (i < r.words.length - 1) out += seps[i] || ' ';
              });
              return out + trail;
            };
            return {
              a: build(r.leadA, r.trailA, r.sepsA, r.seedsA),
              b: build(r.leadB, r.trailB, r.sepsB, r.seedsB),
            };
          }),
        arbSelection,
        ({ a, b }, selection) => {
          // Precondition: the two usernames normalize (trim + collapse + lower) equally.
          const norm = (u: string) => u.trim().replace(/\s+/g, ' ').toLowerCase();
          fc.pre(norm(a) === norm(b));

          expect(buildCacheKey(a, selection)).toBe(buildCacheKey(b, selection));
        }
      ),
      { numRuns: 100 }
    );
  });
});
