import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  convertUsdToCad,
  priceCard,
} from '../src/domain/build-commander-pricing.js';
import type { BuildCommanderCard } from '../src/types.js';

// Feature: build-a-commander, Property 10: Per-card CAD conversion follows the FX rate

/** Rounds a monetary amount to 2 decimal places (the app's convention). */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Finite, non-negative USD prices with sane magnitudes. Uses `noNaN` /
 * `noDefaultInfinity` and a bounded range so the rounded arithmetic stays
 * well-defined (no NaN/Infinity leaking through the multiply).
 */
const arbUsd: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 100_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** A positive USD→CAD multiplier in a realistic-but-generous range. */
const arbRate: fc.Arbitrary<number> = fc.double({
  min: 0.01,
  max: 100,
  noNaN: true,
  noDefaultInfinity: true,
});

/** A build-commander card with an arbitrary (possibly null) USD price. */
const arbCard: fc.Arbitrary<BuildCommanderCard> = fc
  .record({
    name: fc.stringMatching(/^[A-Za-z][A-Za-z '-]{0,20}$/),
    category: fc.constantFrom('Ramp', 'Lands', 'High Synergy Cards', 'Draw'),
    owned: fc.boolean(),
    sourceDecks: fc.array(fc.stringMatching(/^[A-Za-z0-9 ]{1,15}$/), {
      maxLength: 4,
    }),
    art: fc.option(fc.webUrl(), { nil: null }),
    scryfallId: fc.option(fc.uuid(), { nil: null }),
    usd: fc.option(arbUsd, { nil: null }),
    // The `cad` field is stale/arbitrary on input; pricing should overwrite it.
    cad: fc.option(arbUsd, { nil: null }),
  })
  .map((card) => card as BuildCommanderCard);

describe('Property 10: Per-card CAD conversion follows the FX rate', () => {
  /**
   * **Validates: Requirements 8.2**
   *
   * For any USD price and positive rate, the CAD conversion equals
   * round(usd * rate) to two decimals; a null USD price yields null CAD.
   */
  it('convertUsdToCad equals round(usd * rate) to two decimals; null usd → null cad', () => {
    fc.assert(
      fc.property(fc.option(arbUsd, { nil: null }), arbRate, (usd, rate) => {
        const cad = convertUsdToCad(usd, rate);

        if (usd == null) {
          expect(cad).toBeNull();
        } else {
          expect(cad).toBe(roundMoney(usd * rate));
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.2**
   *
   * `priceCard` sets `cad` from the card's own `usd` and the rate, following
   * the same conversion rule (null USD → null CAD).
   */
  it('priceCard sets cad from the card usd and rate', () => {
    fc.assert(
      fc.property(arbCard, arbRate, (card, rate) => {
        const priced = priceCard(card, rate);

        if (card.usd == null) {
          expect(priced.cad).toBeNull();
        } else {
          expect(priced.cad).toBe(roundMoney(card.usd * rate));
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.2**
   *
   * `priceCard` is non-mutating and only changes `cad`: the input object is
   * left untouched and every other field is preserved on the output.
   */
  it('priceCard preserves all other fields and does not mutate the input', () => {
    fc.assert(
      fc.property(arbCard, arbRate, (card, rate) => {
        const before = structuredClone(card);
        const priced = priceCard(card, rate);

        // Non-mutating: the input is unchanged.
        expect(card).toEqual(before);
        // Returns a new object.
        expect(priced).not.toBe(card);

        // Only `cad` may differ; every other field is preserved exactly.
        expect(priced.name).toBe(card.name);
        expect(priced.category).toBe(card.category);
        expect(priced.owned).toBe(card.owned);
        expect(priced.sourceDecks).toEqual(card.sourceDecks);
        expect(priced.art).toBe(card.art);
        expect(priced.scryfallId).toBe(card.scryfallId);
        expect(priced.usd).toBe(card.usd);
      }),
      { numRuns: 100 },
    );
  });
});
