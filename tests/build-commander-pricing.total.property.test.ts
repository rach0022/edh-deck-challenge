import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeBuyListTotalCad } from '../src/domain/build-commander-pricing.js';
import type { BuildCommanderCard } from '../src/types.js';

// Feature: build-a-commander, Property 11: Buy-list total sums priced to-buy cards only

/** Rounds a monetary amount to 2 decimals, mirroring the module under test. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A to-buy card carrying a CAD price. Everything except `cad` is filler — the
 * buy-list total depends only on the `cad` field. `cad` is either a
 * non-negative amount with at most 2 decimals (a real priced card) or `null`
 * (a priceless card that must contribute nothing).
 */
const arbCad: fc.Arbitrary<number | null> = fc.oneof(
  fc.constant<number | null>(null),
  fc
    .double({ min: 0, max: 100000, noNaN: true, noDefaultInfinity: true })
    .map((v) => roundMoney(v)),
);

function makeCard(cad: number | null): BuildCommanderCard {
  return {
    name: 'x',
    category: 'y',
    owned: false,
    sourceDecks: [],
    art: null,
    scryfallId: null,
    usd: cad === null ? null : cad,
    cad,
  };
}

const arbCards: fc.Arbitrary<BuildCommanderCard[]> = fc
  .array(arbCad, { minLength: 0, maxLength: 40 })
  .map((cads) => cads.map(makeCard));

describe('Property 11: Buy-list total sums priced to-buy cards only', () => {
  /**
   * **Validates: Requirements 8.3, 8.4**
   *
   * The buy-list total equals the (2-decimal-rounded) sum of the CAD prices of
   * the priced cards; cards with no CAD price contribute nothing.
   */
  it('total equals the rounded sum of priced cards, ignoring null-priced cards', () => {
    fc.assert(
      fc.property(arbCards, (cards) => {
        const expected = roundMoney(
          cards.reduce((sum, card) => sum + (card.cad ?? 0), 0),
        );
        expect(computeBuyListTotalCad(cards)).toBe(expected);

        // Priceless cards are excluded: the total over only the priced cards
        // is identical to the total over the full list.
        const pricedOnly = cards.filter((c) => c.cad !== null);
        expect(computeBuyListTotalCad(pricedOnly)).toBe(
          computeBuyListTotalCad(cards),
        );
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * Adding a null-priced card to any list does not change the total.
   */
  it('adding a null-priced card does not change the total', () => {
    fc.assert(
      fc.property(arbCards, (cards) => {
        const before = computeBuyListTotalCad(cards);
        const after = computeBuyListTotalCad([...cards, makeCard(null)]);
        expect(after).toBe(before);
      }),
      { numRuns: 100 },
    );
  });

  it('the total of an empty list is 0', () => {
    expect(computeBuyListTotalCad([])).toBe(0);
  });

  it('the total of an all-null list is 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (n) => {
        const cards = Array.from({ length: n }, () => makeCard(null));
        expect(computeBuyListTotalCad(cards)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
