import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildOwnedCardIndex,
  partitionRecommendations,
  splitRecommendations,
  type OwnedCardIndex,
  type UserDeckCards,
} from '../src/domain/build-commander-split.js';
import { normalizeCardName } from '../src/domain/deck-similarity.js';
import type { EdhrecRecommendation } from '../src/types.js';

// Feature: build-a-commander, Property 9: Owned/To-Buy split is a total, disjoint partition

/**
 * Arbitrary card names, deliberately including case variation, padding, and
 * "A // B" split-card syntax so the test exercises the normalization boundary
 * (a recommendation is owned iff its *normalized* name is in the owned set).
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
);

/** A minimal EDHREC recommendation carrying only what the split reads. */
const arbRecommendation: fc.Arbitrary<EdhrecRecommendation> = fc
  .tuple(
    arbCardName,
    fc.stringMatching(/^[A-Za-z ]{1,15}$/),
    fc.option(fc.string(), { nil: null }),
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
  { minLength: 0, maxLength: 30 },
);

/** A single deck: a display name plus a list of raw card names. */
const arbDeck: fc.Arbitrary<UserDeckCards> = fc
  .tuple(
    fc.stringMatching(/^[A-Za-z0-9 ]{1,20}$/),
    fc.array(arbCardName, { minLength: 0, maxLength: 25 }),
  )
  .map(([name, cardNames]) => ({ name, cardNames }));

const arbDecks: fc.Arbitrary<UserDeckCards[]> = fc.array(arbDeck, {
  minLength: 0,
  maxLength: 8,
});

/**
 * An arbitrary owned-card index built directly from an arbitrary set of
 * normalized names. This lets us drive the partition against an owned set
 * chosen independently of the recommendations (including one that overlaps
 * some recommendations and one that is empty).
 */
const arbOwnedIndex: fc.Arbitrary<OwnedCardIndex> = fc
  .array(arbCardName, { minLength: 0, maxLength: 30 })
  .map((names) => {
    const ownedSet = new Set<string>();
    const sourceDecks = new Map<string, string[]>();
    for (const raw of names) {
      const normalized = normalizeCardName(raw);
      if (normalized.length === 0) continue;
      ownedSet.add(normalized);
      if (!sourceDecks.has(normalized)) {
        sourceDecks.set(normalized, ['Deck']);
      }
    }
    return { ownedSet, sourceDecks, deckCount: 1 };
  });

describe('Property 9: Owned/To-Buy split is a total, disjoint partition', () => {
  /**
   * **Validates: Requirements 6.3, 6.4, 7.2, 12.5**
   *
   * For any recommendations and any owned-card set, the owned and to-buy
   * groups together contain exactly the recommendations (total) with no
   * overlap (disjoint); each recommendation is owned iff its normalized name
   * is in the owned set; and the counts add up to the input length.
   */
  it('every recommendation lands in exactly one group and counts add up', () => {
    fc.assert(
      fc.property(arbRecommendations, arbOwnedIndex, (recommendations, index) => {
        const split = partitionRecommendations(recommendations, index);

        // Counts match group sizes and the input length (total).
        expect(split.ownedCount).toBe(split.ownedCards.length);
        expect(split.toBuyCount).toBe(split.toBuyCards.length);
        expect(split.ownedCount + split.toBuyCount).toBe(
          recommendations.length,
        );

        // Membership rule: owned iff normalized name ∈ owned set.
        for (const card of split.ownedCards) {
          expect(index.ownedSet.has(normalizeCardName(card.name))).toBe(true);
        }
        for (const card of split.toBuyCards) {
          expect(index.ownedSet.has(normalizeCardName(card.name))).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('is a disjoint, order-preserving partition of the input names', () => {
    fc.assert(
      fc.property(arbRecommendations, arbOwnedIndex, (recommendations, index) => {
        const split = partitionRecommendations(recommendations, index);

        // Reconstructing the input by splicing the two groups back together in
        // recommendation order yields exactly the input names — this proves
        // both totality (nothing dropped/added) and disjointness (nothing
        // duplicated across groups).
        const ownedQueue = [...split.ownedCards];
        const toBuyQueue = [...split.toBuyCards];
        const reconstructed: string[] = [];
        for (const rec of recommendations) {
          const owned = index.ownedSet.has(normalizeCardName(rec.name));
          const next = owned ? ownedQueue.shift() : toBuyQueue.shift();
          expect(next).toBeDefined();
          reconstructed.push(next!.name);
        }
        expect(ownedQueue).toHaveLength(0);
        expect(toBuyQueue).toHaveLength(0);
        expect(reconstructed).toEqual(recommendations.map((r) => r.name));
      }),
      { numRuns: 100 },
    );
  });

  it('an empty owned set makes every recommendation a to-buy card', () => {
    fc.assert(
      fc.property(arbRecommendations, (recommendations) => {
        const emptyIndex: OwnedCardIndex = {
          ownedSet: new Set<string>(),
          sourceDecks: new Map<string, string[]>(),
          deckCount: 0,
        };
        const split = partitionRecommendations(recommendations, emptyIndex);

        expect(split.ownedCount).toBe(0);
        expect(split.ownedCards).toHaveLength(0);
        expect(split.toBuyCount).toBe(recommendations.length);
      }),
      { numRuns: 100 },
    );
  });

  it('splitRecommendations partitions against the index built from the decks', () => {
    fc.assert(
      fc.property(arbRecommendations, arbDecks, (recommendations, decks) => {
        const index = buildOwnedCardIndex(decks);
        const viaConvenience = splitRecommendations(recommendations, decks);
        const viaParts = partitionRecommendations(recommendations, index);

        // The convenience wrapper is the same partition plus the deck count.
        expect(viaConvenience.deckCount).toBe(index.deckCount);
        expect(viaConvenience.ownedCount + viaConvenience.toBuyCount).toBe(
          recommendations.length,
        );
        expect(viaConvenience.ownedCount).toBe(viaParts.ownedCount);
        expect(viaConvenience.toBuyCount).toBe(viaParts.toBuyCount);
      }),
      { numRuns: 100 },
    );
  });
});
