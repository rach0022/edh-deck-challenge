import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { commanderSlug, buildEdhrecSlug } from '../src/domain/edhrec-slug.js';
import type { CommanderSelection } from '../src/types.js';

// Feature: build-a-commander, Property 5: EDHREC slug building is deterministic and pairs partners

/**
 * A commander name that always yields a non-empty slug.
 *
 * The slug transform strips everything except ASCII letters/digits, so a name
 * made only of punctuation/whitespace would slugify to the empty string. To
 * keep the pairing/partner properties meaningful (EDHREC pairs two non-empty
 * slugs), we guarantee at least one alphanumeric token.
 */
const arbCommanderName: fc.Arbitrary<string> = fc
  .tuple(
    // a guaranteed alphanumeric core so the slug is never empty
    fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,20}$/),
    // free-form decoration (spaces, punctuation, accents, more words)
    fc.string({ maxLength: 20 }),
  )
  .map(([core, extra]) => `${core} ${extra}`.trim());

/**
 * Produces a set of "cosmetic" variants of a name that a slug MUST treat as
 * equivalent: differing only by letter case, surrounding/internal whitespace,
 * and stripped punctuation (apostrophes/commas).
 */
function normalizationVariants(name: string): string[] {
  return [
    name,
    name.toUpperCase(),
    name.toLowerCase(),
    `  ${name}  `, // surrounding whitespace
    name.replace(/ /g, '   '), // widened internal whitespace
    name.replace(/[a-z]/i, (c) => `${c}'`), // inject an apostrophe after a letter
    `${name},`, // trailing comma punctuation
  ];
}

describe('Property 5: EDHREC slug building is deterministic and pairs partners', () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * Determinism: for any name, slugging the exact same input twice yields the
   * exact same output. A pure transform must never depend on hidden state.
   */
  it('commanderSlug is deterministic for identical input', () => {
    fc.assert(
      fc.property(arbCommanderName, (name) => {
        expect(commanderSlug(name)).toBe(commanderSlug(name));
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Normalization stability: names that differ only by case, whitespace, or
   * stripped punctuation collapse to the same slug.
   */
  it('commanderSlug is stable across case/whitespace/punctuation variants', () => {
    fc.assert(
      fc.property(arbCommanderName, (name) => {
        const variants = normalizationVariants(name);
        const slugs = variants.map((v) => commanderSlug(v));
        const expected = commanderSlug(name);
        for (const slug of slugs) {
          expect(slug).toBe(expected);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * The slug alphabet is restricted to lowercase ASCII letters, digits, and
   * hyphens, with no leading/trailing hyphen and no doubled hyphens.
   */
  it('commanderSlug output is lowercase ASCII with clean hyphenation', () => {
    fc.assert(
      fc.property(arbCommanderName, (name) => {
        const slug = commanderSlug(name);
        expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * A single commander (no partner) produces exactly its own commanderSlug.
   */
  it('buildEdhrecSlug of a lone commander equals its commanderSlug', () => {
    fc.assert(
      fc.property(arbCommanderName, fc.option(arbCommanderName, { nil: null }), (commander, companion) => {
        const selection: CommanderSelection = {
          commander,
          partner: null,
          // companion is deliberately excluded from the slug
          companion,
        };
        expect(buildEdhrecSlug(selection)).toBe(commanderSlug(commander));
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * The companion never participates in the slug: two selections with the same
   * commander (and partner) but different companions produce the same slug.
   */
  it('buildEdhrecSlug ignores the companion', () => {
    fc.assert(
      fc.property(
        arbCommanderName,
        fc.option(arbCommanderName, { nil: null }),
        fc.option(arbCommanderName, { nil: null }),
        fc.option(arbCommanderName, { nil: null }),
        (commander, partner, companionA, companionB) => {
          const withA: CommanderSelection = { commander, partner, companion: companionA };
          const withB: CommanderSelection = { commander, partner, companion: companionB };
          expect(buildEdhrecSlug(withA)).toBe(buildEdhrecSlug(withB));
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Partner pairing is order-independent: swapping which commander sits in the
   * commander vs partner slot yields an identical slug (EDHREC's canonical
   * alphabetical pairing).
   */
  it('buildEdhrecSlug pairs partners order-independently', () => {
    fc.assert(
      fc.property(arbCommanderName, arbCommanderName, (a, b) => {
        const forward: CommanderSelection = { commander: a, partner: b, companion: null };
        const reversed: CommanderSelection = { commander: b, partner: a, companion: null };
        expect(buildEdhrecSlug(forward)).toBe(buildEdhrecSlug(reversed));
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * The paired slug is exactly the two commander slugs joined with a hyphen in
   * alphabetical order — deterministic and containing both members' slugs.
   */
  it('buildEdhrecSlug of a pair is the two slugs joined alphabetically', () => {
    fc.assert(
      fc.property(arbCommanderName, arbCommanderName, (a, b) => {
        const selection: CommanderSelection = { commander: a, partner: b, companion: null };
        const expected = [commanderSlug(a), commanderSlug(b)].sort().join('-');
        expect(buildEdhrecSlug(selection)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * The paired slug is also normalization-stable: cosmetic variants of either
   * commander name produce the same combined pairing.
   */
  it('buildEdhrecSlug pairing is normalization-stable', () => {
    fc.assert(
      fc.property(arbCommanderName, arbCommanderName, (a, b) => {
        const base: CommanderSelection = { commander: a, partner: b, companion: null };
        const noisy: CommanderSelection = {
          commander: `  ${a.toUpperCase()}  `,
          partner: `  ${b.toLowerCase()},  `,
          companion: null,
        };
        expect(buildEdhrecSlug(noisy)).toBe(buildEdhrecSlug(base));
      }),
      { numRuns: 100 },
    );
  });
});
