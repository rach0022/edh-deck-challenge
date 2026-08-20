/**
 * Color identity resolution for EDH commanders.
 * Computes the combined color identity from one or more commanders,
 * sorts in WUBRG order, and converts to a slot key.
 */

import type { Color, ColorIdentity } from '../types.js';

const WUBRG_ORDER: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];

export interface CommanderColorSource {
  colorIdentity: Color[];
}

/**
 * Resolves the combined color identity from one or more commanders.
 * Computes the union, deduplicates, and sorts in WUBRG order.
 */
export function resolveColorIdentity(commanders: CommanderColorSource[]): ColorIdentity {
  const colorSet = new Set<Color>();

  for (const commander of commanders) {
    for (const color of commander.colorIdentity) {
      colorSet.add(color);
    }
  }

  return WUBRG_ORDER.filter((c) => colorSet.has(c));
}

/**
 * Converts a color identity array to a string key.
 * Empty identity (colorless) returns "C".
 */
export function colorIdentityToKey(identity: ColorIdentity): string {
  if (identity.length === 0) {
    return 'C';
  }
  return identity.join('');
}
