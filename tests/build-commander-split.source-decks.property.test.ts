import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildOwnedCardIndex,
  partitionRecommendations,
  type UserDeckCards,
} from '../src/domain/build-commander-split.js';
import { normalizeCardName } from '../src/domain/deck-similarity.js';
import type { EdhrecRecommendation } from '../src/types.js';

// Feature: build-a-commander, Property 12: Owned cards record every source deck that contains them

/**
 * Normalizes a list of raw names to the non-empty normalized forms, matching
 * the module's own `buildCardSet` behavior (which drops names that normalize
 * to the empty string).
 */
function normalizedNonEmptyNames(names: readonly string[]): string[] {
  return names
    .map((n) => normalizeCardName(n))
    .filter((n) => n.length > 0);
}

/**
 * The set of deck names whose normalized card set contains `normalized`,
 * computed independently of the implementation. Deck names are de-duplicated
 * because a deck (name) either contains the card or it doesn't.
 */
function decksContaining(
  decks: readonly UserDeckCards[],
  normalized: string,
): string[] {
  const names = new Set<string>();
  for (const deck of decks) {
    if (normalizedNonEmptyNames(deck.cardNames).includes(normalized)) {
      names.add(deck.name);
    }
  }
  return [...names];
}

/**
 * Arbitrary raw card names — includes case variation, whitespace padding, and
 * "A // B" split-card syntax so the test exercises the normalization boundary.
 */
const arbCardName: fc.Arbitrary<string> = fc.oneof(
  fc
    .tuple(
      fc.constantFrom('', '  ', '\t'),
      fc.stringMatching(/^[A-Za-z][A-Za-z '-]{0,20}$/),
      fc.constantFrom('', '  '),
    )
    .map(([pre, body, post]) => `${pre}${body}${post}`),
  fc
    .tuple(
      fc.stringMatching(/^[A-Za-z][A-Za-z ']{0,15}$/),
      fc.stringMatching(/^[A-Za-z][A-Za-z ']{0,15}$/),
    )
    .map(([front, back]) => `${front} // ${back}`),
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

/** A single EDHREC recommendation. Only name/category/scryfallId feed the
 *  split; the remaining fields are filled to satisfy the type. */
const arbRecommendation: fc.Arbitrary<EdhrecRecommendation> = fc
  .tuple(
    arbCardName,
    fc.stringMatching(/^[A-Za-z ]{1,15}$/),
    fc.option(fc.stringMatching(/^[a-f0-9]{8}$/), { nil: null }),
  )
  .map(([name, category, scryfallId]) => ({
    name,
    category,
    inclusion: null,
    synergy: null,
    scryfallId,
    setCode: null,
    collectorNumber: null,
  }));

const arbRecommendations: fc.Arbitrary<EdhrecRecommendation[]> = fc.array(
  arbRecommendation,
  { minLength: 0, maxLength: 20 },
);

describe('Property 12: Owned cards record every source deck that contains them', () => {
  /**
   * **Validates: Requirements 10.1, 10.3**
   *
   * For any collection of decks and any owned recommended card, the card's
   * `sourceDecks` list is exactly the set of the user's deck names whose
   * normalized card set contains that card — no missing decks, no spurious
   * decks — sorted and de-duplicated, and therefore non-empty for every owned
   * card. To-buy cards carry an empty `sourceDecks`.
   */
  it('owned cards record exactly the decks that contain them; to-buy cards record none', () => {
    fc.assert(
      fc.property(arbDecks, arbRecommendations, (decks, recommendations) => {
        const index = buildOwnedCardIndex(decks);
        const { ownedCards, toBuyCards } = partitionRecommendations(
          recommendations,
          index,
        );

        for (const card of ownedCards) {
          const normalized = normalizeCardName(card.name);
          const expected = decksContaining(decks, normalized).sort((a, b) =>
            a.localeCompare(b),
          );

          // Exact set/order match: no missing decks, no spurious decks.
          expect(card.sourceDecks).toEqual(expected);

          // Every owned card is contained by at least one deck.
          expect(card.sourceDecks.length).toBeGreaterThan(0);

          // De-duplicated: each deck name appears at most once.
          expect(new Set(card.sourceDecks).size).toBe(card.sourceDecks.length);

          // Sorted for deterministic output.
          const sorted = [...card.sourceDecks].sort((a, b) =>
            a.localeCompare(b),
          );
          expect(card.sourceDecks).toEqual(sorted);
        }

        // To-buy cards never carry source decks.
        for (const card of toBuyCards) {
          expect(card.sourceDecks).toEqual([]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('recommendations drawn from deck cards are owned and trace back to their decks', () => {
    // Build recommendations directly from cards that appear in decks so the
    // owned branch (and its source-deck attachment) is always exercised.
    const arbDecksWithCards = arbDecks.filter((decks) =>
      decks.some((d) => normalizedNonEmptyNames(d.cardNames).length > 0),
    );

    fc.assert(
      fc.property(arbDecksWithCards, (decks) => {
        // One recommendation per distinct owned card (using the raw name from
        // the first deck that has it, to keep names realistic).
        const seen = new Set<string>();
        const recommendations: EdhrecRecommendation[] = [];
        for (const deck of decks) {
          for (const raw of deck.cardNames) {
            const normalized = normalizeCardName(raw);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            recommendations.push({
              name: raw,
              category: 'Test',
              inclusion: null,
              synergy: null,
              scryfallId: null,
              setCode: null,
              collectorNumber: null,
            });
          }
        }

        const index = buildOwnedCardIndex(decks);
        const { ownedCards, toBuyCards } = partitionRecommendations(
          recommendations,
          index,
        );

        // Everything we picked comes from a deck, so all are owned.
        expect(toBuyCards).toEqual([]);
        expect(ownedCards.length).toBe(recommendations.length);

        for (const card of ownedCards) {
          const normalized = normalizeCardName(card.name);
          const expected = decksContaining(decks, normalized).sort((a, b) =>
            a.localeCompare(b),
          );
          expect(card.sourceDecks).toEqual(expected);
          expect(card.sourceDecks.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
