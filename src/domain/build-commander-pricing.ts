/**
 * Build-a-Commander pricing — pure, side-effect-free logic for converting
 * to-buy card prices from USD to CAD and computing the buy-list total.
 *
 * Cards are priced using their known USD price (from Scryfall printing data),
 * converted to CAD with the FX_Service's cached USD→CAD rate. A card without a
 * USD price has no CAD price and is excluded from the buy-list total.
 *
 * Rounding matches the rest of the app: monetary amounts are rounded to two
 * decimal places (see `roundMoney` in `deck-similarity.ts`).
 */

import type { BuildCommanderCard } from '../types.js';

/** Rounds a monetary amount to 2 decimal places. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Converts a USD price to CAD using the given USD→CAD rate, rounded to two
 * decimal places. Returns `null` when there is no USD price (the card is shown
 * priceless and excluded from the buy-list total).
 *
 * @param usd       Known USD price, or `null` when unavailable.
 * @param usdToCad  Positive USD→CAD multiplier from the FX_Service.
 */
export function convertUsdToCad(usd: number | null, usdToCad: number): number | null {
  if (usd == null) return null;
  return roundMoney(usd * usdToCad);
}

/**
 * Prices a single to-buy card by filling in its `cad` field from its `usd`
 * price and the given rate. Returns a new card object (does not mutate the
 * input). A card with no USD price keeps `cad: null`.
 */
export function priceCard(card: BuildCommanderCard, usdToCad: number): BuildCommanderCard {
  return {
    ...card,
    cad: convertUsdToCad(card.usd, usdToCad),
  };
}

/**
 * Prices every to-buy card, returning a new array with each card's `cad`
 * field set from its `usd` price and the rate.
 */
export function priceCards(cards: BuildCommanderCard[], usdToCad: number): BuildCommanderCard[] {
  return cards.map((card) => priceCard(card, usdToCad));
}

/**
 * Computes the buy-list total: the sum of the CAD prices of the to-buy cards
 * that have a price. Cards without a CAD price contribute nothing. The result
 * is rounded to two decimal places.
 */
export function computeBuyListTotalCad(cards: BuildCommanderCard[]): number {
  const total = cards.reduce((sum, card) => sum + (card.cad ?? 0), 0);
  return roundMoney(total);
}
