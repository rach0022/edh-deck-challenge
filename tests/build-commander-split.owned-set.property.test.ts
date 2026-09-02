import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildOwnedCardIndex,
  type UserDeckCards,
} from '../src/domain/build-commander-split.js';
import { normalizeCardName } from '../src/domain/deck-similarity.js';

// Feature: build-a-commander, Property 8: Owned-card set is the union of deck card names

/**
 * The Owned_Card_Set is built with `buildCardSet`, which normalizes each name
 * via `normalizeCardName` and drops names that normalize to the empty string.
 * A membership test therefore has to use the same normalization, and the
 * union we compare against must exclude names that normalize away.
 */
function normalizedNonEmptyNames(names: readonly string[]): string[] {
  return names
    .map((n) => normalizeCardName(n))
    .filter((n) => n.length > 0);
}

/**
 * Arbitrary raw card names. Deliberately includes case variation, extra
 * whitespace, and "A // B" split-card syntax so the test exercises the
 * normalization boundary rather than just distinct clean strings.
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

/** A single deck: a display name plus a list of raw card names. */
const arbDeck: fc.Arbitrary<UserDeckCards> = fc
  .tuple(
    fc.stringMatching(/^[A-Za-z0-9 ]{1,20}$/),
    fc.array(arbCardName, { minLength: 0, maxLength: 25 }),
  )
  .map(([name, cardNames]) => ({ name, cardNames }));

/** A collection of the user's decks (possibly empty). */
const arbDecks: fc.Arbitrary<UserDeckCards[]> = fc.array(arbDeck, {
  minLength: 0,
  maxLength: 8,
});

describe('Property 8: Owned-card set is the union of deck card names', () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any collection of the user's decks, the Owned_Card_Set equals the
   * union of the normalized (non-empty) card names across all decks: a
   * normalized name is a member iff at least one deck contains it.
   */
  it('ownedSet equals the union of normalized deck card names', () => {
    fc.assert(
      fc.property(arbDecks, (decks) => {
        const { ownedSet } = buildOwnedCardIndex(decks);

        // The union computed independently of the implementation.
        const expectedUnion = new Set<string>();
        for (const deck of decks) {
          for (const normalized of normalizedNonEmptyNames(deck.cardNames)) {
            expectedUnion.add(normalized);
          }
        }

        // Same size and same members → set equality.
        expect(ownedSet.size).toBe(expectedUnion.size);
        for (const name of expectedUnion) {
          expect(ownedSet.has(name)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('membership: a normalized name is owned iff some deck contains it', () => {
    fc.assert(
      fc.property(arbDecks, (decks) => {
        const { ownedSet } = buildOwnedCardIndex(decks);

        // Forward: every card in any deck (that survives normalization)
        // is a member of the owned set.
        for (const deck of decks) {
          for (const normalized of normalizedNonEmptyNames(deck.cardNames)) {
            expect(ownedSet.has(normalized)).toBe(true);
          }
        }

        // Backward: the owned set contains nothing that isn't in some deck.
        for (const owned of ownedSet) {
          const inSomeDeck = decks.some((deck) =>
            normalizedNonEmptyNames(deck.cardNames).includes(owned),
          );
          expect(inSomeDeck).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('no decks yields an empty owned set', () => {
    const { ownedSet, deckCount } = buildOwnedCardIndex([]);
    expect(ownedSet.size).toBe(0);
    expect(deckCount).toBe(0);
  });
});
